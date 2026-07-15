import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSessionStore } from "../stores/sessionStore";
import { useAppStore } from "../stores/appStore";
import { Search, Star, ArrowRight, Settings, Plus, FolderPlus, Download } from "lucide-react";
import type { Session } from "../types";

interface CommandPaletteProps {
  onClose: () => void;
}

export function CommandPalette({ onClose }: CommandPaletteProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { sessions } = useSessionStore();
  const { addTab, setCurrentView } = useAppStore();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Search sessions
  const results = useMemo(() => {
    if (!query.trim()) {
      // Show recent/favorites when no query
      const favs = sessions.filter((s) => s.favorite).slice(0, 5);
      const recent = [...sessions]
        .sort((a, b) => (b.last_connected_at || "").localeCompare(a.last_connected_at || ""))
        .slice(0, 5);
      // Merge without duplicates
      const merged = [...favs];
      for (const s of recent) {
        if (!merged.find((m) => m.id === s.id)) merged.push(s);
      }
      return merged.slice(0, 8);
    }

    const q = query.toLowerCase().trim();
    const scored = sessions.map((session) => {
      let score = 0;
      const name = session.name.toLowerCase();
      const host = session.host.toLowerCase();
      const vendor = (session.vendor || "").toLowerCase();
      const desc = (session.description || "").toLowerCase();
      const model = (session.model || "").toLowerCase();

      // Exact matches
      if (host === q) score += 100;
      if (name === q) score += 90;
      // Starts with
      if (name.startsWith(q)) score += 70;
      if (host.startsWith(q)) score += 65;
      // Contains
      if (name.includes(q)) score += 40;
      if (host.includes(q)) score += 50; // IP partial match ranks high
      if (vendor.includes(q)) score += 30;
      if (model.includes(q)) score += 25;
      if (desc.includes(q)) score += 20;
      if (session.username?.toLowerCase().includes(q)) score += 15;
      // Favorite boost
      if (session.favorite && score > 0) score += 5;

      return { session, score };
    });

    return scored
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((r) => r.session);
  }, [query, sessions]);

  // Commands (shown when query starts with ">")
  const commands = useMemo(() => {
    if (!query.startsWith(">")) return null;
    const q = query.slice(1).toLowerCase().trim();
    const all = [
      { id: "settings", label: "Settings", icon: Settings, action: () => { setCurrentView("settings"); onClose(); } },
      { id: "newSession", label: "New Session", icon: Plus, action: () => { onClose(); } },
      { id: "newFolder", label: "New Folder", icon: FolderPlus, action: () => { onClose(); } },
      { id: "import", label: "Import Sessions", icon: Download, action: () => { onClose(); } },
    ];
    return q ? all.filter((c) => c.label.toLowerCase().includes(q)) : all;
  }, [query, setCurrentView, onClose]);

  const handleSelect = (index: number) => {
    if (commands) {
      commands[index]?.action();
      return;
    }
    const session = results[index];
    if (session) {
      addTab({
        id: crypto.randomUUID(),
        sessionId: session.id,
        sessionName: session.name,
        host: session.host,
        protocol: session.protocol,
        status: "connecting",
        pinned: false,
      });
      onClose();
    }
  };

  const itemCount = commands ? commands.length : results.length;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, itemCount - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSelect(selectedIndex);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-lg bg-dock-sidebar border border-dock-border rounded-xl shadow-2xl overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-dock-border">
          <Search size={15} className="text-dock-text-muted flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder={t("search.placeholder")}
            className="flex-1 bg-transparent text-[13px] text-dock-text placeholder-dock-text-muted outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-[10px] px-1.5 py-0.5 rounded bg-dock-border text-dock-text-muted">
              Clear
            </button>
          )}
        </div>

        {/* Results */}
        <div className="max-h-[320px] overflow-y-auto py-1">
          {commands ? (
            // Application commands
            commands.map((cmd, i) => (
              <button
                key={cmd.id}
                onClick={() => handleSelect(i)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-[12px] ${
                  i === selectedIndex ? "bg-dock-accent/10 text-dock-accent" : "text-dock-text-muted hover:bg-dock-surface"
                }`}
              >
                <cmd.icon size={14} />
                <span>{cmd.label}</span>
              </button>
            ))
          ) : results.length > 0 ? (
            // Session results
            results.map((session, i) => (
              <SessionResult
                key={session.id}
                session={session}
                isSelected={i === selectedIndex}
                query={query}
                onClick={() => handleSelect(i)}
              />
            ))
          ) : query.trim() ? (
            <div className="px-4 py-8 text-center text-[12px] text-dock-text-muted">
              No sessions found for "{query}"
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-[12px] text-dock-text-muted">
              Type to search sessions, or <span className="text-dock-accent">&gt;</span> for commands
            </div>
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-dock-border text-[10px] text-dock-text-muted">
          <span>↑↓ Navigate</span>
          <span>↵ Connect</span>
          <span>Esc Close</span>
          {!commands && results.length > 0 && (
            <span className="ml-auto tabular-nums">{results.length} result{results.length !== 1 ? "s" : ""}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function SessionResult({ session, isSelected, query, onClick }: {
  session: Session; isSelected: boolean; query: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${
        isSelected ? "bg-dock-accent/10" : "hover:bg-dock-surface"
      }`}
    >
      {/* Protocol badge */}
      <div className={`w-7 h-7 rounded flex items-center justify-center text-[9px] font-bold uppercase flex-shrink-0 ${
        session.protocol === "ssh"
          ? "bg-emerald-500/10 text-emerald-400"
          : session.protocol === "telnet"
            ? "bg-amber-500/10 text-amber-400"
            : "bg-blue-500/10 text-blue-400"
      }`}>
        {session.protocol === "ssh" ? "SSH" : session.protocol === "telnet" ? "TEL" : "SER"}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-medium text-dock-text truncate">
            <Highlight text={session.name} query={query} />
          </span>
          {session.favorite && <Star size={9} className="text-amber-400 fill-amber-400 flex-shrink-0" />}
        </div>
        <div className="text-[11px] text-dock-text-muted truncate">
          <Highlight text={session.host} query={query} />
          {session.vendor && <span> • {session.vendor}</span>}
        </div>
      </div>

      {/* Arrow */}
      <ArrowRight size={12} className={`flex-shrink-0 ${isSelected ? "text-dock-accent" : "text-dock-text-muted opacity-0"}`} />
    </button>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim() || !text) return <>{text}</>;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-dock-accent/25 text-dock-text rounded-sm px-0.5">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}
