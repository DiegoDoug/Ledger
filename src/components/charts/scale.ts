export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Round an axis maximum up to a readable step (1/2/2.5/5 x 10^n). */
export function niceTicks(max: number, count: number): number[] {
  if (max <= 0 || !Number.isFinite(max)) return [0]
  const rough = max / Math.max(count, 1)
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const normalised = rough / magnitude
  const step =
    (normalised <= 1
      ? 1
      : normalised <= 2
        ? 2
        : normalised <= 2.5
          ? 2.5
          : normalised <= 5
            ? 5
            : 10) * magnitude

  const ticks: number[] = []
  for (let value = 0; value <= max + step * 0.001 && ticks.length < 12; value += step) {
    ticks.push(Math.round(value))
  }
  const last = ticks[ticks.length - 1] ?? 0
  if (last < max) ticks.push(Math.round(last + step))
  return ticks
}
