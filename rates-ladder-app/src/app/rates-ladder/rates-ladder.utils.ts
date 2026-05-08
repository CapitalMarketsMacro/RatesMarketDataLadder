/* Helpers — README §3.2 + ported from design_reference/Ladder.jsx */

import type { BuiltRows, LadderRow, MarketData } from './rates-ladder.types';

export const TICK = 1 / 64;

/** 32nds notation: 98.140625 → "98-04+", 98.125 → "98-04" */
export function fmtPx(n: number): string {
  const whole = Math.floor(n);
  const frac32 = (n - whole) * 32;
  const i32 = Math.floor(frac32 + 1e-9);
  const halfTick = Math.round((frac32 - i32) * 4); // 0,1,2,3 quarters of a 32nd
  const sup = halfTick === 0 ? '' : (halfTick === 2 ? '+' : String(halfTick));
  return `${whole}-${String(i32).padStart(2, '0')}${sup}`;
}

export function fmtQty(n: number | null | undefined): string {
  return n == null ? '' : Number(n).toLocaleString();
}

/** Decimal yield → "436.22 bps" (decimal × 10000, two decimals) */
export function fmtBp(n: number): string {
  return (n * 10000).toFixed(2);
}

/** "HH:MM:SS.mmm" UTC from epoch ms (status strip) */
export function fmtUtcClock(epochMs: number): string {
  const d = new Date(epochMs);
  // ISO is "YYYY-MM-DDTHH:MM:SS.mmmZ" — slice the time + millis portion.
  return d.toISOString().substr(11, 12);
}

export function fmtWallClock(epochMs: number): string {
  const d = new Date(epochMs);
  const h = d.getHours();
  const m = d.getMinutes();
  const s = d.getSeconds();
  const hh = ((h + 11) % 12) + 1;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${hh}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} ${ampm}`;
}

export interface BuildRowsOptions {
  topPad?: number;
  botPad?: number;
  tick?: number;
}

/** Build a vertically-stacked ladder of price rows around best bid/ask.
 *  Ported verbatim from design_reference/Ladder.jsx → `buildRows`. */
export function buildRows(payload: MarketData, opts: BuildRowsOptions = {}): BuiltRows {
  const topPad = opts.topPad ?? 9;
  const botPad = opts.botPad ?? 9;
  const tick   = opts.tick   ?? TICK;

  const bidMap = new Map(payload.Bid.map(b => [b.Price.toFixed(8), b]));
  const askMap = new Map(payload.Ask.map(a => [a.Price.toFixed(8), a]));

  const bestBid = payload.Bid[0]?.Price ?? payload.RefPrice;
  const bestAsk = payload.Ask[0]?.Price ?? payload.RefPrice;
  const bestAskIdx = topPad;
  const totalRows = topPad + botPad + 2;

  const rows: LadderRow[] = [];
  for (let i = 0; i < totalRows; i++) {
    let price: number;
    if (i <= bestAskIdx) {
      price = bestAsk + (bestAskIdx - i) * tick;
    } else {
      price = bestAsk - (i - bestAskIdx) * tick;
    }
    // float-safety: re-snap to tick grid
    price = Math.round(price / tick) * tick;
    const k = price.toFixed(8);
    const bid = bidMap.get(k);
    const ask = askMap.get(k);
    rows.push({
      price,
      bidQty: bid?.Qty ?? null,
      askQty: ask?.Qty ?? null,
      sources: bid?.Source ?? ask?.Source ?? [],
      isBestBid: !!bid && bid.Price === bestBid,
      isBestAsk: !!ask && ask.Price === bestAsk,
      isLast:    Math.abs(price - payload.LastTradePrice) < 1e-9,
      isHigh:    Math.abs(price - payload.HighTradePrice) < 1e-9,
      isLow:     Math.abs(price - payload.LowTradePrice)  < 1e-9,
      isRefBand: payload.RefPrice >= price - tick / 2 && payload.RefPrice < price + tick / 2,
    });
  }

  const maxQty = Math.max(
    1,
    ...payload.Bid.map(b => b.Qty),
    ...payload.Ask.map(a => a.Qty),
  );
  return { rows, maxQty };
}
