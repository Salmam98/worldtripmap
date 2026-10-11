import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { track } from '../../lib/analytics';
import { computeAchievements } from '../../lib/maps/achievements';
import { mapPath } from '../../lib/maps/registry';
import { buildHash, parseHash } from '../../lib/maps/share-codec';
import { computeStats, formatCount } from '../../lib/maps/stats';
import { loadDisplayName, normalizeSelection, saveDisplayName } from '../../lib/maps/store';
import type { MapDefinition, MapGeoMeta, MapGeometry, PlaceLayer, Selection } from '../../lib/maps/types';
import { composePoster, fontsFor } from '../../lib/poster/compose';
import { loadPrintGeometry } from '../../lib/poster/data';
import {
  bleedUnits,
  canShareFile,
  exportPdf,
  exportPng,
  formatBytes,
  saveFile,
  shareFile,
  type ExportedFile,
} from '../../lib/poster/export';
import { loadFonts, type FontSet } from '../../lib/poster/fonts';
import { FORMATS, getFormat } from '../../lib/poster/formats';
import { rasterText } from '../../lib/poster/raster-text';
import { sceneToSvg } from '../../lib/poster/render-svg';
import type { Scene } from '../../lib/poster/scene';
import {
  cleanText,
  LIMITS,
  loadSettings,
  saveSettings,
  type PosterSettings,
  type Typeface,
} from '../../lib/poster/settings';
import { TEMPLATE_LIST, TEMPLATES } from '../../lib/poster/templates';
import { href } from '../../lib/site';
import { plural } from '../../lib/text';
import { SWITCHED_OFF } from '../map/frame';
import { PlaceList } from '../map/PlaceList';
import { shareSentence } from '../map/ShareDialog';
import { useMapState } from '../map/useMapState';
import { usePlaces } from '../map/usePlaces';
import '../map/mapapp.css';
import { Icon } from '../ui/Icon';
import { LoadState } from '../ui/LoadState';
import { Toast, type ToastMessage } from '../ui/Toast';
import '../ui/ui.css';
import './studio.css';

interface Props {
  def: MapDefinition;
  meta: MapGeoMeta;
  /** Display-resolution geometry, used for the live preview and screen-size files. */
  geometry: MapGeometry;
  /** The places inside each feature, when the map has them: their percentages can go on the poster. */
  places?: PlaceLayer;
  /**
   * Draws the studio as it first appears, with every control switched off. Used when the site is
   * built: the result holds the page's shape until the real studio loads, so nothing moves when
   * it does (see StudioPlaceholder.astro). Never set in the browser.
   */
  shell?: boolean;
}

type Busy = null | 'png' | 'pdf' | 'share';

const TYPEFACES: { id: Typeface; label: string }[] = [
  { id: 'template', label: 'As designed' },
  { id: 'serif', label: 'Serif' },
  { id: 'sans', label: 'Sans' },
  { id: 'script', label: 'Script' },
];

function readHandoff(def: MapDefinition): Selection | null {
  if (typeof window === 'undefined') return null;
  const shared = parseHash(def, window.location.hash);
  return shared ? normalizeSelection(def, shared.visited, shared.wishlist) : null;
}

