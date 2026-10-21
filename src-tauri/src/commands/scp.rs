use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::AtomicU8;
use std::time::{Duration, Instant};

use ssh2::{Channel, Session};
use tauri::{AppHandle, State};

use super::sftp::{
    emit_transfer, normalize_remote_path, retryable_io, transfer_cancelled, transfer_name,
    validate_local_download, validate_local_upload, wait_for_transfer, SftpTransferEvent,
    SftpTransferManager,
};
use crate::error::AppError;
use crate::terminal::{authenticated_ssh_session, NativeSshManager};

const SCP_TIMEOUT: Duration = Duration::from_secs(15);
const SCP_BUFFER_SIZE: usize = 64 * 1024;

fn normalize_scp_remote_path(path: &str) -> Result<String, AppError> {
    let path = normalize_remote_path(path)?;
    if path == "/" {
        return Err(AppError::Validation(
            "SCP requires a remote file path".to_string(),
        ));
    }
    if !path
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'/' | b'.' | b'_' | b'-'))
    {
        return Err(AppError::Validation(
            "SCP remote paths may contain only letters, numbers, '/', '.', '_' and '-'".to_string(),
        ));
    }
    Ok(path)
}

async fn retry_ssh<T, F>(stage: &str, mut operation: F) -> Result<T, AppError>
where
    F: FnMut() -> Result<T, ssh2::Error>,
{
    let deadline = Instant::now() + SCP_TIMEOUT;
    loop {
        match operation() {
            Ok(value) => return Ok(value),
            Err(error)
                if error.code() == ssh2::ErrorCode::Session(-37) && Instant::now() < deadline =>
            {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
            Err(error) => return Err(AppError::Ssh(format!("SCP {stage} failed: {error}"))),
        }
    }
}

async fn write_channel(
    channel: &mut Channel,
    data: &[u8],
    control: &AtomicU8,
    on_progress: &mut impl FnMut(u64),
) -> Result<(), AppError> {
    let mut offset = 0;
    let mut deadline = Instant::now() + SCP_TIMEOUT;
    while offset < data.len() {
        wait_for_transfer(control).await?;
        match channel.write(&data[offset..]) {
            Ok(0) if Instant::now() < deadline => {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
            Ok(0) => return Err(AppError::Ssh("SCP upload timed out".to_string())),
            Ok(count) => {
                offset += count;
                deadline = Instant::now() + SCP_TIMEOUT;
                on_progress(count as u64);
            }
            Err(ref error) if retryable_io(error) && Instant::now() < deadline => {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
            Err(error) => return Err(AppError::Io(error)),
        }
    }
    Ok(())
}

async fn read_channel(
    channel: &mut Channel,
    data: &mut [u8],
    control: &AtomicU8,
    on_progress: &mut impl FnMut(u64),
) -> Result<(), AppError> {
    let mut offset = 0;
    let mut deadline = Instant::now() + SCP_TIMEOUT;
    while offset < data.len() {
        wait_for_transfer(control).await?;
        match channel.read(&mut data[offset..]) {
            Ok(0) if Instant::now() < deadline => {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
            Ok(0) => {
                return Err(AppError::Ssh(
                    "SCP channel ended before the expected data arrived".to_string(),
                ))
            }
            Ok(count) => {
                offset += count;
                deadline = Instant::now() + SCP_TIMEOUT;
                on_progress(count as u64);
            }
            Err(ref error) if retryable_io(error) && Instant::now() < deadline => {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
            Err(error) => return Err(AppError::Io(error)),
        }
    }
    Ok(())
}

async fn read_line(channel: &mut Channel, control: &AtomicU8) -> Result<Vec<u8>, AppError> {
    let mut line = Vec::new();
    loop {
        if line.len() >= 8192 {
            return Err(AppError::Ssh("SCP response line is too long".to_string()));
        }
        let mut byte = [0_u8; 1];
        read_channel(channel, &mut byte, control, &mut |_| {}).await?;
        line.push(byte[0]);
        if byte[0] == b'\n' {
            return Ok(line);
        }
    }
}

async fn read_ack(channel: &mut Channel, control: &AtomicU8) -> Result<(), AppError> {
    let mut status = [0_u8; 1];
    read_channel(channel, &mut status, control, &mut |_| {}).await?;
    match status[0] {
        0 => Ok(()),
        1 | 2 => {
            let message = String::from_utf8_lossy(&read_line(channel, control).await?)
                .trim()
                .to_string();
            Err(AppError::Ssh(format!(
                "SCP server rejected transfer: {message}"
            )))
        }
        status => Err(AppError::Ssh(format!(
            "SCP server returned invalid status {status}"
        ))),
    }
}

async fn open_scp_channel(
    session: &Session,
    mode: &str,
    remote_path: &str,
) -> Result<Channel, AppError> {
    let mut channel = retry_ssh("channel open", || session.channel_session()).await?;
    let command = format!("scp {mode} '{remote_path}'");
    retry_ssh("command start", || channel.exec(&command)).await?;
    Ok(channel)
}

async fn finish_channel(channel: &mut Channel, direction: &str) -> Result<(), AppError> {
    retry_ssh(&format!("{direction} send EOF"), || channel.send_eof()).await?;
    retry_ssh(&format!("{direction} wait for EOF"), || channel.wait_eof()).await?;
    retry_ssh(&format!("{direction} close"), || channel.close()).await?;
    retry_ssh(&format!("{direction} wait for close"), || {
        channel.wait_close()
    })
    .await
}

async fn upload_file(
    session: &Session,
    local_path: &Path,
    remote_path: &str,
    control: &AtomicU8,
    mut on_progress: impl FnMut(u64),
) -> Result<(), AppError> {
    let total = local_path.metadata()?.len();
    let mut channel = open_scp_channel(session, "-t", remote_path).await?;
    read_ack(&mut channel, control).await?;
    let header = format!("C0644 {total} sessiondock-upload\n");
    write_channel(&mut channel, header.as_bytes(), control, &mut |_| {}).await?;
    read_ack(&mut channel, control).await?;
    let mut local_file = std::fs::File::open(local_path)?;
    let mut buffer = vec![0_u8; SCP_BUFFER_SIZE];

    loop {
        wait_for_transfer(control).await?;
        let count = local_file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        write_channel(&mut channel, &buffer[..count], control, &mut on_progress).await?;
    }

    write_channel(&mut channel, &[0], control, &mut |_| {}).await?;
    read_ack(&mut channel, control).await?;

    finish_channel(&mut channel, "upload").await
}

fn parse_download_header(header: &[u8]) -> Result<u64, AppError> {
    if !header.starts_with(b"C") || !header.ends_with(b"\n") {
        return Err(AppError::Ssh("Invalid SCP download header".to_string()));
    }
    let fields = header[1..header.len() - 1]
        .splitn(3, |byte| *byte == b' ')
        .collect::<Vec<_>>();
    if fields.len() != 3
        || fields[0].len() != 4
        || !fields[0].iter().all(u8::is_ascii_digit)
        || fields[2].is_empty()
        || fields[2].len() > 255
        || fields[2].contains(&b'/')
        || fields[2].contains(&b'\\')
        || fields[2].contains(&0)
    {
        return Err(AppError::Ssh("Invalid SCP download metadata".to_string()));
    }
    std::str::from_utf8(fields[1])
        .ok()
        .and_then(|size| size.parse::<u64>().ok())
        .ok_or_else(|| AppError::Ssh("Invalid SCP download size".to_string()))
}

async fn download_file(
    session: &Session,
    remote_path: &str,
    local_path: &Path,
    overwrite: bool,
    transfer_id: &str,
    control: &AtomicU8,
    mut on_progress: impl FnMut(u64, u64),
) -> Result<u64, AppError> {
    if local_path.exists() && !overwrite {
        return Err(AppError::Validation(
            "Local destination already exists".to_string(),
        ));
    }

    let mut channel = open_scp_channel(session, "-f", remote_path).await?;
    write_channel(&mut channel, &[0], control, &mut |_| {}).await?;
    let total = loop {
        let header = read_line(&mut channel, control).await?;
        if header.starts_with(b"T") {
            write_channel(&mut channel, &[0], control, &mut |_| {}).await?;
            continue;
        }
        break parse_download_header(&header)?;
    };
    on_progress(0, total);
    write_channel(&mut channel, &[0], control, &mut |_| {}).await?;
    let staged_path = local_path.with_file_name(format!(
        ".{}.sessiondock-{transfer_id}.part",
        transfer_name(local_path)
    ));
    let mut local_file = std::fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&staged_path)?;
    let mut buffer = vec![0_u8; SCP_BUFFER_SIZE];
    let mut transferred = 0_u64;

    let transfer_result = async {
        while transferred < total {
            wait_for_transfer(control).await?;
            let remaining = usize::try_from((total - transferred).min(SCP_BUFFER_SIZE as u64))
                .unwrap_or(SCP_BUFFER_SIZE);
            read_channel(
                &mut channel,
                &mut buffer[..remaining],
                control,
                &mut |count| {
                    transferred += count;
                    on_progress(count, total);
                },
            )
            .await?;
            local_file.write_all(&buffer[..remaining])?;
        }
        read_ack(&mut channel, control).await?;
        write_channel(&mut channel, &[0], control, &mut |_| {}).await?;
        finish_channel(&mut channel, "download").await?;
        local_file.sync_all()?;
        if overwrite && local_path.exists() {
            std::fs::remove_file(local_path)?;
        }
        std::fs::rename(&staged_path, local_path)?;
        Ok(())
    }
    .await;

    if transfer_result.is_err() {
        let _ = std::fs::remove_file(&staged_path);
    }
    transfer_result.map(|_| total)
}

fn transfer_event(
    id: String,
    name: String,
    direction: &'static str,
    total: u64,
) -> SftpTransferEvent {
    SftpTransferEvent {
        id,
        name,
        direction,
        transferred: 0,
        total,
        status: "running",
        error: None,
    }
}

#[tauri::command]
pub async fn start_scp_upload(
    app: AppHandle,
    ssh_manager: State<'_, NativeSshManager>,
    transfer_manager: State<'_, SftpTransferManager>,
    tab_id: String,
    local_path: String,
    remote_path: String,
    overwrite: bool,
) -> Result<String, AppError> {
    if !overwrite {
        return Err(AppError::Validation(
            "SCP cannot check whether the remote destination exists; confirm overwrite to continue"
                .to_string(),
        ));
    }
    let local_path = validate_local_upload(&local_path)?;
    let remote_path = normalize_scp_remote_path(&remote_path)?;
    let total = local_path.metadata()?.len();
    let session = authenticated_ssh_session(&ssh_manager, &tab_id).await?;
    let id = uuid::Uuid::new_v4().to_string();
    let control = transfer_manager.register(&id, &tab_id).await;
    let manager = transfer_manager.inner().clone();
    let task_id = id.clone();

    tokio::spawn(async move {
        let mut event =
            transfer_event(task_id.clone(), transfer_name(&local_path), "upload", total);
        emit_transfer(&app, &tab_id, &event);
        let result = upload_file(&session, &local_path, &remote_path, &control, |count| {
            event.transferred += count;
            emit_transfer(&app, &tab_id, &event);
        })
        .await;
        match result {
            Ok(()) => event.status = "completed",
            Err(_) if transfer_cancelled(&control) => event.status = "cancelled",
            Err(error) => {
                event.status = "failed";
                event.error = Some(format!(
                    "{error}; SCP uploads are not atomic and the remote file may be partial"
                ));
            }
        }
        emit_transfer(&app, &tab_id, &event);
        manager.finish(&task_id).await;
    });
    Ok(id)
}

#[tauri::command]
pub async fn start_scp_download(
    app: AppHandle,
    ssh_manager: State<'_, NativeSshManager>,
    transfer_manager: State<'_, SftpTransferManager>,
    tab_id: String,
    remote_path: String,
    local_path: String,
    overwrite: bool,
) -> Result<String, AppError> {
    let remote_path = normalize_scp_remote_path(&remote_path)?;
    let local_path = validate_local_download(&local_path)?;
    if local_path.exists() && !overwrite {
        return Err(AppError::Validation(
            "Local destination already exists".to_string(),
        ));
    }
    let session = authenticated_ssh_session(&ssh_manager, &tab_id).await?;
    let id = uuid::Uuid::new_v4().to_string();
    let control = transfer_manager.register(&id, &tab_id).await;
    let manager = transfer_manager.inner().clone();
    let task_id = id.clone();

    tokio::spawn(async move {
        let mut event = transfer_event(
            task_id.clone(),
            transfer_name(Path::new(&remote_path)),
            "download",
            0,
        );
        emit_transfer(&app, &tab_id, &event);
        let result = download_file(
            &session,
            &remote_path,
            &local_path,
            overwrite,
            &task_id,
            &control,
            |count, total| {
                event.total = total;
                event.transferred += count;
                emit_transfer(&app, &tab_id, &event);
            },
        )
        .await;
        match result {
            Ok(total) => {
                event.total = total;
                event.status = "completed";
            }
            Err(_) if transfer_cancelled(&control) => event.status = "cancelled",
            Err(error) => {
                event.status = "failed";
                event.error = Some(error.to_string());
            }
        }
        emit_transfer(&app, &tab_id, &event);
        manager.finish(&task_id).await;
    });
    Ok(id)
}

#[cfg(test)]
pub(crate) async fn live_smoke_scp(
    manager: &NativeSshManager,
    tab_id: &str,
) -> Result<(), AppError> {
    let directory = std::env::temp_dir().join(format!("sessiondock-scp-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&directory)?;
    let upload_path = directory.join("upload.txt");
    let download_path = directory.join("download.txt");
    let payload = b"sessiondock-scp-live-probe";
    std::fs::write(&upload_path, payload)?;
    let control = AtomicU8::new(0);
    let session = authenticated_ssh_session(manager, tab_id).await?;

    let result = async {
        upload_file(&session, &upload_path, "/scp-probe.txt", &control, |_| {}).await?;
        download_file(
            &session,
            "/scp-probe.txt",
            &download_path,
            false,
            "live-smoke",
            &control,
            |_, _| {},
        )
        .await?;
        let downloaded = std::fs::read(&download_path)?;
        if downloaded != payload {
            return Err(AppError::Ssh(
                format!(
                    "SCP live smoke payload did not round-trip: expected {} bytes, received {} bytes ({downloaded:02x?})",
                    payload.len(),
                    downloaded.len()
                ),
            ));
        }
        Ok(())
    }
    .await;

    let _ = std::fs::remove_dir_all(directory);
    result
}

#[cfg(test)]
mod tests {
    use super::{normalize_scp_remote_path, parse_download_header};

    #[test]
    fn validates_shell_safe_scp_paths() {
        assert_eq!(
            normalize_scp_remote_path("/var/tmp/config-01.txt").unwrap(),
            "/var/tmp/config-01.txt"
        );
        assert!(normalize_scp_remote_path("/").is_err());
        assert!(normalize_scp_remote_path("relative.txt").is_err());
        assert!(normalize_scp_remote_path("/tmp/config file").is_err());
        assert!(normalize_scp_remote_path("/tmp/file;reboot").is_err());
        assert!(normalize_scp_remote_path("/tmp/$(command)").is_err());
        assert!(normalize_scp_remote_path("/tmp/file'quote").is_err());
    }

    #[test]
    fn parses_bounded_scp_download_metadata() {
        assert_eq!(parse_download_header(b"C0644 26 config.txt\n").unwrap(), 26);
        assert!(parse_download_header(b"C0644 invalid config.txt\n").is_err());
        assert!(parse_download_header(b"C0644 26 ../config.txt\n").is_err());
        assert!(parse_download_header(b"D0755 0 config\n").is_err());
        assert!(parse_download_header(b"C0644 26 config.txt").is_err());
    }
}
