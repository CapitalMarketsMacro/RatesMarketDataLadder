import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { MarketData } from '../rates-ladder.types';
import { fmtPx } from '../rates-ladder.utils';

/** Footer — size pills + Buy/CXL/Sell. README §5.7. Ported from Ladder.jsx → Footer. */
@Component({
  selector: 'ladder-footer',
  template: `
    <div class="footer">
      <div class="size-row">
        <span class="label-mini">SIZE</span>
        @for (s of sizes; track s) {
          <button class="pill"
                  [class.active]="size() === s"
                  (click)="sizeChange.emit(s)">{{ s }}</button>
        }
        <input class="num size-input"
               type="number"
               [value]="size()"
               (input)="onSizeInput($event)" />
      </div>
      <div class="action-row">
        <button class="action buy"
                (click)="submitBuy.emit()">
          Buy {{ fmtPx(askBest()) }}
        </button>
        <button class="action cxl"
                title="Cancel all working orders"
                (click)="cancelAll.emit()">
          ✕ CXL
        </button>
        <button class="action sell"
                (click)="submitSell.emit()">
          Sell {{ fmtPx(bidBest()) }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; flex: 0 0 auto; }
    .footer {
      border-top: 1px solid var(--border-1);
      background: var(--bg-panel);
      padding: 8px;
      display: flex; flex-direction: column; gap: 6px;
    }

    .size-row { display: flex; gap: 4px; align-items: center; }
    .label-mini {
      font-size: 10px; font-weight: 500; letter-spacing: 0.06em;
      text-transform: uppercase; color: var(--fg-3);
      margin-right: 4px;
    }
    .pill {
      min-width: 28px; padding: 2px 6px;
      background: transparent; color: var(--fg-2);
      border: 1px solid var(--border-2); border-radius: 3px;
      font-family: var(--font-mono); font-size: 10px;
      cursor: pointer;
      transition: background 120ms ease-out, color 120ms ease-out, border-color 120ms ease-out;
    }
    .pill:hover { background: var(--bg-elev); color: var(--fg-1); }
    .pill.active {
      background: var(--brand-soft);
      color: var(--brand);
      border-color: var(--brand);
    }
    .size-input {
      width: 56px; height: 22px;
      margin-left: 4px;
      background: var(--bg-app);
      border: 1px solid var(--border-2);
      color: var(--fg-1);
      padding: 0 6px;
      border-radius: 3px;
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
      font-size: 11px;
      outline: none;
    }
    .size-input:focus { border-color: var(--brand); box-shadow: 0 0 0 2px var(--brand-soft); }

    .action-row { display: flex; gap: 6px; }
    .action {
      padding: 6px 0;
      font-size: 12px; font-weight: 600;
      border: 1px solid var(--border-2);
      background: transparent;
      color: var(--fg-1);
      border-radius: 3px;
      cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center; gap: 4px;
      transition: background 120ms ease-out;
    }
    .action.buy {
      flex: 1;
      background: var(--btn-bid-bg);
      color: var(--btn-bid-fg);
      border-color: var(--btn-bid-border);
    }
    .action.buy:hover { background: var(--btn-bid-bg-hover); }

    .action.sell {
      flex: 1;
      background: var(--btn-ask-bg);
      color: var(--btn-ask-fg);
      border-color: var(--btn-ask-border);
    }
    .action.sell:hover { background: var(--btn-ask-bg-hover); }

    .action.cxl {
      padding: 6px 8px;
      font-size: 11px;
      color: var(--fg-2);
    }
    .action.cxl:hover { background: var(--bg-elev); color: var(--fg-1); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LadderFooterComponent {
  payload = input.required<MarketData>();
  size    = input(10);

  sizeChange = output<number>();
  submitBuy  = output<void>();
  submitSell = output<void>();
  cancelAll  = output<void>();

  protected readonly sizes = [1, 5, 10, 25, 100] as const;
  protected readonly fmtPx = fmtPx;

  protected askBest(): number { return this.payload().Ask[0]?.Price ?? this.payload().RefPrice; }
  protected bidBest(): number { return this.payload().Bid[0]?.Price ?? this.payload().RefPrice; }

  protected onSizeInput(ev: Event): void {
    const v = Number((ev.target as HTMLInputElement).value);
    this.sizeChange.emit(Number.isFinite(v) && v > 0 ? v : 0);
  }
}
