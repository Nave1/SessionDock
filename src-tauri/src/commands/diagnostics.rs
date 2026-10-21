use std::collections::HashMap;
use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use ssh2::{Channel, Session};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

use super::sftp::retryable_io;
use crate::error::AppError;
use crate::terminal::{authenticated_ssh_session, NativeSshManager};

const DIAGNOSTIC_TIMEOUT: Duration = Duration::from_secs(10);
const DIAGNOSTIC_OUTPUT_LIMIT: usize = 64 * 1024;
const DIAGNOSTIC_BUFFER_SIZE: usize = 8 * 1024;

struct DiagnosticDefinition {
    provider_id: &'static str,
    diagnostic_id: &'static str,
    command: &'static str,
}

const DIAGNOSTICS: &[DiagnosticDefinition] = &[
    DiagnosticDefinition {
        provider_id: "linux",
        diagnostic_id: "linux-identity",
        command: "uname -a",
    },
    DiagnosticDefinition {
        provider_id: "linux",
        diagnostic_id: "linux-filesystems",
        command: "df -h",
    },
    DiagnosticDefinition {
        provider_id: "linux",
        diagnostic_id: "linux-network",
        command: "ip addr",
    },
    DiagnosticDefinition {
        provider_id: "arista-eos",
        diagnostic_id: "eos-platform",
        command: "show version",
    },
    DiagnosticDefinition {
        provider_id: "arista-eos",
        diagnostic_id: "eos-interfaces",
        command: "show interfaces status",
    },
    DiagnosticDefinition {
        provider_id: "arista-eos",
        diagnostic_id: "eos-routing",
        command: "show ip bgp summary",
    },
];

#[derive(Clone)]
pub struct DiagnosticsManager {
    jobs: Arc<Mutex<HashMap<String, DiagnosticJob>>>,
}

struct DiagnosticJob {
    tab_id: String,
    cancelled: Arc<AtomicBool>,
}

