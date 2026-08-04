import { invoke } from "@tauri-apps/api/core";

export interface BmcWebviewBounds {
  connectionId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function createBmcWebview(request: BmcWebviewBounds & { url: string; cookiePersistence: string }): Promise<string> {
  return invoke("create_bmc_webview", { request });
}

export async function setBmcWebviewBounds(request: BmcWebviewBounds): Promise<void> {
  return invoke("set_bmc_webview_bounds", { request });
}

export async function setBmcWebviewVisible(connectionId: string, visible: boolean): Promise<void> {
  return invoke("set_bmc_webview_visible", { connectionId, visible });
}

export async function reloadBmcWebview(connectionId: string): Promise<void> {
  return invoke("reload_bmc_webview", { connectionId });
}

export async function closeBmcWebview(connectionId: string, clearBrowsingData: boolean): Promise<void> {
  return invoke("close_bmc_webview", { connectionId, clearBrowsingData });
}

export interface BmcTestResult {
  reachable: boolean;
  statusCode?: number;
  latencyMs: number;
  redfishAvailable?: boolean;
  redfishStatusCode?: number;
  error?: string;
}

export async function testBmcConnection(request: {
  url: string;
  username?: string;
  password?: string;
  timeoutSeconds: number;
  ignoreTlsErrors: boolean;
  testRedfish: boolean;
}): Promise<BmcTestResult> {
  return invoke("test_bmc_connection", { request });
}