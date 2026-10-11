import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { track } from '../../lib/analytics';
import { featuresById } from '../../lib/maps/registry';
import { computeStats } from '../../lib/maps/stats';
import { loadSelection, normalizeSelection, sameSelection, saveSelection } from '../../lib/maps/store';
import type { MapDefinition, Selection } from '../../lib/maps/types';

export type MarkMode = 'visited' | 'wishlist';
export type PlaceState = 'none' | 'visited' | 'wishlist';
export type SaveState = 'pending' | 'saved' | 'unavailable';

const HISTORY_LIMIT = 100;

function clone(selection: Selection): Selection {
  return { visited: new Set(selection.visited), wishlist: new Set(selection.wishlist) };
}

export function stateOf(selection: Selection, id: string): PlaceState {
  if (selection.visited.has(id)) return 'visited';
  if (selection.wishlist.has(id)) return 'wishlist';
  return 'none';
}

/**
 * A visitor's own marks on one map: the selection, an undo history, and saving to this device.
 * A place is "explored", "want to go" or neither, so it can never be counted twice.
 */
export function useMapState(def: MapDefinition, handoff?: Selection | null) {
  // What this browser has saved is read before the first frame is drawn, so the map opens already
  // showing it and nothing has to move a moment later. A selection handed over in the link (from
  // the map page to the poster studio) fills in when nothing is saved here. While the site is
  // being built there is no browser, and the map starts empty.
  const [start] = useState(() => {
    const stored = loadSelection(def);
    const empty = stored.visited.size === 0 && stored.wishlist.size === 0;
    const selection = empty && handoff ? normalizeSelection(def, handoff.visited, handoff.wishlist) : stored;
    return { selection, handedOver: empty && selection.visited.size + selection.wishlist.size > 0 };
  });
  const [selection, setSelectionState] = useState<Selection>(start.selection);
  const [past, setPastState] = useState<Selection[]>([]);
  /** True in the browser, where saved marks are already loaded; false while the site is built. */
  const ready = typeof window !== 'undefined';
  const [saveState, setSaveState] = useState<SaveState>('pending');
  const current = useRef<Selection>(selection);
  const history = useRef<Selection[]>(past);
  const started = useRef(false);
  const known = useMemo(() => featuresById(def), [def]);

  const apply = useCallback((next: Selection, nextHistory: Selection[]) => {
    current.current = next;
    history.current = nextHistory;
    setSelectionState(next);
    setPastState(nextHistory);
  }, []);

  // A selection that arrived in the link is saved here, so it is still on the map after a reload.
  useEffect(() => {
    if (start.handedOver) setSaveState(saveSelection(def, start.selection) ? 'saved' : 'unavailable');
  }, [def, start]);

  // Another tab (the poster studio, say) changed the same map.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== `wtm:v1:map:${def.id}`) return;
      const next = loadSelection(def);
      if (!sameSelection(current.current, next)) apply(next, history.current);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [def, apply]);

  const commit = useCallback(
    (update: (draft: Selection) => void) => {
      const before = current.current;
      const draft = clone(before);
      update(draft);
      const next = normalizeSelection(def, draft.visited, draft.wishlist);
      if (sameSelection(before, next)) return;

      apply(next, [...history.current.slice(-(HISTORY_LIMIT - 1)), before]);
      setSaveState(saveSelection(def, next) ? 'saved' : 'unavailable');

      const was = computeStats(def, before);
      const now = computeStats(def, next);
      if (!started.current) {
        started.current = true;
        track('map_started', { map: def.id });
      }
      if (now.visited + now.otherVisited > was.visited + was.otherVisited) {
        track('region_selected', { map: def.id, count: now.visited + now.otherVisited });
      }
      if (now.complete && !was.complete) track('map_completed', { map: def.id });
    },
    [def, apply],
  );

  const setPlace = useCallback(
    (id: string, state: PlaceState) => {
      if (!known.has(id)) return;
      commit((draft) => {
        draft.visited.delete(id);
        draft.wishlist.delete(id);
        if (state === 'visited') draft.visited.add(id);
        if (state === 'wishlist') draft.wishlist.add(id);
      });
    },
    [commit, known],
  );

  /** Tap behaviour on the map: marks the place in the current mode, or clears it if already so. */
  const toggle = useCallback(
    (id: string, mode: MarkMode): PlaceState => {
      const next: PlaceState = stateOf(current.current, id) === mode ? 'none' : mode;
      setPlace(id, next);
      return next;
    },
    [setPlace],
  );

  const setMany = useCallback(
    (ids: string[], state: PlaceState) => {
      commit((draft) => {
        for (const id of ids) {
          draft.visited.delete(id);
          draft.wishlist.delete(id);
          if (state === 'visited') draft.visited.add(id);
          if (state === 'wishlist') draft.wishlist.add(id);
        }
      });
    },
    [commit],
  );

  const clear = useCallback(() => {
    commit((draft) => {
      draft.visited.clear();
      draft.wishlist.clear();
    });
  }, [commit]);

  const undo = useCallback(() => {
    const stack = history.current;
    if (!stack.length) return;
    const previous = stack[stack.length - 1];
    apply(previous, stack.slice(0, -1));
    setSaveState(saveSelection(def, previous) ? 'saved' : 'unavailable');
  }, [def, apply]);

  return { selection, ready, saveState, canUndo: past.length > 0, setPlace, toggle, setMany, clear, undo };
}