impl DiagnosticsManager {
    pub fn new() -> Self {
        Self {
            jobs: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn cancel_tab(&self, tab_id: &str) {
        let jobs = self.jobs.lock().await;
        for job in jobs.values().filter(|job| job.tab_id == tab_id) {
            job.cancelled.store(true, Ordering::Release);
        }
    }

    async fn register(&self, job_id: &str, tab_id: &str) -> Arc<AtomicBool> {
        let cancelled = Arc::new(AtomicBool::new(false));
        self.jobs.lock().await.insert(
            job_id.to_string(),
            DiagnosticJob {
                tab_id: tab_id.to_string(),
                cancelled: cancelled.clone(),
            },
        );
        cancelled
    }

    async fn finish(&self, job_id: &str) {
        self.jobs.lock().await.remove(job_id);
    }

    async fn cancel(&self, job_id: &str) -> Result<(), AppError> {
        let jobs = self.jobs.lock().await;
        let job = jobs
            .get(job_id)
            .ok_or_else(|| AppError::NotFound("Diagnostic job not found".into()))?;
        job.cancelled.store(true, Ordering::Release);
        Ok(())
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartDiagnosticRequest {
    tab_id: String,
    provider_id: String,
    diagnostic_id: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticEvent {
    job_id: String,
    provider_id: String,
    diagnostic_id: String,
    command: String,
    status: &'static str,
    stdout: String,
    stderr: String,
    exit_code: Option<i32>,
    truncated: bool,
    error: Option<String>,
}

pub(crate) struct BoundedSshOutput {
    pub(crate) status: &'static str,
    pub(crate) stdout: String,
    pub(crate) stderr: String,
    pub(crate) exit_code: Option<i32>,
    pub(crate) truncated: bool,
    pub(crate) error: Option<String>,
}

fn resolve_diagnostic(
    provider_id: &str,
    diagnostic_id: &str,
) -> Result<&'static DiagnosticDefinition, AppError> {
    DIAGNOSTICS
        .iter()
        .find(|definition| {
            definition.provider_id == provider_id && definition.diagnostic_id == diagnostic_id
        })
        .ok_or_else(|| AppError::Validation("Unsupported provider diagnostic".into()))
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

async fn retry_ssh<T>(
    deadline: Instant,
    stage: &str,
    mut operation: impl FnMut() -> Result<T, ssh2::Error>,
) -> Result<T, AppError> {
    loop {
        match operation() {
            Ok(value) => return Ok(value),
            Err(error)
                if error.code() == ssh2::ErrorCode::Session(-37) && Instant::now() < deadline =>
            {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
            Err(_) if Instant::now() >= deadline => {
                return Err(AppError::Ssh(format!("SSH command {stage} timed out")))
            }
            Err(error) => {
                return Err(AppError::Ssh(format!(
                    "SSH command {stage} failed: {error}"
                )))
            }
        }
    }
}

fn append_bounded(destination: &mut Vec<u8>, data: &[u8], remaining: &mut usize) -> bool {
    let count = data.len().min(*remaining);
    destination.extend_from_slice(&data[..count]);
    *remaining -= count;
    count < data.len()
}

fn read_available(
    reader: &mut impl Read,
    destination: &mut Vec<u8>,
    buffer: &mut [u8],
    remaining: &mut usize,
) -> Result<(bool, bool), AppError> {
    match reader.read(buffer) {
        Ok(0) => Ok((false, false)),
        Ok(count) => Ok((
            true,
            append_bounded(destination, &buffer[..count], remaining),
        )),
        Err(error) if retryable_io(&error) => Ok((false, false)),
        Err(error) => Err(AppError::Io(error)),
    }
}

async fn open_channel(
    session: &Session,
    command: &str,
    deadline: Instant,
) -> Result<Channel, AppError> {
    let mut channel = retry_ssh(deadline, "channel open", || session.channel_session()).await?;
    retry_ssh(deadline, "command start", || channel.exec(command)).await?;
    Ok(channel)
}

pub(crate) async fn execute_bounded_ssh_command(
    session: &Session,
    command: &str,
    cancelled: &AtomicBool,
) -> BoundedSshOutput {
    let deadline = Instant::now() + DIAGNOSTIC_TIMEOUT;
    let mut channel = match open_channel(session, command, deadline).await {
        Ok(channel) => channel,
        Err(error) => return failed_output(error.to_string()),
    };
    let mut stdout = Vec::new();
    let mut stderr = Vec::new();
    let mut buffer = vec![0_u8; DIAGNOSTIC_BUFFER_SIZE];
    let mut remaining = DIAGNOSTIC_OUTPUT_LIMIT;

    loop {
        if cancelled.load(Ordering::Acquire) {
            let _ = channel.close();
            return BoundedSshOutput {
                status: "cancelled",
                stdout: String::from_utf8_lossy(&stdout).into_owned(),
                stderr: String::from_utf8_lossy(&stderr).into_owned(),
                exit_code: None,
                truncated: false,
                error: None,
            };
        }
        if Instant::now() >= deadline {
            let _ = channel.close();
            return output_with_error(stdout, stderr, false, "SSH command timed out");
        }

        let stdout_read =
            match read_available(&mut channel, &mut stdout, &mut buffer, &mut remaining) {
                Ok(result) => result,
                Err(error) => return output_with_error(stdout, stderr, false, &error.to_string()),
            };
        let stderr_read = {
            let mut stream = channel.stderr();
            match read_available(&mut stream, &mut stderr, &mut buffer, &mut remaining) {
                Ok(result) => result,
                Err(error) => return output_with_error(stdout, stderr, false, &error.to_string()),
            }
        };
        if stdout_read.1 || stderr_read.1 {
            let _ = channel.close();
            return output_with_error(
                stdout,
                stderr,
                true,
                "SSH command output exceeded the 64 KiB limit",
            );
        }
        if channel.eof() {
            break;
        }
        if !stdout_read.0 && !stderr_read.0 {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    }

    let exit_code = channel.exit_status().ok();
    let _ = retry_ssh(deadline, "channel close", || channel.close()).await;
    BoundedSshOutput {
        status: if exit_code == Some(0) {
            "completed"
        } else {
            "failed"
        },
        stdout: String::from_utf8_lossy(&stdout).into_owned(),
        stderr: String::from_utf8_lossy(&stderr).into_owned(),
        exit_code,
        truncated: false,
        error: (exit_code != Some(0))
            .then(|| "Diagnostic command returned a failure status".into()),
    }
}

fn failed_output(error: String) -> BoundedSshOutput {
    BoundedSshOutput {
        status: "failed",
        stdout: String::new(),
        stderr: String::new(),
        exit_code: None,
        truncated: false,
        error: Some(error),
    }
}

fn output_with_error(
    stdout: Vec<u8>,
    stderr: Vec<u8>,
    truncated: bool,
    error: &str,
) -> BoundedSshOutput {
    BoundedSshOutput {
        status: "failed",
        stdout: String::from_utf8_lossy(&stdout).into_owned(),
        stderr: String::from_utf8_lossy(&stderr).into_owned(),
        exit_code: None,
        truncated,
        error: Some(error.to_string()),
    }
}

#[tauri::command]
pub async fn start_ssh_diagnostic(
    app: AppHandle,
    ssh_manager: State<'_, NativeSshManager>,
    diagnostics_manager: State<'_, DiagnosticsManager>,
    request: StartDiagnosticRequest,
) -> Result<String, AppError> {
    validate_tab_id(&request.tab_id)?;
    let definition = resolve_diagnostic(&request.provider_id, &request.diagnostic_id)?;
    let session = authenticated_ssh_session(&ssh_manager, &request.tab_id).await?;
    let job_id = uuid::Uuid::new_v4().to_string();
    let cancelled = diagnostics_manager.register(&job_id, &request.tab_id).await;
    let manager = diagnostics_manager.inner().clone();
    let event_name = format!("diagnostic-{}", request.tab_id);
    let running = DiagnosticEvent {
        job_id: job_id.clone(),
        provider_id: definition.provider_id.into(),
        diagnostic_id: definition.diagnostic_id.into(),
        command: definition.command.into(),
        status: "running",
        stdout: String::new(),
        stderr: String::new(),
        exit_code: None,
        truncated: false,
        error: None,
    };
    let task_job_id = job_id.clone();
    let task_app = app.clone();

    tokio::spawn(async move {
        let _ = task_app.emit(&event_name, &running);
        let output = execute_bounded_ssh_command(&session, definition.command, &cancelled).await;
        let completed = DiagnosticEvent {
            status: output.status,
            stdout: output.stdout,
            stderr: output.stderr,
            exit_code: output.exit_code,
            truncated: output.truncated,
            error: output.error,
            ..running
        };
        let _ = task_app.emit(&event_name, completed);
        manager.finish(&task_job_id).await;
    });
    Ok(job_id)
}

#[tauri::command]
pub async fn cancel_ssh_diagnostic(
    diagnostics_manager: State<'_, DiagnosticsManager>,
    job_id: String,
) -> Result<(), AppError> {
    uuid::Uuid::parse_str(&job_id)
        .map_err(|_| AppError::Validation("Invalid diagnostic job ID".into()))?;
    diagnostics_manager.cancel(&job_id).await
}

#[cfg(test)]
mod tests {
    use super::{append_bounded, resolve_diagnostic, validate_tab_id};

    #[test]
    fn resolves_only_allowlisted_provider_diagnostics() {
        let definition = resolve_diagnostic("arista-eos", "eos-platform").unwrap();
        assert_eq!(definition.command, "show version");
        assert!(resolve_diagnostic("arista-eos", "linux-identity").is_err());
        assert!(resolve_diagnostic("unknown", "eos-platform").is_err());
    }

    #[test]
    fn validates_pane_identifiers_and_bounds_output() {
        assert!(validate_tab_id("pane-123").is_ok());
        assert!(validate_tab_id("bad pane").is_err());
        assert!(validate_tab_id(&"x".repeat(129)).is_err());

        let mut output = Vec::new();
        let mut remaining = 4;
        assert!(!append_bounded(&mut output, b"abc", &mut remaining));
        assert!(append_bounded(&mut output, b"def", &mut remaining));
        assert_eq!(output, b"abcd");
    }
}
