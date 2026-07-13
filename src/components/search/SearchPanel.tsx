import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Search, Star, Folder, Tag } from "lucide-react";
import type { SearchResult } from "../../types";

interface SearchPanelProps {
  onSearch: (query: string) => Promise<SearchResult[]>;
  onSelectResult: (result: SearchResult) => void;
  onClose: () => void;
}

export function SearchPanel({ onSearch, onSelectResult, onClose }: SearchPanelProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const performSearch = useCallback(
    async (q: string) => {
      if (q.trim().length === 0) {
        setResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const res = await onSearch(q);
        setResults(res);
        setSelectedIndex(0);
      } finally {
        setIsSearching(false);
      }
    },
    [onSearch],
  );

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => performSearch(value), 150);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      onSelectResult(results[selectedIndex]);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-2xl bg-dock-sidebar border border-dock-border rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-dock-border">
          <Search size={16} className="text-dock-text-muted flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("search.placeholder")}
            className="flex-1 bg-transparent text-sm text-dock-text placeholder-dock-text-muted outline-none"
          />
          {isSearching && (
            <div className="w-4 h-4 border-2 border-dock-accent border-t-transparent rounded-full animate-spin" />
          )}
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {results.length === 0 && query.trim().length > 0 && !isSearching ? (
            <div className="px-4 py-8 text-center text-xs text-dock-text-muted">
              {t("search.noResults")}
            </div>
          ) : (
            results.map((result, index) => (
              <SearchResultItem
                key={result.session.id}
                result={result}
                isSelected={index === selectedIndex}
                onClick={() => onSelectResult(result)}
                query={query}
              />
            ))
          )}
        </div>

        {/* Footer */}
        {results.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-2 border-t border-dock-border text-[10px] text-dock-text-muted">
            <span>↑↓ navigate</span>
            <span>↵ open</span>
            <span>esc close</span>
            <span className="ml-auto">{results.length} results</span>
          </div>
        )}
      </div>
    </div>
  );
}

function SearchResultItem({
  result,
  isSelected,
  onClick,
  query,
}: {
  result: SearchResult;
  isSelected: boolean;
  onClick: () => void;
  query: string;
}) {
  const { session, folder_path, tags } = result;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
        isSelected ? "bg-dock-accent/10" : "hover:bg-dock-surface"
      }`}
    >
      {/* Protocol badge */}
      <span
        className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
          session.protocol === "ssh"
            ? "bg-dock-success/20 text-dock-success"
            : session.protocol === "telnet"
              ? "bg-dock-warning/20 text-dock-warning"
              : "bg-dock-accent/20 text-dock-accent"
        }`}
      >
        {session.protocol.toUpperCase()}
      </span>

      {/* Session info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-dock-text truncate">
            <HighlightText text={session.name} query={query} />
          </span>
          {session.favorite && <Star size={10} className="text-dock-warning fill-dock-warning" />}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-dock-text-muted">
          <span><HighlightText text={session.host} query={query} /></span>
          {session.port > 0 && <span>:{session.port}</span>}
          {folder_path && (
            <>
              <span>•</span>
              <Folder size={9} />
              <span className="truncate">{folder_path}</span>
            </>
          )}
        </div>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <Tag size={9} className="text-dock-text-muted" />
          {tags.slice(0, 2).map((tag) => (
            <span key={tag} className="text-[10px] px-1 py-0.5 rounded bg-dock-surface text-dock-text-muted">
              {tag}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-dock-accent/30 text-dock-text rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
