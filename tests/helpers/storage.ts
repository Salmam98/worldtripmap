/** A minimal in-memory stand-in for the browser's storage, so storage code can run under Node. */
export class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  /** When set, every write throws, as browsers do when site data is blocked or full. */
  failWrites = false;

  get length(): number {
    return this.data.size;
  }
  clear(): void {
    this.data.clear();
  }
  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  setItem(key: string, value: string): void {
    if (this.failWrites) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    this.data.set(key, String(value));
  }
}

export function installStorage(): { local: MemoryStorage; session: MemoryStorage; remove: () => void } {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  const g = globalThis as unknown as { window?: unknown };
  const before = g.window;
  g.window = { localStorage: local, sessionStorage: session };
  return {
    local,
    session,
    remove: () => {
      if (before === undefined) delete g.window;
      else g.window = before;
    },
  };
}
