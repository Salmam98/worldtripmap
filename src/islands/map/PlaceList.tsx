import { useMemo, useState } from 'preact/hooks';
import type { PlaceCount, PlacesSummary } from '../../lib/maps/places';
import { searchFeatures } from '../../lib/maps/search';
import type { FeatureDef, MapDefinition, Selection } from '../../lib/maps/types';
import { Icon } from '../ui/Icon';
import { stateOf, type PlaceState } from './useMapState';

interface Props {
  def: MapDefinition;
  selection: Selection;
  onSet: (id: string, state: PlaceState) => void;
  onSetMany: (ids: string[], state: PlaceState) => void;
  onHover: (id: string | null) => void;
  /** Open every group from the start. Used for short lists. */
  expanded?: boolean;
  /** Start with every group closed, where the list shares a small screen with other content. */
  collapsed?: boolean;
  /** Places inside each feature: adds a line under every row that opens that feature's places. */
  detail?: { summary: PlacesSummary; onOpen: (id: string) => void };
}

function Row({
  feature,
  state,
  onSet,
  onHover,
  places,
  onOpenPlaces,
}: {
  feature: FeatureDef;
  state: PlaceState;
  onSet: Props['onSet'];
  onHover: Props['onHover'];
  places?: PlaceCount;
  onOpenPlaces?: (id: string) => void;
}) {
  const visited = state === 'visited';
  const wished = state === 'wishlist';
  return (
    <li
      class={`place ${visited ? 'is-visited' : ''} ${wished ? 'is-wishlist' : ''} ${places ? 'place--detail' : ''}`}
      onMouseEnter={() => onHover(feature.id)}
      onMouseLeave={() => onHover(null)}
      onFocusIn={() => onHover(feature.id)}
      onFocusOut={() => onHover(null)}
    >
      <label class="place__main">
        <input
          type="checkbox"
          class="place__check"
          checked={visited}
          onChange={(event) => onSet(feature.id, (event.target as HTMLInputElement).checked ? 'visited' : 'none')}
        />
        <span class="place__box" aria-hidden="true">
          <Icon name="check" size={14} />
        </span>
        <span class="place__name">{feature.name}</span>
        {feature.note && <span class="place__note">{feature.note}</span>}
      </label>
      <button
        type="button"
        class="place__wish"
        aria-pressed={wished}
        aria-label={wished ? `Remove ${feature.name} from your bucket list` : `Add ${feature.name} to your bucket list`}
        title={wished ? 'On your bucket list' : 'Add to bucket list'}
        onClick={() => onSet(feature.id, wished ? 'none' : 'wishlist')}
      >
        <Icon name="bookmark" size={18} />
      </button>
      {places && onOpenPlaces && (
        <button
          type="button"
          class="place__detail"
          data-testid={`places-${feature.id}`}
          // The name begins with the words on the button, so someone using voice control can say what they see.
          aria-label={`${places.visited} of ${places.total} places${places.visited ? ` · ${places.percentLabel}` : ''}. Choose places in ${feature.name}`}
          onClick={() => onOpenPlaces(feature.id)}
        >
          <span class="place__detail-text">
            <span class="num">
              {places.visited} of {places.total}
            </span>{' '}
            places
            {places.visited > 0 && (
              <>
                {' · '}
                <strong class="num">{places.percentLabel}</strong>
              </>
            )}
          </span>
          <Icon name="chevron" size={14} class="place__detail-chevron" />
        </button>
      )}
    </li>
  );
}

/** Every place on the map as a searchable checklist: the dependable way to mark small places. */
export function PlaceList({ def, selection, onSet, onSetMany, onHover, expanded, collapsed, detail }: Props) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchFeatures(def, query), [def, query]);
  const searching = query.trim().length > 0;

  const sections = useMemo(() => {
    const countable = def.groups
      .map((group) => ({
        key: group.id,
        title: group.name,
        features: def.features.filter((f) => f.countable && f.group === group.id),
      }))
      .filter((section) => section.features.length > 0);
    const others = def.features.filter((f) => !f.countable);
    return { countable, others };
  }, [def]);

  // The rows of a closed group are only built once it is opened. The world list has 237 rows, and
  // building them all up front made the page slow to respond on phones for no visible gain.
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const reveal = (key: string) => setOpened((current) => (current.has(key) ? current : new Set(current).add(key)));

  const renderRows = (features: FeatureDef[]) => (
    <ul class="place-list__rows">
      {features.map((feature) => (
        <Row
          key={feature.id}
          feature={feature}
          state={stateOf(selection, feature.id)}
          onSet={onSet}
          onHover={onHover}
          places={detail?.summary.byFeature[feature.id]}
          onOpenPlaces={detail?.onOpen}
        />
      ))}
    </ul>
  );

  const section = (key: string, title: string, features: FeatureDef[], note?: string) => {
    const done = features.filter((f) => selection.visited.has(f.id)).length;
    const allDone = done === features.length;
    const startsOpen = !collapsed && (expanded || features.length <= 6);
    return (
      <details
        class="place-group"
        key={key}
        open={startsOpen}
        // Opened some other way than a click on the heading (find-in-page, a script): still build the rows.
        onToggle={(event) => {
          if ((event.currentTarget as HTMLDetailsElement).open) reveal(key);
        }}
      >
        {/* The click arrives before the group opens, so its rows are in place by the time it does. */}
        <summary class="place-group__summary" onClick={() => reveal(key)}>
          <span class="place-group__title">{title}</span>
          <span class="place-group__count num">
            {done} of {features.length}
          </span>
          <Icon name="chevron" size={18} class="place-group__chevron" />
        </summary>
        {note && <p class="place-group__note">{note}</p>}
        {(startsOpen || opened.has(key)) && renderRows(features)}
        <button
          type="button"
          class="place-group__all"
          onClick={() => onSetMany(features.map((f) => f.id), allDone ? 'none' : 'visited')}
        >
          {allDone ? `Clear all ${features.length} in ${title}` : `Mark all ${features.length} in ${title} as explored`}
        </button>
      </details>
    );
  };

  return (
    <div class="place-list">
      <div class="place-search">
        <Icon name="search" size={18} class="place-search__icon" />
        <label class="visually-hidden" for={`search-${def.id}`}>
          Search {def.unit.many}
        </label>
        <input
          id={`search-${def.id}`}
          class="input place-search__input"
          type="search"
          placeholder={`Search ${def.unit.many}`}
          autocomplete="off"
          spellcheck={false}
          enterkeyhint="search"
          value={query}
          onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
        />
      </div>

      <p class="visually-hidden" role="status">
        {searching ? `${results.length} ${results.length === 1 ? 'match' : 'matches'}` : ''}
      </p>

      {searching ? (
        results.length > 0 ? (
          renderRows(results)
        ) : (
          <div class="place-list__empty">
            <p>
              <strong>Nothing matches “{query.trim()}”.</strong>
            </p>
            <p>Try a shorter name, or check the spelling. You can also tap the place on the map.</p>
            <button type="button" class="btn btn--sm btn--quiet" onClick={() => setQuery('')}>
              Show all {def.unit.many}
            </button>
          </div>
        )
      ) : (
        <>
          {sections.countable.map((s) => section(s.key, s.title, s.features))}
          {sections.others.length > 0 &&
            section(
              'others',
              'Territories and other areas',
              sections.others,
              'You can mark these too. They are counted separately and are not part of the 195.',
            )}
        </>
      )}
    </div>
  );
}
