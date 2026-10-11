import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { nextInDirection, type Direction } from '../../lib/maps/spatial';
import type { FeatureDef, MapDefinition, MapGeoMeta, MapGeometry } from '../../lib/maps/types';
import { ZoomBar } from './frame';
import type { Tone } from './tones';

/** How a place is painted. The first three are a visitor's own map; the rest compare two maps. */
export type Fill = 'none' | 'visited' | 'wishlist' | 'you' | 'friend' | 'both';

interface Props {
  def: MapDefinition;
  meta: MapGeoMeta;
  geometry: MapGeometry;
  fillOf: (id: string) => Fill;
  /**
   * A tone of its own for a visited place, when places are coloured by how much of each has been
   * seen. Return nothing and the place gets the one colour every visited place has.
   */
  toneOf?: (id: string) => Tone | null | undefined;
  /** Words for a place's current state, e.g. "Explored". Used by the tooltip and screen readers. */
  describe: (id: string) => string;
  /** Called when a place is tapped, clicked or activated from the keyboard. Omit for a read-only map. */
  onActivate?: (id: string) => string | void;
  /** A place to outline because it is hovered or focused elsewhere on the page (the list). */
  hotId?: string | null;
  label: string;
  maxZoom?: number;
  /** Area features smaller than this (map units) get a tap marker when they are small on screen. */
  markerBelow?: number;
}

const MARKER_PX = 3.6;
const POINT_PX = 5.5;
const LABEL_PX = 11;
const TAP_SLOP = 6;

interface View {
  zoom: number;
  cx: number;
  cy: number;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function MapCanvas({
  def,
  meta,
  geometry,
  fillOf,
  toneOf,
  describe,
  onActivate,
  hotId,
  label,
  maxZoom = 8,
  markerBelow = 40,
}: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const W = meta.width;
  const H = meta.height;
  const interactive = Boolean(onActivate);

  const areas = useMemo(() => def.features.filter((f) => geometry.shapes[f.id]), [def, geometry]);
  const points = useMemo(() => def.features.filter((f) => geometry.points?.[f.id]), [def, geometry]);
  const all = useMemo(() => [...areas, ...points], [areas, points]);
  const byId = useMemo(() => new Map(all.map((f) => [f.id, f])), [all]);
  /** Features that may show a tap marker: every point, plus areas that are small on the map. */
  const marked = useMemo(
    () => [...areas.filter((f) => (meta.features[f.id]?.size ?? Infinity) < markerBelow), ...points],
    [areas, points, meta, markerBelow],
  );
  const isPoint = useCallback((id: string) => Boolean(geometry.points?.[id]), [geometry]);
  const countableIds = useMemo(() => new Set(def.features.filter((f) => f.countable).map((f) => f.id)), [def]);
  const coarse = useMemo(
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)').matches),
    [],
  );
  /**
   * A small place gets a tap marker when its shape is too small to hit at the current zoom
   * (under 14 px for fingers, 7 px for a mouse). Two things keep the first view readable:
   * territories that do not count toward the total wait until the map is zoomed in, and on
   * phones so do places that would be smaller than a pixel.
   */
  const markerVisible = useCallback(
    (id: string, ppu: number, zoom: number): boolean => {
      if (geometry.points?.[id]) return true;
      const px = (meta.features[id]?.size ?? Infinity) * ppu;
      if (px >= (coarse ? 14 : 7)) return false;
      if (!countableIds.has(id) && zoom < 2) return false;
      if (coarse && px < 0.5 && zoom < 3) return false;
      return true;
    },
    [geometry, meta, coarse, countableIds],
  );
  /** All land as one path, drawn under the shapes with a heavier line to give every coast an outline. */
  const coast = useMemo(
    () => [geometry.base ?? '', ...Object.values(geometry.baseShapes ?? {}), ...Object.values(geometry.shapes)].join(''),
    [geometry],
  );
  const anchor = useCallback(
    (id: string): [number, number] => geometry.points?.[id] ?? meta.features[id]?.label ?? [W / 2, H / 2],
    [geometry, meta, W, H],
  );

  const container = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const markerLayer = useRef<SVGGElement>(null);
  const labelLayer = useRef<SVGGElement>(null);
  const view = useRef<View>({ zoom: 1, cx: W / 2, cy: H / 2 });
  const pxPerUnit = useRef(0.1);
  /** Width of the map on screen in CSS pixels, as last reported by the resize observer. */
  const boxWidth = useRef(0);
  const frame = useRef(0);
  const animation = useRef(0);
  const suppressClick = useRef(false);
  const pointerType = useRef('mouse');
  const keyboard = useRef(false);
  const tipTimer = useRef(0);

