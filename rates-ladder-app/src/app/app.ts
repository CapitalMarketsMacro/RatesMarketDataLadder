import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RatesLadderComponent } from './rates-ladder/rates-ladder.component';
import { MarketDataService, type DataSource } from './rates-ladder/market-data.service';
import { AmpsService } from './rates-ladder/amps.service';
import { ProductService } from './rates-ladder/product.service';
import { environment } from '../environments/environment';

/** Demo shell — README §6. Mounts the three ladder variants side by side. */
@Component({
  selector: 'app-root',
  imports: [RatesLadderComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly mds      = inject(MarketDataService);
  protected readonly amps   = inject(AmpsService);
  protected readonly prod   = inject(ProductService);

  protected readonly ticking    = signal(true);
  protected readonly showVAP    = signal(false);
  protected readonly theme      = signal<'dark' | 'light'>('dark');
  protected readonly dataSource = signal<DataSource>('amps');
  protected readonly productFilter = signal('');

  protected readonly ampsUrl = environment.amps.url;

  protected readonly stdWidth = computed(() => this.showVAP() ? 580 : 360);
  protected readonly proWidth = computed(() => this.showVAP() ? 640 : 420);
  protected readonly anaWidth = computed(() => this.showVAP() ? 740 : 520);

  /** Products filtered by the picker search box (matches Desc / LongDesc / Alias). */
  protected readonly filteredProducts = computed(() => {
    const q = this.productFilter().trim().toLowerCase();
    const all = this.prod.products();
    if (!q) return all;
    return all.filter(p =>
      p.Desc.toLowerCase().includes(q)
      || p.LongDesc.toLowerCase().includes(q)
      || (p.Alias?.toLowerCase().includes(q) ?? false),
    );
  });

  protected readonly ampsBadge = computed(() => {
    const state = this.amps.state();
    const stats = this.amps.stats();
    switch (state) {
      case 'connecting': return 'AMPS: connecting…';
      case 'connected':  return `AMPS: live (${stats.products} prod / ${stats.mdMsgs} MD / ${stats.vapMsgs} VAP)`;
      case 'disconnected': return 'AMPS: disconnected';
      case 'error':      return `AMPS: error — ${this.amps.lastError() ?? 'unknown'}`;
      default:           return 'AMPS: idle';
    }
  });

  constructor() {
    // Apply data-source switches.
    effect(() => {
      const src = this.dataSource();
      if (src === 'amps') {
        this.prod.attach();
        this.mds.useAmps({
          url: environment.amps.url,
          productsTopic: environment.amps.productsTopic,
          marketDataTopic: environment.amps.marketDataTopic,
          vapTopic: environment.amps.vapTopic,
          clientName: environment.amps.clientName,
        });
      } else {
        this.prod.detach();
        this.prod.reset();
        this.mds.useSimulator();
      }
    });

    // When the picked product changes, drop the old MD/VAP subs and place
    // new ones on /Id = <selected>. The book/vap buffers are wiped first
    // so the next snapshot doesn't flash stale levels.
    effect(() => {
      const id = this.prod.selectedId();
      if (id != null && this.dataSource() === 'amps') {
        this.mds.resetForProductSwap();
        this.amps.setProduct(id);
      }
    });
  }

  protected toggleTicking(ev: Event) { this.ticking.set((ev.target as HTMLInputElement).checked); }
  protected toggleVAP(ev: Event)     { this.showVAP.set((ev.target as HTMLInputElement).checked); }
  protected setTheme(ev: Event)      { this.theme.set((ev.target as HTMLSelectElement).value as 'dark' | 'light'); }
  protected setDataSource(ev: Event) { this.dataSource.set((ev.target as HTMLSelectElement).value as DataSource); }

  protected onProductFilter(ev: Event) { this.productFilter.set((ev.target as HTMLInputElement).value); }

  protected onProductInput(ev: Event) {
    const v = (ev.target as HTMLInputElement).value;
    this.productFilter.set(v);
    // datalist `change` fires for both typing and selection; promote a match
    // whose Desc equals the typed value to a selection.
    const hit = this.prod.products().find(p => p.Desc.toLowerCase() === v.trim().toLowerCase());
    if (hit) this.prod.select(hit.Id);
  }

  protected pickProduct(id: number) {
    this.prod.select(id);
    const p = this.prod.selected();
    this.productFilter.set(p?.Desc ?? '');
  }
}
