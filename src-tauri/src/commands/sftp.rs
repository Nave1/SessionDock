use std::collections::HashMap;
use std::future::Future;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::Serialize;
use ssh2::{FileStat, RenameFlags, Sftp};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

use crate::error::AppError;
use crate::terminal::{open_sftp, NativeSshManager};

const S_IFMT: u32 = 0o170000;
const S_IFDIR: u32 = 0o040000;
const S_IFLNK: u32 = 0o120000;
const SFTP_TIMEOUT: Duration = Duration::from_secs(15);
const TRANSFER_RUNNING: u8 = 0;
const TRANSFER_PAUSED: u8 = 1;
const TRANSFER_CANCELLED: u8 = 2;

#[derive(Clone)]
pub struct SftpTransferManager {
    jobs: Arc<Mutex<HashMap<String, TransferJob>>>,
}

struct TransferJob {
    tab_id: String,
    control: Arc<AtomicU8>,
}

impl SftpTransferManager {
    pub fn new() -> Self {
        Self {
            jobs: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn cancel_tab(&self, tab_id: &str) {
        let jobs = self.jobs.lock().await;
        for job in jobs.values().filter(|job| job.tab_id == tab_id) {
            job.control.store(TRANSFER_CANCELLED, Ordering::Release);
        }
    }

    pub(crate) async fn register(&self, id: &str, tab_id: &str) -> Arc<AtomicU8> {
        let control = Arc::new(AtomicU8::new(TRANSFER_RUNNING));
        self.jobs.lock().await.insert(
            id.to_string(),
            TransferJob {
                tab_id: tab_id.to_string(),
                control: control.clone(),
            },
        );
        control
    }

    pub(crate) async fn finish(&self, id: &str) {
        self.jobs.lock().await.remove(id);
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SftpTransferEvent {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) direction: &'static str,
    pub(crate) transferred: u64,
    pub(crate) total: u64,
    pub(crate) status: &'static str,
    pub(crate) error: Option<String>,
}

struct TransferProgress<'a> {
    app: &'a AppHandle,
    tab_id: &'a str,
    event: &'a mut SftpTransferEvent,
    control: &'a AtomicU8,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpEntry {
    pub name: String,
    pub path: String,
    pub kind: &'static str,
    pub size: Option<u64>,
    pub modified_at: Option<u64>,
    pub permissions: Option<u32>,
}

pub(crate) fn normalize_remote_path(path: &str) -> Result<String, AppError> {
    if path.is_empty() || path.contains('\0') || path.len() > 4096 {
        return Err(AppError::Validation("Invalid remote path".to_string()));
    }
    if !path.starts_with('/') {
        return Err(AppError::Validation(
            "Remote paths must be absolute".to_string(),
        ));
    }

    let mut components = Vec::new();
    for component in path.split('/') {
        match component {
            "" | "." => {}
            ".." => {
                components.pop();
            }
            value if value.contains('\\') => {
                return Err(AppError::Validation(
                    "Remote paths cannot contain backslashes".to_string(),
                ));
            }
            value => components.push(value),
        }
    }

    if components.is_empty() {
        Ok("/".to_string())
    } else {
        Ok(format!("/{}", components.join("/")))
    }
}

fn remote_name(path: &Path) -> Result<String, AppError> {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| AppError::Validation("Server returned an invalid file name".to_string()))?;
    if name.is_empty() || name == "." || name == ".." || name.contains(['/', '\\', '\0']) {
        return Err(AppError::Validation(
            "Server returned an unsafe file name".to_string(),
        ));
    }
    Ok(name.to_string())
}

fn join_remote_path(parent: &str, name: &str) -> String {
    if parent == "/" {
        format!("/{name}")
    } else {
        format!("{parent}/{name}")
    }
}

fn entry_kind(stat: &FileStat) -> &'static str {
    match stat.perm.map(|permissions| permissions & S_IFMT) {
        Some(S_IFDIR) => "directory",
        Some(S_IFLNK) => "symlink",
        _ => "file",
    }
}

