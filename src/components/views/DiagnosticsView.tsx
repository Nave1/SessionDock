import { useDeferredValue, useState } from "react";
import { CircleStop, ExternalLink, Play, RotateCcw, Search, Stethoscope, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { nativeInvoke } from "../../api/native";
import { findConnectedSshPane, listTerminalPaneIds, useAppStore } from "../../stores/appStore";
import { type DiagnosticRecord, type DiagnosticStatus, useDiagnosticStore } from "../../stores/diagnosticStore";
import { useToastStore } from "../../stores/toastStore";
import { DiagnosticRawOutput } from "../diagnostics/DiagnosticRawOutput";

type DiagnosticFilter = "all" | "active" | "completed" | "failed";

export function DiagnosticsView({ onQuickConnect = () => undefined }: { onQuickConnect?: () => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DiagnosticFilter>("all");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const diagnostics = useDiagnosticStore((state) => state.diagnostics);
  const attachDiagnostic = useDiagnosticStore((state) => state.attachDiagnostic);
  const clearFinished = useDiagnosticStore((state) => state.clearFinished);
  const { tabs, activeTabId, setActiveTab, setActivePane, setCurrentView, requestPaneTool } = useAppStore();
  const addToast = useToastStore((state) => state.addToast);

  const ownerFor = (diagnostic: DiagnosticRecord) => tabs.find((tab) =>
    listTerminalPaneIds(tab.paneLayout ?? { type: "pane", id: tab.id }).includes(diagnostic.tabId));
  const activeCount = diagnostics.filter((diagnostic) => diagnostic.status === "running").length;
  const completedCount = diagnostics.filter((diagnostic) => diagnostic.status === "completed").length;
  const failedCount = diagnostics.filter((diagnostic) => diagnostic.status === "failed").length;
  const visibleDiagnostics = diagnostics.filter((diagnostic) => {
    if (filter === "active" && diagnostic.status !== "running") return false;
    if (filter === "completed" && diagnostic.status !== "completed") return false;
    if (filter === "failed" && diagnostic.status !== "failed") return false;
    if (!deferredQuery) return true;
    const owner = ownerFor(diagnostic);
    return [diagnostic.providerId, diagnostic.diagnosticId, diagnostic.command, diagnostic.status, owner?.sessionName, owner?.host]
      .some((value) => value?.toLocaleLowerCase().includes(deferredQuery));
  });

  const focusOwner = (diagnostic: DiagnosticRecord) => {
    const owner = ownerFor(diagnostic);
    if (!owner) return;
    setActiveTab(owner.id);
    setActivePane(owner.id, diagnostic.tabId);
    setCurrentView("recent");
  };

  const runDiagnostic = () => {
    const target = findConnectedSshPane(tabs, activeTabId);
    if (!target) return onQuickConnect();
    requestPaneTool(target.tabId, target.paneId, "device");
  };

  const cancel = async (diagnostic: DiagnosticRecord) => {
    try {
      await nativeInvoke("cancel_ssh_diagnostic", { jobId: diagnostic.jobId });
    } catch (error) {
      addToast("error", String(error));
    }
  };

  const rerun = async (diagnostic: DiagnosticRecord) => {
    if (!ownerFor(diagnostic)) return;
    try {
      const jobId = await nativeInvoke<string>("start_ssh_diagnostic", {
        request: {
          tabId: diagnostic.tabId,
          providerId: diagnostic.providerId,
          diagnosticId: diagnostic.diagnosticId,
        },
      });
      attachDiagnostic(diagnostic.tabId, {
        jobId,
        providerId: diagnostic.providerId,
        diagnosticId: diagnostic.diagnosticId,
        command: diagnostic.command,
        status: "running",
        stdout: "",
        stderr: "",
        truncated: false,
      });
    } catch (error) {
      addToast("error", String(error));
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-dock-bg">
      <header className="border-b border-dock-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Stethoscope size={16} className="text-dock-accent" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-dock-text">{t("diagnosticsWorkspace.title")}</h2>
            <p className="text-[10px] text-dock-text-muted">{t("diagnosticsWorkspace.summary", { count: diagnostics.length })}</p>
          </div>
          <DiagnosticCount label={t("diagnosticsWorkspace.active")} count={activeCount} tone="active" />
          <DiagnosticCount label={t("diagnosticsWorkspace.completed")} count={completedCount} tone="completed" />
          <DiagnosticCount label={t("diagnosticsWorkspace.failed")} count={failedCount} tone="failed" />
          <button type="button" onClick={runDiagnostic} className="ms-1 inline-flex h-7 items-center gap-1 rounded bg-dock-accent px-2.5 text-[10px] font-medium text-white hover:bg-dock-accent-hover">
            <Play size={11} />
            <span>{t("diagnosticsWorkspace.start")}</span>
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-dock-border px-4 py-2">
        <div className="flex h-7 min-w-48 max-w-sm flex-1 items-center gap-2 rounded border border-dock-border bg-dock-sidebar px-2">
          <Search size={12} className="text-dock-text-muted" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("diagnosticsWorkspace.search")} className="min-w-0 flex-1 bg-transparent text-[11px] text-dock-text outline-none placeholder:text-dock-text-muted" />
          {query && <button type="button" onClick={() => setQuery("")} className="text-dock-text-muted hover:text-dock-text" aria-label={t("diagnosticsWorkspace.clearSearch")}><X size={11} /></button>}
        </div>
        <div className="flex h-7 rounded border border-dock-border bg-dock-sidebar p-0.5" role="group" aria-label={t("diagnosticsWorkspace.filterStatus")}>
          {(["all", "active", "completed", "failed"] as const).map((option) => (
            <button key={option} type="button" aria-pressed={filter === option} onClick={() => setFilter(option)} className={`rounded px-2 text-[10px] font-medium ${filter === option ? "bg-dock-surface text-dock-text" : "text-dock-text-muted hover:text-dock-text"}`}>
              {t(`diagnosticsWorkspace.${option}`)}
            </button>
          ))}
        </div>
        {diagnostics.some((diagnostic) => diagnostic.status !== "running") && (
          <button type="button" onClick={clearFinished} className="flex h-7 items-center gap-1 rounded border border-dock-border px-2 text-[10px] text-dock-text-muted hover:text-dock-text" title={t("diagnosticsWorkspace.clearFinished")}>
            <Trash2 size={11} />
            <span>{t("diagnosticsWorkspace.clearFinished")}</span>
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {diagnostics.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-dock-text-muted"><span>{t("diagnosticsWorkspace.empty")}</span><span className="text-[10px]">{t("diagnosticsWorkspace.emptyHint")}</span><button type="button" onClick={runDiagnostic} className="inline-flex h-7 items-center gap-1 rounded border border-dock-border px-2.5 text-[10px] text-dock-text hover:border-dock-accent"><Play size={11} />{t("diagnosticsWorkspace.start")}</button></div>
        ) : visibleDiagnostics.length === 0 ? (
          <div className="px-2 py-4 text-xs text-dock-text-muted">{t("diagnosticsWorkspace.noMatches")}</div>
        ) : (
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[minmax(170px,1.25fr)_minmax(170px,1.25fr)_minmax(150px,1fr)_100px_100px] gap-2 border-b border-dock-border px-2.5 py-1.5 text-[9px] font-semibold uppercase text-dock-text-muted">
              <span>{t("diagnosticsWorkspace.diagnostic")}</span>
              <span>{t("diagnosticsWorkspace.command")}</span>
              <span>{t("diagnosticsWorkspace.connection")}</span>
              <span>{t("diagnosticsWorkspace.status")}</span>
              <span className="text-end">{t("diagnosticsWorkspace.actions")}</span>
            </div>
            {visibleDiagnostics.map((diagnostic) => {
              const owner = ownerFor(diagnostic);
              return (
                <article key={diagnostic.jobId} className="border-b border-dock-border/70 hover:bg-dock-surface">
                  <div className="grid min-h-12 grid-cols-[minmax(170px,1.25fr)_minmax(170px,1.25fr)_minmax(150px,1fr)_100px_100px] items-center gap-2 px-2.5 py-1.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-dock-text">{t(`deviceInfo.diagnosticLabels.${diagnostic.diagnosticId}`, { defaultValue: diagnostic.diagnosticId })}</p>
                      <p className="truncate text-[9px] text-dock-text-muted">{diagnostic.providerId}</p>
                    </div>
                    <code className="truncate text-[10px] text-dock-text" dir="ltr" title={diagnostic.command}>{diagnostic.command}</code>
                    <div className="min-w-0">
                      <p className="truncate text-[10px] text-dock-text">{owner?.sessionName ?? t("diagnosticsWorkspace.closedConnection")}</p>
                      {owner && <p className="truncate font-mono text-[9px] text-dock-text-muted" dir="ltr">{owner.host}</p>}
                    </div>
                    <DiagnosticStatusLabel status={diagnostic.status} />
                    <div className="flex justify-end gap-0.5">
                      {owner && <ActionButton label={t("diagnosticsWorkspace.focus")} onClick={() => focusOwner(diagnostic)} icon={ExternalLink} />}
                      {diagnostic.status === "running" && <ActionButton label={t("deviceInfo.cancelDiagnostic")} onClick={() => void cancel(diagnostic)} icon={CircleStop} danger />}
                      {diagnostic.status !== "running" && owner && <ActionButton label={t("diagnosticsWorkspace.rerun")} onClick={() => void rerun(diagnostic)} icon={RotateCcw} />}
                    </div>
                  </div>
                  {(diagnostic.stdout || diagnostic.stderr || diagnostic.error || diagnostic.exitCode !== undefined) && (
                    <details className="border-t border-dock-border/50 px-2.5 py-1.5">
                      <summary className="cursor-pointer text-[9px] font-medium text-dock-text-muted">{t("deviceInfo.rawOutput")}</summary>
                      {diagnostic.exitCode !== undefined && <div className="mt-1 text-[9px] text-dock-text-muted">{t("deviceInfo.exitCode")}: {diagnostic.exitCode}</div>}
                      {diagnostic.truncated && <div className="mt-1 text-[9px] text-amber-400">{t("deviceInfo.truncated")}</div>}
                      {diagnostic.error && <div className="mt-1 text-[9px] text-red-400 break-words">{diagnostic.error}</div>}
                      <DiagnosticRawOutput stdout={diagnostic.stdout} stderr={diagnostic.stderr} />
                    </details>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function DiagnosticCount({ label, count, tone }: { label: string; count: number; tone: "active" | "completed" | "failed" }) {
  const color = tone === "active" ? "text-amber-400" : tone === "completed" ? "text-emerald-400" : "text-red-400";
  return <div className="min-w-16 text-end"><span className={`text-xs font-semibold tabular-nums ${color}`}>{count}</span><span className="ms-1 text-[9px] text-dock-text-muted">{label}</span></div>;
}

function DiagnosticStatusLabel({ status }: { status: DiagnosticStatus }) {
  const { t } = useTranslation();
  const tone = status === "completed" ? "bg-emerald-400" : status === "running" ? "bg-amber-400" : status === "cancelled" ? "bg-zinc-500" : "bg-red-400";
  return <span className="flex items-center gap-1.5 text-[10px] text-dock-text-muted"><span className={`h-1.5 w-1.5 rounded-full ${tone}`} /><span className="truncate">{t(`deviceInfo.status.${status}`)}</span></span>;
}

function ActionButton({ label, onClick, icon: Icon, danger = false }: { label: string; onClick: () => void; icon: typeof X; danger?: boolean }) {
  return <button type="button" onClick={onClick} className={`p-1.5 ${danger ? "text-dock-text-muted hover:text-red-400" : "text-dock-text-muted hover:text-dock-accent"}`} title={label} aria-label={label}><Icon size={12} /></button>;
}