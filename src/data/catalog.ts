// Live-ops catalog for the synthetic scenario. The event format and the offer prices follow what
// Pokémon GO publishes for Community Day (a monthly three-hour event, a paid Special Research
// ticket, a Web Store box, PokéCoin packs); every player, order and payment record is generated.
export const EVENTS=[
 {event_id:'cd_01',name:'Community Day 1',starts_at:'2026-01-17T14:00:00Z',ends_at:'2026-01-17T17:00:00Z'},
 {event_id:'cd_02',name:'Community Day 2',starts_at:'2026-02-14T14:00:00Z',ends_at:'2026-02-14T17:00:00Z'},
 {event_id:'cd_03',name:'Community Day 3',starts_at:'2026-03-14T14:00:00Z',ends_at:'2026-03-14T17:00:00Z'},
 {event_id:'cd_04',name:'Community Day 4',starts_at:'2026-04-18T14:00:00Z',ends_at:'2026-04-18T17:00:00Z'}
];
export const COIN_PACKS=[
 {sku:'coins_550',coins:550,price_usd:4.99,weight:0.40},
 {sku:'coins_1200',coins:1200,price_usd:9.99,weight:0.28},
 {sku:'coins_2500',coins:2500,price_usd:19.99,weight:0.18},
 {sku:'coins_5200',coins:5200,price_usd:39.99,weight:0.10},
 {sku:'coins_14500',coins:14500,price_usd:99.99,weight:0.04}
];
const ALL='app_store,google_play,web_store';
// Community Day 4 raises the ticket from US$1.99 to US$4.99 and drops the ticket from the Web Store box.
export const OFFERS=EVENTS.flatMap(e=>{
 const late=e.event_id==='cd_04';
 return [
  {event_id:e.event_id,sku:'cd_ticket',name:'Community Day Special Research ticket',kind:'ticket',price_usd:late?4.99:1.99,channels:ALL,contents:'Event-exclusive Special Research'},
  {event_id:e.event_id,sku:'cd_box_web',name:'Community Day Box',kind:'box',price_usd:4.99,channels:'web_store',contents:late?'3 Rare Candy, 1 Super Incubator':'Special Research ticket, 3 Rare Candy'},
  ...COIN_PACKS.map(p=>({event_id:e.event_id,sku:p.sku,name:`${p.coins.toLocaleString('en-US')} PokéCoins`,kind:'coins',price_usd:p.price_usd,channels:ALL,contents:`${p.coins} PokéCoins`}))
 ];
});
export const RELEASES=[
 {version:'0.391.0',platform:'android',released_at:'2026-01-06T18:00:00Z',notes:'Season update'},
 {version:'0.391.0',platform:'ios',released_at:'2026-01-06T18:00:00Z',notes:'Season update'},
 {version:'0.393.1',platform:'android',released_at:'2026-02-12T18:00:00Z',notes:'Checkout screen refresh; Google Play Billing Library upgrade'},
 {version:'0.393.1',platform:'ios',released_at:'2026-02-12T18:00:00Z',notes:'Checkout screen refresh'},
 {version:'0.393.2',platform:'android',released_at:'2026-02-24T18:00:00Z',notes:'Fixes purchases failing on some Android devices'},
 {version:'0.395.0',platform:'android',released_at:'2026-03-09T18:00:00Z',notes:'Season update'},
 {version:'0.395.0',platform:'ios',released_at:'2026-03-09T18:00:00Z',notes:'Season update'},
 {version:'0.397.0',platform:'android',released_at:'2026-04-06T18:00:00Z',notes:'Season update'},
 {version:'0.397.0',platform:'ios',released_at:'2026-04-06T18:00:00Z',notes:'Season update'}
];
