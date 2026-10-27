// Live-ops catalog for the synthetic scenario. The event format and the offer prices follow what
// Pokémon GO publishes for Community Day (a monthly three-hour event, a paid Special Research
// ticket, a Web Store box, PokéCoin packs); every player, order and payment record is generated,
// and the build numbers and release notes are invented.
export const EVENTS=[
 {event_id:'cd_01',name:'Community Day 1',starts_at:'2026-01-17T14:00:00Z',ends_at:'2026-01-17T17:00:00Z'},
 {event_id:'cd_02',name:'Community Day 2',starts_at:'2026-02-14T14:00:00Z',ends_at:'2026-02-14T17:00:00Z'},
 {event_id:'cd_03',name:'Community Day 3',starts_at:'2026-03-14T14:00:00Z',ends_at:'2026-03-14T17:00:00Z'},
 {event_id:'cd_04',name:'Community Day 4',starts_at:'2026-04-18T14:00:00Z',ends_at:'2026-04-18T17:00:00Z'},
 {event_id:'cd_05',name:'Community Day 5',starts_at:'2026-05-16T14:00:00Z',ends_at:'2026-05-16T17:00:00Z'}
];
export const COIN_PACKS=[
 {sku:'coins_100',coins:100,price_usd:0.99},
 {sku:'coins_550',coins:550,price_usd:4.99},
 {sku:'coins_1200',coins:1200,price_usd:9.99},
 {sku:'coins_2500',coins:2500,price_usd:19.99},
 {sku:'coins_5200',coins:5200,price_usd:39.99},
 {sku:'coins_14500',coins:14500,price_usd:99.99}
];
const ALL='app_store,google_play,web_store';
// Offer history: Community Day 2 adds an Incubator to the box (a change that does not hurt sales);
// from Community Day 4 the ticket costs US$4.99 and the box no longer contains the ticket.
const BOX:Record<string,string>={cd_01:'Special Research ticket, 3 Rare Candy',cd_02:'Special Research ticket, 3 Rare Candy, 1 Incubator',cd_03:'Special Research ticket, 3 Rare Candy, 1 Incubator',
 cd_04:'3 Rare Candy, 1 Incubator',cd_05:'3 Rare Candy, 1 Incubator'};
export const OFFERS=EVENTS.flatMap(e=>{
 const late=e.event_id==='cd_04'||e.event_id==='cd_05';
 return [
  {event_id:e.event_id,sku:'cd_ticket',name:'Community Day Special Research ticket',kind:'ticket',price_usd:late?4.99:1.99,channels:ALL,contents:'Event-exclusive Special Research'},
  {event_id:e.event_id,sku:'cd_box_web',name:'Community Day Box',kind:'box',price_usd:4.99,channels:'web_store',contents:BOX[e.event_id]},
  ...COIN_PACKS.map(p=>({event_id:e.event_id,sku:p.sku,name:`${p.coins.toLocaleString('en-US')} PokéCoins`,kind:'coins',price_usd:p.price_usd,channels:ALL,contents:`${p.coins} PokéCoins`}))
 ];
});
// 0.393.1 rolls out to Android in stages; the season updates are unrelated to purchases.
export const RELEASES=[
 {version:'0.391.0',platform:'android',released_at:'2026-01-06T18:00:00Z',notes:'Season update'},
 {version:'0.391.0',platform:'ios',released_at:'2026-01-06T18:00:00Z',notes:'Season update'},
 {version:'0.393.1',platform:'android',released_at:'2026-02-12T18:00:00Z',notes:'Checkout screen refresh; Google Play Billing Library upgrade; staged rollout'},
 {version:'0.393.1',platform:'ios',released_at:'2026-02-12T18:00:00Z',notes:'Checkout screen refresh'},
 {version:'0.393.2',platform:'android',released_at:'2026-02-24T18:00:00Z',notes:'Fixes purchases failing on some Android devices'},
 {version:'0.395.0',platform:'android',released_at:'2026-03-09T18:00:00Z',notes:'Season update'},
 {version:'0.395.0',platform:'ios',released_at:'2026-03-09T18:00:00Z',notes:'Season update'},
 {version:'0.397.0',platform:'android',released_at:'2026-04-06T18:00:00Z',notes:'Season update'},
 {version:'0.397.0',platform:'ios',released_at:'2026-04-06T18:00:00Z',notes:'Season update'},
 {version:'0.399.0',platform:'android',released_at:'2026-05-11T18:00:00Z',notes:'Season update; new map style'},
 {version:'0.399.0',platform:'ios',released_at:'2026-05-11T18:00:00Z',notes:'Season update; new map style'}
];
