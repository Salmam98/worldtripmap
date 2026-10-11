import type { ComponentChildren } from 'preact';
import { useEffect, useId, useRef } from 'preact/hooks';
import { Icon } from './Icon';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  /** Wider panel for dialogs that show a preview. */
  wide?: boolean;
}

/**
 * A modal built on the native <dialog>, which traps focus, closes on Escape and returns focus to
 * the control that opened it.
 */
export function Dialog({ open, title, onClose, children, wide }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      class={`dialog ${wide ? 'dialog--wide' : ''}`}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      {open && (
        <div class="dialog__panel">
          <header class="dialog__head">
            <h2 id={titleId}>{title}</h2>
            <button type="button" class="dialog__close" onClick={onClose} aria-label="Close">
              <Icon name="close" size={20} />
            </button>
          </header>
          <div class="dialog__body">{children}</div>
        </div>
      )}
    </dialog>
  );
}
