import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { CircleStop, ListChecks, Play, ShieldAlert, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { nativeInvoke } from "../../api/native";
import { useAppStore } from "../../stores/appStore";

interface MultiExecPanelProps {
  tabId: string;
  onClose: () => void;
}

type CommandRisk = "read_only" | "potentially_modifying" | "high_risk";
type ExecutionStatus = "running" | "completed" | "failed" | "cancelled";

interface CommandClassification {
  risk: CommandRisk;
  reasons: string[];
}

interface MultiExecEvent {
  batchId: string;
  targetTabId: string;
  command: string;
  risk: CommandRisk;
  status: ExecutionStatus;
  stdout: string;
  stderr: string;
  exitCode?: number;
  truncated: boolean;
  error?: string;
}

interface MultiExecTarget {
  tabId: string;
  name: string;
  host: string;
}

export function MultiExecPanel({ tabId, onClose }: MultiExecPanelProps) {
  const { t } = useTranslation();
  const tabs = useAppStore((state) => state.tabs);
  const targets = useMemo<MultiExecTarget[]>(() => tabs
    .filter((tab) => tab.protocol === "ssh" && tab.status === "connected")
    .map((tab) => ({
      tabId: tab.activePaneId ?? tab.id,
      name: tab.sessionName,
      host: tab.host,
    })), [tabs]);
  const [selectedTargets, setSelectedTargets] = useState<string[]>([tabId]);
  const [command, setCommand] = useState("");
  const [classification, setClassification] = useState<CommandClassification>();
  const [acknowledgedRisk, setAcknowledgedRisk] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [batchId, setBatchId] = useState<string>();
  const [results, setResults] = useState<Record<string, MultiExecEvent>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const expectedConfirmation = `EXECUTE ${selectedTargets.length} TARGETS`;
  const running = Object.values(results).some((result) => result.status === "running");

  useEffect(() => {
    const available = new Set(targets.map((target) => target.tabId));
    setSelectedTargets((current) => {
      const next = current.filter((targetId) => available.has(targetId));
      if (available.has(tabId) && !next.includes(tabId)) next.unshift(tabId);
      return next;
    });
  }, [tabId, targets]);

  useEffect(() => {
    const unlisten = listen<MultiExecEvent>(`multi-exec-${tabId}`, ({ payload }) => {
      setResults((current) => ({ ...current, [payload.targetTabId]: payload }));
      setBatchId(payload.batchId);
    });
    return () => { void unlisten.then((dispose) => dispose()); };
  }, [tabId]);

  const resetReview = () => {
    setClassification(undefined);
    setAcknowledgedRisk(false);
    setConfirmation("");
    setError(undefined);
  };

  const toggleTarget = (targetId: string) => {
    setSelectedTargets((current) => current.includes(targetId)
      ? current.filter((id) => id !== targetId)
      : [...current, targetId]);
    resetReview();
  };

  const review = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await nativeInvoke<CommandClassification>("classify_multi_exec_command", { command });
      setClassification(result);
      setAcknowledgedRisk(false);
      setConfirmation("");
    } catch (reviewError) {
      setError(String(reviewError));
    } finally {
      setLoading(false);
    }
  };

  const execute = async () => {
    setLoading(true);
    setError(undefined);
    setResults({});
    setBatchId(undefined);
    try {
      const nextBatchId = await nativeInvoke<string>("start_multi_exec", {
        request: {
          ownerTabId: tabId,
          targetTabIds: selectedTargets,
          command,
          acknowledgedRisk,
          confirmation: classification?.risk === "high_risk" ? confirmation : null,
        },
      });
      setBatchId(nextBatchId);
    } catch (executionError) {
      setError(String(executionError));
    } finally {
      setLoading(false);
    }
  };

  const cancel = async () => {
    if (!batchId) return;
    try {
      await nativeInvoke("cancel_multi_exec", { batchId });
    } catch (cancelError) {
      setError(String(cancelError));
    }
  };

  const canExecute = classification
    && selectedTargets.length > 0
    && (classification.risk === "read_only" || acknowledgedRisk)
    && (classification.risk !== "high_risk" || confirmation === expectedConfirmation)
    && !loading
    && !running;

  return (
    <aside className="w-[420px] max-w-[55vw] min-w-[340px] h-full flex flex-col bg-dock-sidebar border-s border-dock-border" aria-label={t("multiExec.title")}>
      <div className="h-9 px-2 flex items-center gap-1 border-b border-dock-border flex-shrink-0">
        <ListChecks size={14} className="text-dock-accent" />
        <h2 className="text-xs font-semibold text-dock-text flex-1">{t("multiExec.title")}</h2>
        <button type="button" onClick={onClose} title={t("multiExec.close")} aria-label={t("multiExec.close")} className="p-1 rounded text-dock-text-muted hover:bg-dock-surface-hover hover:text-dock-text"><X size={13} /></button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <section className="p-3 border-b border-dock-border" aria-labelledby="multi-exec-targets">
          <div className="flex items-center justify-between gap-2">
            <h3 id="multi-exec-targets" className="text-[10px] font-semibold uppercase text-dock-text-muted">{t("multiExec.targets")}</h3>
            <span className="text-[10px] text-dock-text-muted">{t("multiExec.selectedCount", { count: selectedTargets.length })}</span>
          </div>
          <div className="mt-2 max-h-36 overflow-auto border-y border-dock-border/60">
            {targets.length === 0 && <div className="py-3 text-center text-[10px] text-dock-text-muted">{t("multiExec.noTargets")}</div>}
            {targets.map((target) => (
              <label key={target.tabId} className="h-9 px-1 flex items-center gap-2 border-b last:border-b-0 border-dock-border/60 cursor-pointer hover:bg-dock-surface-hover">
                <input type="checkbox" checked={selectedTargets.includes(target.tabId)} onChange={() => toggleTarget(target.tabId)} className="accent-dock-accent" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] text-dock-text">{target.name}</span>
                  <span className="block truncate text-[9px] text-dock-text-muted" dir="ltr">{target.host}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="p-3 border-b border-dock-border" aria-labelledby="multi-exec-command">
          <h3 id="multi-exec-command" className="text-[10px] font-semibold uppercase text-dock-text-muted">{t("multiExec.command")}</h3>
          <textarea
            value={command}
            onChange={(event) => { setCommand(event.target.value); resetReview(); }}
            maxLength={8192}
            rows={3}
            dir="ltr"
            aria-label={t("multiExec.command")}
            placeholder={t("multiExec.commandPlaceholder")}
            className="mt-2 w-full resize-y rounded border border-dock-border bg-dock-bg px-2 py-1.5 font-mono text-[11px] leading-4 text-dock-text outline-none focus:border-dock-accent"
          />
          <p className="mt-1.5 text-[9px] leading-3 text-dock-text-muted">{t("multiExec.classificationAdvisory")}</p>
          <button type="button" onClick={() => void review()} disabled={!command.trim() || selectedTargets.length === 0 || loading || running} className="mt-2 h-7 w-full rounded border border-dock-border text-[10px] font-medium text-dock-text hover:bg-dock-surface-hover disabled:opacity-40">{loading ? t("multiExec.reviewing") : t("multiExec.review")}</button>
        </section>

        {classification && (
          <section className="p-3 border-b border-dock-border" aria-labelledby="multi-exec-review">
            <div className="flex items-center gap-2">
              <ShieldAlert size={13} className={classification.risk === "read_only" ? "text-emerald-400" : classification.risk === "high_risk" ? "text-red-400" : "text-amber-400"} />
              <h3 id="multi-exec-review" className="text-[10px] font-semibold uppercase text-dock-text-muted">{t("multiExec.reviewTitle")}</h3>
              <span className={`ms-auto text-[9px] font-semibold ${classification.risk === "read_only" ? "text-emerald-400" : classification.risk === "high_risk" ? "text-red-400" : "text-amber-400"}`}>{t(`multiExec.risk.${classification.risk}`)}</span>
            </div>
            <div className="mt-2 text-[9px] text-dock-text-muted">{t("multiExec.exactCommand")}</div>
            <pre className="mt-1 rounded bg-dock-bg p-2 font-mono text-[10px] leading-4 text-dock-text whitespace-pre-wrap break-words" dir="ltr">{command.trim()}</pre>
            <div className="mt-2 text-[10px] text-dock-text">{t("multiExec.targetSummary", { count: selectedTargets.length })}</div>

            {classification.risk !== "read_only" && (
              <label className="mt-3 flex items-start gap-2 text-[10px] leading-4 text-amber-300 cursor-pointer">
                <input type="checkbox" checked={acknowledgedRisk} onChange={(event) => setAcknowledgedRisk(event.target.checked)} className="mt-0.5 accent-dock-accent" />
                <span>{t("multiExec.acknowledgeRisk")}</span>
              </label>
            )}
            {classification.risk === "high_risk" && (
              <label className="mt-3 block text-[10px] text-red-300">
                {t("multiExec.confirmationPrompt", { phrase: expectedConfirmation })}
                <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} dir="ltr" aria-label={t("multiExec.confirmation")} className="mt-1 h-7 w-full rounded border border-red-500/50 bg-dock-bg px-2 font-mono text-[10px] text-dock-text outline-none focus:border-red-400" />
              </label>
            )}
            <button type="button" onClick={() => void execute()} disabled={!canExecute} className="mt-3 h-8 w-full flex items-center justify-center gap-1 rounded bg-dock-accent text-[10px] font-semibold text-white hover:brightness-110 disabled:opacity-40"><Play size={12} />{t("multiExec.execute", { count: selectedTargets.length })}</button>
          </section>
        )}

        {error && <div role="alert" className="px-3 py-2 border-b border-red-500/30 bg-red-500/10 text-[10px] text-red-400 break-words">{error}</div>}

        {Object.keys(results).length > 0 && (
          <section aria-labelledby="multi-exec-results">
            <div className="sticky top-0 z-10 px-3 py-2 flex items-center gap-2 bg-dock-sidebar border-b border-dock-border">
              <h3 id="multi-exec-results" className="text-[10px] font-semibold uppercase text-dock-text-muted flex-1">{t("multiExec.results")}</h3>
              {running && <button type="button" onClick={() => void cancel()} className="h-6 px-2 flex items-center gap-1 rounded border border-red-500/40 text-[9px] font-medium text-red-400 hover:bg-red-500/10"><CircleStop size={11} />{t("multiExec.cancel")}</button>}
            </div>
            {targets.filter((target) => results[target.tabId]).map((target) => <TargetResult key={target.tabId} target={target} result={results[target.tabId]} />)}
          </section>
        )}
      </div>
    </aside>
  );
}

