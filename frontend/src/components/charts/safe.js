// Shared input guard for the charts: NaN, Infinity, negatives and non-numbers all become 0 so no chart can emit NaN geometry.
export const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
