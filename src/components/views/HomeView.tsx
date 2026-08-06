import { useTranslation } from "react-i18next";
import { useSessionStore } from "../../stores/sessionStore";
import { useAppStore } from "../../stores/appStore";
import {
  Search,
  Zap,
  Star,
  Clock,
  Monitor,
  FolderOpen,
  ArrowRight,
  Wifi,
} from "lucide-react";
import type { Session } from "../../types";

interface HomeViewProps {
  onNewSession: () => void;
  onNewFolder: () => void;
  onQuickConnect: () => void;
  onImport: () => void;
}

export function HomeView({ onNewSession, onNewFolder, onQuickConnect, onImport }: HomeViewProps) {
  const { t } = useTranslation();
  const { sessions, folders } = useSessionStore();
  const { addTab } = useAppStore();

  const favorites = sessions.filter((s) => s.favorite);
  const recent = [...sessions]
    .filter((s) => s.last_connected_at)
    .sort((a, b) => (b.last_connected_at || "").localeCompare(a.last_connected_at || ""))
    .slice(0, 6);

  const handleConnect = (session: Session) => {
    addTab({
      id: crypto.randomUUID(),
      sessionId: session.id,
      sessionName: session.name,
      host: session.host,
      protocol: session.protocol,
      status: "connecting",
      pinned: false,
    });
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-10 py-8">

        {/* Search — the hero element */}
        <div className="mb-10">
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-dock-text-muted" />
            <input
              type="text"
              placeholder={t("search.placeholder")}
              className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-dock-surface border border-dock-border text-sm text-dock-text placeholder-dock-text-muted focus:border-dock-accent focus:outline-none focus:ring-1 focus:ring-dock-accent/30"
              onFocus={() => useAppStore.getState().setCommandPaletteOpen(true)}
              readOnly
            />
            <kbd className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] px-1.5 py-0.5 rounded bg-dock-border text-dock-text-muted font-mono">
              Ctrl+K
            </kbd>
          </div>
        </div>

        {/* Quick actions row */}
        <div className="flex gap-2 mb-10">
          <QuickAction icon={Zap} label="Quick Connect" onClick={onQuickConnect} primary />
          <QuickAction icon={Monitor} label="New Session" onClick={onNewSession} />
          <QuickAction icon={FolderOpen} label="New Folder" onClick={onNewFolder} />
          <QuickAction icon={ArrowRight} label="Import" onClick={onImport} />
        </div>

        {/* Stats strip */}
        <div className="flex items-center gap-6 mb-10 px-1">
          <Stat value={sessions.length} label="Sessions" />
          <div className="w-px h-4 bg-dock-border" />
          <Stat value={folders.length} label="Folders" />
          <div className="w-px h-4 bg-dock-border" />
          <Stat value={favorites.length} label="Favorites" />
          <div className="w-px h-4 bg-dock-border" />
          <Stat value={sessions.filter(s => s.protocol === "ssh").length} label="SSH" />
        </div>

        {/* Favorites */}
        {favorites.length > 0 && (
          <Section title="Favorites" icon={Star} count={favorites.length}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {favorites.slice(0, 6).map((session) => (
                <DeviceCard key={session.id} session={session} onConnect={handleConnect} />
              ))}
            </div>
          </Section>
        )}

        {/* Recent */}
        {recent.length > 0 && (
          <Section title="Recent" icon={Clock} count={recent.length}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {recent.map((session) => (
                <DeviceCard key={session.id} session={session} onConnect={handleConnect} />
              ))}
            </div>
          </Section>
        )}

        {/* Empty state */}
        {sessions.length === 0 && (
          <div className="mt-16 text-center animate-fade-in">
            <Wifi size={40} className="mx-auto mb-4 text-dock-text-muted opacity-40" />
            <h3 className="text-sm font-medium text-dock-text-secondary mb-2">No sessions yet</h3>
            <p className="text-xs text-dock-text-muted max-w-sm mx-auto mb-6">
              Create your first session to start connecting to your infrastructure.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={onQuickConnect}
                className="px-4 py-2 rounded-lg text-xs font-medium text-white bg-dock-accent hover:bg-dock-accent-hover"
              >
                Quick Connect
              </button>
              <button
                onClick={onNewSession}
                className="px-4 py-2 rounded-lg text-xs font-medium text-dock-text-secondary bg-dock-surface hover:bg-dock-surface-hover border border-dock-border"
              >
                New Session
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Sub-components ---

function QuickAction({ icon: Icon, label, onClick, primary }: {
  icon: typeof Zap; label: string; onClick?: () => void; primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium ${
        primary
          ? "bg-dock-accent text-white hover:bg-dock-accent-hover shadow-sm shadow-dock-accent/20"
          : "bg-dock-surface text-dock-text-secondary hover:text-dock-text hover:bg-dock-surface-hover border border-dock-border"
      }`}
    >
      <Icon size={14} />
      <span>{label}</span>
    </button>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-lg font-semibold text-dock-text tabular-nums">{value}</span>
      <span className="text-xs text-dock-text-muted">{label}</span>
    </div>
  );
}

function Section({ title, icon: Icon, count, children }: {
  title: string; icon: typeof Star; count: number; children: React.ReactNode;
}) {
  return (
    <div className="mb-8 animate-fade-in">
      <div className="flex items-center gap-2 mb-3 px-1">
        <Icon size={13} className="text-dock-text-muted" />
        <h2 className="text-xs font-medium text-dock-text-secondary uppercase tracking-wider">{title}</h2>
        <span className="text-[10px] text-dock-text-muted">({count})</span>
      </div>
      {children}
    </div>
  );
}

function DeviceCard({ session, onConnect }: { session: Session; onConnect: (s: Session) => void }) {
  return (
    <button
      onClick={() => onConnect(session)}
      className="w-full flex items-center gap-3 px-3.5 py-3 rounded-lg bg-dock-surface border border-dock-border hover:border-dock-accent/40 hover:bg-dock-surface-hover text-left group"
    >
      {/* Protocol indicator */}
      <div className={`w-8 h-8 rounded-md flex items-center justify-center text-[10px] font-bold uppercase ${
        session.protocol === "ssh"
          ? "bg-emerald-500/10 text-emerald-400"
          : session.protocol === "telnet"
            ? "bg-amber-500/10 text-amber-400"
            : "bg-blue-500/10 text-blue-400"
      }`}>
        {session.protocol.slice(0, 3).toUpperCase()}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-dock-text truncate">{session.name}</span>
          {session.favorite && <Star size={9} className="text-amber-400 fill-amber-400 flex-shrink-0" />}
        </div>
        <span className="text-[11px] text-dock-text-muted truncate block">
          {session.host || "No host"}{session.port > 0 && session.port !== 22 ? `:${session.port}` : ""}
        </span>
      </div>

      {/* Connect arrow */}
      <ArrowRight size={14} className="text-dock-text-muted opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5" />
    </button>
  );
}
