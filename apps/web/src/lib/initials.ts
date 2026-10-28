/** Thai leading vowels sit in front of the spoken initial. */
const LEADING_VOWELS = new Set(['เ', 'แ', 'โ', 'ใ', 'ไ']);

/** First visible letter of `name`, skipping leading เ แ โ ใ ไ. */
export function nameInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  let index = 0;
  while (index < trimmed.length && LEADING_VOWELS.has(trimmed[index]!)) {
    index += 1;
  }
  return trimmed[index] ?? trimmed[0] ?? '';
}
