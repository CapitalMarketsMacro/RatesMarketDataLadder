import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Depth bar — proportional fill, anchored left (ask) or right (bid).
 *  Ported from design_reference/Ladder.jsx → DepthBar. */
@Component({
  selector: 'depth-bar',
  template: `
    @if (qty() != null) {
      <div
        class="bar"
        [class.bid]="side() === 'bid'"
        [class.ask]="side() === 'ask'"
        [style.width.%]="pct()"></div>
    }
  `,
  styles: [`
    :host { display: contents; }
    .bar {
      position: absolute;
      top: 0; bottom: 0;
      pointer-events: none;
    }
    .bar.bid { right: 0; background: var(--bid-bg); }
    .bar.ask { left:  0; background: var(--ask-bg); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DepthBarComponent {
  qty  = input<number | null>(null);
  max  = input(1);
  side = input<'bid' | 'ask'>('bid');

  pct = computed(() => {
    const q = this.qty();
    if (q == null) return 0;
    const max = this.max() || 1;
    return Math.min(1, q / max) * 100;
  });
}
