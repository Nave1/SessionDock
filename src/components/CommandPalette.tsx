import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Search, Plus, FolderPlus, Settings, Download, Upload } from "lucide-react";

interface CommandPaletteProps {
  onClose: () => void;
}

const commands = [
  { id: "search", icon: Search, labelKey: "search.placeholder" },
  { id: "newSession", icon: Plus, labelKey: "sidebar.newSession" },
  { id: "newFolder", icon: FolderPlus, labelKey: "sidebar.newFolder" },
  { id: "settings", icon: Settings, labelKey: "settings.title" },
  { id: "import", icon: Download, labelKey: "home.importSessions" },
  { id: "export", icon: Upload, labelKey: "home.importSessions" },
];

export function CommandPalette({ onClose }: CommandPaletteProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Palette */}
      <div
        className="relative w-full max-w-lg bg-dock-sidebar border border-dock-border rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-dock-border">
          <Search size={16} className="text-dock-text-muted" />
          <input
            ref={inputRef}
            type="text"
            placeholder={t("search.placeholder")}
            className="flex-1 bg-transparent text-sm text-dock-text placeholder-dock-text-muted outline-none"
          />
        </div>

        {/* Commands */}
        <div className="max-h-64 overflow-y-auto py-2">
          {commands.map((cmd) => (
            <button
              key={cmd.id}
              className="w-full flex items-center gap-3 px-4 py-2 text-xs text-dock-text-muted hover:text-dock-text hover:bg-dock-surface transition-colors"
            >
              <cmd.icon size={14} />
              <span>{t(cmd.labelKey)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
