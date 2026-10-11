import { ICONS, type IconName } from '../../lib/icons';

interface Props {
  name: IconName;
  size?: number;
  class?: string;
}

export function Icon({ name, size = 20, class: className }: Props) {
  return (
    <svg
      class={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}