async fn retry_sftp<T, F>(mut operation: F) -> Result<T, AppError>
where
    F: FnMut() -> Result<T, ssh2::Error>,
{
    let deadline = Instant::now() + SFTP_TIMEOUT;
    loop {
        match operation() {
            Ok(value) => return Ok(value),
            Err(error)
                if error.code() == ssh2::ErrorCode::Session(-37) && Instant::now() < deadline =>
            {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
            Err(error) => return Err(AppError::Ssh(format!("SFTP operation failed: {error}"))),
        }
    }
}

pub(crate) fn validate_local_upload(path: &str) -> Result<std::path::PathBuf, AppError> {
    if path.is_empty() || path.contains('\0') {
        return Err(AppError::Validation("Invalid local file path".to_string()));
    }
    let path = std::fs::canonicalize(path)?;
    if !path.is_absolute() || !path.is_file() {
        return Err(AppError::Validation(
            "Upload source must be a local file".to_string(),
        ));
    }
    Ok(path)
}

pub(crate) fn validate_local_download(path: &str) -> Result<std::path::PathBuf, AppError> {
    if path.is_empty() || path.contains('\0') {
        return Err(AppError::Validation("Invalid local file path".to_string()));
    }
    let path = std::path::PathBuf::from(path);
    if !path.is_absolute() || path.file_name().is_none() {
        return Err(AppError::Validation(
            "Download destination must be an absolute file path".to_string(),
        ));
    }
    let parent = path.parent().ok_or_else(|| {
        AppError::Validation("Download destination has no parent directory".to_string())
    })?;
    if !parent.is_dir() {
        return Err(AppError::Validation(
            "Download destination directory does not exist".to_string(),
        ));
    }
    Ok(path)
}

pub(crate) fn transfer_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("transfer")
        .to_string()
}

pub(crate) async fn wait_for_transfer(control: &AtomicU8) -> Result<(), AppError> {
    loop {
        match control.load(Ordering::Acquire) {
            TRANSFER_RUNNING => return Ok(()),
            TRANSFER_PAUSED => tokio::time::sleep(Duration::from_millis(100)).await,
            _ => return Err(AppError::Generic("Transfer cancelled".to_string())),
        }
    }
}

pub(crate) fn retryable_io(error: &std::io::Error) -> bool {
    matches!(
        error.kind(),
        std::io::ErrorKind::WouldBlock | std::io::ErrorKind::Interrupted
    )
}

pub(crate) fn emit_transfer(app: &AppHandle, tab_id: &str, event: &SftpTransferEvent) {
    let _ = app.emit(&format!("sftp-transfer-{tab_id}"), event);
}

pub(crate) fn transfer_cancelled(control: &AtomicU8) -> bool {
    control.load(Ordering::Acquire) == TRANSFER_CANCELLED
}

async fn with_sftp<T, F, Fut>(
    manager: &NativeSshManager,
    tab_id: &str,
    operation: F,
) -> Result<T, AppError>
where
    F: FnOnce(Sftp) -> Fut,
    Fut: Future<Output = Result<T, AppError>>,
{
    let sftp = open_sftp(manager, tab_id).await?;
    operation(sftp).await
}

#[cfg(test)]
pub(crate) async fn live_smoke_sftp(
    manager: &NativeSshManager,
    tab_id: &str,
) -> Result<(), AppError> {
    let directory = format!("/rust-smoke-{}", uuid::Uuid::new_v4());
    let renamed = format!("{directory}-renamed");

    with_sftp(manager, tab_id, |sftp| async move {
        retry_sftp(|| sftp.mkdir(Path::new(&directory), 0o755)).await?;
        let entries = retry_sftp(|| sftp.readdir(Path::new("/"))).await?;
        if !entries
            .iter()
            .any(|(path, _)| path.file_name() == Path::new(&directory).file_name())
        {
            return Err(AppError::Ssh(
                "SFTP smoke directory was not returned by the server".to_string(),
            ));
        }
        retry_sftp(|| sftp.rename(Path::new(&directory), Path::new(&renamed), None)).await?;
        retry_sftp(|| sftp.rmdir(Path::new(&renamed))).await
    })
    .await
}

