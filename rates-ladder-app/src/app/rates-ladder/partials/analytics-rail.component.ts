import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { MarketData } from '../rates-ladder.types';
import { fmtBp, fmtPx } from '../rates-ladder.utils';
import { SparklineComponent } from './sparkline.component';

interface KpiTile {
  label: string;
  value: string;
  kind: 'bid' | 'ask' | 'muted' | 'neutral';
}

/** Analytics right-rail — README §5, ported from Ladder.jsx → AnalyticsRail. */
@Component({
  selector: 'analytics-rail',
  imports: [SparklineComponent],
  template: `
    <aside class="rail">
      <div class="title-strip">ANALYTICS</div>
      <div class="body">
        <div class="intraday">
          <div class="kpi-label">INTRADAY</div>
          <div class="spark-wrap">
            <sparkline [pts]="sparkPts()" [width]="132" [height]="36" stroke="var(--brand)" />
          </div>
          <div class="lo-hi">
            <span>{{ fmtPx(payload().LowTradePrice) }}</span>
            <span>{{ fmtPx(payload().HighTradePrice) }}</span>
          </div>
        </div>

        @for (it of tiles(); track it.label) {
          <div class="tile">
            <span class="kpi-label">{{ it.label }}</span>
            <span class="kpi-value num" [attr.data-kind]="it.kind">{{ it.value }}</span>
          </div>
        }
      </div>
    </aside>
  `,
  styles: [`
    :host {
      flex: 0 0 auto;
      display: block;
      width: 156px;
      border-left: 1px solid var(--border-1);
      background: var(--bg-panel);
    }
    .rail { display: flex; flex-direction: column; height: 100%; }

    .title-strip {
      padding: 6px 10px;
      border-bottom: 1px solid var(--border-1);
      font-size: 10px; font-weight: 500; letter-spacing: 0.06em;
      text-transform: uppercase; color: var(--fg-3);
    }
    .body {
      padding: 10px;
      display: flex; flex-direction: column; gap: 8px;
      overflow: auto; min-height: 0;
    }

    .intraday { display: flex; flex-direction: column; gap: 2px; }
    .spark-wrap { margin-top: 4px; }
    .lo-hi {
      display: flex; justify-content: space-between;
      font-size: 10px; color: var(--fg-3);
      font-family: var(--font-mono); font-variant-numeric: tabular-nums;
      margin-top: 2px;
    }

    .kpi-label {
      font-size: 10px; font-weight: 500; letter-spacing: 0.06em;
      text-transform: uppercase; color: var(--fg-3);
    }
    .tile { display: flex; flex-direction: column; gap: 1px; }
    .kpi-value {
      font-size: 12px; font-weight: 500; color: var(--fg-1);
    }
    .kpi-value[data-kind="bid"]   { color: var(--bid); }
    .kpi-value[data-kind="ask"]   { color: var(--ask); }
    .kpi-value[data-kind="muted"] { color: var(--fg-3); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsRailComponent {
  payload  = input.required<MarketData>();
  sparkPts = input<number[]>([]);

  protected readonly fmtPx = fmtPx;

  tiles = computed<KpiTile[]>(() => {
    const p = this.payload();
    return [
      { label: 'DV01',      value: '$' + p.DV01.toFixed(2),                       kind: 'neutral' },
      { label: 'BID YIELD', value: fmtBp(p.BidYield) + ' bps',                    kind: 'bid' },
      { label: 'ASK YIELD', value: fmtBp(p.AskYield) + ' bps',                    kind: 'ask' },
      { label: 'REF',       value: fmtPx(p.RefPrice),                             kind: 'neutral' },
      { label: 'MKT ID',    value: String(p.MarketId),                            kind: 'muted' },
      { label: 'REV',       value: String(p.RevisionId),                          kind: 'muted' },
      { label: 'PRICES',    value: `${p.BidPricesUsed} × ${p.AskPricesUsed}`,     kind: 'muted' },
      { label: 'GROUP',     value: String(p.ProductGroup),                        kind: 'muted' },
    ];
  });
}
