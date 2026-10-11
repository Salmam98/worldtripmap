import { Component, type ComponentChildren } from 'preact';

interface Props {
  /** What stopped working, to start the sentence: "The map". */
  what: string;
  children: ComponentChildren;
}

/**
 * The outermost part of every interactive tool on the site. It does two jobs.
 *
 * If the tool hits an unexpected error, the visitor sees a plain message and a way to recover
 * instead of an empty space. Their saved maps are not touched.
 *
 * And when the tool first appears, it takes away the stand-in that was drawn in its place when
 * the site was built (an element marked data-placeholder beside it). Both happen in the same
 * frame, so the visitor never sees the two together or a gap between them.
 */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  componentDidMount(): void {
    const host = (this.base as Element | null)?.parentElement?.closest('[data-island-host]');
    host?.querySelector(':scope > [data-placeholder]')?.remove();
  }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    // Keep the detail available to whoever is debugging, without showing it to the visitor.
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div class="notice notice--error island-error" role="alert">
        <p>
          <strong>{this.props.what} ran into a problem and had to stop.</strong>
        </p>
        <p>Your saved maps are safe on this device. Reloading the page usually fixes it.</p>
        <p>
          <button type="button" class="btn btn--sm" onClick={() => window.location.reload()}>
            Reload the page
          </button>
        </p>
      </div>
    );
  }
}
