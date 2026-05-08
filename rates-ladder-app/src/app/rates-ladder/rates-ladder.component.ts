import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';

import { MarketDataService } from './market-data.service';
import { VapService } from './vap.service';
import type {
  LadderVariant,
  MarketData,
  VapEntry,
  WorkingOrder,
} from './rates-ladder.types';
import { fmtUtcClock } from './rates-ladder.utils';

import { LadderHeaderComponent } from './partials/ladder-header.component';
import { LadderBodyComponent } from './partials/ladder-body.component';
import { LadderFooterComponent } from './partials/ladder-footer.component';
import { AnalyticsRailComponent } from './partials/analytics-rail.component';
import { WorkingStripComponent } from './partials/working-strip.component';

const DEFAULT_ORDERS: WorkingOrder[] = [
  { side: 'BUY',  price: 98.109375, qty: 25, status: 'working' },
  { side: 'SELL', price: 98.171875, qty: 10, status: 'working' },
];

/** Rates Market Data Ladder — README §5. */
@Component({
  selector: 'rates-ladder',
  imports: [
    LadderHeaderComponent,
    LadderBodyComponent,
    LadderFooterComponent,
    AnalyticsRailComponent,
    WorkingStripComponent,
  ],
  templateUrl: './rates-ladder.component.html',
  styleUrl: './rates-ladder.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.theme-light]': "theme() === 'light'",
    '[style.width.px]': 'width()',
    '[style.height.px]': 'height()',
  },
})
export class RatesLadderComponent {
  // ── inputs / outputs ─────────────────────────────────────────────────
  variant         = input<LadderVariant>('standard');
  title           = input('MD Trader');
  width           = input(360);
  height          = input(720);
  ticking         = input(true);
  theme           = input<'dark' | 'light'>('dark');
  showVAP         = input(false);
  tickSize        = input(1 / 64);
  instrumentLabel = input('TY · UST 10Y FUT · DEC26');

  submitOrder = output<{ side: 'BUY' | 'SELL'; price: number; qty: number }>();
  cancelOrder = output<number>();

  // ── injected services ────────────────────────────────────────────────
  private readonly mds = inject(MarketDataService);
  private readonly vap = inject(VapService);

  // ── reactive state ───────────────────────────────────────────────────
  readonly data    = toSignal(this.mds.data$, { requireSync: true });
  readonly vapMap  = toSignal(this.vap.vapMap$, {
    initialValue: new Map<string, VapEntry>(),
  });
  readonly flashes = signal<Map<string, 'up' | 'down'>>(new Map());
  readonly orders  = signal<WorkingOrder[]>(DEFAULT_ORDERS);
  readonly size    = signal(10);
  readonly sparkPts = signal<number[]>(this.makeIntradayPath(this.data()));

  /** Sparkline pts to render in the header — analytics variant uses the rail instead. */
  readonly headerSparkPts = computed(() =>
    this.variant() === 'analytics' ? null : this.sparkPts(),
  );

  readonly utcClock = computed(() => fmtUtcClock(this.data().Time));

  constructor() {
    // Reference-counted tick subscription — drops when ticking() flips off.
    effect((onCleanup) => {
      if (this.ticking()) {
        const sub = this.mds.startTickSimulation();
        onCleanup(() => sub.unsubscribe());
      }
    });

    // Per-level qty flashes: hold for 600ms then drop.
    this.mds.flash$.pipe(takeUntilDestroyed()).subscribe(({ key, dir }) => {
      this.flashes.update((m) => {
        const n = new Map(m);
        n.set(key, dir);
        return n;
      });
      setTimeout(() => {
        this.flashes.update((m) => {
          const n = new Map(m);
          n.delete(key);
          return n;
        });
      }, 600);
    });

    // New last-trade prints push onto the local sparkline buffer.
    this.mds.lastTrade$.pipe(takeUntilDestroyed()).subscribe((t) => {
      this.sparkPts.update((arr) => [...arr.slice(1), t.price]);
    });
  }

  // ── handlers ─────────────────────────────────────────────────────────
  protected onClickBid(price: number): void {
    const qty = this.size();
    this.orders.update((o) => [...o, { side: 'BUY', price, qty, status: 'working' }]);
    this.submitOrder.emit({ side: 'BUY', price, qty });
  }
  protected onClickAsk(price: number): void {
    const qty = this.size();
    this.orders.update((o) => [...o, { side: 'SELL', price, qty, status: 'working' }]);
    this.submitOrder.emit({ side: 'SELL', price, qty });
  }
  protected onCancel(idx: number): void {
    this.orders.update((o) => o.filter((_, j) => j !== idx));
    this.cancelOrder.emit(idx);
  }
  protected onCancelAll(): void {
    this.orders.set([]);
  }
  protected onSubmitBuy(): void {
    const ask = this.data().Ask[0]?.Price ?? this.data().RefPrice;
    this.onClickAsk(ask);
  }
  protected onSubmitSell(): void {
    const bid = this.data().Bid[0]?.Price ?? this.data().RefPrice;
    this.onClickBid(bid);
  }

  // ── seed sparkline ───────────────────────────────────────────────────
  private makeIntradayPath(d: MarketData): number[] {
    const n = 60;
    const lo = d.LowTradePrice;
    const hi = d.HighTradePrice;
    let p = (lo + hi) / 2;
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      p += (Math.random() - 0.5) * (hi - lo) * 0.07;
      p = Math.max(lo, Math.min(hi, p));
      out.push(p);
    }
    out[n - 1] = d.LastTradePrice;
    return out;
  }
}
