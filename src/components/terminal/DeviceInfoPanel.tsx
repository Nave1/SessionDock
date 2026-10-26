import { useState } from "react";
import { CircleStop, Cpu, Play, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { nativeInvoke } from "../../api/native";
import { selectDeviceProvider, type DeviceContext, type ProviderDiagnostic, type QuickCommand } from "../../device/providers";
import { type DiagnosticRecord, useDiagnosticStore } from "../../stores/diagnosticStore";
import { DiagnosticRawOutput } from "../diagnostics/DiagnosticRawOutput";

interface DeviceInfoPanelProps {
  tabId: string;
  context: DeviceContext;
  onClose: () => void;
}

export function DeviceInfoPanel({ tabId, context, onClose }: DeviceInfoPanelProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<"commands" | "diagnostics">("commands");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string>();
  const diagnostics = useDiagnosticStore((state) => state.diagnostics);
  const attachDiagnostic = useDiagnosticStore((state) => state.attachDiagnostic);
  const diagnosticResults = diagnostics.filter((diagnostic) => diagnostic.tabId === tabId);
  const match = selectDeviceProvider(context);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const commandLabel = (command: QuickCommand) => t(`deviceInfo.commands.${command.id}`, { defaultValue: command.label });
  const categoryLabel = (command: QuickCommand) => t(`deviceInfo.categories.${command.category.toLocaleLowerCase().split(" ").join("-")}`, { defaultValue: command.category });
  const commands = normalizedQuery
    ? match.provider.quickCommands.filter((command) => [commandLabel(command), command.command, categoryLabel(command)]
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery)))
    : match.provider.quickCommands;

  const insert = async (quickCommand: QuickCommand) => {
    setError(undefined);
    try {
      await nativeInvoke("write_terminal", { tabId, data: quickCommand.command, protocol: "ssh" });
    } catch (insertError) {
      setError(String(insertError));
    }
  };

  const runDiagnostic = async (diagnostic: ProviderDiagnostic) => {
    setError(undefined);
    try {
      const jobId = await nativeInvoke<string>("start_ssh_diagnostic", {
        request: { tabId, providerId: match.provider.id, diagnosticId: diagnostic.id },
      });
      attachDiagnostic(tabId, {
        jobId,
        providerId: match.provider.id,
        diagnosticId: diagnostic.id,
        command: diagnostic.command,
        status: "running",
        stdout: "",
        stderr: "",
        truncated: false,
      });
    } catch (diagnosticError) {
      setError(String(diagnosticError));
    }
  };

  const cancelDiagnostic = async (jobId: string) => {
    try {
      await nativeInvoke("cancel_ssh_diagnostic", { jobId });
    } catch (cancelError) {
      setError(String(cancelError));
    }
  };

  return (
    <aside className="w-[360px] max-w-[50vw] min-w-[300px] h-full flex flex-col bg-dock-sidebar border-s border-dock-border" aria-label={t("deviceInfo.title")}>
      <div className="h-9 px-2 flex items-center gap-1 border-b border-dock-border flex-shrink-0">
        <Cpu size={14} className="text-dock-accent" />
        <h2 className="text-xs font-semibold text-dock-text flex-1">{t("deviceInfo.title")}</h2>
        <button type="button" onClick={onClose} title={t("deviceInfo.close")} aria-label={t("deviceInfo.close")} className="p-1 rounded text-dock-text-muted hover:bg-dock-surface-hover hover:text-dock-text"><X size={13} /></button>
      </div>

      <ProviderDetails context={context} match={match} />

      <div className="m-2 grid grid-cols-2 rounded border border-dock-border bg-dock-bg p-0.5" role="group" aria-label={t("deviceInfo.viewMode")}>
        <button type="button" aria-pressed={view === "commands"} onClick={() => setView("commands")} className={`h-6 rounded text-[10px] font-medium ${view === "commands" ? "bg-dock-surface text-dock-text shadow-sm" : "text-dock-text-muted hover:text-dock-text"}`}>{t("deviceInfo.quickCommands")}</button>
        <button type="button" aria-pressed={view === "diagnostics"} onClick={() => setView("diagnostics")} className={`h-6 rounded text-[10px] font-medium ${view === "diagnostics" ? "bg-dock-surface text-dock-text shadow-sm" : "text-dock-text-muted hover:text-dock-text"}`}>{t("deviceInfo.diagnostics")}</button>
      </div>

      {error && <div role="alert" className="px-3 py-2 border-b border-red-500/30 bg-red-500/10 text-[10px] text-red-400 break-words">{error}</div>}

      {view === "commands" ? (
        <QuickCommandsView
          commands={commands}
          query={query}
          setQuery={setQuery}
          providerId={match.provider.id}
          commandLabel={commandLabel}
          categoryLabel={categoryLabel}
          insert={insert}
        />
      ) : (
        <DiagnosticsView
          providerId={match.provider.id}
          diagnostics={match.provider.diagnostics}
          results={diagnosticResults}
          run={runDiagnostic}
          cancel={cancelDiagnostic}
        />
      )}
    </aside>
  );
}

