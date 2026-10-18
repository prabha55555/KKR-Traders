/**
 * The web forms stored what they displayed: `parseFloat(total.toFixed(2))`. Reproduces that rounding
 * (and turns NaN / -0 into 0).
 */
export const round2 = (n) => parseFloat(n.toFixed(2)) || 0;
