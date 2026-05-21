import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Subject, Subscription } from 'rxjs';
import type { LastTradeEvent, MarketData, VapPrint } from './rates-ladder.types';
import { VapService } from './vap.service';
import { AmpsService, type AmpsConnectOptions } from './amps.service';

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

export type DataSource = 'simulator' | 'amps';

@Injectable({ providedIn: 'root' })
export class MarketDataService {
  private readonly vap  = inject(VapService);
  private readonly amps = inject(AmpsService);

  private readonly _data$ = new BehaviorSubject<MarketData>(SEED);
  readonly data$ = this._data$.asObservable();

  /** Per-level qty flashes — emitted as ('up' | 'down', priceKey). */
  readonly flash$ = new Subject<{ key: string; dir: 'up' | 'down' }>();

  /** New last-trade prints — components can drive sparkline buffers off this. */
  readonly lastTrade$ = new Subject<LastTradeEvent>();

  private mode: DataSource = 'simulator';
  private tickRefCount = 0;
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private flashTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private ampsSub: Subscription | null = null;
  private priorBid = new Map<string, number>();
  private priorAsk = new Map<string, number>();
  private priorLastPx = SEED.LastTradePrice;

  constructor() {
    // Seed VAP off the seed last-trade so the column isn't empty before any prints.
    this.vap.seedSynthetic(SEED.LastTradePrice, 1 / 64);
    this.seedPriorBookFrom(SEED);
  }

  /** Reference-counted: start one interval no matter how many subscribers; stop when all unsubscribe.
   *  No-op while in AMPS mode — real ticks come from the wire. */
  startTickSimulation(intervalMs = 1100): Subscription {
    if (this.mode === 'amps') {
      return new Subscription();
    }
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

  /** Switch to real AMPS feed. Connects + subscribes to products; the
   *  per-product market_data/vap subscriptions are placed by setProduct. */
  async useAmps(opts: AmpsConnectOptions): Promise<void> {
    this.stopTickSimulation();
    this.tearDownAmpsSub();
    this.mode = 'amps';

    const sub = new Subscription();
    sub.add(this.amps.marketData$.subscribe((d) => this.absorbAmpsMarketData(d)));
    sub.add(this.amps.vapPrint$.subscribe((p) => this.vap.applyPrint(p)));
    this.ampsSub = sub;

    try {
      await this.amps.connect(opts);
    } catch (err) {
      // Connection failed: stay in 'amps' mode so UI can show the error,
      // but tear down the empty subscription wiring.
      console.error('[MarketDataService] AMPS connect failed:', err);
    }
  }

  /** Clear prior book / VAP buffers when swapping product so the next
   *  diff doesn't flash leftover levels from the previous instrument. */
  resetForProductSwap(): void {
    this.priorBid.clear();
    this.priorAsk.clear();
    this.vap.clear();
  }

  /** Revert to the local tick simulator and disconnect AMPS. */
  async useSimulator(): Promise<void> {
    this.tearDownAmpsSub();
    await this.amps.disconnect();
    this.mode = 'simulator';
    // Optionally reset prior book so the next live switch starts clean.
    this.priorBid.clear();
    this.priorAsk.clear();
    this.seedPriorBookFrom(this._data$.value);
  }

  getDataSource(): DataSource {
    return this.mode;
  }

  // ── AMPS message absorption ──────────────────────────────────────────
  private absorbAmpsMarketData(d: MarketData): void {
    if (!Array.isArray(d.Bid) || !Array.isArray(d.Ask)) return;

    const newBid = new Map<string, number>();
    for (const lvl of d.Bid) newBid.set(lvl.Price.toFixed(8), lvl.Qty);
    const newAsk = new Map<string, number>();
    for (const lvl of d.Ask) newAsk.set(lvl.Price.toFixed(8), lvl.Qty);

    for (const [k, q] of newBid) {
      const prev = this.priorBid.get(k);
      if (prev != null && prev !== q) {
        this.emitFlash(k, q > prev ? 'up' : 'down');
      }
    }
    for (const [k, q] of newAsk) {
      const prev = this.priorAsk.get(k);
      if (prev != null && prev !== q) {
        this.emitFlash(k, q > prev ? 'up' : 'down');
      }
    }
    this.priorBid = newBid;
    this.priorAsk = newAsk;

    if (typeof d.LastTradePrice === 'number' && d.LastTradePrice !== this.priorLastPx) {
      this.lastTrade$.next({
        price: d.LastTradePrice,
        side:  d.LastTradeSide,
        size:  d.LastTradeSize,
        time:  d.LastTradeTime,
      });
      this.priorLastPx = d.LastTradePrice;
    }

    this._data$.next(d);
  }

  private seedPriorBookFrom(d: MarketData): void {
    for (const lvl of d.Bid) this.priorBid.set(lvl.Price.toFixed(8), lvl.Qty);
    for (const lvl of d.Ask) this.priorAsk.set(lvl.Price.toFixed(8), lvl.Qty);
    this.priorLastPx = d.LastTradePrice;
  }

  private emitFlash(key: string, dir: 'up' | 'down'): void {
    this.flash$.next({ key, dir });
    const prevTimer = this.flashTimers.get(key);
    if (prevTimer) clearTimeout(prevTimer);
    const t = setTimeout(() => this.flashTimers.delete(key), 600);
    this.flashTimers.set(key, t);
  }

  private tearDownAmpsSub(): void {
    if (this.ampsSub) {
      this.ampsSub.unsubscribe();
      this.ampsSub = null;
    }
  }

  // ── simulator tick body — README §4.4, ported from Ladder.jsx ───────
  private tick(): void {
    const prev = this._data$.value;
    const next: MarketData = {
      ...prev,
      Bid: prev.Bid.map(b => ({ ...b })),
      Ask: prev.Ask.map(a => ({ ...a })),
    };

    if (Math.random() < 0.6) {
      const onBid = Math.random() < 0.5;
      const arr = onBid ? next.Bid : next.Ask;
      if (arr.length) {
        const idx = Math.floor(Math.random() * arr.length);
        const delta = (Math.random() < 0.5 ? -1 : 1) * Math.max(1, Math.round(Math.random() * 20));
        const lvl = arr[idx];
        lvl.Qty = Math.max(1, lvl.Qty + delta);
        this.emitFlash(lvl.Price.toFixed(8), delta > 0 ? 'up' : 'down');
      }
    }

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
