import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Upload, FileJson, FileSpreadsheet, AlertCircle, CheckCircle } from "lucide-react";
import { parseJsonImport, parseCsvImport } from "../../utils/importExport";
import type { Session } from "../../types";

interface ImportViewProps {
  onImport: (sessions: Partial<Session>[]) => void;
}

export function ImportView({ onImport }: ImportViewProps) {
  const { t } = useTranslation();
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<Partial<Session>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setFileName(file.name);

    const text = await file.text();

    if (file.name.endsWith(".json")) {
      const data = parseJsonImport(text);
      if (data) {
        const sessions = data.sessions.map((s) => ({
          name: s.name,
          host: s.host,
          port: s.port,
          protocol: s.protocol as Session["protocol"],
          username: s.username,
          device_type: s.device_type,
          vendor: s.vendor,
          model: s.model,
          description: s.description,
          favorite: s.favorite,
        }));
        setPreview(sessions);
      } else {
        setError("Invalid SessionDock JSON format");
      }
    } else if (file.name.endsWith(".csv")) {
      const sessions = parseCsvImport(text);
      if (sessions.length > 0) {
        setPreview(sessions);
      } else {
        setError("No valid sessions found in CSV");
      }
    } else {
      setError("Unsupported file format. Use .json or .csv");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleConfirmImport = () => {
    if (preview.length > 0) {
      onImport(preview);
      setPreview([]);
      setFileName(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-lg font-semibold text-dock-text mb-6">
          {t("home.importSessions")}
        </h2>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
            dragOver
              ? "border-dock-accent bg-dock-accent/5"
              : "border-dock-border hover:border-dock-text-muted"
          }`}
        >
          <Upload size={32} className="mx-auto mb-3 text-dock-text-muted" />
          <p className="text-sm text-dock-text mb-1">
            Drop a file here or click to browse
          </p>
          <p className="text-xs text-dock-text-muted">
            Supports: SessionDock JSON, CSV
          </p>
          <div className="flex justify-center gap-4 mt-4">
            <div className="flex items-center gap-1 text-[10px] text-dock-text-muted">
              <FileJson size={12} /> JSON
            </div>
            <div className="flex items-center gap-1 text-[10px] text-dock-text-muted">
              <FileSpreadsheet size={12} /> CSV
            </div>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          className="hidden"
        />

        {/* Error */}
        {error && (
          <div className="mt-4 flex items-center gap-2 p-3 rounded bg-dock-error/10 border border-dock-error/30 text-xs text-dock-error">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {/* Preview */}
        {preview.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CheckCircle size={14} className="text-dock-success" />
                <span className="text-sm text-dock-text">
                  {preview.length} sessions ready to import
                </span>
                {fileName && (
                  <span className="text-xs text-dock-text-muted">from {fileName}</span>
                )}
              </div>
              <button
                onClick={handleConfirmImport}
                className="px-4 py-2 rounded text-xs text-white bg-dock-accent hover:bg-dock-accent-hover transition-colors"
              >
                Import {preview.length} sessions
              </button>
            </div>

            {/* Preview table */}
            <div className="rounded border border-dock-border overflow-hidden">
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-dock-surface sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-dock-text-muted font-medium">Name</th>
                      <th className="px-3 py-2 text-left text-dock-text-muted font-medium">Host</th>
                      <th className="px-3 py-2 text-left text-dock-text-muted font-medium">Protocol</th>
                      <th className="px-3 py-2 text-left text-dock-text-muted font-medium">Vendor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 50).map((s, i) => (
                      <tr key={i} className="border-t border-dock-border">
                        <td className="px-3 py-1.5 text-dock-text">{s.name}</td>
                        <td className="px-3 py-1.5 text-dock-text-muted">{s.host}</td>
                        <td className="px-3 py-1.5 text-dock-text-muted">{s.protocol}</td>
                        <td className="px-3 py-1.5 text-dock-text-muted">{s.vendor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 50 && (
                  <div className="px-3 py-2 text-xs text-dock-text-muted bg-dock-surface">
                    ...and {preview.length - 50} more
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
