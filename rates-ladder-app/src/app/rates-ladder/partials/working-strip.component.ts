import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { WorkingOrder } from '../rates-ladder.types';
import { fmtPx } from '../rates-ladder.utils';

/** Working-orders strip — pro variant only. README §5; ported from Ladder.jsx → WorkingStrip. */
@Component({
  selector: 'working-strip',
  template: `
    @if (orders().length === 0) {
      <div class="empty">No working orders. Click a price level to place one.</div>
    } @else {
      <div class="strip">
        <div class="hdr-label">WORKING · {{ orders().length }}</div>
        @for (o of orders(); track $index) {
          <div class="row">
            <span class="side" [class.bid]="o.side === 'BUY'" [class.ask]="o.side === 'SELL'">{{ o.side }}</span>
            <span class="num">{{ o.qty }} &#64; {{ fmtPx(o.price) }}</span>
            <span class="badge"><span class="dot"></span>{{ o.status }}</span>
            <button class="cxl"
                    title="Cancel"
                    (click)="cancel.emit($index)">✕</button>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    :host { display: block; flex: 0 0 auto; }
    .empty {
      font-size: 10px; padding: 6px 10px;
      color: var(--fg-3);
      border-top: 1px solid var(--border-1);
      background: var(--bg-canvas);
    }
    .strip {
      border-top: 1px solid var(--border-1);
      background: var(--bg-canvas);
      padding: 6px 8px;
      display: flex; flex-direction: column; gap: 4px;
      max-height: 96px; overflow: auto;
    }
    .hdr-label {
      font-size: 10px; font-weight: 500; letter-spacing: 0.06em;
      text-transform: uppercase; color: var(--fg-3);
    }
    .row {
      display: grid; grid-template-columns: 44px 1fr auto 20px;
      align-items: center; gap: 6px;
      font-size: 11px; font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
      padding: 2px 4px; border-radius: 3px;
      background: var(--bg-raised);
      border: 1px solid var(--border-1);
    }
    .side { font-size: 9px; font-weight: 700; letter-spacing: 0.04em; }
    .side.bid { color: var(--bid); }
    .side.ask { color: var(--ask); }

    .num { color: var(--fg-1); }

    .badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 2px 8px; border-radius: 999px;
      font-size: 10px; font-family: var(--font-sans); font-weight: 500;
      background: rgba(63, 185, 80, 0.14);
      color: var(--mkt-up);
    }
    .badge .dot { width: 6px; height: 6px; border-radius: 999px; background: currentColor; }

    .cxl {
      padding: 1px 4px;
      background: transparent;
      border: 1px solid var(--border-2);
      border-radius: 3px;
      color: var(--fg-2);
      font-size: 10px;
      cursor: pointer;
    }
    .cxl:hover { background: var(--bg-elev); color: var(--fg-1); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkingStripComponent {
  orders = input<WorkingOrder[]>([]);
  cancel = output<number>();

  protected readonly fmtPx = fmtPx;
}
