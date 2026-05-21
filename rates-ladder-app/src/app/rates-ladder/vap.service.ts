import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import type { VapEntry, VapPrint } from './rates-ladder.types';
import { fmtWallClock } from './rates-ladder.utils';

@Injectable({ providedIn: 'root' })
export class VapService {
  private readonly _vapMap$ = new BehaviorSubject<Map<string, VapEntry>>(new Map());
  readonly vapMap$ = this._vapMap$.asObservable();

  /** Wipe the VAP map — used when switching products to drop stale prints. */
  clear(): void {
    this._vapMap$.next(new Map());
  }

  /** Apply one AMPS clobVAP print, accumulating into the per-price entry. */
  applyPrint(p: VapPrint): void {
    const key = p.TradePrice.toFixed(8);
    const m = new Map(this._vapMap$.value);
    const cur = m.get(key) ?? { total: 0, buy: 0, sell: 0, other: 0, time: '' };
    m.set(key, {
      total: cur.total + p.TradeSize,
      buy:   cur.buy   + p.MarketBidVolume,
      sell:  cur.sell  + p.MarketAskVol,
      other: cur.other + p.MarketOtherVolume,
      time:  fmtWallClock(p.TradeTime),
    });
    this._vapMap$.next(m);
  }

  /** Seed plausible distribution centered on lastPrice — README §4.5,
   *  deterministic via seeded sin so reloads are stable. */
  seedSynthetic(lastPrice: number, tick: number): void {
    const seed = Math.floor(lastPrice * 64);
    const rand = (i: number): number => {
      const x = Math.sin(seed * 9301 + i * 49297) * 233280;
      return x - Math.floor(x);
    };
    const m = new Map<string, VapEntry>();
    for (let i = -12; i <= 12; i++) {
      const p = +(lastPrice + i * tick).toFixed(8);
      const dist = Math.abs(i);
      const total = Math.round(900 * Math.exp(-dist * 0.18) + rand(i) * 400);
      const buy = Math.round(total * (0.42 + rand(i + 100) * 0.16));
      const other = Math.round(rand(i + 200) * 8);
      const sell = Math.max(0, total - buy - other);
      const hour = 8 + Math.floor(rand(i + 300) * 8);
      const min  = Math.floor(rand(i + 400) * 60);
      const sec  = Math.floor(rand(i + 500) * 60);
      const hh = ((hour + 11) % 12) + 1;
      const ampm = hour < 12 ? 'AM' : 'PM';
      m.set(p.toFixed(8), {
        total, buy, sell, other,
        time: `${hh}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')} ${ampm}`,
      });
    }
    this._vapMap$.next(m);
  }
}
