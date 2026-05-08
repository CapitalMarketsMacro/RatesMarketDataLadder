import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Tiny inline SVG sparkline. Ported from design_reference/Ladder.jsx → Sparkline. */
@Component({
  selector: 'sparkline',
  template: `
    @if (pts().length > 1) {
      <svg [attr.width]="width()" [attr.height]="height()" style="display:block">
        <path
          [attr.d]="path()"
          fill="none"
          [attr.stroke]="stroke()"
          stroke-width="1"
          vector-effect="non-scaling-stroke" />
      </svg>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SparklineComponent {
  pts    = input<number[]>([]);
  width  = input(120);
  height = input(28);
  stroke = input('var(--brand)');

  path = computed(() => {
    const arr = this.pts();
    if (arr.length < 2) return '';
    let min = Infinity, max = -Infinity;
    for (const p of arr) { if (p < min) min = p; if (p > max) max = p; }
    const range = max - min || 1;
    const w = this.width();
    const h = this.height();
    const dx = w / (arr.length - 1);
    let d = '';
    for (let i = 0; i < arr.length; i++) {
      const x = i * dx;
      const y = h - ((arr[i] - min) / range) * (h - 2) - 1;
      d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)} `;
    }
    return d.trim();
  });
}
