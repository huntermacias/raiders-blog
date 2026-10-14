// Number formats shared by the stat catalog (playersKit.ts) and the v2 additions (statsV2.ts). One function each, so a check that
// asks "is this a percent stat?" by identity (shareCount does) gives the same answer for both.
export const pct0 = (v: number) => `${(v * 100).toFixed(0)}%`
export const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`
