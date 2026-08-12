/**
 * "1 account" / "2 accounts". Counts are always shown next to their noun, so
 * getting agreement right here keeps every summary line reading naturally.
 */
export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`
}
