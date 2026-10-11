/** "A", "A and B", "A, B and C". */
export function listOf(items: string[]): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function possessive(name: string): string {
  return `${name}’s`;
}

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** Sentence case for the first letter only: "provinces and territories" -> "Provinces and territories". */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
