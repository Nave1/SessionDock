const UPDATE_ENDPOINT: &str =
    "https://github.com/Nave1/SessionDock/releases/latest/download/latest.json";

pub fn configure() {
    #[cfg(target_os = "windows")]
    if std::env::var_os("HTTPS_PROXY").is_none() && std::env::var_os("https_proxy").is_none() {
        if let Some(proxy) = windows::resolve(UPDATE_ENDPOINT) {
            std::env::set_var("HTTPS_PROXY", &proxy);
            std::env::set_var("HTTP_PROXY", &proxy);
            log::info!("Using Windows system proxy for update checks");
        }
    }
}

fn select_proxy(value: &str) -> Option<String> {
    let entries: Vec<&str> = value
        .split(';')
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .collect();
    let selected = entries
        .iter()
        .find_map(|entry| entry.strip_prefix("https="))
        .or_else(|| entries.iter().find_map(|entry| entry.strip_prefix("http=")))
        .or_else(|| entries.first().copied())?
        .trim();

    if selected.eq_ignore_ascii_case("direct") || selected.is_empty() {
        None
    } else if selected.contains("://") {
        Some(selected.to_string())
    } else {
        Some(format!("http://{selected}"))
    }
}

#[cfg(target_os = "windows")]
mod windows {
    use super::select_proxy;
    use std::{ffi::OsStr, os::windows::ffi::OsStrExt, ptr};
    use winapi::{
        shared::minwindef::HGLOBAL,
        um::{
            winbase::GlobalFree,
            winhttp::{
                WinHttpCloseHandle, WinHttpGetIEProxyConfigForCurrentUser,
                WinHttpGetProxyForUrl, WinHttpOpen, WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
                WINHTTP_AUTOPROXY_AUTO_DETECT, WINHTTP_AUTOPROXY_CONFIG_URL,
                WINHTTP_AUTOPROXY_OPTIONS, WINHTTP_AUTO_DETECT_TYPE_DHCP,
                WINHTTP_AUTO_DETECT_TYPE_DNS_A, WINHTTP_CURRENT_USER_IE_PROXY_CONFIG,
                WINHTTP_PROXY_INFO,
            },
        },
    };

    pub fn resolve(url: &str) -> Option<String> {
        unsafe {
            let mut config: WINHTTP_CURRENT_USER_IE_PROXY_CONFIG = std::mem::zeroed();
            if WinHttpGetIEProxyConfigForCurrentUser(&mut config) == 0 {
                return None;
            }

            let result = resolve_from_config(url, &config).or_else(|| {
                pointer_to_string(config.lpszProxy).and_then(|proxy| select_proxy(&proxy))
            });

            free_global(config.lpszAutoConfigUrl);
            free_global(config.lpszProxy);
            free_global(config.lpszProxyBypass);
            result
        }
    }

    unsafe fn resolve_from_config(
        url: &str,
        config: &WINHTTP_CURRENT_USER_IE_PROXY_CONFIG,
    ) -> Option<String> {
        let auto_config_url = pointer_to_string(config.lpszAutoConfigUrl);
        if auto_config_url.is_none() && config.fAutoDetect == 0 {
            return None;
        }

        let agent = wide("SessionDock Updater");
        let session = WinHttpOpen(
            agent.as_ptr(),
            WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
            ptr::null(),
            ptr::null(),
            0,
        );
        if session.is_null() {
            return None;
        }

        let auto_config_wide = auto_config_url.as_deref().map(wide);
        let mut options: WINHTTP_AUTOPROXY_OPTIONS = std::mem::zeroed();
        if let Some(auto_config) = auto_config_wide.as_ref() {
            options.dwFlags = WINHTTP_AUTOPROXY_CONFIG_URL;
            options.lpszAutoConfigUrl = auto_config.as_ptr();
        } else {
            options.dwFlags = WINHTTP_AUTOPROXY_AUTO_DETECT;
            options.dwAutoDetectFlags =
                WINHTTP_AUTO_DETECT_TYPE_DHCP | WINHTTP_AUTO_DETECT_TYPE_DNS_A;
        }
        options.fAutoLogonIfChallenged = 1;

        let mut proxy_info: WINHTTP_PROXY_INFO = std::mem::zeroed();
        let url_wide = wide(url);
        let succeeded = WinHttpGetProxyForUrl(
            session,
            url_wide.as_ptr(),
            &mut options,
            &mut proxy_info,
        );
        WinHttpCloseHandle(session);

        let proxy = if succeeded != 0 {
            pointer_to_string(proxy_info.lpszProxy).and_then(|value| select_proxy(&value))
        } else {
            None
        };
        free_global(proxy_info.lpszProxy);
        free_global(proxy_info.lpszProxyBypass);
        proxy
    }

    fn wide(value: &str) -> Vec<u16> {
        OsStr::new(value).encode_wide().chain(Some(0)).collect()
    }

    unsafe fn pointer_to_string(pointer: *mut u16) -> Option<String> {
        if pointer.is_null() {
            return None;
        }
        let length = (0..).take_while(|offset| *pointer.add(*offset) != 0).count();
        String::from_utf16(std::slice::from_raw_parts(pointer, length)).ok()
    }

    unsafe fn free_global(pointer: *mut u16) {
        if !pointer.is_null() {
            GlobalFree(pointer as HGLOBAL);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::select_proxy;

    #[test]
    fn prefers_https_proxy() {
        assert_eq!(
            select_proxy("http=web-proxy:8080;https=secure-proxy:8443"),
            Some("http://secure-proxy:8443".to_string())
        );
    }

    #[test]
    fn rejects_direct_connection() {
        assert_eq!(select_proxy("DIRECT"), None);
    }
}