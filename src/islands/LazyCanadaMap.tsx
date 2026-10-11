import type { ComponentChildren, FunctionComponent } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

/**
 * The home page shows the Canada map well below the fold. This small wrapper waits until the
 * section is near the viewport before fetching the map code and geometry, so the first paint of
 * the home page does not pay for them. Its children are the static outline shown meanwhile.
 */
export default function LazyCanadaMap({ children }: { children?: ComponentChildren }) {
  const host = useRef<HTMLDivElement>(null);
  const [Map, setMap] = useState<FunctionComponent<{ variant?: 'page' | 'embed' }> | null>(null);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);

  const load = useCallback(() => {
    setFailed(false);
    import('./CanadaMap')
      .then((module) => {
        if (alive.current) setMap(() => module.default);
      })
      .catch(() => {
        if (alive.current) setFailed(true);
      });
  }, []);

  useEffect(() => {
    alive.current = true;
    const el = host.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      load();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: '700px 0px' },
    );
    observer.observe(el);
    return () => {
      alive.current = false;
      observer.disconnect();
    };
  }, [load]);

  if (Map) return <Map variant="embed" />;
  return (
    // data-lazy tells the page's "did it load?" check that this placeholder is waiting on purpose.
    <div ref={host} data-lazy="">
      {children}
      {failed && (
        <div class="notice notice--error island-error" role="alert">
          <p>
            <strong>The map did not load.</strong> Check your connection and try again.
          </p>
          <p>
            <button type="button" class="btn btn--sm" onClick={load}>
              Try again
            </button>
          </p>
        </div>
      )}
    </div>
  );
}
