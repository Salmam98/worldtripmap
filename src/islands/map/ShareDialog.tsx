import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { track } from '../../lib/analytics';
import { mapPath, posterPath } from '../../lib/maps/registry';
import { buildHash, MAX_NAME_LENGTH, sanitizeName } from '../../lib/maps/share-codec';
import type { PlacesSummary } from '../../lib/maps/places';
import type { MapStats } from '../../lib/maps/stats';
import { loadDisplayName, saveDisplayName } from '../../lib/maps/store';
import type { MapDefinition, MapGeoMeta, MapGeometry, Selection } from '../../lib/maps/types';
import { href } from '../../lib/site';
import { Dialog } from '../ui/Dialog';
import { Icon } from '../ui/Icon';

export type ShareKind = 'share' | 'challenge';

interface Props {
  def: MapDefinition;
  meta: MapGeoMeta;
  geometry: MapGeometry;
  selection: Selection;
  stats: MapStats;
  /** Places ticked inside the map's features, so the picture can carry their percentages. */
  places?: PlacesSummary | null;
  kind: ShareKind | null;
  onClose: () => void;
  onDone: (message: string) => void;
}

export function shareSentence(def: MapDefinition, stats: MapStats, kind: ShareKind): string {
  return kind === 'challenge'
    ? `I have explored ${stats.visited} of ${def.scope}. Can you beat that?`
    : `My travel map: ${stats.visited} of ${def.scope} explored.`;
}

async function copyText(text: string, fallback: HTMLInputElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (!fallback) return false;
    fallback.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    }
  }
}

/**
 * Sharing is always the visitor's choice. The link carries the marked places and, if they add one,
 * a display name. Nothing is uploaded, so there is no stored copy to delete later.
 */
export function ShareDialog({ def, meta, geometry, selection, stats, places, kind, onClose, onDone }: Props) {
  const [name, setName] = useState('');
  const [copied, setCopied] = useState(false);
  const [imageState, setImageState] = useState<'idle' | 'working' | 'failed'>('idle');
  const linkField = useRef<HTMLInputElement>(null);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    if (kind) {
      setName(loadDisplayName());
      setCopied(false);
    }
  }, [kind]);

  const url = useMemo(() => {
    if (!kind || typeof window === 'undefined') return '';
    const hash = buildHash(def, { visited: selection.visited, name, challenge: kind === 'challenge' });
    return new URL(href(mapPath(def)), window.location.href).href.split('#')[0] + hash;
  }, [def, selection, name, kind]);

  if (!kind) return <Dialog open={false} title="" onClose={onClose}>{null}</Dialog>;

  const sentence = shareSentence(def, stats, kind);
  const empty = stats.visited + stats.otherVisited === 0;

  const onName = (value: string) => {
    const clean = [...value].slice(0, MAX_NAME_LENGTH).join('');
    setName(clean);
    saveDisplayName(sanitizeName(clean));
    setCopied(false);
  };

  // Like the two handlers below, this reports the visitor's choice at the moment they make it,
  // not after the clipboard has answered.
  const copy = async () => {
    track('share_initiated', { map: def.id, kind, method: 'copy-link' });
    const ok = await copyText(url, linkField.current);
    setCopied(ok);
    if (ok) onDone('Link copied.');
  };

  const share = async () => {
    track('share_initiated', { map: def.id, kind, method: 'web-share' });
    try {
      await navigator.share({ title: 'WorldTripMap', text: sentence, url });
    } catch {
      /* the visitor closed the share sheet */
    }
  };

  // The poster engine is fetched only when someone asks for an image.
  const image = async (formatId: 'post' | 'story') => {
    if (imageState === 'working') return;
    setImageState('working');
    track('share_initiated', { map: def.id, kind, method: `image-${formatId}` });
    try {
      const { makeShareCard, shareOrSave } = await import('../../lib/poster/quick-card');
      const file = await makeShareCard(def, meta, geometry, selection, name, formatId, places);
      const outcome = await shareOrSave(file, sentence, url);
      setImageState('idle');
      if (outcome === 'saved') onDone(`Saved ${file.filename}`);
    } catch {
      setImageState('failed');
    }
  };

  return (
    <Dialog open title={kind === 'challenge' ? 'Challenge a friend' : 'Share your map'} onClose={onClose}>
      <p>
        {kind === 'challenge'
          ? 'Send this link to a friend. They mark their own map, then you both see who has explored more and where you overlap.'
          : 'Anyone with this link can see the places you have marked. They cannot change your map.'}
      </p>

      {empty && (
        <p class="notice notice--warn">
          You have not marked any places yet, so the link will show an empty map.
        </p>
      )}

      <label class="field">
        <span class="field__label">Your name or nickname (optional)</span>
        <input
          class="input"
          type="text"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          autocomplete="nickname"
          placeholder="Shown to the person who opens the link"
          onInput={(event) => onName((event.target as HTMLInputElement).value)}
        />
      </label>

      <div class="field">
        <label class="field__label" for={`share-link-${def.id}`}>
          Link
        </label>
        <div class="copy-row">
          <input id={`share-link-${def.id}`} ref={linkField} class="input" type="text" readOnly value={url} onFocus={(e) => (e.target as HTMLInputElement).select()} />
          <button type="button" class="btn btn--quiet" onClick={copy}>
            <Icon name={copied ? 'check' : 'copy'} size={18} />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <span class="field__hint">
          The link itself holds your places{name.trim() ? ' and this name' : ''}. Nothing is uploaded or stored by us.
        </span>
      </div>

      <div class="share-image">
        <p class="field__label">Share as a picture</p>
        <div class="share-image__buttons">
          <button type="button" class="btn btn--quiet btn--sm" onClick={() => image('post')} disabled={imageState === 'working'}>
            <Icon name="image" size={16} />
            Post, 4:5
          </button>
          <button type="button" class="btn btn--quiet btn--sm" onClick={() => image('story')} disabled={imageState === 'working'}>
            <Icon name="device" size={16} />
            Story, 9:16
          </button>
          <a class="text-link share-image__more" href={href(posterPath(def)) + buildHash(def, { visited: selection.visited, wishlist: selection.wishlist })}>
            Design it first
          </a>
        </div>
        <p class="field__hint" role="status">
          {imageState === 'working'
            ? 'Drawing your image…'
            : imageState === 'failed'
              ? 'The image could not be made on this device. Try the poster studio instead.'
              : 'Made on your device with your current poster design.'}
        </p>
      </div>

      <div class="dialog__actions">
        {canShare && (
          <button type="button" class="btn btn--forest" onClick={share}>
            <Icon name="share" size={18} />
            Share
          </button>
        )}
        <button type="button" class="btn btn--quiet" onClick={onClose}>
          Done
        </button>
      </div>
    </Dialog>
  );
}
