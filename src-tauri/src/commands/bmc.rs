use crate::error::AppError;
use tauri::{LogicalPosition, LogicalSize, Manager, WebviewBuilder, WebviewUrl};
use std::time::Instant;

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BmcWebviewRequest {
    pub connection_id: String,
    pub url: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub cookie_persistence: String,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BmcBoundsRequest {
    pub connection_id: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

fn webview_label(connection_id: &str) -> Result<String, AppError> {
    let id = uuid::Uuid::parse_str(connection_id)
        .map_err(|_| AppError::Validation("Invalid BMC connection ID".into()))?;
    Ok(format!("bmc-{id}"))
}

fn parse_bmc_url(value: &str) -> Result<tauri::Url, AppError> {
    let url = value
        .parse::<tauri::Url>()
        .map_err(|_| AppError::Validation("Invalid BMC URL".into()))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(AppError::Validation(
            "BMC URLs must use HTTP or HTTPS".into(),
        ));
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(AppError::Validation(
            "BMC URLs must not contain credentials".into(),
        ));
    }
    Ok(url)
}

fn get_bmc_webview(
    app: &tauri::AppHandle,
    connection_id: &str,
) -> Result<tauri::Webview, AppError> {
    let label = webview_label(connection_id)?;
    app.get_webview(&label)
        .ok_or_else(|| AppError::NotFound(format!("BMC WebView not found: {label}")))
}

#[tauri::command]
pub async fn create_bmc_webview(
    window: tauri::Window,
    request: BmcWebviewRequest,
) -> Result<String, AppError> {
    let label = webview_label(&request.connection_id)?;
    let url = parse_bmc_url(&request.url)?;
    if window.get_webview(&label).is_some() {
        return Ok(label);
    }

    let builder = WebviewBuilder::new(label.clone(), WebviewUrl::External(url))
        .on_navigation(|url| matches!(url.scheme(), "http" | "https"))
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
        .incognito(request.cookie_persistence == "tab")
        .devtools(false)
        .disable_drag_drop_handler();

    window
        .add_child(
            builder,
            LogicalPosition::new(request.x, request.y),
            LogicalSize::new(request.width.max(1.0), request.height.max(1.0)),
        )
        .map_err(|error| AppError::Generic(format!("Failed to create BMC WebView: {error}")))?;
    Ok(label)
}

#[tauri::command]
pub fn set_bmc_webview_bounds(
    app: tauri::AppHandle,
    request: BmcBoundsRequest,
) -> Result<(), AppError> {
    let webview = get_bmc_webview(&app, &request.connection_id)?;
    webview
        .set_position(LogicalPosition::new(request.x, request.y))
        .and_then(|_| {
            webview.set_size(LogicalSize::new(
                request.width.max(1.0),
                request.height.max(1.0),
            ))
        })
        .map_err(|error| AppError::Generic(error.to_string()))
}

#[tauri::command]
pub fn set_bmc_webview_visible(
    app: tauri::AppHandle,
    connection_id: String,
    visible: bool,
) -> Result<(), AppError> {
    let webview = get_bmc_webview(&app, &connection_id)?;
    let result = if visible { webview.show() } else { webview.hide() };
    result.map_err(|error| AppError::Generic(error.to_string()))
}

#[tauri::command]
pub fn reload_bmc_webview(
    app: tauri::AppHandle,
    connection_id: String,
) -> Result<(), AppError> {
    get_bmc_webview(&app, &connection_id)?
        .reload()
        .map_err(|error| AppError::Generic(error.to_string()))
}

#[tauri::command]
pub fn close_bmc_webview(
    app: tauri::AppHandle,
    connection_id: String,
    clear_browsing_data: bool,
) -> Result<(), AppError> {
    let webview = get_bmc_webview(&app, &connection_id)?;
    if clear_browsing_data {
        webview
            .clear_all_browsing_data()
            .map_err(|error| AppError::Generic(error.to_string()))?;
    }
    webview
        .close()
        .map_err(|error| AppError::Generic(error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::{parse_bmc_url, webview_label};

    #[test]
    fn validates_labels_and_urls() {
        let id = "8ecad79b-a192-4f3a-af6e-f7c70a40ea63";
        assert_eq!(webview_label(id).unwrap(), format!("bmc-{id}"));
        assert!(webview_label("../../main").is_err());
        assert!(parse_bmc_url("https://bmc.example/console").is_ok());
        assert!(parse_bmc_url("javascript:alert(1)").is_err());
        assert!(parse_bmc_url("https://admin:secret@bmc.example/").is_err());
    }
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BmcTestRequest {
    pub url: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub timeout_seconds: u64,
    pub ignore_tls_errors: bool,
    pub test_redfish: bool,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BmcTestResult {
    pub reachable: bool,
    pub status_code: Option<u16>,
    pub latency_ms: u128,
    pub redfish_available: Option<bool>,
    pub redfish_status_code: Option<u16>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn test_bmc_connection(request: BmcTestRequest) -> Result<BmcTestResult, AppError> {
    let url = parse_bmc_url(&request.url)?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(request.timeout_seconds.clamp(1, 120)))
        .danger_accept_invalid_certs(request.ignore_tls_errors)
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|error| AppError::Generic(error.to_string()))?;
    let start = Instant::now();
    let mut probe = client.get(url.clone());
    if let Some(username) = request.username.as_ref().filter(|value| !value.is_empty()) {
        probe = probe.basic_auth(username, request.password.as_deref());
    }
    let response = probe.send().await;
    let latency_ms = start.elapsed().as_millis();
    let response = match response {
        Ok(response) => response,
        Err(error) => {
            return Ok(BmcTestResult {
                reachable: false,
                status_code: None,
                latency_ms,
                redfish_available: None,
                redfish_status_code: None,
                error: Some(error.to_string()),
            });
        }
    };
    let status_code = response.status().as_u16();

    let (redfish_available, redfish_status_code) = if request.test_redfish {
        let redfish_url = url
            .join("/redfish/v1/")
            .map_err(|_| AppError::Validation("Invalid Redfish URL".into()))?;
        let mut redfish_probe = client.get(redfish_url);
        if let Some(username) = request.username.as_ref().filter(|value| !value.is_empty()) {
            redfish_probe = redfish_probe.basic_auth(username, request.password.as_deref());
        }
        match redfish_probe.send().await {
            Ok(redfish) => {
                let code = redfish.status().as_u16();
                (Some(redfish.status().is_success() || code == 401), Some(code))
            }
            Err(_) => (Some(false), None),
        }
    } else {
        (None, None)
    };

    Ok(BmcTestResult {
        reachable: true,
        status_code: Some(status_code),
        latency_ms,
        redfish_available,
        redfish_status_code,
        error: None,
    })
}