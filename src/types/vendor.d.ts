/** Build-script dependencies that ship without type declarations. */
declare module 'mapshaper' {
  const mapshaper: {
    applyCommands(commands: string, input?: Record<string, string>): Promise<Record<string, string | Uint8Array>>;
  };
  export default mapshaper;
}

declare module 'polylabel' {
  export default function polylabel(polygon: number[][][], precision?: number): [number, number] & { distance?: number };
}
