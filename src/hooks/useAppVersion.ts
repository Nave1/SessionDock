import { useState, useEffect } from "react";

/**
 * Hook to retrieve the installed application version from Tauri runtime.
 * Returns the version from tauri.conf.json (embedded in the binary at build time).
 */
export function useAppVersion() {
  const [version, setVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchVersion() {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const v = await getVersion();
        if (!cancelled) {
          setVersion(v);
          setLoading(false);
        }
      } catch {
        // Fallback for dev mode (browser without Tauri)
        if (!cancelled) {
          setVersion(null);
          setLoading(false);
        }
      }
    }

    fetchVersion();
    return () => { cancelled = true; };
  }, []);

  return { version, loading };
}
