import type { ComponentChildren } from 'preact';
import { Icon } from '../ui/Icon';

interface BarProps {
  /** The map is zoomed in, so it can be zoomed out and dragged. */
  zoomed: boolean;
  canZoomIn: boolean;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFit?: () => void;
  /** Shown for its shape only, in the stand-in drawn when the site is built. */
  switchedOff?: boolean;
}

/**
 * Marks a part of a stand-in as present but not usable: it cannot be clicked or focused, and
 * screen readers pass over it. Spread onto the element.
 */
export const SWITCHED_OFF = { inert: true, 'aria-hidden': true } as const;

/** The zoom buttons: over the corner of the map on large screens, in a row under it on phones. */
export function ZoomBar({ zoomed, canZoomIn, onZoomIn, onZoomOut, onFit, switchedOff }: BarProps) {
  return (
    <div class="map__bar" {...(switchedOff ? SWITCHED_OFF : null)}>
      {/* A touch hint only: the instructions for keyboards and screen readers are in the map's help text. */}
      <p class="map__hint" aria-hidden="true">
        {zoomed ? 'Drag to move the map' : 'Pinch or tap + to zoom in'}
      </p>
      <div class="map__zoom" role="group" aria-label="Zoom">
        <button type="button" class="map__zoom-btn" onClick={onZoomIn} disabled={!canZoomIn} aria-label="Zoom in">
          <Icon name="plus" size={18} />
        </button>
        <button type="button" class="map__zoom-btn" onClick={onZoomOut} disabled={!zoomed} aria-label="Zoom out">
          <Icon name="minus" size={18} />
        </button>
        <button type="button" class="map__zoom-btn" onClick={onFit} disabled={!zoomed} aria-label="Show the whole map">
          <Icon name="fit" size={18} />
        </button>
      </div>
    </div>
  );
}

export interface ShellPicture {
  /** All the land as one path, at a coarse level of detail. */
  land: string;
  /** Outline of the projected globe, for the world map. */
  outline?: string;
  /** The land is a backdrop for points (cities) and is drawn in the quieter backdrop colour. */
  backdrop?: boolean;
}

/**
 * A plain picture of the map in exactly the frame the interactive map uses. It is drawn when the
 * site is built, from a fraction of the data, and holds the map's place until the real one loads.
 */
export function ShellMap({
  width,
  height,
  picture,
  children,
}: {
  width: number;
  height: number;
  picture: ShellPicture;
  /** The loading message, shown over the foot of the picture. */
  children: ComponentChildren;
}) {
  return (
    <div class="map-frame" style={{ '--map-ratio': String(width / height) }}>
      <div class="map map--readonly" style={{ aspectRatio: `${width} / ${height}` }}>
        <svg class="map__svg" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
          {picture.outline && <path class="map__sphere" d={picture.outline} />}
          <path class={`map__shell-land ${picture.backdrop ? 'map__shell-land--backdrop' : ''}`} d={picture.land} />
        </svg>
        <p class="map__status">{children}</p>
      </div>
      <ZoomBar zoomed={false} canZoomIn switchedOff />
    </div>
  );
}
