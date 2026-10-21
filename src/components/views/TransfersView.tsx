import { useDeferredValue, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ExternalLink,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { nativeInvoke } from "../../api/native";
import { findConnectedSshPane, listTerminalPaneIds, useAppStore } from "../../stores/appStore";
import {
  type TransferRecord,
  type TransferStatus,
  useTransferStore,
} from "../../stores/transferStore";
import { useToastStore } from "../../stores/toastStore";
import { formatTransferSize } from "../../utils/sftp";

type TransferFilter = "all" | "active" | "completed" | "failed";

const ACTIVE_STATUSES = new Set<TransferStatus>(["running", "paused"]);

export function TransfersView({ onQuickConnect = () => undefined }: { onQuickConnect?: () => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TransferFilter>("all");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const transfers = useTransferStore((state) => state.transfers);
  const setTransferStatus = useTransferStore((state) => state.setTransferStatus);
  const attachRequest = useTransferStore((state) => state.attachRequest);
  const clearFinished = useTransferStore((state) => state.clearFinished);
  const { tabs, activeTabId, setActiveTab, setActivePane, setCurrentView, requestPaneTool } = useAppStore();
  const addToast = useToastStore((state) => state.addToast);

  const ownerFor = (transfer: TransferRecord) => tabs.find((tab) =>
    listTerminalPaneIds(tab.paneLayout ?? { type: "pane", id: tab.id }).includes(transfer.tabId));
  const activeCount = transfers.filter((transfer) => ACTIVE_STATUSES.has(transfer.status)).length;
  const completedCount = transfers.filter((transfer) => transfer.status === "completed").length;
  const failedCount = transfers.filter((transfer) => transfer.status === "failed").length;
  const visibleTransfers = transfers.filter((transfer) => {
    if (filter === "active" && !ACTIVE_STATUSES.has(transfer.status)) return false;
    if (filter === "completed" && transfer.status !== "completed") return false;
    if (filter === "failed" && transfer.status !== "failed") return false;
    if (!deferredQuery) return true;
    const owner = ownerFor(transfer);
    return [transfer.name, transfer.direction, transfer.status, transfer.request?.args.remotePath, owner?.sessionName, owner?.host]
      .some((value) => value?.toLocaleLowerCase().includes(deferredQuery));
  });

  const focusOwner = (transfer: TransferRecord) => {
    const owner = ownerFor(transfer);
    if (!owner) return;
    setActiveTab(owner.id);
    setActivePane(owner.id, transfer.tabId);
    setCurrentView("recent");
  };

  const startTransfer = () => {
    const target = findConnectedSshPane(tabs, activeTabId);
    if (!target) return onQuickConnect();
    requestPaneTool(target.tabId, target.paneId, "files", "sftp");
  };

  const changeState = async (transfer: TransferRecord, action: "pause" | "resume" | "cancel") => {
    try {
      await nativeInvoke(`${action}_sftp_transfer`, { transferId: transfer.id });
      setTransferStatus(transfer.id, action === "pause" ? "paused" : action === "resume" ? "running" : "cancelled");
    } catch (error) {
      addToast("error", String(error));
    }
  };

  const retry = async (transfer: TransferRecord) => {
    if (!transfer.request || !ownerFor(transfer)) return;
    const run = async (overwrite: boolean) => {
      const args = { ...transfer.request!.args, overwrite };
      const id = await nativeInvoke<string>(transfer.request!.command, args);
      attachRequest(
        transfer.tabId,
        id,
        { ...transfer.request!, args } as typeof transfer.request,
        transfer.name,
        transfer.direction,
      );
    };
    try {
      await run(transfer.request.args.overwrite);
    } catch (error) {
      const message = String(error);
      if (message.includes("destination already exists") && window.confirm(t("sftp.confirmOverwrite"))) {
        await run(true).catch((retryError) => addToast("error", String(retryError)));
      } else {
        addToast("error", message);
      }
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-dock-bg">
      <header className="border-b border-dock-border px-4 py-3">
        <div className="flex items-center gap-2">
          <ArrowUpFromLine size={16} className="text-dock-accent" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-dock-text">{t("transfers.title")}</h2>
            <p className="text-[10px] text-dock-text-muted">{t("transfers.summary", { count: transfers.length })}</p>
          </div>
          <TransferCount label={t("transfers.active")} count={activeCount} tone="active" />
          <TransferCount label={t("transfers.completed")} count={completedCount} tone="completed" />
          <TransferCount label={t("transfers.failed")} count={failedCount} tone="failed" />
          <button type="button" onClick={startTransfer} className="ms-1 inline-flex h-7 items-center gap-1 rounded bg-dock-accent px-2.5 text-[10px] font-medium text-white hover:bg-dock-accent-hover">
            <Plus size={12} />
            <span>{t("transfers.start")}</span>
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-dock-border px-4 py-2">
        <div className="flex h-7 min-w-48 max-w-sm flex-1 items-center gap-2 rounded border border-dock-border bg-dock-sidebar px-2">
          <Search size={12} className="text-dock-text-muted" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("transfers.search")} className="min-w-0 flex-1 bg-transparent text-[11px] text-dock-text outline-none placeholder:text-dock-text-muted" />
          {query && <button type="button" onClick={() => setQuery("")} className="text-dock-text-muted hover:text-dock-text" aria-label={t("transfers.clearSearch")}><X size={11} /></button>}
        </div>
        <div className="flex h-7 rounded border border-dock-border bg-dock-sidebar p-0.5" role="group" aria-label={t("transfers.filterStatus")}>
          {(["all", "active", "completed", "failed"] as const).map((option) => (
            <button key={option} type="button" aria-pressed={filter === option} onClick={() => setFilter(option)} className={`rounded px-2 text-[10px] font-medium ${filter === option ? "bg-dock-surface text-dock-text" : "text-dock-text-muted hover:text-dock-text"}`}>
              {t(`transfers.${option}`)}
            </button>
          ))}
        </div>
        {transfers.some((transfer) => !ACTIVE_STATUSES.has(transfer.status)) && (
          <button type="button" onClick={clearFinished} className="flex h-7 items-center gap-1 rounded border border-dock-border px-2 text-[10px] text-dock-text-muted hover:text-dock-text" title={t("transfers.clearFinished")}>
            <Trash2 size={11} />
            <span>{t("transfers.clearFinished")}</span>
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {transfers.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-dock-text-muted"><span>{t("transfers.empty")}</span><button type="button" onClick={startTransfer} className="inline-flex h-7 items-center gap-1 rounded border border-dock-border px-2.5 text-[10px] text-dock-text hover:border-dock-accent"><Plus size={12} />{t("transfers.start")}</button></div>
        ) : visibleTransfers.length === 0 ? (
          <div className="px-2 py-4 text-xs text-dock-text-muted">{t("transfers.noMatches")}</div>
        ) : (
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[minmax(170px,1.4fr)_90px_minmax(160px,1.2fr)_150px_100px_110px] gap-2 border-b border-dock-border px-2.5 py-1.5 text-[9px] font-semibold uppercase text-dock-text-muted">
              <span>{t("transfers.file")}</span>
              <span>{t("transfers.direction")}</span>
              <span>{t("transfers.connection")}</span>
              <span>{t("transfers.progress")}</span>
              <span>{t("transfers.status")}</span>
              <span className="text-end">{t("transfers.actions")}</span>
            </div>
            {visibleTransfers.map((transfer) => {
              const owner = ownerFor(transfer);
              const percent = transfer.total > 0 ? Math.min(100, Math.round((transfer.transferred / transfer.total) * 100)) : 0;
              return (
                <div key={transfer.id} className="grid min-h-12 grid-cols-[minmax(170px,1.4fr)_90px_minmax(160px,1.2fr)_150px_100px_110px] items-center gap-2 border-b border-dock-border/70 px-2.5 py-1.5 hover:bg-dock-surface">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-dock-text" title={transfer.name}>{transfer.name}</p>
                    <p className="truncate font-mono text-[9px] text-dock-text-muted" dir="ltr" title={transfer.request?.args.remotePath}>{transfer.request?.args.remotePath ?? t("transfers.runtimeTransfer")}</p>
                  </div>
                  <span className="flex items-center gap-1 text-[10px] text-dock-text-muted">
                    {transfer.direction === "upload" ? <ArrowUpFromLine size={11} /> : <ArrowDownToLine size={11} />}
                    {t(`transfers.${transfer.direction}`)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[10px] text-dock-text">{owner?.sessionName ?? t("transfers.closedConnection")}</p>
                    {owner && <p className="truncate font-mono text-[9px] text-dock-text-muted" dir="ltr">{owner.host}</p>}
                  </div>
                  <div className="min-w-0">
                    <div className="flex justify-between text-[9px] text-dock-text-muted"><span>{formatTransferSize(transfer.transferred)} / {formatTransferSize(transfer.total)}</span><span>{transfer.status === "completed" ? 100 : percent}%</span></div>
                    <div className="mt-1 h-1 overflow-hidden bg-dock-border"><div className={`h-full ${transfer.status === "failed" ? "bg-red-500" : transfer.status === "completed" ? "bg-emerald-500" : "bg-dock-accent"}`} style={{ width: `${transfer.status === "completed" ? 100 : percent}%` }} /></div>
                  </div>
                  <TransferStatusLabel status={transfer.status} />
                  <div className="flex justify-end gap-0.5">
                    {owner && <ActionButton label={t("transfers.focus")} onClick={() => focusOwner(transfer)} icon={ExternalLink} />}
                    {transfer.status === "running" && <ActionButton label={t("sftp.pause")} onClick={() => void changeState(transfer, "pause")} icon={Pause} />}
                    {transfer.status === "paused" && <ActionButton label={t("sftp.resume")} onClick={() => void changeState(transfer, "resume")} icon={Play} />}
                    {ACTIVE_STATUSES.has(transfer.status) && <ActionButton label={t("sftp.cancel")} onClick={() => void changeState(transfer, "cancel")} icon={X} danger />}
                    {transfer.status === "failed" && transfer.request && owner && <ActionButton label={t("sftp.retry")} onClick={() => void retry(transfer)} icon={RotateCcw} />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function TransferCount({ label, count, tone }: { label: string; count: number; tone: "active" | "completed" | "failed" }) {
  const color = tone === "active" ? "text-amber-400" : tone === "completed" ? "text-emerald-400" : "text-red-400";
  return <div className="min-w-16 text-end"><span className={`text-xs font-semibold tabular-nums ${color}`}>{count}</span><span className="ms-1 text-[9px] text-dock-text-muted">{label}</span></div>;
}

function TransferStatusLabel({ status }: { status: TransferStatus }) {
  const { t } = useTranslation();
  const tone = status === "completed" ? "bg-emerald-400" : status === "running" || status === "paused" ? "bg-amber-400" : status === "cancelled" ? "bg-zinc-500" : "bg-red-400";
  return <span className="flex items-center gap-1.5 text-[10px] text-dock-text-muted"><span className={`h-1.5 w-1.5 rounded-full ${tone}`} /><span className="truncate">{t(`transfers.statuses.${status}`)}</span></span>;
}

function ActionButton({ label, onClick, icon: Icon, danger = false }: { label: string; onClick: () => void; icon: typeof X; danger?: boolean }) {
  return <button type="button" onClick={onClick} className={`p-1.5 ${danger ? "text-dock-text-muted hover:text-red-400" : "text-dock-text-muted hover:text-dock-accent"}`} title={label} aria-label={label}><Icon size={12} /></button>;
}