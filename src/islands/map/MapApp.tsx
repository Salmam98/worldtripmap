import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { track } from '../../lib/analytics';
import { computeAchievements } from '../../lib/maps/achievements';
import { featuresWithMarks } from '../../lib/maps/places';
import { featuresById, mapPath, posterPath } from '../../lib/maps/registry';
import { suggestRollup, type RollupSuggestion } from '../../lib/maps/rollup';
import { buildHash, parseHash, type SharedMap } from '../../lib/maps/share-codec';
import { computeStats } from '../../lib/maps/stats';
import { normalizeSelection } from '../../lib/maps/store';
import type { MapDefinition, MapGeoMeta, MapGeometry, PlaceDef, PlaceLayer } from '../../lib/maps/types';
import { href } from '../../lib/site';
import { capitalize, listOf, plural, possessive } from '../../lib/text';
import { Dialog } from '../ui/Dialog';
import { Icon } from '../ui/Icon';
import { LoadState } from '../ui/LoadState';
import { Toast, type ToastMessage } from '../ui/Toast';
import '../ui/ui.css';
import './map.css';
import './mapapp.css';
import { ShellMap, SWITCHED_OFF, type ShellPicture } from './frame';
import { MapCanvas, type Fill } from './MapCanvas';
import { AchievementsPanel, CompareSummary, Legend, PlacesPrompt, ProgressPanel } from './panels';
import { TONE_RAMP, toneFor, type Tone } from './tones';
import { PlaceList } from './PlaceList';
import { PlacesDialog } from './PlacesDialog';
import { ShareDialog, type ShareKind } from './ShareDialog';
import { stateOf, useMapState, type MarkMode, type PlaceState } from './useMapState';
import { usePlaces } from './usePlaces';

interface Props {
  def: MapDefinition;
  meta: MapGeoMeta;
  geometry: MapGeometry;
  /** "page" is the full tool. "embed" is the lighter version on the home page. */
  variant?: 'page' | 'embed';
  /** "side" puts the panel beside the map; "stack" gives a wide map the full width. */
  layout?: 'side' | 'stack';
  maxZoom?: number;
  markerBelow?: number;
  /** The places inside each feature (a province's cities, parks and landmarks), when the map has them. */
  places?: PlaceLayer;
  /**
   * Draws the tool as it first appears, with a plain picture in place of the interactive map.
   * Used when the site is built: the result holds the page's shape until the real map loads,
   * so nothing moves when it does (see MapPlaceholder.astro). Never set in the browser.
   */
  shell?: ShellPicture;
}

type ViewKind = 'mine' | 'theirs' | 'compare';

const ROLLUP_DISMISSED = 'wtm:v1:rollup-dismissed:';

