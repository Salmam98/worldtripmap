interface Props {
  /** While loading, e.g. "Loading the map…" */
  wait: string;
  /** Without JavaScript. */
  nojs: string;
  /** What failed to load, to finish the sentence "… did not load": "The map". */
  what: string;
}

/**
 * The message shown in place of an interactive part of the page before it has started. It says
 * the right thing in three situations: scripts are still loading, scripts are switched off, or
 * the scripts never arrived. The styles are in global.css; a small script in the page layout
 * picks the failed state after a wait. It is only ever drawn when the site is built.
 */
export function LoadState({ wait, nojs, what }: Props) {
  return (
    <span class="load-state" data-loading="">
      <span class="load-state__wait">{wait}</span>
      <span class="load-state__nojs">{nojs}</span>
      <span class="load-state__failed">
        {what} did not load. Check your connection, then{' '}
        <button type="button" class="load-state__reload" data-reload="">
          reload the page
        </button>
        .
      </span>
    </span>
  );
}
