import { describe, expect, it } from 'vitest'
import { PALETTE, pickDefaultColor } from './categoryColor'
import type { Category } from './types'

function cat(type: Category['type'], color: string, id = color): Category {
  return { id, name: id, type, color }
}

describe('pickDefaultColor', () => {
  it('gives the first palette colour when nothing is used yet', () => {
    expect(pickDefaultColor([], 'expense')).toBe(PALETTE[0])
    expect(pickDefaultColor([], 'income')).toBe(PALETTE[0])
  })

  it('skips colours already used by a category of the same direction', () => {
    const categories = [cat('expense', PALETTE[0]), cat('expense', PALETTE[1])]
    expect(pickDefaultColor(categories, 'expense')).toBe(PALETTE[2])
  })

  it('skips used colours regardless of their order in the category list', () => {
    // PALETTE[1] is taken but PALETTE[0] is not — the result must still be
    // the first *unused* colour, not just "one past the last taken one".
    const categories = [cat('expense', PALETTE[1])]
    expect(pickDefaultColor(categories, 'expense')).toBe(PALETTE[0])
  })

  it('does not let one direction contaminate the other', () => {
    // Every expense colour is taken, but income has used none of them —
    // an income category should still get PALETTE[0], not spill over into
    // "everything is taken" just because expense is full.
    const allExpense = PALETTE.map((color) => cat('expense', color))
    expect(pickDefaultColor(allExpense, 'income')).toBe(PALETTE[0])

    // And the reverse: colours already used by income must not be skipped
    // when picking for expense, since the two pickers are independent.
    const someIncome = [cat('income', PALETTE[0]), cat('income', PALETTE[1])]
    expect(pickDefaultColor(someIncome, 'expense')).toBe(PALETTE[0])
  })

  it('is deterministic — same input always yields the same output', () => {
    const categories = [cat('expense', PALETTE[0]), cat('expense', PALETTE[2])]
    const first = pickDefaultColor(categories, 'expense')
    const second = pickDefaultColor(categories, 'expense')
    expect(first).toBe(second)
    expect(first).toBe(PALETTE[1])
  })

  it('assigns a different colour to each of a run of new categories, in palette order', () => {
    // Simulates creating several categories back to back without ever
    // touching the swatch picker — each pick must account for the ones
    // already committed, not just the ones present at the start.
    let categories: Category[] = []
    const assigned: string[] = []
    for (let i = 0; i < 4; i += 1) {
      const color = pickDefaultColor(categories, 'expense')
      assigned.push(color)
      categories = [...categories, cat('expense', color, `c${i}`)]
    }
    expect(assigned).toEqual([PALETTE[0], PALETTE[1], PALETTE[2], PALETTE[3]])
    expect(new Set(assigned).size).toBe(assigned.length)
  })

  it('falls back to the first colour once every palette slot is taken', () => {
    const full = PALETTE.map((color) => cat('expense', color))
    expect(pickDefaultColor(full, 'expense')).toBe(PALETTE[0])
  })
})