#[tauri::command]
pub async fn list_sftp_directory(
    manager: State<'_, NativeSshManager>,
    tab_id: String,
    path: String,
) -> Result<Vec<SftpEntry>, AppError> {
    let path = normalize_remote_path(&path)?;
    with_sftp(&manager, &tab_id, |sftp| async move {
        let rows = retry_sftp(|| sftp.readdir(Path::new(&path))).await?;
        let mut entries = Vec::with_capacity(rows.len());
        for (server_path, stat) in rows {
            let name = remote_name(&server_path)?;
            entries.push(SftpEntry {
                path: join_remote_path(&path, &name),
                name,
                kind: entry_kind(&stat),
                size: stat.size,
                modified_at: stat.mtime,
                permissions: stat.perm,
            });
        }
        entries.sort_by(|left, right| {
            let left_directory = left.kind == "directory";
            let right_directory = right.kind == "directory";
            right_directory
                .cmp(&left_directory)
                .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
        });
        Ok(entries)
    })
    .await
}

#[tauri::command]
pub async fn create_sftp_directory(
    manager: State<'_, NativeSshManager>,
    tab_id: String,
    path: String,
) -> Result<(), AppError> {
    let path = normalize_remote_path(&path)?;
    if path == "/" {
        return Err(AppError::Validation(
            "Cannot create the remote root".to_string(),
        ));
    }
    with_sftp(&manager, &tab_id, |sftp| async move {
        retry_sftp(|| sftp.mkdir(Path::new(&path), 0o755)).await
    })
    .await
}

#[tauri::command]
pub async fn rename_sftp_entry(
    manager: State<'_, NativeSshManager>,
    tab_id: String,
    source_path: String,
    destination_path: String,
) -> Result<(), AppError> {
    let source_path = normalize_remote_path(&source_path)?;
    let destination_path = normalize_remote_path(&destination_path)?;
    if source_path == "/" || destination_path == "/" {
        return Err(AppError::Validation(
            "Cannot rename the remote root".to_string(),
        ));
    }
    with_sftp(&manager, &tab_id, |sftp| async move {
        retry_sftp(|| sftp.rename(Path::new(&source_path), Path::new(&destination_path), None))
            .await
    })
    .await
}

#[tauri::command]
pub async fn delete_sftp_entry(
    manager: State<'_, NativeSshManager>,
    tab_id: String,
    path: String,
    is_directory: bool,
) -> Result<(), AppError> {
    let path = normalize_remote_path(&path)?;
    if path == "/" {
        return Err(AppError::Validation(
            "Cannot delete the remote root".to_string(),
        ));
    }
    with_sftp(&manager, &tab_id, |sftp| async move {
        if is_directory {
            retry_sftp(|| sftp.rmdir(Path::new(&path))).await
        } else {
            retry_sftp(|| sftp.unlink(Path::new(&path))).await
        }
    })
    .await
}