function ProviderDetails({ context, match }: { context: DeviceContext; match: ReturnType<typeof selectDeviceProvider> }) {
  const { t } = useTranslation();
  return (
    <section className="p-3 border-b border-dock-border" aria-label={t("deviceInfo.providerDetails")}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold text-dock-text">{match.provider.name}</div>
          <div className="text-[10px] text-dock-text-muted">{match.provider.operatingSystem}</div>
        </div>
        <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${match.confidence === "high" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>{t(`deviceInfo.confidence.${match.confidence}`)}</span>
      </div>
      <dl className="mt-2 grid grid-cols-[88px_minmax(0,1fr)] gap-x-2 gap-y-1 text-[10px]">
        <dt className="text-dock-text-muted">{t("deviceInfo.source")}</dt><dd className="truncate text-dock-text">{t(`deviceInfo.sources.${match.source}`)}</dd>
        <dt className="text-dock-text-muted">{t("deviceInfo.vendor")}</dt><dd className="truncate text-dock-text" dir="auto">{context.vendor || t("deviceInfo.notConfigured")}</dd>
        <dt className="text-dock-text-muted">{t("deviceInfo.deviceType")}</dt><dd className="truncate text-dock-text" dir="auto">{context.deviceType || t("deviceInfo.notConfigured")}</dd>
        <dt className="text-dock-text-muted">{t("deviceInfo.model")}</dt><dd className="truncate text-dock-text" dir="auto">{context.model || t("deviceInfo.notConfigured")}</dd>
        <dt className="text-dock-text-muted">{t("deviceInfo.providerVersion")}</dt><dd className="text-dock-text" dir="ltr">{match.provider.version}</dd>
      </dl>
    </section>
  );
}

function QuickCommandsView({ commands, query, setQuery, providerId, commandLabel, categoryLabel, insert }: {
  commands: readonly QuickCommand[];
  query: string;
  setQuery: (value: string) => void;
  providerId: string;
  commandLabel: (command: QuickCommand) => string;
  categoryLabel: (command: QuickCommand) => string;
  insert: (command: QuickCommand) => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-2 pb-2 border-b border-dock-border">
        <label className="h-7 px-2 flex items-center gap-2 rounded border border-dock-border bg-dock-bg focus-within:border-dock-accent">
          <Search size={12} className="text-dock-text-muted" /><span className="sr-only">{t("deviceInfo.search")}</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("deviceInfo.search")} className="min-w-0 flex-1 bg-transparent text-[11px] text-dock-text outline-none placeholder:text-dock-text-muted" />
        </label>
        <p className="mt-1.5 text-[9px] leading-3 text-dock-text-muted">{t("deviceInfo.advisory")}</p>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {commands.length === 0 && <div className="p-4 text-center text-xs text-dock-text-muted">{t(providerId === "generic-ssh" ? "deviceInfo.noProviderCommands" : "deviceInfo.noResults")}</div>}
        {commands.map((command) => (
          <article key={command.id} className="px-2 py-2 border-b border-dock-border/60">
            <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-[11px] font-medium text-dock-text">{commandLabel(command)}</span><span className="text-[9px] text-dock-text-muted">{categoryLabel(command)}</span><ReadOnlyBadge /></div>
            <CommandText command={command.command} />
            <button type="button" onClick={() => void insert(command)} className="mt-2 h-7 w-full rounded border border-dock-border text-[10px] font-medium text-dock-text hover:bg-dock-surface-hover">{t("deviceInfo.insert")}</button>
          </article>
        ))}
      </div>
    </div>
  );
}

