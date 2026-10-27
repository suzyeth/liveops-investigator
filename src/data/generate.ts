import {EVENTS,OFFERS,COIN_PACKS,RELEASES} from './catalog.ts';
// Deterministic generator for the three synthetic data sources. Same seed, same rows.
// The behaviour model is written out here so every effect in the data can be traced to a line.

function rng(seed:number){ // mulberry32
 return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
}
type Weighted<T>=[T,number][];
const pick=<T,>(r:()=>number,items:Weighted<T>)=>{let x=r()*items.reduce((s,[,w])=>s+w,0);for(const [v,w] of items){if((x-=w)<0)return v;}return items[items.length-1][0];};

const POOL=95000;
const COUNTRIES:Weighted<string>=[['US',34],['JP',12],['BR',8],['GB',7],['DE',7],['MX',5],['FR',5],['KR',4],['CA',4],['AU',3],['IT',3],['ES',3],['TW',2],['PH',3]];
const PARTICIPANTS:Record<string,number>={cd_01:42000,cd_02:55000,cd_03:47000,cd_04:57000};
// Share of active / returning (lapsed 30+ days) / new players among each event's participants.
const MIX:Record<string,Weighted<string>>={cd_01:[['active',74],['returning',16],['new',10]],cd_02:[['active',62],['returning',28],['new',10]],cd_03:[['active',72],['returning',17],['new',11]],cd_04:[['active',64],['returning',26],['new',10]]};
const VERSIONS:Record<string,Record<string,Weighted<string>>>={
 cd_01:{android:[['0.391.0',90],['0.389.1',10]],ios:[['0.391.0',88],['0.389.1',12]]},
 cd_02:{android:[['0.393.1',82],['0.391.0',18]],ios:[['0.393.1',78],['0.391.0',22]]},
 cd_03:{android:[['0.395.0',85],['0.393.2',15]],ios:[['0.395.0',83],['0.393.1',17]]},
 cd_04:{android:[['0.397.0',88],['0.395.0',12]],ios:[['0.397.0',86],['0.395.0',14]]}
};
// Purchase propensity per event participant, by segment.
const P_TICKET:Record<string,number>={active:0.26,returning:0.14,new:0.07};
const P_BOX:Record<string,number>={active:0.30,returning:0.15,new:0.05}; // Web Store users only
const P_COINS:Record<string,number>={active:0.035,returning:0.02,new:0.012};
// Community Day 4: ticket price US$1.99 → US$4.99; the box no longer contains the ticket.
const TICKET_FACTOR:Record<string,number>={cd_04:0.2};
const BOX_FACTOR:Record<string,number>={cd_04:0.30};
// Payment outcome by provider. The Android 0.393.1 build breaks Google Play Billing for most attempts.
const SUCCESS:Record<string,number>={google_play:0.93,app_store:0.945,web_store:0.955};
const BROKEN_SUCCESS=0.22;
const FAIL_CODES:Record<string,Weighted<string>>={
 google_play:[['USER_CANCELED',60],['NETWORK_ERROR',15],['SERVICE_UNAVAILABLE',10],['ERROR',10],['ITEM_UNAVAILABLE',5]],
 google_play_broken:[['BILLING_UNAVAILABLE',55],['SERVICE_UNAVAILABLE',20],['USER_CANCELED',15],['ERROR',10]],
 app_store:[['SKErrorPaymentCancelled',70],['SKErrorCloudServiceNetworkConnectionFailed',20],['SKErrorUnknown',10]],
 web_store:[['card_declined',45],['authentication_required',25],['expired_card',20],['processing_error',10]]
};
const CANCEL=new Set(['USER_CANCELED','SKErrorPaymentCancelled']);
const RETRY=0.4;