async fn require_remote_destination(
    sftp: &Sftp,
    path: &str,
    overwrite: bool,
) -> Result<(), AppError> {
    if overwrite {
        return Ok(());
    }
    let deadline = Instant::now() + SFTP_TIMEOUT;
    loop {
        match sftp.stat(Path::new(path)) {
            Ok(_) => {
                return Err(AppError::Validation(
                    "Remote destination already exists".to_string(),
                ))
            }
            Err(error) if error.code() == ssh2::ErrorCode::SFTP(2) => return Ok(()),
            Err(error)
                if error.code() == ssh2::ErrorCode::Session(-37) && Instant::now() < deadline =>
            {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
            Err(error) => return Err(AppError::Ssh(format!("SFTP operation failed: {error}"))),
        }
    }
}

async fn upload_file(
    progress: &mut TransferProgress<'_>,
    sftp: Sftp,
    local_path: &Path,
    remote_path: &str,
    overwrite: bool,
) -> Result<(), AppError> {
    require_remote_destination(&sftp, remote_path, overwrite).await?;
    let staged_path = format!("{remote_path}.sessiondock-{}.part", progress.event.id);
    let mut local_file = std::fs::File::open(local_path)?;
    let mut remote_file = retry_sftp(|| sftp.create(Path::new(&staged_path))).await?;
    let mut buffer = vec![0_u8; 64 * 1024];

    let transfer_result = async {
        loop {
            wait_for_transfer(progress.control).await?;
            let count = local_file.read(&mut buffer)?;
            if count == 0 {
                break;
            }
            let mut written = 0;
            while written < count {
                wait_for_transfer(progress.control).await?;
                match remote_file.write(&buffer[written..count]) {
                    Ok(0) => tokio::time::sleep(Duration::from_millis(10)).await,
                    Ok(size) => {
                        written += size;
                        progress.event.transferred += size as u64;
                        emit_transfer(progress.app, progress.tab_id, progress.event);
                    }
                    Err(ref error) if retryable_io(error) => {
                        tokio::time::sleep(Duration::from_millis(10)).await;
                    }
                    Err(error) => return Err(AppError::Io(error)),
                }
            }
        }
        drop(remote_file);
        let flags = if overwrite {
            RenameFlags::ATOMIC | RenameFlags::OVERWRITE | RenameFlags::NATIVE
        } else {
            RenameFlags::ATOMIC
        };
        retry_sftp(|| sftp.rename(Path::new(&staged_path), Path::new(remote_path), Some(flags)))
            .await
    }
    .await;

    if transfer_result.is_err() {
        let _ = sftp.unlink(Path::new(&staged_path));
    }
    transfer_result
}

async fn download_file(
    progress: &mut TransferProgress<'_>,
    sftp: Sftp,
    remote_path: &str,
    local_path: &Path,
    overwrite: bool,
) -> Result<(), AppError> {
    if local_path.exists() && !overwrite {
        return Err(AppError::Validation(
            "Local destination already exists".to_string(),
        ));
    }
    let stat = retry_sftp(|| sftp.stat(Path::new(remote_path))).await?;
    progress.event.total = stat.size.unwrap_or(0);
    let mut remote_file = retry_sftp(|| sftp.open(Path::new(remote_path))).await?;
    let staged_path = local_path.with_file_name(format!(
        ".{}.sessiondock-{}.part",
        transfer_name(local_path),
        progress.event.id
    ));
    let mut local_file = std::fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&staged_path)?;
    let mut buffer = vec![0_u8; 64 * 1024];

    let transfer_result = async {
        loop {
            wait_for_transfer(progress.control).await?;
            match remote_file.read(&mut buffer) {
                Ok(0) => break,
                Ok(size) => {
                    local_file.write_all(&buffer[..size])?;
                    progress.event.transferred += size as u64;
                    emit_transfer(progress.app, progress.tab_id, progress.event);
                }
                Err(ref error) if retryable_io(error) => {
                    tokio::time::sleep(Duration::from_millis(10)).await;
                }
                Err(error) => return Err(AppError::Io(error)),
            }
        }
        local_file.sync_all()?;
        if overwrite && local_path.exists() {
            std::fs::remove_file(local_path)?;
        }
        std::fs::rename(&staged_path, local_path)?;
        Ok(())
    }
    .await;

    if transfer_result.is_err() {
        let _ = std::fs::remove_file(staged_path);
    }
    transfer_result
}

#[tauri::command]
pub async fn start_sftp_upload(
    app: AppHandle,
    ssh_manager: State<'_, NativeSshManager>,
    transfer_manager: State<'_, SftpTransferManager>,
    tab_id: String,
    local_path: String,
    remote_path: String,
    overwrite: bool,
) -> Result<String, AppError> {
    let local_path = validate_local_upload(&local_path)?;
    let remote_path = normalize_remote_path(&remote_path)?;
    if remote_path == "/" {
        return Err(AppError::Validation(
            "Cannot upload to the remote root path".to_string(),
        ));
    }
    let total = local_path.metadata()?.len();
    let sftp = open_sftp(&ssh_manager, &tab_id).await?;
    let id = uuid::Uuid::new_v4().to_string();
    let control = Arc::new(AtomicU8::new(TRANSFER_RUNNING));
    transfer_manager.jobs.lock().await.insert(
        id.clone(),
        TransferJob {
            tab_id: tab_id.clone(),
            control: control.clone(),
        },
    );
    let manager = transfer_manager.inner().clone();
    let task_id = id.clone();
    tokio::spawn(async move {
        let mut event = SftpTransferEvent {
            id: task_id.clone(),
            name: transfer_name(&local_path),
            direction: "upload",
            transferred: 0,
            total,
            status: "running",
            error: None,
        };
        emit_transfer(&app, &tab_id, &event);
        let mut progress = TransferProgress {
            app: &app,
            tab_id: &tab_id,
            event: &mut event,
            control: &control,
        };
        match upload_file(&mut progress, sftp, &local_path, &remote_path, overwrite).await {
            Ok(()) => event.status = "completed",
            Err(_) if control.load(Ordering::Acquire) == TRANSFER_CANCELLED => {
                event.status = "cancelled";
                event.error = None;
            }
            Err(error) => {
                event.status = "failed";
                event.error = Some(error.to_string());
            }
        }
        emit_transfer(&app, &tab_id, &event);
        manager.jobs.lock().await.remove(&task_id);
    });
    Ok(id)
}

