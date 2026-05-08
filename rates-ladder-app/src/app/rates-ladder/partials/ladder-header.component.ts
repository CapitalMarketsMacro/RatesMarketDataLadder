import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { fmtPx } from '../rates-ladder.utils';
import type { MarketData } from '../rates-ladder.types';
import { SparklineComponent } from './sparkline.component';

/** Header KPI strip — README §5.6, ported from Ladder.jsx → HeaderStrip. */
@Component({
  selector: 'ladder-header',
  imports: [SparklineComponent],
  template: `
    <div class="hdr" [class.dense]="dense()">
      <div class="row1">
        <div class="left">
          <span class="tag">FUT</span>
          <span class="tenor">{{ instrumentLabel() }}</span>
        </div>
        <span class="badge-live"><span class="dot"></span>Live</span>
      </div>

      <div class="row2">
        <span class="num last-px" [class.up]="dirUp()" [class.down]="!dirUp()">
          {{ fmtPx(payload().LastTradePrice) }}
        </span>
        <span class="num muted dec">{{ payload().LastTradePrice.toFixed(5) }}</span>
        <span class="num delta" [class.up]="dirUp()" [class.down]="!dirUp()">
          {{ dirUp() ? '▲' : '▼' }} {{ absChange().toFixed(5) }}
        </span>
        <span class="num delta" [class.up]="dirUp()" [class.down]="!dirUp()">
          {{ dirUp() ? '+' : '−' }}{{ pctChange().toFixed(3) }}%
        </span>
        @if (sparkPts(); as sp) {
          <div class="spark">
            <sparkline [pts]="sp" [width]="84" [height]="22" [stroke]="dirUp() ? 'var(--mkt-up)' : 'var(--mkt-down)'" />
          </div>
        }
      </div>

      <div class="row3">
        <span>HI <span class="num up">{{ fmtPx(payload().HighTradePrice) }}</span></span>
        <span>LO <span class="num down">{{ fmtPx(payload().LowTradePrice) }}</span></span>
        <span>REF <span class="num ref">{{ fmtPx(payload().RefPrice) }}</span></span>
        <span class="dv01">DV01 <span class="num primary">\${{ payload().DV01.toFixed(2) }}</span></span>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; flex: 0 0 auto; }
    .hdr {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border-1);
      background: var(--bg-panel);
      display: flex; flex-direction: column; gap: 6px;
    }
    .hdr.dense { padding: 8px 10px; }

    .row1 { display: flex; align-items: center; justify-content: space-between; }
    .left { display: flex; align-items: center; gap: 8px; }
    .tag {
      display: inline-flex; align-items: center;
      padding: 1px 6px; border-radius: 3px;
      font-family: var(--font-mono); font-size: 10px;
      background: var(--bg-elev); border: 1px solid var(--border-1); color: var(--fg-2);
    }
    .tenor { font-size: 13px; font-weight: 600; color: var(--fg-1); }

    .badge-live {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 2px 8px; border-radius: 999px;
      font-size: 10px; font-weight: 500; letter-spacing: 0.03em;
      background: rgba(63, 185, 80, 0.14); color: var(--mkt-up);
    }
    .badge-live .dot {
      width: 6px; height: 6px; border-radius: 999px; background: currentColor;
    }

    .row2 {
      display: flex; align-items: baseline; gap: 10px;
      flex-wrap: nowrap; white-space: nowrap; overflow: hidden;
    }
    .last-px {
      font-size: 22px; font-weight: 500; letter-spacing: -0.01em;
      white-space: nowrap;
    }
    .dec  { font-size: 11px; }
    .delta { font-size: 11px; }
    .spark { margin-left: auto; }

    .row3 {
      display: flex; gap: 12px;
      font-size: 10px; color: var(--fg-3);
    }
    .ref { color: var(--fg-2); }
    .primary { color: var(--fg-1); }
    .dv01 { margin-left: auto; }

    .num { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
    .muted { color: var(--fg-3); }
    .up { color: var(--mkt-up); }
    .down { color: var(--mkt-down); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LadderHeaderComponent {
  payload         = input.required<MarketData>();
  sparkPts        = input<number[] | null>(null);
  dense           = input(false);
  instrumentLabel = input('TY · UST 10Y FUT · DEC26');

  protected readonly fmtPx = fmtPx;

  dirUp = computed(() => this.payload().LastTradePrice - this.payload().RefPrice >= 0);
  absChange = computed(() => Math.abs(this.payload().LastTradePrice - this.payload().RefPrice));
  pctChange = computed(() => Math.abs((this.payload().LastTradePrice - this.payload().RefPrice) / this.payload().RefPrice * 100));
}