  const [zoomLevel, setZoomLevel] = useState(1);
  const [focusId, setFocusIdState] = useState<string>(() => all[0]?.id ?? '');
  // The same id in a ref, so two arrow keys pressed within one frame both move on from the right place.
  const focusRef = useRef(focusId);
  const setFocusId = useCallback((id: string) => {
    focusRef.current = id;
    setFocusIdState(id);
  }, []);
  const [focusShown, setFocusShown] = useState(false);

  // ------------------------------------------------------------------ view

  const clamp = useCallback(
    (v: View): View => {
      const zoom = Math.min(maxZoom, Math.max(1, v.zoom));
      const w = W / zoom;
      const h = H / zoom;
      return {
        zoom,
        cx: Math.min(W - w / 2, Math.max(w / 2, v.cx)),
        cy: Math.min(H - h / 2, Math.max(h / 2, v.cy)),
      };
    },
    [W, H, maxZoom],
  );

  /** Writes the current view to the DOM. Markers and labels keep a constant size on screen. */
  const paint = useCallback(() => {
    const el = svg.current;
    if (!el) return;
    const v = (view.current = clamp(view.current));
    const w = W / v.zoom;
    const h = H / v.zoom;
    el.setAttribute('viewBox', `${(v.cx - w / 2).toFixed(2)} ${(v.cy - h / 2).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`);
    // Asking the element for its width makes the browser stop and lay the page out, so the size
    // the resize observer last reported is used whenever there is one.
    const width = boxWidth.current || el.clientWidth || el.getBoundingClientRect().width || 1;
    const ppu = (pxPerUnit.current = width / w);

    markerLayer.current?.querySelectorAll<SVGCircleElement>('circle').forEach((circle) => {
      const id = circle.getAttribute('data-id') ?? circle.getAttribute('data-for') ?? '';
      const point = circle.hasAttribute('data-point');
      circle.style.display = markerVisible(id, ppu, v.zoom) ? '' : 'none';
      circle.setAttribute('r', String(((point ? POINT_PX : MARKER_PX) / ppu).toFixed(3)));
    });
    // Hatch patterns are defined in map units; rescale them so the lines stay about 7 px apart.
    el.querySelectorAll('pattern').forEach((pattern, i) => {
      pattern.setAttribute('patternTransform', `rotate(${i === 0 ? 45 : -45}) scale(${(7 / 6 / ppu).toFixed(3)})`);
    });
    const labels = labelLayer.current;
    if (labels) {
      labels.setAttribute('font-size', (LABEL_PX / ppu).toFixed(2));
      labels.querySelectorAll<SVGTextElement>('text').forEach((text) => {
        const size = meta.features[text.getAttribute('data-for') ?? '']?.size ?? 0;
        text.style.display = size * ppu > 30 ? '' : 'none';
      });
    }
    if (container.current) container.current.style.touchAction = v.zoom > 1.01 ? 'none' : 'pan-y';
  }, [W, H, clamp, meta, markerVisible]);

