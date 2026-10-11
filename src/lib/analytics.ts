/**
 * Privacy-conscious event tracking.
 *
 * Nothing is sent unless an analytics provider is configured at build time (see .env.example).
 * Events carry the map id and coarse counts only: never a display name, never which places were
 * marked, never the part of a share link after "#".
 *
 * Every event is also dispatched in the page as a "wtm:track" DOM event, which is what the
 * automated tests listen to and what any other integration can hook into.
 */

export type EventName =
  | 'homepage_viewed'
  | 'map_started'
  | 'region_selected'
  | 'map_completed'
  | 'poster_customized'
  | 'png_downloaded'
  | 'pdf_downloaded'
  | 'share_initiated'
  | 'challenge_link_opened'
  | 'challenge_completed';

export type EventProps = Record<string, string | number | boolean>;

declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: EventProps }) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

export function track(name: EventName, props: EventProps = {}): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('wtm:track', { detail: { name, props } }));
    window.plausible?.(name, { props });
    window.gtag?.('event', name, props);
  } catch {
    /* analytics must never break the page */
  }
}
