/**
 * Payment-method detection from a transaction's free-text description.
 *
 * This is a display heuristic, not stored data — Ledger has no dedicated
 * "payment method" field, and category already carries "what this was for".
 * Conflating the two is what causes a P2P transfer named "Bizum" to look like
 * it belongs to a category called Bizum. Detecting the method separately lets
 * the UI show both without either field having to stand in for the other.
 */
const PAYMENT_METHOD_PATTERNS: Array<{ label: string; pattern: RegExp }> = [{ label: 'Bizum', pattern: /\bbizum\b/i }]

export function detectPaymentMethod(description: string): string | null {
  for (const { label, pattern } of PAYMENT_METHOD_PATTERNS) {
    if (pattern.test(description)) return label
  }
  return null
}
