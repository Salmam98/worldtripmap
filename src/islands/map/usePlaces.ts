import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { loadPlaceMarks, savePlaceMarks, storageKeys, summarizePlaces, type PlacesSummary } from '../../lib/maps/places';
import type { PlaceLayer } from '../../lib/maps/types';

const NONE: ReadonlySet<string> = new Set();

/**
 * The places a visitor has ticked inside the features of a map (the cities, parks and landmarks of
 * each province), saved on this device. Without a layer it holds nothing and costs nothing.
 */
export function usePlaces(layer: PlaceLayer | undefined) {
  // Read before the first frame is drawn, like the map's own marks, so nothing changes a moment later.
  const [marks, setMarks] = useState<ReadonlySet<string>>(() => (layer ? loadPlaceMarks(layer) : NONE));
  const current = useRef(marks);

  const apply = useCallback((next: ReadonlySet<string>) => {
    current.current = next;
    setMarks(next);
  }, []);

  // Another tab, or the cities map in another tab, changed the same marks.
  useEffect(() => {
    if (!layer) return;
    const keys = new Set(storageKeys(layer));
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || keys.has(event.key)) apply(loadPlaceMarks(layer));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [layer, apply]);

  /** Ticks or unticks one place. Returns false when the browser would not save it. */
  const set = useCallback(
    (id: string, on: boolean): boolean => {
      if (!layer || current.current.has(id) === on) return true;
      const next = new Set(current.current);
      if (on) next.add(id);
      else next.delete(id);
      apply(next);
      return savePlaceMarks(layer, next);
    },
    [layer, apply],
  );

  /** Replaces every mark at once: used to clear the map, and to undo that. */
  const replace = useCallback(
    (next: ReadonlySet<string>): boolean => {
      if (!layer) return true;
      apply(new Set(next));
      return savePlaceMarks(layer, next);
    },
    [layer, apply],
  );

  const summary = useMemo<PlacesSummary | null>(() => (layer ? summarizePlaces(layer, marks) : null), [layer, marks]);

  return { marks, summary, set, replace };
}
