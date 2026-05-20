import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { Client, type Message } from 'amps';
import type { MarketData, VapPrint } from './rates-ladder.types';

export interface AmpsConnectOptions {
  url: string;
  marketDataTopic: string;
  vapTopic: string;
  marketId?: number;
  clientName?: string;
}

type ConnState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * Thin Angular wrapper around the 60East AMPS JS client.
 * Subscribes to two SOW topics declared in the AMPS instance config:
 *   - rates_market_data  (keys: /Id, /MarketId)  → MarketData snapshots
 *   - rates_vap          (keys: /Id, /ECN, /TradePrice) → VapPrint rows
 */
@Injectable({ providedIn: 'root' })
export class AmpsService {
  readonly marketData$ = new Subject<MarketData>();
  readonly vapPrint$   = new Subject<VapPrint>();

  readonly state     = signal<ConnState>('idle');
  readonly lastError = signal<string | null>(null);
  readonly connected = signal(false);
  readonly stats     = signal<{ mdMsgs: number; vapMsgs: number }>({ mdMsgs: 0, vapMsgs: 0 });

  private client: Client | null = null;
  private subIds: string[] = [];

  async connect(opts: AmpsConnectOptions): Promise<void> {
    await this.disconnect();
    this.state.set('connecting');
    this.lastError.set(null);

    const client = new Client(opts.clientName ?? 'rates-ladder-web');
    client.errorHandler((err) => {
      this.lastError.set(err?.message ?? String(err));
      console.warn('[AMPS] error:', err);
    });
    client.disconnectHandler(() => {
      this.connected.set(false);
      this.state.set('disconnected');
    });
    this.client = client;

    try {
      await client.connect(opts.url);
      this.connected.set(true);
      this.state.set('connected');

      const mdFilter = opts.marketId != null ? `/MarketId = ${opts.marketId}` : '';
      const mdSubId = await client.sowAndSubscribe(
        (m: Message) => this.handleMarketData(m),
        opts.marketDataTopic,
        mdFilter,
      );
      this.subIds.push(mdSubId);

      const vapSubId = await client.sowAndSubscribe(
        (m: Message) => this.handleVap(m),
        opts.vapTopic,
        '',
      );
      this.subIds.push(vapSubId);
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? String(err);
      this.lastError.set(msg);
      this.state.set('error');
      this.connected.set(false);
      console.error('[AMPS] connect failed:', err);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.client) return;
    try { await this.client.disconnect(); } catch { /* ignore */ }
    this.client = null;
    this.subIds = [];
    this.connected.set(false);
    this.state.set('disconnected');
  }

  private handleMarketData(m: Message): void {
    const data = m?.data;
    if (this.looksLikeMarketData(data)) {
      this.stats.update(s => ({ ...s, mdMsgs: s.mdMsgs + 1 }));
      this.marketData$.next(data);
    }
  }

  private handleVap(m: Message): void {
    const data = m?.data;
    if (this.looksLikeVapPrint(data)) {
      this.stats.update(s => ({ ...s, vapMsgs: s.vapMsgs + 1 }));
      this.vapPrint$.next(data);
    }
  }

  private looksLikeMarketData(d: unknown): d is MarketData {
    const o = d as Partial<MarketData> | null;
    return !!o && typeof o === 'object' && Array.isArray(o.Bid) && Array.isArray(o.Ask);
  }

  private looksLikeVapPrint(d: unknown): d is VapPrint {
    const o = d as Partial<VapPrint> | null;
    return !!o && typeof o === 'object'
      && typeof o.TradePrice === 'number'
      && typeof o.TradeSize === 'number';
  }
}