export function generate(seed=20260417){
 const r=rng(seed);
 const players=Array.from({length:POOL},(_,i)=>{
  const country=pick(r,COUNTRIES),platform=r()<0.58?'android':'ios';
  const day=Math.floor(r()*900);
  return {player_id:`p${String(i+1).padStart(6,'0')}`,platform,country,first_seen:new Date(Date.UTC(2023,6,1)+day*864e5).toISOString().slice(0,10),web_store_user:r()<(['US','GB','CA','AU'].includes(country)?0.2:0.08)};
 });
 const participation:any[]=[],orders:any[]=[],attempts:any[]=[];
 let orderSeq=0,attemptSeq=0;
 for(const e of EVENTS){
  const offers=OFFERS.filter(o=>o.event_id===e.event_id),price=(sku:string)=>offers.find(o=>o.sku===sku)!.price_usd;
  const start=Date.parse(e.starts_at)-24*36e5,span=Date.parse(e.ends_at)-start;
  // Partial Fisher-Yates: a distinct random set of participants for this event.
  const ids=players.map((_,i)=>i);
  for(let i=0;i<PARTICIPANTS[e.event_id];i++){const j=i+Math.floor(r()*(ids.length-i));[ids[i],ids[j]]=[ids[j],ids[i]];}
  for(const idx of ids.slice(0,PARTICIPANTS[e.event_id])){
   const p=players[idx],segment=pick(r,MIX[e.event_id]),app_version=pick(r,VERSIONS[e.event_id][p.platform]);
   participation.push({event_id:e.event_id,player_id:p.player_id,platform:p.platform,app_version,segment,sessions:1+Math.floor(r()*(segment==='active'?6:3)),minutes_played:Math.round(25+r()*(segment==='active'?160:90))});
   const store=p.platform==='android'?'google_play':'app_store';
   const wants:{sku:string,channel:string}[]=[];
   const boxed=p.web_store_user&&r()<P_BOX[segment]*(BOX_FACTOR[e.event_id]??1);
   if(boxed)wants.push({sku:'cd_box_web',channel:'web_store'});
   // The box used to include the ticket, so box buyers did not also buy a ticket.
   const boxHasTicket=e.event_id!=='cd_04';
   if(!(boxed&&boxHasTicket)&&r()<P_TICKET[segment]*(TICKET_FACTOR[e.event_id]??1))wants.push({sku:'cd_ticket',channel:p.web_store_user&&r()<0.4?'web_store':store});
   if(r()<P_COINS[segment])wants.push({sku:pick(r,COIN_PACKS.map(c=>[c.sku,c.weight] as [string,number])),channel:p.web_store_user&&r()<0.4?'web_store':store});
   for(const w of wants){
    const order_id=`o${String(++orderSeq).padStart(7,'0')}`,created=start+r()*span;
    const broken=w.channel==='google_play'&&app_version==='0.393.1';
    let ok=false,lastCode='';
    for(let n=0;n<2&&!ok;n++){
     if(n===1&&(CANCEL.has(lastCode)||r()>RETRY))break;
     ok=r()<(broken?BROKEN_SUCCESS:SUCCESS[w.channel]);
     lastCode=ok?'OK':pick(r,FAIL_CODES[broken?'google_play_broken':w.channel]);
     attempts.push({attempt_id:`a${String(++attemptSeq).padStart(7,'0')}`,order_id,provider:w.channel,response_code:lastCode,
      latency_ms:Math.round((broken&&!ok?2400:850)*(0.6+r()*0.9)),attempted_at:new Date(created+n*45e3).toISOString()});
    }
    orders.push({order_id,event_id:e.event_id,player_id:p.player_id,sku:w.sku,channel:w.channel,price_usd:price(w.sku),
     status:ok?'completed':CANCEL.has(lastCode)?'canceled':'failed',created_at:new Date(created).toISOString()});
   }
  }
 }
 return {
  game:{players:players.map(({web_store_user,...p})=>p),event_participation:participation,store_orders:orders},
  billing:{payment_attempts:attempts},
  liveops:{events:EVENTS,offers:OFFERS,releases:RELEASES}
 };
}
