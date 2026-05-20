import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RatesLadderComponent } from './rates-ladder/rates-ladder.component';
import { MarketDataService, type DataSource } from './rates-ladder/market-data.service';
import { AmpsService } from './rates-ladder/amps.service';
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
  private readonly mds = inject(MarketDataService);
  protected readonly amps = inject(AmpsService);

  protected readonly ticking    = signal(true);
  protected readonly showVAP    = signal(false);
  protected readonly theme      = signal<'dark' | 'light'>('dark');
  protected readonly dataSource = signal<DataSource>('amps');
  protected readonly marketId   = signal(environment.amps.marketId);

  protected readonly ampsUrl = environment.amps.url;

  protected readonly stdWidth = computed(() => this.showVAP() ? 580 : 360);
  protected readonly proWidth = computed(() => this.showVAP() ? 640 : 420);
  protected readonly anaWidth = computed(() => this.showVAP() ? 740 : 520);

  protected readonly ampsBadge = computed(() => {
    const state = this.amps.state();
    const stats = this.amps.stats();
    switch (state) {
      case 'connecting': return 'AMPS: connecting…';
      case 'connected':  return `AMPS: live (${stats.mdMsgs} MD / ${stats.vapMsgs} VAP)`;
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
        this.mds.useAmps({
          url: environment.amps.url,
          marketDataTopic: environment.amps.marketDataTopic,
          vapTopic: environment.amps.vapTopic,
          marketId: this.marketId(),
          clientName: environment.amps.clientName,
        });
      } else {
        this.mds.useSimulator();
      }
    });
  }

  protected toggleTicking(ev: Event) { this.ticking.set((ev.target as HTMLInputElement).checked); }
  protected toggleVAP(ev: Event)     { this.showVAP.set((ev.target as HTMLInputElement).checked); }
  protected setTheme(ev: Event)      { this.theme.set((ev.target as HTMLSelectElement).value as 'dark' | 'light'); }
  protected setDataSource(ev: Event) { this.dataSource.set((ev.target as HTMLSelectElement).value as DataSource); }
}