export function PosterStudio({ def, meta, geometry, places, shell }: Props) {
  const handoff = useMemo(() => readHandoff(def), [def]);
  const state = useMapState(def, handoff);
  const { selection } = state;
  const inside = usePlaces(places).summary;

  // Saved poster settings are read before the first frame is drawn, so the studio opens as it was
  // left. With nothing saved (and while the site is being built) these are the defaults.
  const [settings, setSettings] = useState<PosterSettings>(() => {
    const saved = loadSettings(def);
    if (!saved.name) saved.name = cleanText(loadDisplayName(), LIMITS.name);
    return saved;
  });
  const [fonts, setFonts] = useState<FontSet | null>(null);
  const [fontsFailed, setFontsFailed] = useState(false);
  const [svg, setSvg] = useState('');
  const [description, setDescription] = useState('');
  const [pngSize, setPngSize] = useState<'standard' | 'large'>('standard');
  const [busy, setBusy] = useState<Busy>(null);
  const [problem, setProblem] = useState('');
  const [result, setResult] = useState<{ file: ExportedFile; url: string; shareable: boolean } | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  // The checklist under "Change places here" is only built once it is opened: on the world map it
  // is 237 rows that most visitors, who marked their places on the map, never look at.
  const [listOpened, setListOpened] = useState(false);
  const toastId = useRef(0);
  const customized = useRef(false);
  const exportRef = useRef<HTMLElement>(null);

  const notify = useCallback((text: string) => setToast({ id: ++toastId.current, text }), []);

  // Tidy the handed-over selection out of the address bar.
  useEffect(() => {
    if (window.location.hash) {
      try {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch {
        /* harmless */
      }
    }
  }, [def]);

  const update = useCallback(
    (patch: Partial<PosterSettings>) => {
      setSettings((current) => {
        const next = { ...current, ...patch };
        saveSettings(def, next);
        return next;
      });
      setResult(null);
      setProblem('');
      if (!customized.current) {
        customized.current = true;
        track('poster_customized', { map: def.id });
      }
    },
    [def],
  );

  const template = TEMPLATES[settings.template];
  const format = getFormat(settings.format);
  const stats = useMemo(() => computeStats(def, selection), [def, selection]);
  const earned = useMemo(() => computeAchievements(def, selection).filter((a) => a.earned), [def, selection]);
  const accent = template.accents.find((a) => a.id === settings.accent) ?? template.accents[0];
  const badge = earned.find((a) => a.id === settings.badge)?.id ?? '';

  // Fonts load once per face and are cached; changing template may pull in one more.
  const fontKeys = fontsFor(settings).join(',');
  useEffect(() => {
    let cancelled = false;
    setFontsFailed(false);
    loadFonts(fontsFor(settings))
      .then((set) => !cancelled && setFonts(set))
      .catch(() => !cancelled && setFontsFailed(true));
    return () => {
      cancelled = true;
    };
  }, [fontKeys]);

  // Redraw the preview shortly after the last change, so typing stays smooth.
  useEffect(() => {
    if (!fonts || !state.ready) return;
    const needed = fontsFor(settings);
    if (needed.some((key) => !fonts.has(key))) return;
    let handover = 0;
    const timer = window.setTimeout(() => {
      try {
        const scene = composePoster({ def, meta, geometry, selection, settings, format, places: inside }, fonts, rasterText);
        const markup = sceneToSvg(scene, { idPrefix: 'preview' });
        // Working the poster out and putting it on the page are two separate turns, so a tap or a
        // keystroke that arrives in between is dealt with straight away.
        handover = window.setTimeout(() => {
          setSvg(markup);
          setDescription(scene.description);
        }, 0);
      } catch {
        setProblem('The preview could not be drawn. Try a different template or shorter text.');
      }
    }, 70);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(handover);
    };
  }, [fonts, state.ready, settings, selection, def, meta, geometry, format, inside]);

  // ---------------------------------------------------------------- export

  const build = async (lod: 'display' | 'print', bleed: number): Promise<Scene> => {
    const [geo, set] = await Promise.all([
      lod === 'print' ? loadPrintGeometry(geometry) : Promise.resolve(geometry),
      loadFonts(fontsFor(settings)),
    ]);
    return composePoster({ def, meta, geometry: geo, selection, settings, format, bleed, places: inside }, set, rasterText);
  };

  const deliver = (file: ExportedFile, save: boolean) => {
    if (result) URL.revokeObjectURL(result.url);
    const url = save ? saveFile(file) : URL.createObjectURL(file.blob);
    setResult({ file, url, shareable: file.blob.type === 'image/png' && canShareFile(file) });
  };

  const run = async (kind: Exclude<Busy, null>, work: () => Promise<void>) => {
    if (busy) return;
    setBusy(kind);
    setProblem('');
    try {
      await work();
    } catch (error) {
      setProblem(error instanceof Error && error.message ? error.message : 'The file could not be created. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const downloadPng = () =>
    run('png', async () => {
      const size = format.png.find((s) => s.id === pngSize) ?? format.png[0];
      const scene = await build(size.width > 2200 ? 'print' : 'display', 0);
      const file = await exportPng(scene, def, settings, size);
      deliver(file, true);
      track('png_downloaded', { map: def.id, template: settings.template, format: format.id, size: size.id });
      notify(`Saved ${file.filename}`);
    });

  const downloadPdf = () =>
    run('pdf', async () => {
      if (!format.pdf) return;
      const bleed = settings.bleed && format.group === 'print';
      const scene = await build('print', bleed ? bleedUnits(format, format.pdf) : 0);
      const file = await exportPdf(scene, def, settings, format.pdf, bleed);
      deliver(file, true);
      track('pdf_downloaded', { map: def.id, template: settings.template, format: format.id });
      notify(`Saved ${file.filename}`);
    });

  const shareUrl = () =>
    new URL(href(mapPath(def)), window.location.href).href.split('#')[0] +
    buildHash(def, { visited: selection.visited, name: settings.name });

  const shareImage = () =>
    run('share', async () => {
      const scene = await build('display', 0);
      const file = await exportPng(scene, def, settings, format.png[0]);
      track('share_initiated', { map: def.id, kind: 'poster', method: canShareFile(file) ? 'web-share-image' : 'download' });
      if (canShareFile(file)) {
        deliver(file, false);
        await shareFile(file, shareSentence(def, stats, 'share'), shareUrl());
      } else {
        deliver(file, true);
        notify('This browser cannot share files directly, so the image was saved instead.');
      }
    });

  const copyLink = async () => {
    track('share_initiated', { map: def.id, kind: 'poster', method: 'copy-link' });
    try {
      await navigator.clipboard.writeText(shareUrl());
      notify('Link to your map copied.');
    } catch {
      setProblem('The link could not be copied. Use Share on the map page instead.');
    }
  };

  // ---------------------------------------------------------------- render

  const text = (key: 'title' | 'subtitle' | 'name' | 'dates' | 'caption') => (event: Event) => {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    update({ [key]: [...value].slice(0, LIMITS[key]).join('') } as Partial<PosterSettings>);
    if (key === 'name') saveDisplayName(cleanText(value, LIMITS.name));
  };
  const toggle = (key: 'showLabels' | 'showList' | 'showWishlist' | 'showBrand' | 'showPlaces' | 'shadePlaces' | 'bleed') => (event: Event) =>
    update({ [key]: (event.target as HTMLInputElement).checked } as Partial<PosterSettings>);

  const size = format.png.find((s) => s.id === pngSize) ?? format.png[0];
  const labelsApply = def.level !== 'country';
  const loading = !svg && !fontsFailed;

  return (
    <div
      class={`studio ${shell ? 'studio--shell' : ''}`}
      // Tests and scripts look for these on the live studio only.
      data-map={shell ? undefined : def.id}
      data-ready={shell ? undefined : svg ? 'true' : 'false'}
    >
      <div class="studio__stage">
        <div class="studio__wall">
          <div
            class={`studio__poster ${loading ? 'is-loading' : ''}`}
            style={{ aspectRatio: `${format.width} / ${format.height}`, '--poster-ratio': String(format.width / format.height) }}
            role="img"
            aria-label={description || 'Poster preview'}
            dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
          />
          {loading && (
            <p class="studio__status">
              {shell ? (
                <LoadState
                  wait="Drawing your poster…"
                  nojs="The poster studio needs JavaScript. Turn it on in your browser to design and download a poster."
                  what="The poster studio"
                />
              ) : (
                'Drawing your poster…'
              )}
            </p>
          )}
          {fontsFailed && (
            <p class="studio__status studio__status--error">
              The poster fonts did not load. Check your connection and{' '}
              <button type="button" class="text-link" onClick={() => window.location.reload()}>
                reload the page
              </button>
              .
            </p>
          )}
        </div>
        <p class="studio__meta">
          Preview of <strong>{template.name}</strong> as <strong>{format.name.toLowerCase()}</strong>. What you see is what downloads.
        </p>
      </div>

      <div class="studio__panel" {...(shell ? SWITCHED_OFF : null)}>
        <section class="studio__section" aria-labelledby="st-design">
          <h2 id="st-design">Design</h2>
          <fieldset class="studio__fieldset">
            <legend>Template</legend>
            <div class="template-grid">
              {TEMPLATE_LIST.map((t) => {
                const look = t.look({ ...settings, template: t.id, accent: 'default', typeface: 'template' });
                return (
                  <label class="template-card" key={t.id}>
                    <input
                      type="radio"
                      name="template"
                      value={t.id}
                      checked={settings.template === t.id}
                      onChange={() => update({ template: t.id, accent: 'default' })}
                    />
                    <span class="template-card__body">
                      <svg class="template-card__swatch" viewBox="0 0 48 60" aria-hidden="true">
                        <rect width="48" height="60" fill={look.paper} />
                        <rect x={look.align === 'center' ? 12 : 6} y="8" width="24" height="3.5" rx="1" fill={look.ink} />
                        <path d="M9 31c2-8 9-12 16-11s13 4 14 11-5 12-13 13-18-4-17-13z" fill={look.land} stroke={look.coast} stroke-width="0.6" />
                        <path d="M9 31c2-8 9-12 16-11l-2 23c-8 0-15-5-14-12z" fill={look.accent} />
                        <rect x={look.align === 'center' ? 16 : 6} y="50" width="16" height="2.5" rx="1" fill={look.inkSoft} />
                      </svg>
                      <span class="template-card__name">{t.name}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <p class="field__hint">{template.blurb}</p>
          </fieldset>

          <fieldset class="studio__fieldset">
            <legend>Colour for explored places</legend>
            <div class="swatches">
              {template.accents.map((a) => (
                <label class="swatch" key={a.id} title={a.name}>
                  <input type="radio" name="accent" value={a.id} checked={accent.id === a.id} onChange={() => update({ accent: a.id })} />
                  <span class="swatch__dot" style={{ background: a.hex }} />
                  <span class="visually-hidden">{a.name}</span>
                </label>
              ))}
              <span class="swatches__name">{accent.name}</span>
            </div>
          </fieldset>

          <fieldset class="studio__fieldset">
            <legend>Title lettering</legend>
            <div class="segmented segmented--wide" role="presentation">
              {TYPEFACES.map((t) => (
                <label class="segmented__option" key={t.id}>
                  <input type="radio" name="typeface" value={t.id} checked={settings.typeface === t.id} onChange={() => update({ typeface: t.id })} />
                  <span>{t.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </section>

        <section class="studio__section" aria-labelledby="st-words">
          <h2 id="st-words">Words</h2>
          <label class="field">
            <span class="field__label">Title</span>
            <input class="input" type="text" value={settings.title} maxLength={LIMITS.title} onInput={text('title')} />
          </label>
          <div class="chips" role="group" aria-label="Title ideas">
            {def.posterTitles.map((title) => (
              <button type="button" class={`chip ${settings.title === title ? 'is-on' : ''}`} key={title} onClick={() => update({ title })}>
                {title}
              </button>
            ))}
          </div>
          <label class="field">
            <span class="field__label">Subtitle (optional)</span>
            <input class="input" type="text" value={settings.subtitle} maxLength={LIMITS.subtitle} onInput={text('subtitle')} />
          </label>
          <div class="studio__pair">
            <label class="field">
              <span class="field__label">Name or nickname (optional)</span>
              <input class="input" type="text" value={settings.name} maxLength={LIMITS.name} autocomplete="nickname" onInput={text('name')} />
            </label>
            <label class="field">
              <span class="field__label">Dates (optional)</span>
              <input class="input" type="text" value={settings.dates} maxLength={LIMITS.dates} placeholder="2015–2026" onInput={text('dates')} />
            </label>
          </div>
          <label class="field">
            <span class="field__label">Caption (optional)</span>
            <textarea class="textarea" rows={2} value={settings.caption} maxLength={LIMITS.caption} onInput={text('caption')} />
            <span class="field__hint">
              A line or two in your own words. {LIMITS.caption - [...settings.caption].length} characters left.
            </span>
          </label>
        </section>

        <section class="studio__section" aria-labelledby="st-details">
          <h2 id="st-details">On the poster</h2>
          <div class="checks">
            {labelsApply && (
              <label class="check">
                <input type="checkbox" checked={settings.showLabels} onChange={toggle('showLabels')} />
                <span>{def.level === 'city' ? 'Names beside explored cities' : 'Labels on the map'}</span>
              </label>
            )}
            <label class="check">
              <input type="checkbox" checked={settings.showList} onChange={toggle('showList')} />
              <span>List of {def.unit.many}</span>
            </label>
            <label class="check">
              <input type="checkbox" checked={settings.showWishlist} onChange={toggle('showWishlist')} />
              <span>
                Bucket-list places{stats.wishlist ? ` (${stats.wishlist})` : ''}
              </span>
            </label>
            {inside && (
              <label class="check">
                <input type="checkbox" checked={settings.showPlaces} onChange={toggle('showPlaces')} />
                <span>
                  Percentages from places{inside.visited ? ` (${inside.percentLabel} of ${def.place})` : ''}
                  <small>
                    {inside.visited
                      ? `Leads with how much of ${def.place} you have seen and adds each ${def.unit.one}’s share beside its name, from the ${inside.visited} ${plural(inside.visited, 'place', 'places')} you ticked.`
                      : `Appear once you tick places inside a ${def.unit.one} on the map.`}
                  </small>
                </span>
              </label>
            )}
            {inside && (
              <label class="check">
                <input
                  type="checkbox"
                  checked={settings.shadePlaces}
                  onChange={toggle('shadePlaces')}
                  disabled={!settings.showPlaces || inside.visited === 0}
                />
                <span>
                  Colour by percentage
                  <small>
                    {inside.visited === 0
                      ? 'Needs places ticked on the map.'
                      : !settings.showPlaces
                        ? 'Needs the percentages switched on.'
                        : `A stronger colour for a ${def.unit.one} with a higher percentage, a lighter one for a lower.`}
                  </small>
                </span>
              </label>
            )}
            <label class="check">
              <input type="checkbox" checked={settings.showBrand} onChange={toggle('showBrand')} />
              <span>Small worldtripmap.com mark</span>
            </label>
          </div>

          <fieldset class="studio__fieldset">
            <legend>Achievement seal</legend>
            {earned.length === 0 ? (
              <p class="field__hint">Seals appear here as you earn them. Mark your first {def.unit.one} to earn one.</p>
            ) : (
              <div class="chips">
                <label class={`chip chip--radio ${badge === '' ? 'is-on' : ''}`}>
                  <input type="radio" name="badge" checked={badge === ''} onChange={() => update({ badge: '' })} />
                  None
                </label>
                {earned.map((a) => (
                  <label class={`chip chip--radio ${badge === a.id ? 'is-on' : ''}`} key={a.id} title={a.rule}>
                    <input type="radio" name="badge" checked={badge === a.id} onChange={() => update({ badge: a.id })} />
                    {a.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        </section>

        <section class="studio__section" aria-labelledby="st-places">
          <h2 id="st-places">Places</h2>
          <p class="studio__places">
            <strong class="num">
              {stats.visited} of {stats.total}
            </strong>{' '}
            {plural(stats.total, def.unit.one, def.unit.many)} explored.{' '}
            <a class="text-link" href={href(mapPath(def))}>
              Mark places on the map
            </a>
          </p>
          {inside && (
            <p class="studio__inside">
              <strong class="num">
                {inside.visited} of {inside.total}
              </strong>{' '}
              places ticked inside them. Choose them on the map page, in the list beside the map.
            </p>
          )}
          {stats.visited === 0 && (
            <p class="notice notice--warn">
              Nothing is marked yet, so the poster shows an empty map. Tick places below or mark them on the map.
            </p>
          )}
          <details
            class="studio__list"
            onToggle={(event) => {
              if ((event.currentTarget as HTMLDetailsElement).open) setListOpened(true);
            }}
          >
            {/* The click arrives before the list opens, so the list is in place by the time it does. */}
            <summary onClick={() => setListOpened(true)}>
              <Icon name="chevron" size={18} />
              Change places here
            </summary>
            {listOpened && (
              <PlaceList
                def={def}
                selection={selection}
                onSet={state.setPlace}
                onSetMany={state.setMany}
                onHover={() => {}}
                expanded={def.features.length <= 20}
              />
            )}
          </details>
        </section>

        <section class="studio__section studio__export" aria-labelledby="st-export" ref={exportRef}>
          <h2 id="st-export">Size and download</h2>
          <fieldset class="studio__fieldset">
            <legend>Shape</legend>
            <div class="format-list">
              {(['share', 'print'] as const).map((group) => (
                <div class="format-list__group" key={group}>
                  <p class="format-list__title">{group === 'share' ? 'For sharing' : 'For printing'}</p>
                  {FORMATS.filter((f) => f.group === group).map((f) => (
                    <label class="format" key={f.id}>
                      <input type="radio" name="format" value={f.id} checked={format.id === f.id} onChange={() => update({ format: f.id })} />
                      <span class="format__shape" aria-hidden="true">
                        <i style={{ aspectRatio: `${f.width} / ${f.height}`, [f.width > f.height ? 'width' : 'height']: '100%' }} />
                      </span>
                      <span class="format__text">
                        <strong>{f.name}</strong>
                        <span>{f.detail}</span>
                      </span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset class="studio__fieldset">
            <legend>Image size</legend>
            <div class="checks">
              {format.png.map((s) => (
                <label class="check" key={s.id}>
                  <input type="radio" name="png-size" checked={pngSize === s.id} onChange={() => setPngSize(s.id)} />
                  <span>
                    <strong class="num">
                      {formatCount(s.width)} × {formatCount(s.height)} px
                    </strong>
                    <small>{s.note}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div class="studio__buttons">
            <button type="button" class="btn btn--forest" onClick={downloadPng} disabled={busy !== null || !svg} data-testid="download-png">
              <Icon name="image" size={18} />
              {busy === 'png' ? 'Drawing…' : 'Download PNG'}
            </button>
            {format.pdf ? (
              <button type="button" class="btn" onClick={downloadPdf} disabled={busy !== null || !svg} data-testid="download-pdf">
                <Icon name="file" size={18} />
                {busy === 'pdf' ? 'Preparing…' : `Download PDF, ${format.pdf.name}`}
              </button>
            ) : (
              <p class="field__hint studio__nopdf">PDF is offered for the post and print shapes.</p>
            )}
          </div>
          {format.pdf && (
            <p class="field__hint">
              {format.pdf.note}. Lines and lettering are vector outlines, in sRGB colour.
            </p>
          )}
          {format.pdf && format.group === 'print' && (
            <label class="check">
              <input type="checkbox" checked={settings.bleed} onChange={toggle('bleed')} />
              <span>
                Add 3 mm bleed to the PDF
                <small>For print shops that trim the sheet. Leave off for home printing.</small>
              </span>
            </label>
          )}

          <div class="studio__buttons studio__buttons--share">
            <button type="button" class="btn btn--quiet" onClick={shareImage} disabled={busy !== null || !svg} data-testid="share-image">
              <Icon name="share" size={18} />
              {busy === 'share' ? 'Preparing…' : 'Share image'}
            </button>
            <button type="button" class="btn btn--quiet" onClick={copyLink}>
              <Icon name="link" size={18} />
              Copy link to my map
            </button>
          </div>

          {problem && (
            <p class="notice notice--error" role="alert">
              {problem}
            </p>
          )}

          {result && (
            <div class="studio__result" role="status">
              {result.file.blob.type === 'image/png' ? (
                <img src={result.url} alt="The image you just made" width="96" height="120" />
              ) : (
                <span class="studio__result-icon">
                  <Icon name="file" size={28} />
                </span>
              )}
              <div>
                <p>
                  <strong>{result.file.filename}</strong>
                </p>
                <p class="small muted">
                  {result.file.detail}, {formatBytes(result.file.blob.size)}
                </p>
                <p class="studio__result-links">
                  <a class="text-link" href={result.url} download={result.file.filename}>
                    Save again
                  </a>
                  <a class="text-link" href={result.url} target="_blank" rel="noopener">
                    Open
                  </a>
                </p>
                <p class="field__hint">If nothing downloaded, choose Open, then press and hold the image to save it.</p>
              </div>
            </div>
          )}
        </section>
      </div>

      <div class="studio__bar" {...(shell ? SWITCHED_OFF : null)}>
        <span class="studio__bar-text">
          <strong>{template.name}</strong>
          <span>
            {format.name}, {formatCount(size.width)} px
          </span>
        </span>
        <button type="button" class="btn btn--forest btn--sm" onClick={downloadPng} disabled={busy !== null || !svg}>
          <Icon name="download" size={16} />
          {busy === 'png' ? 'Drawing…' : 'PNG'}
        </button>
        <button
          type="button"
          class="btn btn--quiet btn--sm"
          onClick={() =>
            exportRef.current?.scrollIntoView({
              behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
              block: 'start',
            })
          }
        >
          All sizes
        </button>
      </div>

      {!shell && (
        <>
          <Toast toast={toast} onDismiss={() => setToast(null)} />
          <p class="visually-hidden" role="status">
            {busy ? 'Creating your file.' : ''}
          </p>
        </>
      )}
    </div>
  );
}