#[tauri::command]
pub async fn start_sftp_download(
    app: AppHandle,
    ssh_manager: State<'_, NativeSshManager>,
    transfer_manager: State<'_, SftpTransferManager>,
    tab_id: String,
    remote_path: String,
    local_path: String,
    overwrite: bool,
) -> Result<String, AppError> {
    let remote_path = normalize_remote_path(&remote_path)?;
    let local_path = validate_local_download(&local_path)?;
    if remote_path == "/" {
        return Err(AppError::Validation(
            "Cannot download the remote root".to_string(),
        ));
    }
    let sftp = open_sftp(&ssh_manager, &tab_id).await?;
    let id = uuid::Uuid::new_v4().to_string();
    let control = Arc::new(AtomicU8::new(TRANSFER_RUNNING));
    transfer_manager.jobs.lock().await.insert(
        id.clone(),
        TransferJob {
            tab_id: tab_id.clone(),
            control: control.clone(),
        },
    );
    let manager = transfer_manager.inner().clone();
    let task_id = id.clone();
    tokio::spawn(async move {
        let mut event = SftpTransferEvent {
            id: task_id.clone(),
            name: transfer_name(Path::new(&remote_path)),
            direction: "download",
            transferred: 0,
            total: 0,
            status: "running",
            error: None,
        };
        emit_transfer(&app, &tab_id, &event);
        let mut progress = TransferProgress {
            app: &app,
            tab_id: &tab_id,
            event: &mut event,
            control: &control,
        };
        match download_file(&mut progress, sftp, &remote_path, &local_path, overwrite).await {
            Ok(()) => event.status = "completed",
            Err(_) if control.load(Ordering::Acquire) == TRANSFER_CANCELLED => {
                event.status = "cancelled";
                event.error = None;
            }
            Err(error) => {
                event.status = "failed";
                event.error = Some(error.to_string());
            }
        }
        emit_transfer(&app, &tab_id, &event);
        manager.jobs.lock().await.remove(&task_id);
    });
    Ok(id)
}

async fn set_transfer_state(
    manager: &SftpTransferManager,
    transfer_id: &str,
    expected: u8,
    next: u8,
) -> Result<(), AppError> {
    let jobs = manager.jobs.lock().await;
    let job = jobs
        .get(transfer_id)
        .ok_or_else(|| AppError::NotFound("SFTP transfer not found".to_string()))?;
    job.control
        .compare_exchange(expected, next, Ordering::AcqRel, Ordering::Acquire)
        .map(|_| ())
        .map_err(|_| AppError::Validation("SFTP transfer state has changed".to_string()))
}

#[tauri::command]
pub async fn pause_sftp_transfer(
    manager: State<'_, SftpTransferManager>,
    transfer_id: String,
) -> Result<(), AppError> {
    set_transfer_state(&manager, &transfer_id, TRANSFER_RUNNING, TRANSFER_PAUSED).await
}

#[tauri::command]
pub async fn resume_sftp_transfer(
    manager: State<'_, SftpTransferManager>,
    transfer_id: String,
) -> Result<(), AppError> {
    set_transfer_state(&manager, &transfer_id, TRANSFER_PAUSED, TRANSFER_RUNNING).await
}

