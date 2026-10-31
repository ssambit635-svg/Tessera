import { useWorkspace } from "../lib/workspace";
import { Icon } from "./Icon";

const ICONS: Record<string, string> = {
  info: "info",
  valid: "check",
  warn: "alert",
  danger: "alert",
  ai: "sparkles",
};

export function Toaster() {
  const { toasts, dismissToast } = useWorkspace();
  if (!toasts.length) return null;
  return (
    <div className="toaster" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.tone}`}>
          <span className="toast-icon">
            <Icon name={ICONS[toast.tone] ?? "info"} size={13} strokeWidth={2} />
          </span>
          <div style={{ minWidth: 0 }}>
            <b>{toast.title}</b>
            {toast.detail ? <p>{toast.detail}</p> : null}
          </div>
          <button className="toast-close" onClick={() => dismissToast(toast.id)} aria-label="Dismiss">
            <Icon name="x" size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
