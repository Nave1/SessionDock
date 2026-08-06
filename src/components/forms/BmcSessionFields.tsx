import { useState } from "react";
import { AlertTriangle, LoaderCircle, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { BmcSessionConfig } from "../../types";
import { hasSensitiveUrlParameters, normalizeBmcUrl } from "../../utils/bmcUrl";
import { testBmcConnection, type BmcTestResult } from "../../api/bmc";

type BmcFields = Partial<BmcSessionConfig> & { vendor?: string; host?: string; port?: number; username?: string; password?: string };

interface BmcSessionFieldsProps {
  value: BmcFields;
  onChange: (patch: Partial<BmcFields>) => void;
}

const PRESETS = {
  dell: { vendor: "Dell", bmc_web_path: "/", bmc_redfish_enabled: true },
  hpe: { vendor: "HPE", bmc_web_path: "/", bmc_redfish_enabled: true },
  lenovo: { vendor: "Lenovo", bmc_web_path: "/", bmc_redfish_enabled: true },
  supermicro: { vendor: "Supermicro", bmc_web_path: "/", bmc_redfish_enabled: true },
} satisfies Record<string, Partial<BmcFields>>;

export function BmcSessionFields({ value, onChange }: BmcSessionFieldsProps) {
  const { t } = useTranslation();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<BmcTestResult>();
  let sensitiveUrl = false;
  let invalidUrl = false;
  if (value.bmc_console_url) {
    try {
      sensitiveUrl = hasSensitiveUrlParameters(normalizeBmcUrl(value.bmc_console_url));
    } catch {
      invalidUrl = true;
    }
  }

  const fieldClass = "w-full px-3 py-2 rounded bg-dock-bg border border-dock-border text-xs text-dock-text focus:border-dock-accent focus:outline-none";
  const runTest = async () => {
    setTesting(true);
    try {
      const url = normalizeBmcUrl(value.bmc_console_url || {
        host: value.host || "",
        port: value.port,
        useHttps: value.bmc_use_https,
        path: value.bmc_web_path,
      });
      setTestResult(await testBmcConnection({
        url,
        username: value.username,
        password: value.password,
        timeoutSeconds: value.bmc_timeout_seconds || 30,
        ignoreTlsErrors: value.bmc_ignore_tls_errors || false,
        testRedfish: value.bmc_redfish_enabled ?? true,
      }));
    } catch (cause) {
      setTestResult({ reachable: false, latencyMs: 0, error: String(cause) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <fieldset className="space-y-4 border-t border-dock-border pt-4">
      <legend className="px-2 text-xs font-semibold text-dock-text">{t("bmc.settings")}</legend>

      <div>
        <label className="block text-xs text-dock-text-muted mb-1.5">{t("bmc.vendorPreset")}</label>
        <select className={fieldClass} defaultValue="" onChange={(event) => {
          const preset = PRESETS[event.target.value as keyof typeof PRESETS];
          if (preset) onChange(preset);
        }}>
          <option value="">{t("bmc.custom")}</option>
          <option value="dell">Dell iDRAC</option>
          <option value="hpe">HPE iLO</option>
          <option value="lenovo">Lenovo XClarity</option>
          <option value="supermicro">Supermicro IPMI</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t("bmc.webPath")} value={value.bmc_web_path || ""} onChange={(bmc_web_path) => onChange({ bmc_web_path })} placeholder="/" />
        <Field label={t("bmc.timeout")} type="number" value={String(value.bmc_timeout_seconds ?? 30)} onChange={(input) => onChange({ bmc_timeout_seconds: Number(input) || 30 })} />
      </div>

      <Field label={t("bmc.consoleUrl")} value={value.bmc_console_url || ""} onChange={(bmc_console_url) => onChange({ bmc_console_url })} placeholder="https://bmc.example/console" />
      {(sensitiveUrl || invalidUrl) && (
        <div className="flex gap-2 p-3 rounded border border-amber-500/30 bg-amber-500/10 text-xs text-amber-400">
          <AlertTriangle size={14} className="shrink-0" />
          {invalidUrl ? t("bmc.invalidUrl") : t("bmc.sensitiveUrlWarning")}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Select label={t("bmc.viewerMode")} value={value.bmc_viewer_mode === "external-browser" ? "external-browser" : "web"} onChange={(bmc_viewer_mode) => onChange({ bmc_viewer_mode: bmc_viewer_mode as BmcSessionConfig["bmc_viewer_mode"] })} options={["web", "external-browser"]} />
        <Select label={t("bmc.cookiePersistence")} value={value.bmc_cookie_persistence || "application"} onChange={(bmc_cookie_persistence) => onChange({ bmc_cookie_persistence: bmc_cookie_persistence as BmcSessionConfig["bmc_cookie_persistence"] })} options={["tab", "application", "persistent"]} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t("bmc.serverHostname")} value={value.bmc_server_hostname || ""} onChange={(bmc_server_hostname) => onChange({ bmc_server_hostname })} />
        <Field label={t("bmc.serialNumber")} value={value.bmc_server_serial_number || ""} onChange={(bmc_server_serial_number) => onChange({ bmc_server_serial_number })} />
        <Field label={t("bmc.site")} value={value.bmc_site || ""} onChange={(bmc_site) => onChange({ bmc_site })} />
        <Field label={t("bmc.rack")} value={value.bmc_rack || ""} onChange={(bmc_rack) => onChange({ bmc_rack })} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Check label={t("bmc.useHttps")} checked={value.bmc_use_https ?? true} onChange={(bmc_use_https) => onChange({ bmc_use_https })} />
        <Check label={t("bmc.redfish")} checked={value.bmc_redfish_enabled ?? true} onChange={(bmc_redfish_enabled) => onChange({ bmc_redfish_enabled })} />
        <Check label={t("bmc.autoConsole")} checked={value.bmc_open_console_automatically ?? false} onChange={(bmc_open_console_automatically) => onChange({ bmc_open_console_automatically })} />
        <Check label={t("bmc.fullscreen")} checked={value.bmc_open_fullscreen ?? false} onChange={(bmc_open_fullscreen) => onChange({ bmc_open_fullscreen })} />
      </div>

      <div className="flex gap-2 p-3 rounded border border-dock-border bg-dock-surface text-xs text-dock-text-muted">
        <ShieldCheck size={14} className="shrink-0 text-dock-accent" />
        {t("bmc.tlsNotice")}
      </div>

      <div className="flex items-center gap-3">
        <button type="button" disabled={testing || !value.host} onClick={() => void runTest()} className="px-3 py-2 rounded text-xs bg-dock-surface text-dock-text hover:bg-dock-border disabled:opacity-50">
          {testing ? <LoaderCircle size={14} className="animate-spin" /> : t("bmc.testConnection")}
        </button>
        {testResult && (
          <span className={`text-xs ${testResult.reachable ? "text-emerald-400" : "text-red-400"}`}>
            {testResult.reachable
              ? `${t("bmc.reachable")} · HTTP ${testResult.statusCode} · ${testResult.latencyMs} ms${testResult.redfishAvailable !== undefined ? ` · Redfish ${testResult.redfishAvailable ? "OK" : "N/A"}` : ""}`
              : testResult.error || t("bmc.unreachable")}
          </span>
        )}
      </div>
    </fieldset>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return <label className="block text-xs text-dock-text-muted">{label}<input className="mt-1.5 w-full px-3 py-2 rounded bg-dock-bg border border-dock-border text-dock-text focus:border-dock-accent focus:outline-none" type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <label className="block text-xs text-dock-text-muted">{label}<select className="mt-1.5 w-full px-3 py-2 rounded bg-dock-bg border border-dock-border text-dock-text" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex items-center gap-2 text-xs text-dock-text-muted"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}