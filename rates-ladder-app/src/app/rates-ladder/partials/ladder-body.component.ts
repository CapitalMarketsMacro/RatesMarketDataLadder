import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { LadderRow, LadderVariant, MarketData, VapEntry, WorkingOrder } from '../rates-ladder.types';
import { buildRows, fmtPx, fmtQty, TICK } from '../rates-ladder.utils';
import { DepthBarComponent } from './depth-bar.component';

interface RowView extends LadderRow {
  myBidQty: number | null;
  myAskQty: number | null;
  flash: 'up' | 'down' | null;
  mark: 'last' | 'high' | 'low' | 'ref' | null;
  vap: VapEntry | null;
}

/** The price grid — README §5.3, §5.4. Ported from Ladder.jsx → LadderBody. */
@Component({
  selector: 'ladder-body',
  imports: [DepthBarComponent],
  template: `
    <div class="body">
      <!-- column header row -->
      <div class="col-headers" [style.--cols]="cols()">
        @if (variant() === 'pro') {
          <span class="col-h center">B</span>
        }
        <span class="col-h right bid-label">BID QTY</span>
        <span class="col-h center">PRICE</span>
        <span class="col-h left ask-label">ASK QTY</span>
        @if (variant() === 'pro') {
          <span class="col-h center">S</span>
        }
        @if (showVAP()) {
          <span class="col-h right vap-label">VAP</span>
          <span class="col-h center">B/S VOL</span>
          <span class="col-h center">VAP TIME</span>
        }
      </div>

      <!-- data rows -->
      <div class="rows-scroll">
        @for (r of rowsView(); track r.price) {
          <div class="row"
               [style.--cols]="cols()"
               [class.flash-up]="r.flash === 'up'"
               [class.flash-down]="r.flash === 'down'"
               [class.last]="r.isLast">
            @if (variant() === 'pro') {
              <div class="strip strip-bid"
                   [class.best]="r.isBestBid"
                   (click)="clickBid.emit(r.price)"
                   [title]="'Buy ' + sizeStep() + ' @ ' + fmtPx(r.price)">+</div>
            }

            <!-- BID QTY -->
            <div class="cell bid-cell" [class.best-bid]="r.isBestBid">
              <depth-bar [qty]="r.bidQty" [max]="maxQty()" side="bid" />
              @if (r.myBidQty !== null) {
                <span class="order-chip chip-left">{{ r.myBidQty }}</span>
              }
              <span class="cell-text" [class.bold]="r.isBestBid">{{ fmtQty(r.bidQty) }}</span>
            </div>

            <!-- PRICE -->
            <div class="cell price-cell"
                 [class.is-last]="r.isLast"
                 [class.best-bid-text]="r.isBestBid && !r.isLast"
                 [class.best-ask-text]="r.isBestAsk && !r.isLast"
                 (click)="clickPrice.emit(r.price)">
              <span class="mark">
                @if (r.mark) {
                  <span class="mark-glyph" [attr.data-mark]="r.mark">{{ markGlyph(r.mark) }}</span>
                }
              </span>
              <span class="px-text">{{ fmtPx(r.price) }}</span>
              <span class="last-arrow">
                @if (r.isLast) {
                  <span class="arrow-glyph">{{ payload().LastTradeSide === 'BUY' ? '↑' : '↓' }}</span>
                }
              </span>
            </div>

            <!-- ASK QTY -->
            <div class="cell ask-cell" [class.best-ask]="r.isBestAsk">
              <depth-bar [qty]="r.askQty" [max]="maxQty()" side="ask" />
              @if (r.myAskQty !== null) {
                <span class="order-chip chip-right">{{ r.myAskQty }}</span>
              }
              <span class="cell-text" [class.bold]="r.isBestAsk">{{ fmtQty(r.askQty) }}</span>
            </div>

            @if (variant() === 'pro') {
              <div class="strip strip-ask"
                   [class.best]="r.isBestAsk"
                   (click)="clickAsk.emit(r.price)"
                   [title]="'Sell ' + sizeStep() + ' @ ' + fmtPx(r.price)">+</div>
            }

            @if (showVAP()) {
              <div class="cell vap-total">{{ r.vap ? fmtQty(r.vap.total) : '' }}</div>
              <div class="cell vap-bso">
                @if (r.vap) {
                  <span class="bid">{{ r.vap.buy }}</span>
                  <span class="vap-sep">|</span>
                  <span class="vap-other">{{ r.vap.other }}</span>
                  <span class="vap-sep">|</span>
                  <span class="ask">{{ r.vap.sell }}</span>
                }
              </div>
              <div class="cell vap-time">{{ r.vap?.time ?? '' }}</div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { flex: 1; min-height: 0; display: flex; }
    .body {
      flex: 1;
      background: var(--bg-canvas);
      display: flex; flex-direction: column; min-height: 0;
    }

    /* column header row */
    .col-headers {
      display: grid; grid-template-columns: var(--cols);
      padding: 0 6px; height: 22px; align-items: center;
      border-bottom: 1px solid var(--border-1);
      background: var(--bg-panel);
      flex: 0 0 auto;
      font-size: 10px; font-weight: 500; letter-spacing: 0.06em;
      text-transform: uppercase; color: var(--fg-3);
    }
    .col-h.center { text-align: center; }
    .col-h.right  { text-align: right; }
    .col-h.left   { text-align: left;  }
    .bid-label { color: var(--bid); }
    .ask-label { color: var(--ask); }
    .vap-label { padding-right: 4px; }

    .rows-scroll { flex: 1; overflow: auto; min-height: 0; }

    .row {
      display: grid; grid-template-columns: var(--cols);
      height: 22px; align-items: stretch;
      border-bottom: 1px solid var(--border-grid);
      position: relative;
    }
    .row.last { background: rgba(245, 193, 58, 0.06); }

    /* PRO click strips */
    .strip {
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      font-family: var(--font-mono); font-size: 9px;
      opacity: 0.55;
      transition: opacity 120ms ease-out;
    }
    .strip-bid { border-right: 1px solid var(--border-grid); color: var(--bid); }
    .strip-ask { border-left:  1px solid var(--border-grid); color: var(--ask); }
    .strip-bid.best { background: var(--bid-bg); opacity: 0.9; }
    .strip-ask.best { background: var(--ask-bg); opacity: 0.9; }
    .strip:hover { opacity: 1; }

    /* QTY cells */
    .cell {
      position: relative;
      display: flex; align-items: center;
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
      font-size: 11px;
    }
    .bid-cell {
      border-right: 1px solid var(--border-grid);
      justify-content: flex-end;
      padding-right: 8px;
      color: var(--bid);
    }
    .bid-cell.best-bid { background: var(--bid-bg); }
    .ask-cell {
      border-left: 1px solid var(--border-grid);
      justify-content: flex-start;
      padding-left: 8px;
      color: var(--ask);
    }
    .ask-cell.best-ask { background: var(--ask-bg); }

    .cell-text { position: relative; z-index: 1; }
    .cell-text.bold { font-weight: 600; }

    /* working-order chip */
    .order-chip {
      position: absolute;
      top: 3px;
      font-size: 9px;
      padding: 1px 3px;
      border-radius: 2px;
      background: var(--brand);
      color: var(--on-brand);
      font-weight: 600;
      line-height: 1;
      z-index: 2;
    }
    .chip-left  { left: 4px; }
    .chip-right { right: 4px; }

    /* PRICE cell */
    .price-cell {
      background: var(--bg-canvas);
      border-left:  1px solid var(--border-grid);
      border-right: 1px solid var(--border-grid);
      justify-content: space-between;
      padding: 0 8px;
      font-weight: 500;
      color: var(--fg-1);
      cursor: pointer;
    }
    .price-cell.is-last {
      background: rgba(245, 193, 58, 0.10);
      font-weight: 600;
    }
    .price-cell.best-bid-text { color: var(--bid); }
    .price-cell.best-ask-text { color: var(--ask); }

    .mark, .last-arrow {
      width: 12px;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .last-arrow { justify-content: flex-end; }
    .mark-glyph {
      display: inline-flex; align-items: center; justify-content: center;
      width: 12px; height: 12px;
      font-size: 9px; font-weight: 700;
      font-family: var(--font-mono);
    }
    .mark-glyph[data-mark="high"] { color: var(--mkt-up); }
    .mark-glyph[data-mark="low"]  { color: var(--mkt-down); }
    .mark-glyph[data-mark="ref"]  { color: var(--brand); }
    .mark-glyph[data-mark="last"] { color: var(--yellow-300); }
    .arrow-glyph {
      font-size: 8px; font-weight: 700; color: var(--yellow-300);
    }

    /* VAP cells */
    .vap-total {
      border-left: 1px solid var(--border-grid);
      justify-content: flex-end;
      padding-right: 6px;
      color: var(--fg-1);
    }
    .vap-bso {
      border-left: 1px solid var(--border-grid);
      justify-content: center;
      gap: 3px;
      color: var(--fg-2);
      font-size: 10px;
    }
    .vap-bso .bid       { color: var(--bid); font-weight: 500; }
    .vap-bso .ask       { color: var(--ask); font-weight: 500; }
    .vap-bso .vap-other { color: var(--fg-2); }
    .vap-bso .vap-sep   { color: var(--fg-3); }
    .vap-time {
      border-left: 1px solid var(--border-grid);
      justify-content: center;
      color: var(--fg-3);
      font-size: 10px;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LadderBodyComponent {
  payload  = input.required<MarketData>();
  orders   = input<WorkingOrder[]>([]);
  variant  = input<LadderVariant>('standard');
  flashMap = input<Map<string, 'up' | 'down'>>(new Map());
  sizeStep = input(10);
  showVAP  = input(false);
  vapMap   = input<Map<string, VapEntry>>(new Map());
  tickSize = input(TICK);

  clickPrice = output<number>();
  clickBid   = output<number>();
  clickAsk   = output<number>();

  protected readonly fmtPx = fmtPx;
  protected readonly fmtQty = fmtQty;

  cols = computed(() => {
    let c = this.variant() === 'pro'
      ? '30px 1fr 86px 1fr 30px'
      : '1fr 86px 1fr';
    if (this.showVAP()) c += ' 48px 90px 72px';
    return c;
  });

  private built = computed(() => {
    const pad = this.variant() === 'pro' ? 8 : 9;
    return buildRows(this.payload(), { topPad: pad, botPad: pad, tick: this.tickSize() });
  });

  maxQty = computed(() => this.built().maxQty);

  private ordersByPrice = computed(() => {
    const m = new Map<string, { bid?: WorkingOrder; ask?: WorkingOrder }>();
    for (const o of this.orders()) {
      const k = o.price.toFixed(8);
      const slot = m.get(k) ?? {};
      if (o.side === 'BUY')  slot.bid = o;
      else                   slot.ask = o;
      m.set(k, slot);
    }
    return m;
  });

  rowsView = computed<RowView[]>(() => {
    const rows = this.built().rows;
    const orders = this.ordersByPrice();
    const flashes = this.flashMap();
    const vap = this.vapMap();

    return rows.map(r => {
      const k = r.price.toFixed(8);
      const slot = orders.get(k);
      const mark: RowView['mark'] = r.isLast ? 'last'
        : r.isHigh ? 'high'
        : r.isLow ? 'low'
        : r.isRefBand ? 'ref'
        : null;
      return {
        ...r,
        myBidQty: slot?.bid?.qty ?? null,
        myAskQty: slot?.ask?.qty ?? null,
        flash: flashes.get(k) ?? null,
        mark,
        vap: vap.get(k) ?? null,
      };
    });
  });

  protected markGlyph(m: 'last' | 'high' | 'low' | 'ref'): string {
    return { last: '•', high: 'H', low: 'L', ref: 'R' }[m];
  }
}
