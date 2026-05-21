/* Domain types — README §3 */

export interface BookLevel {
  Price: number;
  Qty: number;
  Source?: number[];
  Status?: number;
}

export interface MarketData {
  Id: number;
  MarketId: number;
  UnderlyingMarketId: number;
  DV01: number;
  Time: number;
  LastTradePrice: number;
  LastTradeSize: number;
  LastTradeSource: number;
  LastTradeTime: number;
  LastTradeSide: 'BUY' | 'SELL';
  HighTradePrice: number;
  LowTradePrice: number;
  RefPrice: number;
  RevisionId: number;
  RevisionTime: number;
  BidSubTickQuantity: number;
  AskSubTickQuantity: number;
  BidPricesUsed: number;
  BidYield: number;
  Bid: BookLevel[];
  AskPricesUsed: number;
  AskYield: number;
  Ask: BookLevel[];
  ProductGroup: number;
}

export interface VapPrint {
  Id: number;
  ECN: number;
  TradeTime: number;
  TradePrice: number;
  TradeSize: number;
  RecordId: number;
  MarketAskVol: number;
  MarketBidVolume: number;
  MarketOtherVolume: number;
  ProductGroup: number;
}

export interface VapEntry {
  total: number;
  buy: number;
  sell: number;
  other: number;
  time: string;
}

export interface WorkingOrder {
  side: 'BUY' | 'SELL';
  price: number;
  qty: number;
  status: 'working' | 'cancelled' | 'filled';
}

export type LadderVariant = 'standard' | 'pro' | 'analytics';

export interface LadderRow {
  price: number;
  bidQty: number | null;
  askQty: number | null;
  sources: number[];
  isBestBid: boolean;
  isBestAsk: boolean;
  isLast: boolean;
  isHigh: boolean;
  isLow: boolean;
  isRefBand: boolean;
}

export interface BuiltRows {
  rows: LadderRow[];
  maxQty: number;
}

export interface LastTradeEvent {
  price: number;
  side: 'BUY' | 'SELL';
  size: number;
  time: number;
}

/** Per-ECN trading info embedded in a Product — mirrors AMPS Product schema. */
export interface ECNInfo {
  ECN: number;
  ECNProductId: string;
  MinInc: number;
  MinQty: number;
}

/** Product reference data — schema from AMPS `products` topic (~/Product.json).
 *  Keyed on /Id. On-the-run filter is /IsOTR. */
export interface Product {
  Id: number;
  Desc: string;
  LongDesc: string;
  AssetType: number;
  AssetSubType: number;
  StrategyType: number;
  PriceType: number;
  Coupon: number;
  Currency: number;
  Notional: number;
  MaturityDate: number;
  Tenor: number;
  previousClosePrice: number;
  TickSize: number;
  MinQty: number;
  isTradable: boolean;
  contractSequence: number;
  IsOTR: boolean;
  IsWI: boolean;
  AuctionDate: number;
  IssueDate: number;
  ReissueDate: number;
  IsRI: boolean;
  TenorId: number;
  Alias: string;
  AliasType: number;
  ECNInfoList: ECNInfo[];
  Liquidity: number;
  Active: boolean;
  ProductGroup: number;
  ReplacedEntry: boolean;
  SortKey: string;
}
