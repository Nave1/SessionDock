import { useTranslation } from "react-i18next";
import { useSessionStore } from "../../stores/sessionStore";
import {
  Zap,
  Plus,
  FolderPlus,
  Download,
  Star,
  Clock,
  Monitor,
  FolderOpen,
} from "lucide-react";

interface HomeViewProps {
  onNewSession: () => void;
  onNewFolder: () => void;
  onQuickConnect: () => void;
  onImport: () => void;
}

export function HomeView({ onNewSession, onNewFolder, onQuickConnect, onImport }: HomeViewProps) {
  const { t } = useTranslation();
  const { sessions, folders } = useSessionStore();

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-dock-text mb-1">
            {t("app.name")}
          </h1>
          <p className="text-sm text-dock-text-muted">
            {t("app.tagline")}
          </p>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          <QuickAction
            icon={Zap}
            label={t("home.quickConnect")}
            accent
            onClick={onQuickConnect}
          />
          <QuickAction icon={Plus} label={t("home.createSession")} onClick={onNewSession} />
          <QuickAction icon={FolderPlus} label={t("home.createFolder")} onClick={onNewFolder} />
          <QuickAction icon={Download} label={t("home.importSessions")} onClick={onImport} />
        </div>

        {/* Stats */}
        <div className="flex gap-6 mb-10">
          <StatCard icon={Monitor} label={t("home.totalSessions")} value={String(sessions.length)} />
          <StatCard icon={FolderOpen} label={t("home.totalFolders")} value={String(folders.length)} />
        </div>

        {/* Favorites */}
        <Section title={t("home.favorites")} icon={Star}>
          <EmptyState message="No favorites yet" />
        </Section>

        {/* Recent */}
        <Section title={t("home.recentSessions")} icon={Clock}>
          <EmptyState message={t("home.noSessions")} />
        </Section>
      </div>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  accent,
  onClick,
}: {
  icon: typeof Zap;
  label: string;
  accent?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors ${
        accent
          ? "border-dock-accent/30 bg-dock-accent/5 hover:bg-dock-accent/10 text-dock-accent"
          : "border-dock-border bg-dock-surface hover:bg-dock-border text-dock-text-muted hover:text-dock-text"
      }`}
    >
      <Icon size={20} />
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Monitor;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-dock-surface border border-dock-border">
      <Icon size={16} className="text-dock-text-muted" />
      <div>
        <div className="text-lg font-semibold text-dock-text">{value}</div>
        <div className="text-xs text-dock-text-muted">{label}</div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Star;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} className="text-dock-text-muted" />
        <h2 className="text-sm font-medium text-dock-text">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="px-4 py-6 rounded-lg border border-dock-border border-dashed text-center">
      <p className="text-xs text-dock-text-muted">{message}</p>
    </div>
  );
}
