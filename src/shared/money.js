/**
 * Performs IEEE 754 half-up rounding to a fixed number of decimal digits.
 *
 * @param {number | string} val
 * @param {number} [decimals=2]
 * @returns {number}
 */
export function roundHalfUp(val, decimals = 2) {
  const num = Number(val);
  const factor = Math.pow(10, decimals);
  return Math.round((num + Number.EPSILON) * factor) / factor;
}

/**
 * Computes VAT and total using KSA standard 15% rate and half-up rounding.
 *
 * @param {number | string} subtotal - Net amount before tax
 * @param {number} [vatRate=0.15] - VAT percentage rate
 * @returns {{ subtotal: number, vatAmount: number, total: number }}
 */
export function computeVat(subtotal, vatRate = 0.15) {
  const cleanSubtotal = roundHalfUp(subtotal, 2);
  const vatAmount = roundHalfUp(cleanSubtotal * vatRate, 2);
  const total = roundHalfUp(cleanSubtotal + vatAmount, 2);

  return {
    subtotal: cleanSubtotal,
    vatAmount,
    total
  };
}
