import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToastStore } from "../../stores/toastStore";

interface DiagnosticRawOutputProps {
  stdout: string;
  stderr: string;
}

export function DiagnosticRawOutput({ stdout, stderr }: DiagnosticRawOutputProps) {
  const { t } = useTranslation();
  const addToast = useToastStore((state) => state.addToast);
  const output = [stdout, stderr].filter(Boolean).join(stdout && stderr ? "\n" : "");

  const copy = async () => {
    try {
      await writeText(output);
      addToast("success", t("deviceInfo.rawOutputCopied"));
    } catch (error) {
      addToast("error", t("deviceInfo.rawOutputCopyFailed", { error: String(error) }));
    }
  };

  if (!output) return null;
  return (
    <div className="mt-1">
      <div className="flex justify-end">
        <button type="button" onClick={() => void copy()} className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[9px] text-dock-text-muted hover:bg-dock-surface-hover hover:text-dock-text" title={t("deviceInfo.copyRawOutput")} aria-label={t("deviceInfo.copyRawOutput")}>
          <Copy size={11} />
          <span>{t("deviceInfo.copy")}</span>
        </button>
      </div>
      {stdout && <pre className="select-text max-h-64 overflow-auto bg-dock-bg p-2 font-mono text-[10px] leading-4 text-dock-text whitespace-pre-wrap break-words" dir="ltr">{stdout}</pre>}
      {stderr && <pre className="select-text mt-1 max-h-40 overflow-auto bg-red-500/5 p-2 font-mono text-[10px] leading-4 text-red-300 whitespace-pre-wrap break-words" dir="ltr">{stderr}</pre>}
    </div>
  );
}