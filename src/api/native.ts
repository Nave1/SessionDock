import { invoke, isTauri, type InvokeArgs, type InvokeOptions } from "@tauri-apps/api/core";

export const NATIVE_RUNTIME_REQUIRED =
  "Device connections require the SessionDock desktop application. Browser preview does not provide native Tauri access.";

export function requireNativeRuntime(): void {
  if (!isTauri()) {
    throw new Error(NATIVE_RUNTIME_REQUIRED);
  }
}

export function nativeInvoke<T>(
  command: string,
  args?: InvokeArgs,
  options?: InvokeOptions,
): Promise<T> {
  requireNativeRuntime();
  return options === undefined
    ? invoke<T>(command, args)
    : invoke<T>(command, args, options);
}