  const schedule = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(paint);
  }, [paint]);

  const settle = useCallback(() => setZoomLevel(Number(view.current.zoom.toFixed(3))), []);

  const moveTo = useCallback(
    (target: View, animate = true) => {
      cancelAnimationFrame(animation.current);
      const to = clamp(target);
      if (!animate || prefersReducedMotion()) {
        view.current = to;
        paint();
        settle();
        return;
      }
      const from = { ...view.current };
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / 220);
        const e = 1 - Math.pow(1 - t, 3);
        view.current = {
          zoom: from.zoom + (to.zoom - from.zoom) * e,
          cx: from.cx + (to.cx - from.cx) * e,
          cy: from.cy + (to.cy - from.cy) * e,
        };
        paint();
        if (t < 1) animation.current = requestAnimationFrame(step);
        else settle();
      };
      animation.current = requestAnimationFrame(step);
    },
    [clamp, paint, settle],
  );

  const toUnits = useCallback(
    (clientX: number, clientY: number): [number, number] => {
      const rect = svg.current!.getBoundingClientRect();
      const v = view.current;
      const w = W / v.zoom;
      const h = H / v.zoom;
      return [
        v.cx - w / 2 + ((clientX - rect.left) / rect.width) * w,
        v.cy - h / 2 + ((clientY - rect.top) / rect.height) * h,
      ];
    },
    [W, H],
  );

  const zoomAt = useCallback(
    (clientX: number, clientY: number, zoom: number, animate: boolean) => {
      const rect = svg.current!.getBoundingClientRect();
      const [ux, uy] = toUnits(clientX, clientY);
      const z = Math.min(maxZoom, Math.max(1, zoom));
      const w = W / z;
      const h = H / z;
      const fx = (clientX - rect.left) / rect.width;
      const fy = (clientY - rect.top) / rect.height;
      moveTo({ zoom: z, cx: ux - fx * w + w / 2, cy: uy - fy * h + h / 2 }, animate);
    },
    [W, H, maxZoom, moveTo, toUnits],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const v = view.current;
      moveTo({ ...v, zoom: v.zoom * factor });
    },
    [moveTo],
  );

  const resetView = useCallback(() => moveTo({ zoom: 1, cx: W / 2, cy: H / 2 }), [moveTo, W, H]);

  useLayoutEffect(() => {
    const el = svg.current;
    if (!el) return;
    if (typeof ResizeObserver === 'undefined') {
      paint();
      return;
    }
    // The observer reports the map's size once the browser has laid the page out (before the
    // first frame is shown) and again whenever it changes. Markers and labels are sized then.
    const observer = new ResizeObserver((entries) => {
      boxWidth.current = entries[entries.length - 1].contentRect.width;
      paint();
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      boxWidth.current = 0;
    };
  }, [paint, geometry]);

  // Ctrl/⌘ + wheel (and trackpad pinch) zooms; a plain wheel scrolls the page as usual.
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoomAt(event.clientX, event.clientY, view.current.zoom * Math.exp(-event.deltaY * 0.012), false);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // Know whether the last interaction was the keyboard, to decide when to draw the focus ring.
  useEffect(() => {
    const onKey = () => (keyboard.current = true);
    const onPointer = () => (keyboard.current = false);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }, []);

  // ------------------------------------------------------------ hit testing

  const featureAt = useCallback(
    (clientX: number, clientY: number, target: EventTarget | null, radiusPx: number): string | null => {
      const [ux, uy] = toUnits(clientX, clientY);
      const ppu = pxPerUnit.current;
      let best: string | null = null;
      let bestDistance = radiusPx;
      for (const feature of marked) {
        if (!markerVisible(feature.id, ppu, view.current.zoom)) continue;
        const [x, y] = anchor(feature.id);
        const distance = Math.hypot(x - ux, y - uy) * ppu;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = feature.id;
        }
      }
      if (best) return best;
      const el = target instanceof Element ? target.closest('[data-id]') : null;
      return el?.getAttribute('data-id') ?? null;
    },
    [toUnits, marked, markerVisible, anchor],
  );

  // ---------------------------------------------------------------- tooltip

  const showTip = useCallback(
    (id: string, clientX: number, clientY: number, text?: string) => {
      const tip = tooltip.current;
      const box = container.current;
      const feature = byId.get(id);
      if (!tip || !box || !feature) return;
      tip.replaceChildren();
      const strong = document.createElement('strong');
      strong.textContent = feature.name;
      const span = document.createElement('span');
      span.textContent = text ?? describe(id);
      tip.append(strong, span);
      tip.hidden = false;
      const rect = box.getBoundingClientRect();
      const tw = tip.offsetWidth;
      const th = tip.offsetHeight;
      let x = clientX - rect.left + 14;
      let y = clientY - rect.top + 18;
      if (x + tw > rect.width - 6) x = clientX - rect.left - tw - 12;
      if (y + th > rect.height - 6) y = clientY - rect.top - th - 12;
      tip.style.transform = `translate(${Math.max(6, x)}px, ${Math.max(6, y)}px)`;
    },
    [byId, describe],
  );

  const hideTip = useCallback(() => {
    if (tooltip.current) tooltip.current.hidden = true;
  }, []);

  // --------------------------------------------------------------- pointers

  const gesture = useRef<{
    pointers: Map<number, { x: number; y: number }>;
    startX: number;
    startY: number;
    startView: View;
    moved: boolean;
    pinch: { distance: number; zoom: number; ux: number; uy: number } | null;
  }>({ pointers: new Map(), startX: 0, startY: 0, startView: view.current, moved: false, pinch: null });

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    cancelAnimationFrame(animation.current);
    const g = gesture.current;
    pointerType.current = event.pointerType;
    g.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (g.pointers.size === 1) {
      suppressClick.current = false;
      g.startX = event.clientX;
      g.startY = event.clientY;
      g.startView = { ...view.current };
      g.moved = false;
      g.pinch = null;
    } else if (g.pointers.size === 2) {
      const [a, b] = [...g.pointers.values()];
      const [ux, uy] = toUnits((a.x + b.x) / 2, (a.y + b.y) / 2);
      g.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: view.current.zoom, ux, uy };
      suppressClick.current = true;
      hideTip();
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    const g = gesture.current;
    const tracked = g.pointers.get(event.pointerId);
    if (!tracked) {
      if (event.pointerType === 'mouse') {
        const id = featureAt(event.clientX, event.clientY, event.target, 8);
        if (id) showTip(id, event.clientX, event.clientY);
        else hideTip();
        container.current?.classList.toggle('is-over-place', Boolean(id) && interactive);
      }
      return;
    }
    tracked.x = event.clientX;
    tracked.y = event.clientY;

    if (g.pinch && g.pointers.size >= 2) {
      const [a, b] = [...g.pointers.values()];
      const rect = svg.current!.getBoundingClientRect();
      const zoom = Math.min(maxZoom, Math.max(1, (g.pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / g.pinch.distance));
      const w = W / zoom;
      const h = H / zoom;
      const fx = ((a.x + b.x) / 2 - rect.left) / rect.width;
      const fy = ((a.y + b.y) / 2 - rect.top) / rect.height;
      view.current = { zoom, cx: g.pinch.ux - fx * w + w / 2, cy: g.pinch.uy - fy * h + h / 2 };
      schedule();
      return;
    }

    const dx = event.clientX - g.startX;
    const dy = event.clientY - g.startY;
    if (!g.moved && Math.hypot(dx, dy) > TAP_SLOP) {
      g.moved = true;
      if (view.current.zoom > 1.01) {
        suppressClick.current = true;
        hideTip();
        try {
          svg.current?.setPointerCapture(event.pointerId);
        } catch {
          /* the pointer is already gone */
        }
        container.current?.classList.add('is-panning');
      }
    }
    if (g.moved && view.current.zoom > 1.01) {
      const ppu = pxPerUnit.current;
      view.current = { ...g.startView, zoom: view.current.zoom, cx: g.startView.cx - dx / ppu, cy: g.startView.cy - dy / ppu };
      schedule();
    }
  };

  const onPointerEnd = (event: PointerEvent) => {
    const g = gesture.current;
    if (!g.pointers.delete(event.pointerId)) return;
    if (g.pointers.size === 1) {
      // One finger lifted after a pinch: carry on as a pan from where the other finger is.
      const [rest] = [...g.pointers.values()];
      g.startX = rest.x;
      g.startY = rest.y;
      g.startView = { ...view.current };
      g.pinch = null;
      g.moved = true;
    }
    if (g.pointers.size === 0) {
      g.pinch = null;
      container.current?.classList.remove('is-panning');
      settle();
    }
  };

  // ------------------------------------------------------------- activation

  const activate = useCallback(
    (id: string, clientX?: number, clientY?: number) => {
      if (!onActivate) return;
      const message = onActivate(id);
      if (typeof message === 'string' && clientX !== undefined && clientY !== undefined && pointerType.current !== 'mouse') {
        // Touch has no hover, so confirm the tap right where it happened.
        showTip(id, clientX, clientY - 44, message);
        window.clearTimeout(tipTimer.current);
        tipTimer.current = window.setTimeout(hideTip, 1500);
      } else if (clientX !== undefined && clientY !== undefined && typeof message === 'string') {
        showTip(id, clientX, clientY, message);
      }
    },
    [onActivate, showTip, hideTip],
  );

  const onClick = (event: MouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    // detail === 0 means the click came from assistive technology or the keyboard: trust the target.
    const synthetic = event.detail === 0;
    const id = synthetic
      ? ((event.target as Element | null)?.closest?.('[data-id]')?.getAttribute('data-id') ?? null)
      : featureAt(event.clientX, event.clientY, event.target, pointerType.current === 'mouse' ? 8 : 15);
    if (!id) return;
    setFocusId(id);
    if (synthetic) activate(id);
    else activate(id, event.clientX, event.clientY);
  };

  // --------------------------------------------------------------- keyboard

  const focusFeature = useCallback(
    (id: string) => {
      setFocusId(id);
      setFocusShown(true);
      const [x, y] = anchor(id);
      const v = view.current;
      const w = W / v.zoom;
      const h = H / v.zoom;
      if (v.zoom > 1.01 && (Math.abs(x - v.cx) > w * 0.42 || Math.abs(y - v.cy) > h * 0.42)) {
        moveTo({ ...v, cx: x, cy: y });
      }
      // Every place carries a tabindex, so focus can move at once, before the next render.
      svg.current?.querySelector<SVGElement>(`[data-id="${CSS.escape(id)}"][tabindex]`)?.focus({ preventScroll: true });
    },
    [anchor, moveTo, W, H, setFocusId],
  );

  /** Label points of every place, for arrow-key navigation. */
  const anchors = useMemo(() => all.map((feature) => [feature.id, anchor(feature.id)] as const), [all, anchor]);

  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as Element | null;
    const id = target?.getAttribute?.('data-id') ?? focusRef.current;
    const arrows: Record<string, Direction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    if (arrows[event.key]) {
      event.preventDefault();
      const next = nextInDirection(anchors, anchor(id), id, arrows[event.key]);
      if (next) focusFeature(next);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      if (byId.has(id)) activate(id);
      return;
    }
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomBy(1.6);
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      zoomBy(1 / 1.6);
    } else if (event.key === '0') {
      event.preventDefault();
      resetView();
    } else if (event.key === 'Home') {
      event.preventDefault();
      if (all[0]) focusFeature(all[0].id);
    }
  };

  const onFocusIn = (event: FocusEvent) => {
    const id = (event.target as Element | null)?.getAttribute?.('data-id');
    if (!id) return;
    setFocusId(id);
    setFocusShown(keyboard.current);
  };

  // If the feature list changes under us (another map), keep a valid tab stop.
  useEffect(() => {
    if (!byId.has(focusId) && all[0]) setFocusId(all[0].id);
  }, [byId, focusId, all]);

  // ------------------------------------------------------------------ render

  const a11y = (feature: FeatureDef, fill: Fill) => {
    const text = `${feature.name}: ${describe(feature.id)}`;
    return interactive
      ? {
          role: 'checkbox' as const,
          'aria-checked': fill === 'visited' ? ('true' as const) : ('false' as const),
          'aria-label': text,
          tabindex: feature.id === focusId ? 0 : -1,
        }
      : { role: 'img' as const, 'aria-label': text, tabindex: feature.id === focusId ? 0 : -1 };
  };

  const ringId = focusShown && byId.has(focusId) ? focusId : null;
  const outlineIds = [hotId && byId.has(hotId) ? hotId : null].filter(Boolean) as string[];

  return (
    // The frame is as wide as the map, so the zoom buttons can float over its corner on large
    // screens and sit in a row under it on small ones, where they would cover whole countries.
    <div class="map-frame" style={{ '--map-ratio': String(W / H) }}>
      <div
        class={`map ${interactive ? 'map--interactive' : 'map--readonly'}`}
        ref={container}
        style={{ aspectRatio: `${W} / ${H}` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') hideTip();
        }}
        // Focus and key listeners live on this wrapper, not on the <svg>: Chrome treats an SVG
        // element with focus listeners as a tab stop of its own.
        onKeyDown={onKeyDown}
        onFocusIn={onFocusIn}
        onFocusOut={() => setFocusShown(false)}
      >
        <svg
          ref={svg}
          class="map__svg"
          viewBox={`0 0 ${W} ${H}`}
          role="group"
          aria-label={label}
          aria-describedby={`${uid}-help`}
          onClick={onClick}
        >
          <defs>
            <pattern id={`${uid}-wish`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45) scale(10)">
              <rect width="6" height="6" class="map__wish-bg" />
              <rect width="2.2" height="6" class="map__wish-line" />
            </pattern>
            <pattern id={`${uid}-friend`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45) scale(10)">
              <rect width="6" height="6" class="map__friend-bg" />
              <rect width="1.6" height="6" class="map__friend-line" />
            </pattern>
          </defs>

          {geometry.outline && <path class="map__sphere" d={geometry.outline} />}
          {geometry.graticule && <path class="map__graticule" d={geometry.graticule} />}

          {/* All land drawn once underneath with a heavier, darker line. Only its outer half shows,
              which gives every coast an outline without shipping separate coastline data. */}
          <path class="map__coast" d={coast} aria-hidden="true" />

          {geometry.base && <path class="map__shape map__shape--inert" d={geometry.base} />}
          {geometry.baseShapes &&
            Object.entries(geometry.baseShapes).map(([id, d]) => (
              <path key={`base-${id}`} class="map__shape map__shape--inert" d={d} />
            ))}
          {areas.map((feature) => {
            const fill = fillOf(feature.id);
            const tone = fill === 'visited' ? toneOf?.(feature.id) : null;
            return (
              <path
                key={feature.id}
                class={`map__shape is-${fill}`}
                style={
                  fill === 'wishlist'
                    ? { fill: `url(#${uid}-wish)` }
                    : fill === 'friend'
                      ? { fill: `url(#${uid}-friend)` }
                      : tone
                        ? { '--tone': tone.fill, '--tone-hover': tone.hover }
                        : undefined
                }
                data-tone={tone ? tone.fill : undefined}
                d={geometry.shapes[feature.id]}
                data-id={feature.id}
                {...a11y(feature, fill)}
              />
            );
          })}

          {geometry.lakes && <path class="map__lake" d={geometry.lakes} />}

          <g ref={labelLayer} class="map__labels" aria-hidden="true">
            {def.level === 'region' &&
              areas.map((feature) => {
                if (!feature.short) return null;
                const fill = fillOf(feature.id);
                const tone = fill === 'visited' ? toneOf?.(feature.id) : null;
                return (
                  <text
                    key={feature.id}
                    class={`map__label is-${fill}`}
                    style={tone ? { '--tone-label': tone.label } : undefined}
                    x={meta.features[feature.id].label[0]}
                    y={meta.features[feature.id].label[1]}
                    data-for={feature.id}
                  >
                    {feature.short}
                  </text>
                );
              })}
          </g>

          <g ref={markerLayer} class="map__markers">
            {marked.map((feature) => {
              const [x, y] = anchor(feature.id);
              const fill = fillOf(feature.id);
              const tone = fill === 'visited' ? toneOf?.(feature.id) : null;
              return isPoint(feature.id) ? (
                <circle
                  key={feature.id}
                  class={`map__marker map__marker--point is-${fill}`}
                  cx={x}
                  cy={y}
                  r={60}
                  data-id={feature.id}
                  data-point=""
                  {...a11y(feature, fill)}
                />
              ) : (
                <circle
                  key={feature.id}
                  class={`map__marker is-${fill}`}
                  style={tone ? { '--tone': tone.fill } : undefined}
                  cx={x}
                  cy={y}
                  r={40}
                  data-for={feature.id}
                  aria-hidden="true"
                />
              );
            })}
          </g>

          {outlineIds.map((id) =>
            isPoint(id) ? (
              <circle key={`hot-${id}`} class="map__hot-point" cx={anchor(id)[0]} cy={anchor(id)[1]} r={(POINT_PX + 5) / pxPerUnit.current} />
            ) : (
              <path key={`hot-${id}`} class="map__hot" d={geometry.shapes[id]} aria-hidden="true" />
            ),
          )}

          {ringId &&
            (isPoint(ringId) ? (
              <circle class="map__ring-point" cx={anchor(ringId)[0]} cy={anchor(ringId)[1]} r={(POINT_PX + 5) / pxPerUnit.current} />
            ) : (
              <>
                <path class="map__ring map__ring--halo" d={geometry.shapes[ringId]} aria-hidden="true" />
                <path class="map__ring" d={geometry.shapes[ringId]} aria-hidden="true" />
                {(meta.features[ringId]?.size ?? 99) * pxPerUnit.current < 14 && (
                  <circle class="map__ring-point" cx={anchor(ringId)[0]} cy={anchor(ringId)[1]} r={(MARKER_PX + 5) / pxPerUnit.current} />
                )}
              </>
            ))}
        </svg>

        <p id={`${uid}-help`} class="visually-hidden">
          {interactive
            ? 'Use the arrow keys to move between places and press Space to mark one. Plus and minus zoom the map, and zero shows all of it.'
            : 'Use the arrow keys to move between places. Plus and minus zoom the map, and zero shows all of it.'}
        </p>

        <div class="map__tooltip" ref={tooltip} hidden aria-hidden="true" />
      </div>

      <ZoomBar
        zoomed={zoomLevel > 1.01}
        canZoomIn={zoomLevel < maxZoom - 0.01}
        onZoomIn={() => zoomBy(1.6)}
        onZoomOut={() => zoomBy(1 / 1.6)}
        onFit={resetView}
      />
    </div>
  );
}
