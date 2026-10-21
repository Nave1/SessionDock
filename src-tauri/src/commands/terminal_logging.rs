use std::collections::HashMap;
use std::fs::OpenOptions;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Serialize;
use tauri::State;
use tokio::io::AsyncWriteExt;
use tokio::sync::{mpsc, Mutex};
use tokio::task::JoinHandle;

use crate::error::AppError;

const MAX_DIRECTORY_LEN: usize = 4_096;
const LOG_BUFFER_CHUNKS: usize = 256;

#[derive(Clone)]
pub struct TerminalLogManager {
    active: Arc<Mutex<HashMap<String, ActiveTerminalLog>>>,
}

struct ActiveTerminalLog {
    path: PathBuf,
    sender: mpsc::Sender<Vec<u8>>,
    worker: JoinHandle<Result<(), AppError>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalLogStatus {
    active: bool,
    path: Option<String>,
}

impl TerminalLogManager {
    pub fn new() -> Self {
        Self {
            active: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    async fn start(&self, tab_id: &str, directory: &str) -> Result<PathBuf, AppError> {
        validate_tab_id(tab_id)?;
        let directory = validate_directory(directory)?;
        let path = next_log_path(&directory, tab_id);
        let file = open_log_file(&path)?;
        let mut file = tokio::fs::File::from_std(file);
        let (sender, mut receiver) = mpsc::channel::<Vec<u8>>(LOG_BUFFER_CHUNKS);
        let worker = tokio::spawn(async move {
            while let Some(data) = receiver.recv().await {
                file.write_all(&data).await.map_err(AppError::Io)?;
            }
            file.flush().await.map_err(AppError::Io)
        });

        let mut active = self.active.lock().await;
        if active.contains_key(tab_id) {
            drop(sender);
            let _ = worker.await;
            let _ = std::fs::remove_file(&path);
            return Err(AppError::Validation(
                "Terminal logging is already active for this pane".into(),
            ));
        }
        active.insert(
            tab_id.to_string(),
            ActiveTerminalLog {
                path: path.clone(),
                sender,
                worker,
            },
        );
        Ok(path)
    }

    pub async fn append(&self, tab_id: &str, data: &[u8]) -> Result<(), AppError> {
        let sender = self
            .active
            .lock()
            .await
            .get(tab_id)
            .map(|log| log.sender.clone());
        if let Some(sender) = sender {
            sender
                .send(data.to_vec())
                .await
                .map_err(|_| AppError::Io(std::io::Error::other("Terminal log writer stopped")))?;
        }
        Ok(())
    }

    pub fn append_blocking(&self, tab_id: &str, data: &[u8]) -> Result<(), AppError> {
        let sender = self
            .active
            .blocking_lock()
            .get(tab_id)
            .map(|log| log.sender.clone());
        if let Some(sender) = sender {
            sender
                .blocking_send(data.to_vec())
                .map_err(|_| AppError::Io(std::io::Error::other("Terminal log writer stopped")))?;
        }
        Ok(())
    }

    async fn stop(&self, tab_id: &str) -> Result<Option<PathBuf>, AppError> {
        let active = self.active.lock().await.remove(tab_id);
        let Some(ActiveTerminalLog {
            path,
            sender,
            worker,
        }) = active
        else {
            return Ok(None);
        };
        drop(sender);
        worker.await.map_err(|error| {
            AppError::Io(std::io::Error::other(format!(
                "Terminal log worker failed: {error}"
            )))
        })??;
        Ok(Some(path))
    }

    pub async fn stop_tab(&self, tab_id: &str) {
        if let Err(error) = self.stop(tab_id).await {
            log::warn!("Terminal log failed to close for pane {tab_id}: {error}");
        }
    }

    async fn status(&self, tab_id: &str) -> TerminalLogStatus {
        let path = self
            .active
            .lock()
            .await
            .get(tab_id)
            .map(|log| log.path.to_string_lossy().into_owned());
        TerminalLogStatus {
            active: path.is_some(),
            path,
        }
    }
}

fn validate_tab_id(tab_id: &str) -> Result<(), AppError> {
    if tab_id.is_empty()
        || tab_id.len() > 128
        || !tab_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
    {
        return Err(AppError::Validation("Invalid terminal pane ID".into()));
    }
    Ok(())
}

fn validate_directory(directory: &str) -> Result<PathBuf, AppError> {
    if directory.is_empty()
        || directory.chars().count() > MAX_DIRECTORY_LEN
        || directory.chars().any(|character| character == '\0')
    {
        return Err(AppError::Validation(
            "Invalid terminal log directory".into(),
        ));
    }
    let path = Path::new(directory);
    if !path.is_absolute() {
        return Err(AppError::Validation(
            "Terminal log directory must be absolute".into(),
        ));
    }
    let canonical = path.canonicalize().map_err(AppError::Io)?;
    if !canonical.is_dir() {
        return Err(AppError::Validation(
            "Terminal log destination must be a directory".into(),
        ));
    }
    Ok(canonical)
}

fn next_log_path(directory: &Path, tab_id: &str) -> PathBuf {
    let timestamp = chrono::Utc::now().format("%Y%m%d-%H%M%S-%3f");
    let pane = &tab_id[..tab_id.len().min(8)];
    let unique = &uuid::Uuid::new_v4().simple().to_string()[..8];
    directory.join(format!("sessiondock-{timestamp}-{pane}-{unique}.log"))
}

fn open_log_file(path: &Path) -> Result<std::fs::File, AppError> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(path).map_err(AppError::Io)
}

#[tauri::command]
pub async fn start_terminal_logging(
    manager: State<'_, TerminalLogManager>,
    tab_id: String,
    directory: String,
) -> Result<TerminalLogStatus, AppError> {
    manager.start(&tab_id, &directory).await?;
    Ok(manager.status(&tab_id).await)
}

#[tauri::command]
pub async fn stop_terminal_logging(
    manager: State<'_, TerminalLogManager>,
    tab_id: String,
) -> Result<TerminalLogStatus, AppError> {
    validate_tab_id(&tab_id)?;
    manager
        .stop(&tab_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Terminal logging is not active for this pane".into()))?;
    Ok(manager.status(&tab_id).await)
}

#[tauri::command]
pub async fn get_terminal_logging_status(
    manager: State<'_, TerminalLogManager>,
    tab_id: String,
) -> Result<TerminalLogStatus, AppError> {
    validate_tab_id(&tab_id)?;
    Ok(manager.status(&tab_id).await)
}

#[cfg(test)]
mod tests {
    use super::{validate_directory, TerminalLogManager};

    fn temporary_directory() -> std::path::PathBuf {
        let path =
            std::env::temp_dir().join(format!("sessiondock-log-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&path).unwrap();
        path
    }

    #[tokio::test]
    async fn preserves_exact_bytes_and_flushes_on_stop() {
        let directory = temporary_directory();
        let manager = TerminalLogManager::new();
        let path = manager
            .start("pane-123", directory.to_str().unwrap())
            .await
            .unwrap();
        manager
            .append("pane-123", b"hello\r\n\x1b[31mred\x1b[0m")
            .await
            .unwrap();
        assert!(manager
            .start("pane-123", directory.to_str().unwrap())
            .await
            .is_err());
        manager.stop("pane-123").await.unwrap();

        assert_eq!(
            std::fs::read(&path).unwrap(),
            b"hello\r\n\x1b[31mred\x1b[0m"
        );
        assert!(path
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("sessiondock-"));
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn rejects_relative_and_non_directory_destinations() {
        assert!(validate_directory("relative/path").is_err());
        let file =
            std::env::temp_dir().join(format!("sessiondock-log-file-{}", uuid::Uuid::new_v4()));
        std::fs::write(&file, b"not a directory").unwrap();
        assert!(validate_directory(file.to_str().unwrap()).is_err());
        std::fs::remove_file(file).unwrap();
    }
}