export function MapApp({ def, meta, geometry, variant = 'page', layout = 'side', maxZoom, markerBelow, places, shell }: Props) {
  const state = useMapState(def);
  const { selection } = state;
  const known = useMemo(() => featuresById(def), [def]);
  // The second level is part of the full tool only; the small map on the home page stays simple.
  const layer = variant === 'page' ? places : undefined;
  const spots = usePlaces(layer);
  const [placesOf, setPlacesOf] = useState<string | null>(null);
  /** The province marked most recently in this visit: the line under the map offers its places. */
  const [lastMarked, setLastMarked] = useState<string | null>(null);
  /** The places that "Start over" just unticked, kept until the next change so Undo can bring them back. */
  const clearedSpots = useRef<ReadonlySet<string> | null>(null);

  const [mode, setMode] = useState<MarkMode>('visited');
  // A shared or challenge link is read before the first frame is drawn, so the page opens in the
  // layout it will keep instead of rearranging itself a moment later.
  const [arrivedWith] = useState<SharedMap | null>(() =>
    !shell && variant === 'page' && typeof window !== 'undefined' ? parseHash(def, window.location.hash) : null,
  );
  const [friend, setFriend] = useState<SharedMap | null>(arrivedWith);
  const [view, setView] = useState<ViewKind>(arrivedWith && !arrivedWith.challenge ? 'theirs' : 'mine');
  const [hotId, setHotId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [shareKind, setShareKind] = useState<ShareKind | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const toastId = useRef(0);
  const compared = useRef(false);
  // On the home page the checklist shares a phone screen with the rest of the page, so its groups start closed there.
  const compactList = useMemo(
    () => variant === 'embed' && typeof window !== 'undefined' && window.matchMedia('(max-width: 63.99rem)').matches,
    [variant],
  );

  const notify = useCallback((text: string, action?: ToastMessage['action']) => {
    setToast({ id: ++toastId.current, text, action });
  }, []);

  // --------------------------------------------------------- shared links

  useEffect(() => {
    if (variant !== 'page') return;
    if (arrivedWith?.challenge) track('challenge_link_opened', { map: def.id });
    // A second shared link opened in the same tab changes only the part after the #.
    const read = () => {
      const shared = parseHash(def, window.location.hash);
      setFriend(shared);
      setView(shared ? (shared.challenge ? 'mine' : 'theirs') : 'mine');
      if (shared?.challenge) track('challenge_link_opened', { map: def.id });
    };
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, [def, variant]);

  const friendName = friend?.name || 'your friend';
  const FriendName = friend?.name || 'Your friend';
  const friendSelection = useMemo(
    () => (friend ? normalizeSelection(def, friend.visited, []) : null),
    [def, friend],
  );
  const friendStats = useMemo(
    () => (friendSelection ? computeStats(def, friendSelection) : null),
    [def, friendSelection],
  );

  const closeFriend = () => {
    setFriend(null);
    setView('mine');
    try {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch {
      /* the address bar keeps the link; harmless */
    }
  };

  const showView = (next: ViewKind) => {
    setView(next);
    if (next === 'compare' && friend?.challenge && !compared.current && selection.visited.size > 0) {
      compared.current = true;
      track('challenge_completed', { map: def.id });
    }
  };

  // ------------------------------------------------------------- derived

  const stats = useMemo(() => computeStats(def, selection), [def, selection]);
  const achievements = useMemo(() => computeAchievements(def, selection), [def, selection]);

  // Once a place is ticked anywhere, a marked province is coloured by how much of it has been
  // seen: the more of its places are ticked, the deeper its colour. Until then, and on maps
  // without places, every marked province has the one colour it always had.
  const tones = useMemo<Map<string, Tone> | null>(() => {
    const summary = spots.summary;
    if (!summary || summary.visited === 0) return null;
    return new Map(Object.entries(summary.byFeature).map(([id, count]) => [id, toneFor(count.total ? count.visited / count.total : 0)]));
  }, [spots.summary]);
  const shaded = Boolean(tones) && view === 'mine';
  const toneOf = useCallback((id: string) => (shaded ? tones?.get(id) : null), [shaded, tones]);

  const fillOf = useCallback(
    (id: string): Fill => {
      if (view === 'theirs' && friendSelection) return friendSelection.visited.has(id) ? 'visited' : 'none';
      if (view === 'compare' && friendSelection) {
        const mine = selection.visited.has(id);
        const theirs = friendSelection.visited.has(id);
        return mine && theirs ? 'both' : mine ? 'you' : theirs ? 'friend' : 'none';
      }
      return stateOf(selection, id);
    },
    [view, selection, friendSelection],
  );

  const describe = useCallback(
    (id: string): string => {
      const fill = fillOf(id);
      if (view === 'theirs') return fill === 'visited' ? `Explored by ${friendName}` : 'Not marked';
      if (view === 'compare') {
        return fill === 'both'
          ? 'You have both explored it'
          : fill === 'you'
            ? 'Only you'
            : fill === 'friend'
              ? `Only ${friendName}`
              : 'Neither of you';
      }
      const words = fill === 'visited' ? 'Explored' : fill === 'wishlist' ? 'On your bucket list' : 'Not marked';
      const inside = spots.summary?.byFeature[id];
      return inside && inside.visited > 0 ? `${words}, ${inside.visited} of ${inside.total} places` : words;
    },
    [fillOf, view, friendName, spots.summary],
  );

  // -------------------------------------------------------------- actions

  const onActivate = useCallback(
    (id: string): string => {
      const feature = known.get(id);
      if (!feature) return '';
      clearedSpots.current = null;
      const before = stateOf(selection, id);
      const after = state.toggle(id, mode);
      // The moment someone marks a province is the moment to ask where in it they have been.
      if (layer && after === 'visited') setLastMarked(id);
      const delta = feature.countable ? (after === 'visited' ? 1 : 0) - (before === 'visited' ? 1 : 0) : 0;
      const message =
        after === 'visited' ? 'Marked as explored' : after === 'wishlist' ? 'Added to your bucket list' : 'Mark removed';
      const count = stats.visited + delta;
      setAnnouncement(
        `${feature.name}: ${message.toLowerCase()}. ${count} of ${stats.total} ${plural(stats.total, def.unit.one, def.unit.many)} explored.`,
      );
      return message;
    },
    [known, selection, state.toggle, mode, stats.visited, stats.total, def, layer],
  );

  // Changes made from the checklist. Any new change means "Start over" can no longer be taken back whole.
  const setPlace = useCallback(
    (id: string, next: PlaceState) => {
      clearedSpots.current = null;
      state.setPlace(id, next);
      if (layer && next === 'visited') setLastMarked(id);
    },
    [state.setPlace, layer],
  );
  const setMany = useCallback(
    (ids: string[], next: PlaceState) => {
      clearedSpots.current = null;
      state.setMany(ids, next);
    },
    [state.setMany],
  );

  /** Steps back one change. Straight after "Start over" that also brings back the places inside. */
  const undo = useCallback(() => {
    state.undo();
    if (clearedSpots.current) {
      spots.replace(clearedSpots.current);
      clearedSpots.current = null;
    }
    setAnnouncement('Last change undone.');
  }, [state.undo, spots.replace]);

  const clearAll = () => {
    setConfirmReset(false);
    const ticked = spots.marks;
    state.clear();
    if (ticked.size) spots.replace(new Set());
    clearedSpots.current = ticked.size ? ticked : null;
    setAnnouncement('Map cleared.');
    notify('Map cleared.', { label: 'Undo', run: undo });
  };

  /** A tick inside a province. Having been to Toronto means having been to Ontario, so that follows. */
  const togglePlace = useCallback(
    (place: PlaceDef, on: boolean) => {
      clearedSpots.current = null;
      spots.set(place.id, on);
      const parent = known.get(place.within);
      if (on && parent && !selection.visited.has(parent.id)) state.setPlace(parent.id, 'visited');
      const inside = spots.summary?.byFeature[place.within];
      const now = (inside?.visited ?? 0) + (on ? 1 : -1);
      setAnnouncement(`${place.name}: ${on ? 'ticked' : 'tick removed'}. ${now} of ${inside?.total ?? 0} places in ${parent?.name ?? def.place}.`);
    },
    [spots.set, spots.summary, known, selection, state.setPlace, def],
  );

  // Ctrl/⌘ + Z undoes the last change, unless the visitor is typing in a field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z' || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (!state.canUndo) return;
      event.preventDefault();
      undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.canUndo, undo]);

  // Celebrate the moment the map is completed, once per completion.
  const wasComplete = useRef<boolean | null>(null);
  useEffect(() => {
    if (!state.ready) return;
    if (wasComplete.current === false && stats.complete) {
      notify(`That is all ${stats.total} ${def.unit.many}. Complete Explorer earned.`);
    }
    wasComplete.current = stats.complete;
  }, [stats.complete, state.ready]);

  // Offer (never apply) places implied by the visitor's other maps. Like the saved marks, the
  // offer is worked out before the first frame, so it does not push the panel down a moment later.
  const [rollupDismissed, setRollupDismissed] = useState(() => {
    try {
      return typeof window !== 'undefined' && window.sessionStorage.getItem(ROLLUP_DISMISSED + def.id) === '1';
    } catch {
      return false; // no session storage: ask each time
    }
  });
  const rollup = useMemo<RollupSuggestion | null>(
    () =>
      state.ready && variant === 'page' && !rollupDismissed
        ? suggestRollup(def, selection, layer ? featuresWithMarks(layer, spots.marks) : undefined)
        : null,
    [state.ready, variant, rollupDismissed, def, selection, layer, spots.marks],
  );

  const dismissRollup = () => {
    try {
      window.sessionStorage.setItem(ROLLUP_DISMISSED + def.id, '1');
    } catch {
      /* fine */
    }
    setRollupDismissed(true);
  };

  // Once they are marked the offer has nothing left to add, and it returns if the change is undone.
  const applyRollup = () => {
    if (!rollup) return;
    setMany(rollup.ids, 'visited');
    notify(`Added ${listOf(rollup.names)}.`, { label: 'Undo', run: undo });
  };

  const hasMarks = selection.visited.size + selection.wishlist.size > 0;
  const tickedInside = spots.marks.size;
  // The marks travel to the poster studio in the link, for browsers that will not store them.
  const posterHref = href(posterPath(def)) + (hasMarks ? buildHash(def, { visited: selection.visited, wishlist: selection.wishlist }) : '');
  const editable = view === 'mine';
  const unitMany = def.unit.many;

  // --------------------------------------------------------------- render

  return (
    <div
      class={`mapapp mapapp--${variant} mapapp--${layout} ${shell ? 'mapapp--shell' : ''}`}
      // Tests and scripts look for these on the live map only.
      data-map={shell ? undefined : def.id}
      data-ready={shell ? undefined : state.ready ? 'true' : 'false'}
    >
      {friend && friendStats && (
        <aside class="friend-banner" aria-label="Shared map">
          <div class="friend-banner__text">
            <Icon name={friend.challenge ? 'flag' : 'compare'} size={22} />
            <p>
              {friend.challenge ? (
                <>
                  <strong>{FriendName}</strong> has explored{' '}
                  <strong class="num">
                    {friendStats.visited} of {friendStats.total}
                  </strong>{' '}
                  {unitMany}. Mark where you have been, then compare.
                </>
              ) : (
                <>
                  You are looking at <strong>{possessive(friendName)}</strong> map:{' '}
                  <strong class="num">
                    {friendStats.visited} of {friendStats.total}
                  </strong>{' '}
                  {unitMany} explored.
                </>
              )}
            </p>
          </div>
          <div class="friend-banner__controls">
            <div class="segmented" role="radiogroup" aria-label="Which map to show">
              {(
                [
                  ['mine', 'My map'],
                  ['theirs', friend.name ? possessive(friend.name) : 'Their map'],
                  ['compare', 'Compare'],
                ] as [ViewKind, string][]
              ).map(([value, text]) => (
                <label class="segmented__option" key={value}>
                  <input type="radio" name={`view-${def.id}`} value={value} checked={view === value} onChange={() => showView(value)} />
                  <span>{text}</span>
                </label>
              ))}
            </div>
            <button type="button" class="btn btn--sm btn--bare" onClick={closeFriend}>
              <Icon name="close" size={16} />
              Close shared map
            </button>
          </div>
        </aside>
      )}

      <div class="mapapp__grid">
        <div class="mapapp__stage">
          {editable && (
            <div class="mapapp__toolbar" {...(shell ? SWITCHED_OFF : null)}>
              <div class="segmented" role="radiogroup" aria-label="What a tap on the map does">
                <label class="segmented__option">
                  <input type="radio" name={`mode-${def.id}-${variant}`} checked={mode === 'visited'} onChange={() => setMode('visited')} />
                  <span>
                    <i class="segmented__swatch legend__swatch--visited" />
                    Explored
                  </span>
                </label>
                <label class="segmented__option">
                  <input type="radio" name={`mode-${def.id}-${variant}`} checked={mode === 'wishlist'} onChange={() => setMode('wishlist')} />
                  <span>
                    <i class="segmented__swatch legend__swatch--wishlist" />
                    Want to go
                  </span>
                </label>
              </div>
              <div class="mapapp__tools">
                <button
                  type="button"
                  class="btn btn--sm btn--bare"
                  onClick={undo}
                  disabled={!state.canUndo}
                >
                  <Icon name="undo" size={18} />
                  Undo
                </button>
                <button type="button" class="btn btn--sm btn--bare" onClick={() => setConfirmReset(true)} disabled={!hasMarks && !tickedInside}>
                  <Icon name="restart" size={18} />
                  Start over
                </button>
              </div>
            </div>
          )}

          <div class="mapapp__sheet">
            {shell ? (
              <ShellMap width={meta.width} height={meta.height} picture={shell}>
                <LoadState
                  wait="Loading the map…"
                  nojs="The interactive map needs JavaScript. Turn it on in your browser to mark places."
                  what="The map"
                />
              </ShellMap>
            ) : (
              <MapCanvas
                def={def}
                meta={meta}
                geometry={geometry}
                fillOf={fillOf}
                toneOf={toneOf}
                describe={describe}
                onActivate={editable ? onActivate : undefined}
                hotId={hotId}
                maxZoom={maxZoom}
                markerBelow={markerBelow}
                label={`Map of ${def.id === 'world' ? 'the world' : 'Canada'} showing ${def.scope}. ${
                  editable ? `Mode: ${mode === 'visited' ? 'mark as explored' : 'add to bucket list'}.` : ''
                }`}
              />
            )}
          </div>

          {layer && editable && (
            <PlacesPrompt
              feature={lastMarked && selection.visited.has(lastMarked) ? (known.get(lastMarked) ?? null) : null}
              count={lastMarked ? (spots.summary?.byFeature[lastMarked] ?? null) : null}
              unit={def.unit.one}
              onOpen={setPlacesOf}
              switchedOff={Boolean(shell)}
            />
          )}

          <div class="mapapp__under">
            <Legend kind={view} friendName={friendName} ramp={shaded ? TONE_RAMP : null} />
            {editable && state.saveState !== 'pending' && (
              <p class={`save-state ${state.saveState === 'unavailable' ? 'is-warn' : ''}`}>
                {state.saveState === 'saved' ? (
                  <>
                    <Icon name="device" size={16} />
                    Saved on this device
                  </>
                ) : (
                  <>
                    <Icon name="info" size={16} />
                    Your browser is blocking storage, so this map will be gone when you close the page.
                  </>
                )}
              </p>
            )}
            {!editable && view === 'theirs' && (
              <p class="save-state">
                <Icon name="eye" size={16} />
                View only. Choose “My map” to mark your own places.
              </p>
            )}
          </div>
        </div>

        <div class="mapapp__panel" {...(shell ? SWITCHED_OFF : null)}>
          {view === 'compare' && friendSelection ? (
            <>
              <CompareSummary def={def} mine={selection} theirs={friendSelection} friendName={FriendName} />
              <div class="mapapp__actions">
                <button type="button" class="btn btn--forest btn--block" onClick={() => setShareKind('challenge')}>
                  <Icon name="flag" size={18} />
                  Send your map back
                </button>
                <button type="button" class="btn btn--quiet btn--block" onClick={() => showView('mine')}>
                  Keep marking my map
                </button>
              </div>
            </>
          ) : view === 'theirs' && friendSelection && friendStats ? (
            <>
              <section class="progress">
                <p class="progress__headline">
                  <span class="progress__count num">{friendStats.visited}</span>
                  <span class="progress__of">
                    of {friendStats.total} {unitMany} explored by {friendName}
                  </span>
                </p>
                <p class="progress__note">
                  {friendStats.visited
                    ? listOf(def.features.filter((f) => friendSelection.visited.has(f.id)).map((f) => f.name)) + '.'
                    : 'No places are marked on this map.'}
                </p>
              </section>
              <div class="mapapp__actions">
                <button type="button" class="btn btn--forest btn--block" onClick={() => showView('mine')}>
                  Make my own map
                </button>
                <button type="button" class="btn btn--quiet btn--block" onClick={() => showView('compare')}>
                  <Icon name="compare" size={18} />
                  Compare with mine
                </button>
              </div>
            </>
          ) : (
            <>
              <div class="mapapp__col mapapp__col--summary">
                <ProgressPanel def={def} stats={stats} selection={selection} compact={variant === 'embed'} places={layer ? spots.summary : null} />

                {rollup && (
                  <aside class="rollup" aria-label="Suggestion from your other maps">
                    <p>
                      {rollup.sources.length > 0 ? (
                        <>
                          Your {listOf(rollup.sources.map((s) => `“${s}”`))} {plural(rollup.sources.length, 'map suggests', 'maps suggest')} you
                          have also been to <strong>{listOf(rollup.names)}</strong>. Maps keep separate progress, so nothing is added unless
                          you say so.
                        </>
                      ) : (
                        <>
                          The places you have ticked are in <strong>{listOf(rollup.names)}</strong>, which {plural(rollup.ids.length, 'is', 'are')}{' '}
                          not marked as explored. Nothing is added unless you say so.
                        </>
                      )}
                    </p>
                    <div class="rollup__actions">
                      <button type="button" class="btn btn--sm btn--forest" onClick={applyRollup}>
                        Add {rollup.ids.length === 1 ? rollup.names[0] : `${rollup.ids.length} ${unitMany}`}
                      </button>
                      <button type="button" class="btn btn--sm btn--quiet" onClick={dismissRollup}>
                        Not now
                      </button>
                    </div>
                  </aside>
                )}

                <div class="mapapp__actions">
                  <a class="btn btn--forest btn--block" href={posterHref} data-testid="poster-link">
                    <Icon name="poster" size={18} />
                    Design my poster
                  </a>
                  {variant === 'page' ? (
                    <div class="mapapp__actions-row">
                      <button type="button" class="btn btn--quiet" onClick={() => setShareKind('share')}>
                        <Icon name="share" size={18} />
                        Share
                      </button>
                      <button type="button" class="btn btn--quiet" onClick={() => setShareKind('challenge')}>
                        <Icon name="flag" size={18} />
                        Challenge a friend
                      </button>
                    </div>
                  ) : (
                    <a class="btn btn--quiet btn--block" href={href(mapPath(def))}>
                      Open the full map
                    </a>
                  )}
                </div>
              </div>

              <section class="mapapp__col mapapp__col--list" aria-labelledby={`list-${def.id}-${variant}`}>
                <div class="panel-head">
                  <h2 id={`list-${def.id}-${variant}`}>{capitalize(unitMany)}</h2>
                </div>
                <PlaceList
                  def={def}
                  selection={selection}
                  onSet={setPlace}
                  onSetMany={setMany}
                  onHover={setHotId}
                  expanded={def.features.length <= 20}
                  collapsed={compactList}
                  detail={layer && spots.summary ? { summary: spots.summary, onOpen: setPlacesOf } : undefined}
                />
              </section>

              {variant === 'page' && (
                <div class="mapapp__col mapapp__col--extra">
                  <AchievementsPanel achievements={achievements} />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Everything below belongs to the live map only. */}
      {!shell && (
        <>
          <p class="visually-hidden" role="status" aria-live="polite">
            {announcement}
          </p>

          <Dialog open={confirmReset} title="Clear this map?" onClose={() => setConfirmReset(false)}>
            <p>
              This removes {selection.visited.size} explored {plural(selection.visited.size, 'place', 'places')}
              {selection.wishlist.size > 0 && ` and ${selection.wishlist.size} on your bucket list`} from this device.
              {tickedInside > 0 && ` It also unticks the ${tickedInside} ${plural(tickedInside, 'place', 'places')} you chose inside them.`} You can
              undo it straight afterwards.
            </p>
            <div class="dialog__actions">
              <button type="button" class="btn btn--quiet" onClick={() => setConfirmReset(false)}>
                Keep my map
              </button>
              <button type="button" class="btn btn--danger" onClick={clearAll}>
                Clear map
              </button>
            </div>
          </Dialog>

          {layer && (
            <PlacesDialog
              layer={layer}
              feature={placesOf ? (known.get(placesOf) ?? null) : null}
              marks={spots.marks}
              count={placesOf ? (spots.summary?.byFeature[placesOf] ?? null) : null}
              onToggle={togglePlace}
              onClose={() => setPlacesOf(null)}
            />
          )}

          <ShareDialog
            def={def}
            meta={meta}
            geometry={geometry}
            selection={selection}
            stats={stats}
            places={spots.summary}
            kind={shareKind}
            onClose={() => setShareKind(null)}
            onDone={(message) => notify(message)}
          />

          <Toast toast={toast} onDismiss={() => setToast(null)} />
        </>
      )}
    </div>
  );
}
