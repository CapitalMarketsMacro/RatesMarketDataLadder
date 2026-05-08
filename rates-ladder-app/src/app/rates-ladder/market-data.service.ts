import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Subject, Subscription } from 'rxjs';
import type { LastTradeEvent, MarketData, VapPrint } from './rates-ladder.types';
import { VapService } from './vap.service';

/** Seed payload — README §4.3, mirrors design_reference/Ladder.jsx PAYLOAD. */
const SEED: MarketData = {
  Id: 61711541, MarketId: 35, UnderlyingMarketId: 35,
  DV01: 779.6588375724411,
  Time: 1778261401498,
  LastTradePrice: 98.125, LastTradeSize: 1, LastTradeSource: 17,
  LastTradeTime: 1778261401276, LastTradeSide: 'BUY',
  HighTradePrice: 98.265625, LowTradePrice: 97.890625,
  RefPrice: 98.1318359375,
  RevisionId: 52244773, RevisionTime: 0,
  BidSubTickQuantity: 0, AskSubTickQuantity: 0,
  BidPricesUsed: 3, BidYield: 0.04362150857266394,
  Bid: [
    { Price: 98.125,    Qty: 18,  Source: [17, 42], Status: 0 },
    { Price: 98.109375, Qty: 337, Source: [42],     Status: 0 },
    { Price: 98.09375,  Qty: 87,  Source: [],       Status: 0 },
  ],
  AskPricesUsed: 2, AskYield: 0.04360146964130807,
  Ask: [
    { Price: 98.140625, Qty: 313, Source: [42, 17], Status: 0 },
    { Price: 98.15625,  Qty: 245, Source: [42],     Status: 0 },
  ],
  ProductGroup: 10,
};

@Injectable({ providedIn: 'root' })
export class MarketDataService {
  private readonly vap = inject(VapService);

  private readonly _data$ = new BehaviorSubject<MarketData>(SEED);
  readonly data$ = this._data$.asObservable();

  /** Per-level qty flashes — emitted as ('up' | 'down', priceKey). */
  readonly flash$ = new Subject<{ key: string; dir: 'up' | 'down' }>();

  /** New last-trade prints — components can drive sparkline buffers off this. */
  readonly lastTrade$ = new Subject<LastTradeEvent>();

  private tickRefCount = 0;
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private flashTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    // Seed VAP off the seed last-trade so the column isn't empty before any prints.
    this.vap.seedSynthetic(SEED.LastTradePrice, 1 / 64);
  }

  /** Reference-counted: start one interval no matter how many subscribers; stop when all unsubscribe. */
  startTickSimulation(intervalMs = 1100): Subscription {
    this.tickRefCount++;
    if (this.tickRefCount === 1) {
      this.tickHandle = setInterval(() => this.tick(), intervalMs);
    }
    return new Subscription(() => {
      this.tickRefCount = Math.max(0, this.tickRefCount - 1);
      if (this.tickRefCount === 0 && this.tickHandle != null) {
        clearInterval(this.tickHandle);
        this.tickHandle = null;
      }
    });
  }

  stopTickSimulation(): void {
    if (this.tickHandle != null) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
    this.tickRefCount = 0;
  }

  /** Real wiring (§7) lives here. Stubbed for v1. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  connect(_wsUrl: string, _topic: string, _marketId: number): void {
    // intentionally stubbed; replace _data$.next on each AMPS message
  }

  // ── tick body — README §4.4, ported from Ladder.jsx ────────────────────
  private tick(): void {
    const prev = this._data$.value;
    // Deep-clone the bid/ask arrays so OnPush + zoneless detect a new reference.
    const next: MarketData = {
      ...prev,
      Bid: prev.Bid.map(b => ({ ...b })),
      Ask: prev.Ask.map(a => ({ ...a })),
    };

    // 60%: wiggle a random level qty
    if (Math.random() < 0.6) {
      const onBid = Math.random() < 0.5;
      const arr = onBid ? next.Bid : next.Ask;
      if (arr.length) {
        const idx = Math.floor(Math.random() * arr.length);
        const delta = (Math.random() < 0.5 ? -1 : 1) * Math.max(1, Math.round(Math.random() * 20));
        const lvl = arr[idx];
        lvl.Qty = Math.max(1, lvl.Qty + delta);
        const key = lvl.Price.toFixed(8);
        const dir: 'up' | 'down' = delta > 0 ? 'up' : 'down';
        this.flash$.next({ key, dir });

        // auto-clear flash 600ms later (matches the @keyframes duration)
        const prevTimer = this.flashTimers.get(key);
        if (prevTimer) clearTimeout(prevTimer);
        const t = setTimeout(() => {
          this.flashTimers.delete(key);
        }, 600);
        this.flashTimers.set(key, t);
      }
    }

    // 18%: print a new last trade at best bid or best ask
    if (Math.random() < 0.18) {
      const useBid = Math.random() < 0.5;
      const lvl = useBid ? next.Bid[0] : next.Ask[0];
      if (lvl) {
        const size = Math.max(1, Math.round(Math.random() * 5));
        const side: 'BUY' | 'SELL' = useBid ? 'SELL' : 'BUY';
        const time = Date.now();
        next.LastTradePrice = lvl.Price;
        next.LastTradeSide = side;
        next.LastTradeSize = size;
        next.LastTradeTime = time;

        // Synthetic VapPrint (§4.4 / matches inline tick logic in Ladder.jsx)
        const print: VapPrint = {
          Id: next.Id,
          ECN: 0,
          TradeTime: time,
          TradePrice: lvl.Price,
          TradeSize: size,
          RecordId: next.RevisionId + 1,
          MarketAskVol:      side === 'SELL' ? size : 0,
          MarketBidVolume:   side === 'BUY'  ? size : 0,
          MarketOtherVolume: 0,
          ProductGroup: next.ProductGroup,
        };
        this.vap.applyPrint(print);

        this.lastTrade$.next({ price: lvl.Price, side, size, time });
      }
    }

    next.RevisionId = prev.RevisionId + 1;
    next.Time = Date.now();
    this._data$.next(next);
  }
}
