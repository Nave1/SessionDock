import { useTranslation } from "react-i18next";
import { Star, ExternalLink, GripVertical } from "lucide-react";
import type { Session } from "../../types";

interface SessionListProps {
  sessions: Session[];
  title: string;
  onConnect: (session: Session) => void;
  onEdit: (session: Session) => void;
}

export function SessionList({ sessions, title, onConnect, onEdit: _onEdit }: SessionListProps) {
  const { t } = useTranslation();

  if (sessions.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-xs text-dock-text-muted">{t("home.noSessions")}</p>
      </div>
    );
  }

  const handleDragStart = (e: React.DragEvent, session: Session) => {
    e.dataTransfer.setData("application/sessiondock-session", JSON.stringify({
      id: session.id,
      name: session.name,
    }));
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <h2 className="text-sm font-medium text-dock-text mb-3">{title}</h2>
      <div className="space-y-1">
        {sessions.map((session) => (
          <div
            key={session.id}
            draggable
            onDragStart={(e) => handleDragStart(e, session)}
            className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-dock-surface transition-colors group cursor-pointer"
            onDoubleClick={() => onConnect(session)}
          >
            {/* Drag handle */}
            <GripVertical size={12} className="text-dock-text-muted opacity-0 group-hover:opacity-50 flex-shrink-0 cursor-grab" />

            {/* Protocol badge */}
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded flex-shrink-0 ${
                session.protocol === "ssh"
                  ? "bg-dock-success/20 text-dock-success"
                  : session.protocol === "telnet"
                    ? "bg-dock-warning/20 text-dock-warning"
                    : "bg-dock-accent/20 text-dock-accent"
              }`}
            >
              {session.protocol.toUpperCase()}
            </span>

            {/* Name */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-dock-text truncate">
                  {session.name}
                </span>
                {session.favorite && (
                  <Star size={10} className="text-dock-warning fill-dock-warning flex-shrink-0" />
                )}
              </div>
              <span className="text-[10px] text-dock-text-muted">
                {session.host}{session.port > 0 ? `:${session.port}` : ""}
                {session.username && ` • ${session.username}`}
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => { e.stopPropagation(); onConnect(session); }}
                className="p-1 rounded hover:bg-dock-accent/20 text-dock-accent"
                title={t("session.connect")}
              >
                <ExternalLink size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
