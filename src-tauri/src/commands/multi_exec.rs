use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

use super::diagnostics::{execute_bounded_ssh_command, BoundedSshOutput};
use crate::error::AppError;
use crate::terminal::{authenticated_ssh_session, NativeSshManager};

const MAX_COMMAND_LEN: usize = 8_192;
const MAX_TARGETS: usize = 25;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CommandRisk {
    ReadOnly,
    PotentiallyModifying,
    HighRisk,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandClassification {
    risk: CommandRisk,
    reasons: Vec<&'static str>,
}

#[derive(Clone)]
pub struct MultiExecManager {
    jobs: Arc<Mutex<HashMap<String, MultiExecJob>>>,
}

struct MultiExecJob {
    owner_tab_id: String,
    target_tab_ids: Vec<String>,
    cancelled: Arc<AtomicBool>,
}

impl MultiExecManager {
    pub fn new() -> Self {
        Self {
            jobs: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn cancel_tab(&self, tab_id: &str) {
        let jobs = self.jobs.lock().await;
        for job in jobs.values().filter(|job| {
            job.owner_tab_id == tab_id || job.target_tab_ids.iter().any(|target| target == tab_id)
        }) {
            job.cancelled.store(true, Ordering::Release);
        }
    }

    async fn register(
        &self,
        batch_id: &str,
        owner_tab_id: &str,
        target_tab_ids: &[String],
    ) -> Arc<AtomicBool> {
        let cancelled = Arc::new(AtomicBool::new(false));
        self.jobs.lock().await.insert(
            batch_id.to_string(),
            MultiExecJob {
                owner_tab_id: owner_tab_id.to_string(),
                target_tab_ids: target_tab_ids.to_vec(),
                cancelled: cancelled.clone(),
            },
        );
        cancelled
    }

    async fn finish(&self, batch_id: &str) {
        self.jobs.lock().await.remove(batch_id);
    }

    async fn cancel(&self, batch_id: &str) -> Result<(), AppError> {
        let jobs = self.jobs.lock().await;
        let job = jobs
            .get(batch_id)
            .ok_or_else(|| AppError::NotFound("MultiExec batch not found".into()))?;
        job.cancelled.store(true, Ordering::Release);
        Ok(())
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartMultiExecRequest {
    owner_tab_id: String,
    target_tab_ids: Vec<String>,
    command: String,
    acknowledged_risk: bool,
    confirmation: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MultiExecEvent {
    batch_id: String,
    target_tab_id: String,
    command: String,
    risk: CommandRisk,
    status: &'static str,
    stdout: String,
    stderr: String,
    exit_code: Option<i32>,
    truncated: bool,
    error: Option<String>,
}

fn validate_command(command: &str) -> Result<&str, AppError> {
    let command = command.trim();
    if command.is_empty() {
        return Err(AppError::Validation("Command is required".into()));
    }
    if command.chars().count() > MAX_COMMAND_LEN {
        return Err(AppError::Validation(format!(
            "Command must not exceed {MAX_COMMAND_LEN} characters"
        )));
    }
    if command
        .chars()
        .any(|character| character == '\0' || character == '\r' || character == '\n')
    {
        return Err(AppError::Validation(
            "MultiExec accepts one command without line breaks".into(),
        ));
    }
    Ok(command)
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

fn classify(command: &str) -> Result<CommandClassification, AppError> {
    let command = validate_command(command)?;
    let normalized = command.to_ascii_lowercase();

    if ["&&", "||", ";", "|", "`", "$(", ">", "<"]
        .iter()
        .any(|separator| normalized.contains(separator))
    {
        return Ok(CommandClassification {
            risk: CommandRisk::HighRisk,
            reasons: vec!["shell_chaining"],
        });
    }

    let tokens: Vec<&str> = normalized
        .split(|character: char| character.is_ascii_whitespace() || character == '=')
        .filter(|token| !token.is_empty())
        .collect();
    let executable = tokens
        .first()
        .and_then(|token| token.rsplit('/').next())
        .unwrap_or_default();
    let executable = if ["sudo", "doas"].contains(&executable) {
        tokens
            .get(1)
            .and_then(|token| token.rsplit('/').next())
            .unwrap_or_default()
    } else {
        executable
    };
    if [
        "sh",
        "bash",
        "zsh",
        "cmd",
        "powershell",
        "pwsh",
        "python",
        "perl",
        "ruby",
    ]
    .contains(&executable)
    {
        return Ok(CommandClassification {
            risk: CommandRisk::HighRisk,
            reasons: vec!["shell_wrapper"],
        });
    }
    let destructive = [
        "rm", "dd", "mkfs", "reboot", "reload", "shutdown", "poweroff", "halt", "erase", "format",
        "delete",
    ];
    if tokens.iter().any(|token| {
        let executable = token.rsplit('/').next().unwrap_or(token);
        destructive.contains(&executable)
    }) || normalized.contains("write erase")
    {
        return Ok(CommandClassification {
            risk: CommandRisk::HighRisk,
            reasons: vec!["destructive_keyword"],
        });
    }

    let read_only_prefixes = [
        "show",
        "display",
        "get",
        "list",
        "ls",
        "cat",
        "head",
        "tail",
        "grep",
        "uname",
        "df",
        "du",
        "uptime",
        "who",
        "whoami",
        "hostname",
        "free",
        "ps",
        "top",
        "ping",
        "traceroute",
        "tracert",
        "ip addr",
        "ip route",
        "ifconfig",
        "netstat",
        "ss",
    ];
    if read_only_prefixes.iter().any(|prefix| {
        normalized == *prefix
            || normalized
                .strip_prefix(prefix)
                .is_some_and(|suffix| suffix.starts_with(char::is_whitespace))
    }) {
        return Ok(CommandClassification {
            risk: CommandRisk::ReadOnly,
            reasons: vec!["recognized_read_only"],
        });
    }

    Ok(CommandClassification {
        risk: CommandRisk::PotentiallyModifying,
        reasons: vec!["unrecognized_command"],
    })
}

fn validate_start_request(
    request: &StartMultiExecRequest,
) -> Result<CommandClassification, AppError> {
    validate_tab_id(&request.owner_tab_id)?;
    if request.target_tab_ids.is_empty() {
        return Err(AppError::Validation(
            "Select at least one MultiExec target".into(),
        ));
    }
    if request.target_tab_ids.len() > MAX_TARGETS {
        return Err(AppError::Validation(format!(
            "MultiExec supports at most {MAX_TARGETS} targets per batch"
        )));
    }
    let mut unique = HashSet::with_capacity(request.target_tab_ids.len());
    for tab_id in &request.target_tab_ids {
        validate_tab_id(tab_id)?;
        if !unique.insert(tab_id) {
            return Err(AppError::Validation(
                "MultiExec targets must be unique".into(),
            ));
        }
    }

    let classification = classify(&request.command)?;
    if classification.risk != CommandRisk::ReadOnly && !request.acknowledged_risk {
        return Err(AppError::Validation(
            "Risk acknowledgement is required".into(),
        ));
    }
    if classification.risk == CommandRisk::HighRisk {
        let expected = format!("EXECUTE {} TARGETS", request.target_tab_ids.len());
        if request.confirmation.as_deref() != Some(expected.as_str()) {
            return Err(AppError::Validation(format!(
                "High-risk MultiExec requires the exact confirmation: {expected}"
            )));
        }
    }
    Ok(classification)
}

#[tauri::command]
pub fn classify_multi_exec_command(command: String) -> Result<CommandClassification, AppError> {
    classify(&command)
}

#[tauri::command]
pub async fn start_multi_exec(
    app: AppHandle,
    ssh_manager: State<'_, NativeSshManager>,
    multi_exec_manager: State<'_, MultiExecManager>,
    request: StartMultiExecRequest,
) -> Result<String, AppError> {
    let classification = validate_start_request(&request)?;
    let command = validate_command(&request.command)?.to_string();
    let mut sessions = Vec::with_capacity(request.target_tab_ids.len());
    for tab_id in &request.target_tab_ids {
        sessions.push((
            tab_id.clone(),
            authenticated_ssh_session(&ssh_manager, tab_id)
                .await
                .map_err(|error| error.to_string()),
        ));
    }

    let batch_id = uuid::Uuid::new_v4().to_string();
    let cancelled = multi_exec_manager
        .register(&batch_id, &request.owner_tab_id, &request.target_tab_ids)
        .await;
    let manager = multi_exec_manager.inner().clone();
    let event_name = format!("multi-exec-{}", request.owner_tab_id);
    let task_batch_id = batch_id.clone();
    let risk = classification.risk;

    tokio::spawn(async move {
        let mut tasks = tokio::task::JoinSet::new();
        for (target_tab_id, session) in sessions {
            let running = MultiExecEvent {
                batch_id: task_batch_id.clone(),
                target_tab_id,
                command: command.clone(),
                risk,
                status: "running",
                stdout: String::new(),
                stderr: String::new(),
                exit_code: None,
                truncated: false,
                error: None,
            };
            let _ = app.emit(&event_name, &running);
            let task_cancelled = cancelled.clone();
            tasks.spawn(async move {
                let output = match session {
                    Ok(session) => {
                        execute_bounded_ssh_command(&session, &running.command, &task_cancelled)
                            .await
                    }
                    Err(error) => BoundedSshOutput {
                        status: "failed",
                        stdout: String::new(),
                        stderr: String::new(),
                        exit_code: None,
                        truncated: false,
                        error: Some(error),
                    },
                };
                MultiExecEvent {
                    status: output.status,
                    stdout: output.stdout,
                    stderr: output.stderr,
                    exit_code: output.exit_code,
                    truncated: output.truncated,
                    error: output.error,
                    ..running
                }
            });
        }
        while let Some(result) = tasks.join_next().await {
            if let Ok(event) = result {
                let _ = app.emit(&event_name, event);
            }
        }
        manager.finish(&task_batch_id).await;
    });
    Ok(batch_id)
}

#[tauri::command]
pub async fn cancel_multi_exec(
    multi_exec_manager: State<'_, MultiExecManager>,
    batch_id: String,
) -> Result<(), AppError> {
    uuid::Uuid::parse_str(&batch_id)
        .map_err(|_| AppError::Validation("Invalid MultiExec batch ID".into()))?;
    multi_exec_manager.cancel(&batch_id).await
}

#[cfg(test)]
mod tests {
    use super::{
        classify, validate_start_request, CommandRisk, StartMultiExecRequest, MAX_COMMAND_LEN,
        MAX_TARGETS,
    };

    #[test]
    fn classifies_read_only_unknown_and_high_risk_commands_conservatively() {
        assert_eq!(
            classify(" SHOW version ").unwrap().risk,
            CommandRisk::ReadOnly
        );
        assert_eq!(
            classify("display version").unwrap().risk,
            CommandRisk::ReadOnly
        );
        assert_eq!(
            classify("get system status").unwrap().risk,
            CommandRisk::ReadOnly
        );
        assert_eq!(classify("ip addr").unwrap().risk, CommandRisk::ReadOnly);
        assert_eq!(
            classify("custom-tool inspect").unwrap().risk,
            CommandRisk::PotentiallyModifying
        );
        assert_eq!(
            classify("sudo rm -rf /tmp/x").unwrap().risk,
            CommandRisk::HighRisk
        );
        assert_eq!(
            classify("show version; reload").unwrap().risk,
            CommandRisk::HighRisk
        );
        assert_eq!(
            classify("show run | include ssh").unwrap().risk,
            CommandRisk::HighRisk
        );
        assert_eq!(
            classify("sudo bash -c 'echo changed'").unwrap().risk,
            CommandRisk::HighRisk
        );
    }

    #[test]
    fn rejects_empty_multiline_and_oversized_commands() {
        assert!(classify("  ").is_err());
        assert!(classify("show version\nreload").is_err());
        assert!(classify(&"x".repeat(MAX_COMMAND_LEN + 1)).is_err());
    }

    fn request(command: &str, count: usize) -> StartMultiExecRequest {
        StartMultiExecRequest {
            owner_tab_id: "owner-pane".into(),
            target_tab_ids: (0..count).map(|index| format!("target-{index}")).collect(),
            command: command.into(),
            acknowledged_risk: false,
            confirmation: None,
        }
    }

    #[test]
    fn enforces_target_bounds_uniqueness_and_risk_confirmation() {
        assert!(validate_start_request(&request("show version", 1)).is_ok());
        assert!(validate_start_request(&request("show version", 0)).is_err());
        assert!(validate_start_request(&request("show version", MAX_TARGETS + 1)).is_err());

        let mut duplicate = request("show version", 2);
        duplicate.target_tab_ids[1] = duplicate.target_tab_ids[0].clone();
        assert!(validate_start_request(&duplicate).is_err());

        let mut modifying = request("configure terminal", 2);
        assert!(validate_start_request(&modifying).is_err());
        modifying.acknowledged_risk = true;
        assert!(validate_start_request(&modifying).is_ok());

        let mut high_risk = request("reload", 2);
        high_risk.acknowledged_risk = true;
        high_risk.confirmation = Some("EXECUTE 1 TARGETS".into());
        assert!(validate_start_request(&high_risk).is_err());
        high_risk.confirmation = Some("EXECUTE 2 TARGETS".into());
        assert!(validate_start_request(&high_risk).is_ok());
    }
}
