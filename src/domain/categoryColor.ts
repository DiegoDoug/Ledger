/**
 * Category colour palette and assignment.
 *
 * The palette itself is a fixed, ordered list — never reshuffled, so an
 * existing category's colour never moves. Assignment only picks a *default*
 * for a brand-new category; the user can always override it via the swatch
 * picker.
 */
import type { Category, CategoryType } from './types'

/** The chart palette. A category's colour is a label aid, never the only signal. */
export const PALETTE = [
  'viz-1',
  'viz-2',
  'viz-3',
  'viz-4',
  'viz-5',
  'viz-6',
  'viz-7',
  'viz-8',
  'viz-9',
  'viz-10',
  'viz-11',
  'viz-neutral',
]

/**
 * The first palette colour not already used by a category of the same
 * direction. New categories default to `PALETTE[0]` otherwise, so creating
 * several in a row without touching the swatch silently piles them onto the
 * same hue — this keeps that from being the default outcome.
 *
 * Spending and income are scoped separately: each direction has its own
 * picker in the UI and its own legend, so a colour already used by an income
 * category should not be skipped when picking one for a new expense category.
 */
export function pickDefaultColor(categories: Category[], type: CategoryType): string {
  const used = new Set(categories.filter((c) => c.type === type).map((c) => c.color))
  return PALETTE.find((color) => !used.has(color)) ?? PALETTE[0]
}
