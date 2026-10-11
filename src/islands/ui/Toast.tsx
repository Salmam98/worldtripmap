import { useEffect } from 'preact/hooks';

export interface ToastMessage {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

interface Props {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

/** A short confirmation at the bottom of the screen. Polite to screen readers; gone in 6 seconds. */
export function Toast({ toast, onDismiss }: Props) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onDismiss, 6000);
    return () => window.clearTimeout(timer);
  }, [toast?.id]);

  return (
    <div class="toast-region" role="status" aria-live="polite">
      {toast && (
        <div class="toast" key={toast.id}>
          <span>{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              class="toast__action"
              onClick={() => {
                toast.action!.run();
                onDismiss();
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