function DiagnosticsView({ providerId, diagnostics, results, run, cancel }: {
  providerId: string;
  diagnostics: readonly ProviderDiagnostic[];
  results: DiagnosticRecord[];
  run: (diagnostic: ProviderDiagnostic) => Promise<void>;
  cancel: (jobId: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <p className="px-3 pb-2 text-[9px] leading-3 text-dock-text-muted">{t("deviceInfo.diagnosticAdvisory")}</p>
      {diagnostics.length === 0 && <div className="p-4 text-center text-xs text-dock-text-muted">{t("deviceInfo.noDiagnostics")}</div>}
      {diagnostics.map((diagnostic) => (
        <article key={`${providerId}-${diagnostic.id}`} className="px-2 py-2 border-b border-dock-border/60">
          <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-[11px] font-medium text-dock-text">{t(`deviceInfo.diagnosticLabels.${diagnostic.id}`, { defaultValue: diagnostic.label })}</span><ReadOnlyBadge /></div>
          <CommandText command={diagnostic.command} />
          <button type="button" onClick={() => void run(diagnostic)} className="mt-2 h-7 w-full flex items-center justify-center gap-1 rounded border border-dock-border text-[10px] font-medium text-dock-text hover:bg-dock-surface-hover"><Play size={11} />{t("deviceInfo.runDiagnostic")}</button>
        </article>
      ))}
      {results.length > 0 && <h3 className="sticky top-0 px-2 py-1.5 bg-dock-sidebar border-b border-dock-border text-[10px] font-semibold uppercase text-dock-text-muted">{t("deviceInfo.results")}</h3>}
      {results.map((result) => <DiagnosticResult key={result.jobId} result={result} cancel={cancel} />)}
    </div>
  );
}

function DiagnosticResult({ result, cancel }: { result: DiagnosticRecord; cancel: (jobId: string) => Promise<void> }) {
  const { t } = useTranslation();
  return (
    <article className="px-2 py-2 border-b border-dock-border/60">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-dock-text">{t(`deviceInfo.diagnosticLabels.${result.diagnosticId}`, { defaultValue: result.diagnosticId })}</span>
        <span className={`text-[9px] font-semibold ${result.status === "completed" ? "text-emerald-400" : result.status === "failed" ? "text-red-400" : "text-amber-400"}`}>{t(`deviceInfo.status.${result.status}`)}</span>
        {result.status === "running" && <button type="button" onClick={() => void cancel(result.jobId)} title={t("deviceInfo.cancelDiagnostic")} aria-label={t("deviceInfo.cancelDiagnostic")} className="p-1 rounded text-red-400 hover:bg-dock-surface-hover"><CircleStop size={12} /></button>}
      </div>
      <CommandText command={result.command} />
      {result.exitCode !== undefined && <div className="mt-1 text-[9px] text-dock-text-muted">{t("deviceInfo.exitCode")}: {result.exitCode}</div>}
      {result.truncated && <div className="mt-1 text-[9px] text-amber-400">{t("deviceInfo.truncated")}</div>}
      {result.error && <div className="mt-1 text-[9px] text-red-400 break-words">{result.error}</div>}
      {(result.stdout || result.stderr) && <details open className="mt-2"><summary className="cursor-pointer text-[9px] font-medium text-dock-text-muted">{t("deviceInfo.rawOutput")}</summary><DiagnosticRawOutput stdout={result.stdout} stderr={result.stderr} /></details>}
    </article>
  );
}

function CommandText({ command }: { command: string }) {
  return <pre className="mt-1 px-2 py-1.5 overflow-x-auto rounded bg-dock-bg text-[10px] leading-4 font-mono text-dock-text whitespace-pre-wrap break-words" dir="ltr">{command}</pre>;
}

function ReadOnlyBadge() {
  const { t } = useTranslation();
  return <span className="px-1 py-0.5 rounded bg-emerald-500/15 text-[9px] font-semibold text-emerald-400">{t("deviceInfo.readOnly")}</span>;
}