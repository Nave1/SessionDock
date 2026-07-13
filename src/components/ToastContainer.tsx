import { useToastStore } from "../stores/toastStore";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] space-y-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg border shadow-lg animate-in slide-in-from-right ${
            toast.type === "success"
              ? "bg-dock-success/10 border-dock-success/30 text-dock-success"
              : toast.type === "error"
                ? "bg-dock-error/10 border-dock-error/30 text-dock-error"
                : toast.type === "warning"
                  ? "bg-dock-warning/10 border-dock-warning/30 text-dock-warning"
                  : "bg-dock-accent/10 border-dock-accent/30 text-dock-accent"
          }`}
        >
          {toast.type === "success" && <CheckCircle size={14} />}
          {toast.type === "error" && <AlertCircle size={14} />}
          {toast.type === "warning" && <AlertTriangle size={14} />}
          {toast.type === "info" && <Info size={14} />}
          <span className="text-xs flex-1">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="opacity-60 hover:opacity-100"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
