import type { Achievement } from '../../lib/maps/achievements';
import type { PlaceCount, PlacesSummary } from '../../lib/maps/places';
import { canadaAreaShare, formatCount, type MapStats } from '../../lib/maps/stats';
import type { FeatureDef, MapDefinition, Selection } from '../../lib/maps/types';
import { capitalize, listOf, plural, possessive } from '../../lib/text';
import { Icon } from '../ui/Icon';
import { toneFor } from './tones';

export function ProgressPanel({
  def,
  stats,
  selection,
  compact,
  places,
}: {
  def: MapDefinition;
  stats: MapStats;
  selection: Selection;
  compact?: boolean;
  /** Places ticked inside the map's features, when the map has that second level. */
  places?: PlacesSummary | null;
}) {
  const unit = plural(stats.total, def.unit.one, def.unit.many);
  const area = def.id === 'canada' && stats.visited > 0 ? canadaAreaShare(selection) : null;
  // The result for each province with something ticked in it, in the order of the map's list.
  const inside = places
    ? def.features.flatMap((feature) => {
        const count = places.byFeature[feature.id];
        return count && count.visited > 0 ? [{ feature, count }] : [];
      })
    : [];
  return (
    <section class="progress" aria-labelledby={`progress-${def.id}`}>
      <h2 id={`progress-${def.id}`} class="visually-hidden">
        Your progress
      </h2>
      <p class="progress__headline">
        <span class="progress__count num">{formatCount(stats.visited)}</span>
        <span class="progress__of">
          of {formatCount(stats.total)} {unit} explored
        </span>
      </p>
      <div
        class="progress__bar"
        role="progressbar"
        aria-label={`${capitalize(def.unit.many)} explored`}
        aria-valuemin={0}
        aria-valuemax={stats.total}
        aria-valuenow={stats.visited}
        aria-valuetext={`${stats.visited} of ${stats.total}, ${stats.percentLabel}`}
      >
        <span style={{ width: `${stats.percent}%` }} />
      </div>
      <p class="progress__percent">
        <strong class="num">{stats.percentLabel}</strong> of {def.id === 'canada-cities' ? 'the 45 cities on this map' : def.unit.many}
        {stats.complete && ' '}
        {stats.complete && <span class="progress__done">Complete</span>}
      </p>

      <ul class="progress__facts">
        {def.otherUnit && stats.otherVisited > 0 && (
          <li>
            <strong class="num">+{stats.otherVisited}</strong> {plural(stats.otherVisited, def.otherUnit.one, def.otherUnit.many)}, counted
            separately
          </li>
        )}
        {def.id === 'world' && stats.visited > 0 && (
          <li>
            <strong class="num">
              {stats.groupsTouched} of {stats.groupsTotal}
            </strong>{' '}
            inhabited continents
          </li>
        )}
        {stats.wishlist > 0 && (
          <li>
            <strong class="num">{stats.wishlist}</strong> on your bucket list
          </li>
        )}
      </ul>

      {places && !compact && (
        <div class="progress__places" data-testid="places-total">
          <p class="progress__places-head">
            <strong class="progress__places-percent num">{places.percentLabel}</strong>{' '}
            <span>
              of {def.place} by places:{' '}
              <strong class="num">
                {formatCount(places.visited)} of {formatCount(places.total)}
              </strong>{' '}
              ticked
            </span>
          </p>
          <div
            class="progress__bar"
            role="progressbar"
            aria-label={`Places ticked across ${def.place}`}
            aria-valuemin={0}
            aria-valuemax={places.total}
            aria-valuenow={places.visited}
            aria-valuetext={`${places.visited} of ${places.total}, ${places.percentLabel}`}
          >
            <span style={{ width: `${places.percent}%` }} />
          </div>
          {inside.length > 0 ? (
            <ul class="progress__inside" data-testid="places-breakdown" aria-label={`Places ticked in each ${def.unit.one}`}>
              {inside.map(({ feature, count }) => (
                <li key={feature.id}>
                  {/* The tone this province has on the map. One that is not marked has no tone there, so none here. */}
                  <i
                    class="progress__inside-tone"
                    aria-hidden="true"
                    style={selection.visited.has(feature.id) ? { background: toneFor(count.visited / count.total).fill } : undefined}
                  />
                  <span class="progress__inside-name">{feature.name}</span>{' '}
                  <span class="progress__inside-count num">
                    {count.visited} of {count.total}
                    <span class="visually-hidden"> places</span>
                  </span>{' '}
                  <strong class="progress__inside-percent num">{count.percentLabel}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p class="progress__places-hint">
              Open a {def.unit.one} in the list and tick the cities, parks and landmarks you have been to. Each one then shows its own
              percentage.
            </p>
          )}
        </div>
      )}

      {!compact && <p class="progress__note">{def.countingNote}</p>}

      {area && !compact && (
        <div class="progress__area">
          <p>
            <strong>By size:</strong> the {plural(stats.visited, def.unit.one, def.unit.many)} you have marked{' '}
            {plural(stats.visited, 'makes', 'make')} up <strong class="num">{area.label}</strong> of Canada’s total area (
            {formatCount(Math.round(area.km2 / 1000) * 1000)} of 9,985,000 km²).
          </p>
          <p>That is the size of those places, not how much of them you have seen.</p>
        </div>
      )}

      {!compact && stats.groups.length > 1 && (
        <ul class="progress__groups" aria-label="Progress by region">
          {stats.groups.map((group) => (
            <li key={group.id}>
              <span class="progress__group-name">{group.name}</span>
              <span class="progress__group-bar" aria-hidden="true">
                <span style={{ width: `${group.total ? (group.visited / group.total) * 100 : 0}%` }} />
              </span>
              <span class="progress__group-count num">
                {group.visited}/{group.total}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The line under the map that asks the question a mark raises: you have been to this province,
 * but where in it? It is always there, so nothing moves when a province is marked, and it never
 * covers the map.
 */
export function PlacesPrompt({
  feature,
  count,
  unit,
  onOpen,
  switchedOff,
}: {
  /** The province marked most recently, while it is still marked. */
  feature: FeatureDef | null;
  count: PlaceCount | null;
  unit: string;
  onOpen: (id: string) => void;
  switchedOff?: boolean;
}) {
  return (
    <div class="mapapp__prompt" data-testid="places-prompt" {...(switchedOff ? { inert: true, 'aria-hidden': true } : null)}>
      {feature && count ? (
        <>
          <p class="mapapp__prompt-text">
            <strong>{feature.name}</strong>
            {' · '}
            <span class="num">
              {count.visited} of {count.total}
            </span>{' '}
            places
            {count.visited > 0 && (
              <>
                {' · '}
                <strong class="num">{count.percentLabel}</strong>
              </>
            )}
          </p>
          <button type="button" class="btn btn--sm btn--forest" onClick={() => onOpen(feature.id)}>
            Choose places<span class="visually-hidden"> in {feature.name}</span>
          </button>
        </>
      ) : (
        <p class="mapapp__prompt-text">Mark a {unit}, then choose the places you have been to inside it.</p>
      )}
    </div>
  );
}

export function AchievementsPanel({ achievements }: { achievements: Achievement[] }) {
  const earned = achievements.filter((a) => a.earned).length;
  return (
    <section class="achievements" aria-labelledby="achievements-title">
      <div class="panel-head">
        <h2 id="achievements-title">Achievements</h2>
        <span class="num muted small">
          {earned} of {achievements.length}
        </span>
      </div>
      <ul class="achievements__list">
        {achievements.map((a) => (
          <li key={a.id} class={`achievement ${a.earned ? 'is-earned' : ''}`}>
            <span class="achievement__icon" aria-hidden="true">
              <Icon name={a.earned ? 'medal' : 'lock'} size={18} />
            </span>
            <span class="achievement__text">
              <strong>{a.name}</strong>
              <span>{a.rule}</span>
            </span>
            <span class="achievement__state num">{a.earned ? 'Earned' : `${a.have}/${a.need}`}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export type LegendKind = 'mine' | 'theirs' | 'compare';

export function Legend({
  kind,
  friendName,
  ramp,
}: {
  kind: LegendKind;
  friendName: string;
  /** The tones of a visited place, lightest first, when places are coloured by how much of each has been seen. */
  ramp?: string[] | null;
}) {
  const items =
    kind === 'compare'
      ? [
          { swatch: 'both', label: 'Both of you' },
          { swatch: 'you', label: 'Only you' },
          { swatch: 'friend', label: `Only ${friendName}` },
          { swatch: 'none', label: 'Neither' },
        ]
      : kind === 'theirs'
        ? [
            { swatch: 'visited', label: `Explored by ${friendName}` },
            { swatch: 'none', label: 'Not marked' },
          ]
        : [
            { swatch: 'visited', label: 'Explored' },
            { swatch: 'wishlist', label: 'Want to go' },
            { swatch: 'none', label: 'Not marked' },
          ];
  return (
    <ul class="legend" aria-label="Map key">
      {items.map((item) =>
        item.swatch === 'visited' && kind === 'mine' && ramp ? (
          // One swatch cannot show a scale, so the key shows the scale itself, lightest to deepest.
          <li key="visited" class="legend__scale" data-testid="legend-scale">
            <span class="legend__ramp" aria-hidden="true">
              {ramp.map((colour) => (
                <i key={colour} style={{ background: colour }} />
              ))}
            </span>
            <span>Explored: darker means more places ticked</span>
          </li>
        ) : (
          <li key={item.swatch}>
            <span class={`legend__swatch legend__swatch--${item.swatch}`} aria-hidden="true" />
            {item.label}
          </li>
        ),
      )}
    </ul>
  );
}

export function CompareSummary({
  def,
  mine,
  theirs,
  friendName,
}: {
  def: MapDefinition;
  mine: Selection;
  theirs: Selection;
  friendName: string;
}) {
  const countable = def.features.filter((f) => f.countable);
  const both = countable.filter((f) => mine.visited.has(f.id) && theirs.visited.has(f.id));
  const onlyYou = countable.filter((f) => mine.visited.has(f.id) && !theirs.visited.has(f.id));
  const onlyThem = countable.filter((f) => !mine.visited.has(f.id) && theirs.visited.has(f.id));
  const you = both.length + onlyYou.length;
  const them = both.length + onlyThem.length;
  const verdict =
    you === them
      ? `It is a tie: ${you} each.`
      : you > them
        ? `You are ahead by ${you - them}.`
        : `${friendName} is ahead by ${them - you}.`;
  const names = (features: typeof countable) => (features.length ? listOf(features.map((f) => f.name)) : 'None yet');

  return (
    <section class="compare" aria-labelledby="compare-title">
      <h2 id="compare-title">You and {friendName}</h2>
      <p class="compare__verdict">{verdict}</p>
      <dl class="compare__scores">
        <div>
          <dt>You</dt>
          <dd class="num">{you}</dd>
        </div>
        <div>
          <dt>{friendName}</dt>
          <dd class="num">{them}</dd>
        </div>
        <div>
          <dt>Both</dt>
          <dd class="num">{both.length}</dd>
        </div>
      </dl>
      <p class="small muted">
        Out of {countable.length} {def.unit.many}.
      </p>
      <dl class="compare__lists">
        <dt>
          <span class="legend__swatch legend__swatch--both" aria-hidden="true" />
          You have both explored
        </dt>
        <dd>{names(both)}</dd>
        <dt>
          <span class="legend__swatch legend__swatch--you" aria-hidden="true" />
          Only you
        </dt>
        <dd>{names(onlyYou)}</dd>
        <dt>
          <span class="legend__swatch legend__swatch--friend" aria-hidden="true" />
          Only {friendName} <span class="visually-hidden">({possessive(friendName)} places you have not marked)</span>
        </dt>
        <dd>{names(onlyThem)}</dd>
      </dl>
    </section>
  );
}