#[tauri::command]
pub async fn cancel_sftp_transfer(
    manager: State<'_, SftpTransferManager>,
    transfer_id: String,
) -> Result<(), AppError> {
    let jobs = manager.jobs.lock().await;
    let job = jobs
        .get(&transfer_id)
        .ok_or_else(|| AppError::NotFound("SFTP transfer not found".to_string()))?;
    job.control.store(TRANSFER_CANCELLED, Ordering::Release);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        entry_kind, join_remote_path, normalize_remote_path, remote_name, set_transfer_state,
        validate_local_download, validate_local_upload, SftpTransferManager, TransferJob,
        TRANSFER_CANCELLED, TRANSFER_PAUSED, TRANSFER_RUNNING,
    };
    use ssh2::FileStat;
    use std::path::Path;
    use std::sync::atomic::{AtomicU8, Ordering};
    use std::sync::Arc;

    #[test]
    fn normalizes_absolute_remote_paths() {
        assert_eq!(normalize_remote_path("/").unwrap(), "/");
        assert_eq!(
            normalize_remote_path("/var//log/./app").unwrap(),
            "/var/log/app"
        );
        assert_eq!(
            normalize_remote_path("/var/log/../tmp").unwrap(),
            "/var/tmp"
        );
        assert_eq!(normalize_remote_path("/../../tmp").unwrap(), "/tmp");
        assert!(normalize_remote_path("relative/path").is_err());
        assert!(normalize_remote_path("/bad\\name").is_err());
        assert!(normalize_remote_path("/bad\0name").is_err());
    }

    #[test]
    fn rejects_untrusted_server_names() {
        assert_eq!(
            remote_name(Path::new("/srv/report.txt")).unwrap(),
            "report.txt"
        );
        assert!(remote_name(Path::new("..")).is_err());
        assert!(remote_name(Path::new(".")).is_err());
        assert_eq!(join_remote_path("/", "home"), "/home");
        assert_eq!(join_remote_path("/srv", "home"), "/srv/home");
    }

    #[test]
    fn classifies_file_modes() {
        let stat = |perm| FileStat {
            size: None,
            uid: None,
            gid: None,
            perm: Some(perm),
            atime: None,
            mtime: None,
        };
        assert_eq!(entry_kind(&stat(0o040755)), "directory");
        assert_eq!(entry_kind(&stat(0o120777)), "symlink");
        assert_eq!(entry_kind(&stat(0o100644)), "file");
    }

    #[test]
    fn validates_local_transfer_paths() {
        let directory =
            std::env::temp_dir().join(format!("sessiondock-sftp-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&directory).unwrap();
        let upload = directory.join("upload.txt");
        std::fs::write(&upload, b"fixture").unwrap();

        assert_eq!(
            validate_local_upload(upload.to_str().unwrap()).unwrap(),
            std::fs::canonicalize(&upload).unwrap()
        );
        assert!(validate_local_upload(directory.to_str().unwrap()).is_err());
        assert!(validate_local_upload("relative.txt").is_err());
        assert!(validate_local_download(directory.join("download.txt").to_str().unwrap()).is_ok());
        assert!(validate_local_download("relative.txt").is_err());
        assert!(validate_local_download(
            directory
                .join("missing")
                .join("download.txt")
                .to_str()
                .unwrap()
        )
        .is_err());

        std::fs::remove_file(upload).unwrap();
        std::fs::remove_dir(directory).unwrap();
    }

    #[tokio::test]
    async fn cancels_only_transfers_owned_by_the_closed_tab() {
        let manager = SftpTransferManager::new();
        let owned = Arc::new(AtomicU8::new(TRANSFER_RUNNING));
        let other = Arc::new(AtomicU8::new(TRANSFER_RUNNING));
        let mut jobs = manager.jobs.lock().await;
        jobs.insert(
            "owned".into(),
            TransferJob {
                tab_id: "tab-1".into(),
                control: owned.clone(),
            },
        );
        jobs.insert(
            "other".into(),
            TransferJob {
                tab_id: "tab-2".into(),
                control: other.clone(),
            },
        );
        drop(jobs);

        manager.cancel_tab("tab-1").await;

        assert_eq!(owned.load(Ordering::Acquire), TRANSFER_CANCELLED);
        assert_eq!(other.load(Ordering::Acquire), TRANSFER_RUNNING);
        assert!(
            set_transfer_state(&manager, "owned", TRANSFER_PAUSED, TRANSFER_RUNNING)
                .await
                .is_err()
        );
        assert_eq!(owned.load(Ordering::Acquire), TRANSFER_CANCELLED);
    }
}