function TargetResult({ target, result }: { target: MultiExecTarget; result: MultiExecEvent }) {
  const { t } = useTranslation();
  return (
    <article className="px-3 py-2 border-b border-dock-border/60">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-dock-text">{target.name}</span>
        <span className={`text-[9px] font-semibold ${result.status === "completed" ? "text-emerald-400" : result.status === "failed" ? "text-red-400" : "text-amber-400"}`}>{t(`multiExec.status.${result.status}`)}</span>
      </div>
      <div className="truncate text-[9px] text-dock-text-muted" dir="ltr">{target.host}</div>
      {result.exitCode !== undefined && <div className="mt-1 text-[9px] text-dock-text-muted">{t("multiExec.exitCode")}: {result.exitCode}</div>}
      {result.truncated && <div className="mt-1 text-[9px] text-amber-400">{t("multiExec.truncated")}</div>}
      {result.error && <div className="mt-1 text-[9px] text-red-400 break-words">{result.error}</div>}
      {(result.stdout || result.stderr) && (
        <details open className="mt-2">
          <summary className="cursor-pointer text-[9px] font-medium text-dock-text-muted">{t("multiExec.rawOutput")}</summary>
          {result.stdout && <pre className="mt-1 max-h-40 overflow-auto rounded bg-dock-bg p-2 font-mono text-[10px] leading-4 text-dock-text whitespace-pre-wrap break-words" dir="ltr">{result.stdout}</pre>}
          {result.stderr && <pre className="mt-1 max-h-32 overflow-auto rounded bg-red-500/5 p-2 font-mono text-[10px] leading-4 text-red-300 whitespace-pre-wrap break-words" dir="ltr">{result.stderr}</pre>}
        </details>
      )}
    </article>
  );
}