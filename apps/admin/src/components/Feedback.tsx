import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { useSettings } from "../settings.js";

export type ToastTone = "success" | "error" | "info";

type Toast = {
  id: number;
  message: string;
  tone: ToastTone;
};

type FeedbackContextValue = {
  notify: (message: string, tone?: ToastTone) => void;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: PropsWithChildren) {
  const { t } = useSettings();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = nextId.current;
      nextId.current += 1;
      setToasts((current) => [...current.slice(-2), { id, message, tone }]);
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), 3600),
      );
    },
    [dismiss],
  );

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) {
        window.clearTimeout(timer);
      }
    },
    [],
  );

  return (
    <FeedbackContext.Provider value={{ notify }}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => {
          const Icon =
            toast.tone === "success"
              ? CheckCircle2
              : toast.tone === "error"
                ? XCircle
                : Info;
          return (
            <div
              key={toast.id}
              className={`toast toast-${toast.tone}`}
              role="status"
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 text-sm font-semibold">
                {toast.message}
              </span>
              <button
                className="toast-close"
                type="button"
                aria-label={t("common.close")}
                onClick={() => dismiss(toast.id)}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackContextValue {
  const value = useContext(FeedbackContext);
  if (!value) {
    throw new Error("useFeedback must be used inside FeedbackProvider");
  }
  return value;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  busy = false,
  danger = false,
  icon,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  danger?: boolean;
  icon?: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const previous = document.activeElement as HTMLElement | null;
    window.setTimeout(() => cancelRef.current?.focus(), 0);
    return () => previous?.focus();
  }, [open]);

  if (!open) {
    return null;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const focusable = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], input:not([disabled]), select:not([disabled])",
      ) ?? [],
    );
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !busy) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        className="dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        onKeyDown={handleKeyDown}
      >
        <div className={`dialog-icon ${danger ? "dialog-icon-danger" : ""}`}>
          {icon ?? <AlertTriangle className="h-6 w-6" aria-hidden />}
        </div>
        <h2 id="confirm-dialog-title" className="dialog-title">
          {title}
        </h2>
        <p id="confirm-dialog-description" className="dialog-description">
          {description}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelRef}
            className="btn btn-secondary"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            {cancelLabel}
          </button>
          <button
            className={danger ? "btn btn-danger-solid" : "btn btn-primary"}
            type="button"
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
