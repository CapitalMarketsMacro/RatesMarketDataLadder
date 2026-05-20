/**
 * AMPS connection settings — config sourced from
 *   http://montyubuntu2604.localdomain:8085/amps/instance/config.xml
 *
 *   <Transport>any-ws / tcp / 9008 / websocket</Transport>
 *   <Topic>rates_market_data</Topic>  // keys: /Id, /MarketId
 *   <Topic>rates_vap</Topic>          // keys: /Id, /ECN, /TradePrice
 */
export const environment = {
  production: false,
  amps: {
    url: 'ws://montyubuntu2604.localdomain:9008/amps/json',
    marketDataTopic: 'rates_market_data',
    vapTopic: 'rates_vap',
    marketId: 35,
    clientName: 'rates-ladder-web',
  },
};
