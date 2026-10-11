import { useEffect, useMemo, useState } from 'preact/hooks';
import { placesIn, type PlaceCount } from '../../lib/maps/places';
import { normalizeText } from '../../lib/maps/search';
import type { FeatureDef, PlaceDef, PlaceLayer } from '../../lib/maps/types';
import { capitalize } from '../../lib/text';
import { Dialog } from '../ui/Dialog';
import { Icon } from '../ui/Icon';

interface Props {
  layer: PlaceLayer;
  /** The province or territory whose places are shown. Null keeps the dialog closed. */
  feature: FeatureDef | null;
  marks: ReadonlySet<string>;
  count: PlaceCount | null;
  onToggle: (place: PlaceDef, on: boolean) => void;
  onClose: () => void;
}

function matches(place: PlaceDef, q: string): boolean {
  if (normalizeText(place.name).includes(q)) return true;
  return (place.aliases ?? []).some((alias) => normalizeText(alias).includes(q));
}

/**
 * The places inside one province or territory, as a checklist grouped by kind. Ticking them is how
 * a visitor says how much of the province they have seen. Every change is saved as it is made.
 */
export function PlacesDialog({ layer, feature, marks, count, onToggle, onClose }: Props) {
  const [query, setQuery] = useState('');
  useEffect(() => setQuery(''), [feature?.id]);

  const places = useMemo(() => (feature ? placesIn(layer, feature.id) : []), [layer, feature]);
  const q = normalizeText(query);
  const shown = q ? places.filter((place) => matches(place, q)) : places;
  const groups = layer.kinds
    .map((kind) => ({ kind, all: places.filter((p) => p.kind === kind.id), shown: shown.filter((p) => p.kind === kind.id) }))
    .filter((group) => group.shown.length > 0);

  return (
    <Dialog open={feature !== null} title={feature ? `Places in ${feature.name}` : ''} onClose={onClose} wide>
      {feature && count && (
        <div class="spots" data-feature={feature.id}>
          <div class="spots__summary">
            <p>
              <strong class="num" data-testid="spots-count">
                {count.visited} of {count.total}
              </strong>{' '}
              places ticked
              {count.visited > 0 && (
                <>
                  : <strong class="num">{count.percentLabel}</strong> of our list for {feature.name}
                </>
              )}
            </p>
            <div
              class="progress__bar"
              role="progressbar"
              aria-label={`Places ticked in ${feature.name}`}
              aria-valuemin={0}
              aria-valuemax={count.total}
              aria-valuenow={count.visited}
              aria-valuetext={`${count.visited} of ${count.total}, ${count.percentLabel}`}
            >
              <span style={{ width: `${count.percent}%` }} />
            </div>
          </div>

          {places.length > 10 && (
            <div class="place-search">
              <Icon name="search" size={18} class="place-search__icon" />
              <label class="visually-hidden" for={`spots-search-${layer.id}`}>
                Search places in {feature.name}
              </label>
              <input
                id={`spots-search-${layer.id}`}
                class="input place-search__input"
                type="search"
                placeholder={`Search places in ${feature.name}`}
                autocomplete="off"
                spellcheck={false}
                enterkeyhint="search"
                value={query}
                onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
              />
            </div>
          )}

          <p class="visually-hidden" role="status">
            {q ? `${shown.length} ${shown.length === 1 ? 'match' : 'matches'}` : ''}
          </p>

          {groups.length === 0 && (
            <div class="place-list__empty">
              <p>
                <strong>Nothing matches “{query.trim()}”.</strong>
              </p>
              <button type="button" class="btn btn--sm btn--quiet" onClick={() => setQuery('')}>
                Show all places
              </button>
            </div>
          )}

          {groups.map(({ kind, all, shown: rows }) => (
            <section class="spots__group" key={kind.id} aria-labelledby={`spots-${layer.id}-${kind.id}`}>
              <div class="spots__head">
                <h3 id={`spots-${layer.id}-${kind.id}`}>{capitalize(kind.name.many)}</h3>
                <span class="num">
                  {all.filter((p) => marks.has(p.id)).length} of {all.length}
                </span>
              </div>
              <ul class="spots__rows">
                {rows.map((place) => {
                  const on = marks.has(place.id);
                  return (
                    <li key={place.id}>
                      <label class={`spot ${on ? 'is-on' : ''}`}>
                        <input
                          type="checkbox"
                          class="place__check"
                          checked={on}
                          onChange={(event) => onToggle(place, (event.target as HTMLInputElement).checked)}
                        />
                        <span class="place__box" aria-hidden="true">
                          <Icon name="check" size={14} />
                        </span>
                        <span class="spot__name">{place.name}</span>
                        {place.note && <span class="spot__note">{place.note}</span>}
                      </label>
                    </li>
                  );
                })}
              </ul>
              {!q && <p class="spots__rule">{kind.rule}</p>}
            </section>
          ))}

          <p class="spots__note">{layer.countingNote}</p>
          <div class="dialog__actions">
            <button type="button" class="btn btn--forest" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
