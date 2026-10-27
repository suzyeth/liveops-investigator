import {EVENTS,OFFERS,COIN_PACKS,RELEASES} from './catalog.ts';
// Deterministic generator for the three synthetic data sources. Same seed, same rows.
// The behaviour model is written out here so every effect in the data can be traced to a line.

function rng(seed:number){ // mulberry32
 return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
}
type Weighted<T>=[T,number][];
const pick=<T,>(r:()=>number,items:Weighted<T>)=>{let x=r()*items.reduce((s,[,w])=>s+w,0);for(const [v,w] of items){if((x-=w)<0)return v;}return items[items.length-1][0];};
const DAY=864e5;
const normal=(r:()=>number)=>Math.sqrt(-2*Math.log(1-r()))*Math.cos(2*Math.PI*r());
const poisson=(r:()=>number,mean:number)=>{let k=0,p=Math.exp(-mean),s=p;const u=r();while(u>s&&k<50){k++;p*=mean/k;s+=p;}return k;};

// Players: country, platform share by country, and how much a player tends to spend
// (log-normal, so a few players spend most of the money).
const COUNTRIES:Weighted<string>=[['US',30],['JP',13],['BR',8],['GB',6],['DE',6],['MX',5],['FR',4],['KR',4],['CA',4],['AU',3],['IT',3],['ES',3],['TW',3],['PH',4],['ID',4]];
const IOS_SHARE:Record<string,number>={US:0.55,JP:0.66,GB:0.5,AU:0.55,CA:0.5,KR:0.3,DE:0.36,FR:0.4,IT:0.3,ES:0.3,TW:0.42,BR:0.12,MX:0.2,PH:0.15,ID:0.1};
const SPEND:Record<string,number>={US:1.2,JP:1.5,KR:1.2,TW:1.1,AU:1.1,CA:1.1,GB:1.0,DE:1.0,FR:0.9,IT:0.8,ES:0.8,BR:0.35,MX:0.45,PH:0.3,ID:0.3};
const WEB_STORE:Record<string,number>={US:0.22,GB:0.2,CA:0.2,AU:0.2,DE:0.12,FR:0.12};
const BASE_PLAYERS=88000;
// New installs in the 30 days before each event (Community Day 5 follows an acquisition campaign).
const NEW_INSTALLS:Record<string,number>={cd_01:3000,cd_02:5500,cd_03:3500,cd_04:5000,cd_05:8000};

// Who takes part. "active" took part in the previous Community Day (for the first one: was active in
// the 30 days before it); "new" installed in the 30 days before the event; everyone else is "returning".
const JOIN:Record<string,Record<string,number>>={
 cd_01:{active:0.72,returning:0.10,new:0.50},cd_02:{active:0.80,returning:0.22,new:0.50},cd_03:{active:0.72,returning:0.10,new:0.50},
 cd_04:{active:0.78,returning:0.20,new:0.50},cd_05:{active:0.74,returning:0.17,new:0.50}};
// Android builds on the device during each event. 0.393.1 is a staged rollout.
const VERSIONS:Record<string,Record<string,Weighted<string>>>={
 cd_01:{android:[['0.391.0',88],['0.389.1',12]],ios:[['0.391.0',86],['0.389.1',14]]},
 cd_02:{android:[['0.393.1',58],['0.391.0',42]],ios:[['0.393.1',80],['0.391.0',20]]},
 cd_03:{android:[['0.395.0',84],['0.393.2',16]],ios:[['0.395.0',83],['0.393.1',17]]},
 cd_04:{android:[['0.397.0',87],['0.395.0',13]],ios:[['0.397.0',86],['0.395.0',14]]},
 cd_05:{android:[['0.399.0',70],['0.397.0',30]],ios:[['0.399.0',72],['0.397.0',28]]}
};
// Purchase propensity per participant, by segment.
const P_TICKET:Record<string,number>={active:0.16,returning:0.06,new:0.05};
const P_BOX:Record<string,number>={active:0.09,returning:0.045,new:0.02}; // Web Store users only
const COIN_BUYER:Record<string,number>={active:0.05,returning:0.012,new:0.01}; // chance of buying coins at all, scaled by spend
// The US$4.99 ticket (Community Day 4 onward): price sensitivity differs by segment.
const TICKET_PRICE_FACTOR:Record<string,number>={active:0.3,returning:0.16,new:0.12};
// Box contents: an added Incubator helps a little; losing the ticket hurts.
const BOX_FACTOR:Record<string,number>={cd_02:1.1,cd_03:1.1,cd_04:0.35,cd_05:0.35};
// Community Day 5: players spend less on everything, for a reason none of the sources records
// (for example a featured Pokémon that players care less about). The agent has no check for it.
const DEMAND:Record<string,number>={cd_05:0.72};
// Purchase outcome per attempt, by store. The Android 0.393.1 build breaks Google Play billing for most attempts.
const SUCCESS:Record<string,number>={google_play:0.93,app_store:0.94,web_store:0.92};
const BROKEN_SUCCESS=0.4;
const FAIL_CODES:Record<string,Weighted<string>>={
 google_play:[['USER_CANCELED',55],['NETWORK_ERROR',15],['SERVICE_UNAVAILABLE',12],['ERROR',12],['ITEM_UNAVAILABLE',6]],
 google_play_broken:[['BILLING_UNAVAILABLE',60],['SERVICE_UNAVAILABLE',18],['USER_CANCELED',14],['ERROR',8]],
 app_store:[['SKErrorPaymentCancelled',65],['SKErrorCloudServiceNetworkConnectionFailed',20],['SKErrorUnknown',15]],
 web_store:[['checkout_abandoned',35],['card_declined',30],['authentication_required',20],['expired_card',10],['processing_error',5]]
};
const CANCEL=new Set(['USER_CANCELED','SKErrorPaymentCancelled','checkout_abandoned']);
const RETRY=0.4,SWITCH_TO_WEB=0.25;

export function generate(seed=20260417){
 const r=rng(seed);
 const mk=(i:number,firstSeen:number,lastActive:number)=>{
  const country=pick(r,COUNTRIES),platform=r()<IOS_SHARE[country]?'ios':'android';
  return {player_id:`p${String(i+1).padStart(6,'0')}`,platform,country,first_seen:new Date(firstSeen).toISOString().slice(0,10),
   last_active_2025:new Date(lastActive).toISOString().slice(0,10),spend:Math.exp(normal(r)*0.8-0.3)*SPEND[country],web:r()<(WEB_STORE[country]??0.06)};
 };
 const players:any[]=[];
 const first=Date.parse(EVENTS[0].starts_at);
 for(let i=0;i<BASE_PLAYERS;i++){
  const firstSeen=Date.UTC(2023,6,1)+Math.floor(r()*880)*DAY;
  // 45% were active in the last month of 2025; the rest last played earlier.
  const lastActive=r()<0.45?first-Math.floor(1+r()*29)*DAY:Math.max(firstSeen,first-Math.floor(31+r()*400)*DAY);
  players.push(mk(i,firstSeen,lastActive));
 }
 const participation:any[]=[],orders:any[]=[],attempts:any[]=[];
 let orderSeq=0,attemptSeq=0,prev=new Set<string>();
 for(const [k,e] of EVENTS.entries()){
  const start=Date.parse(e.starts_at),end=Date.parse(e.ends_at);
  for(let i=0;i<NEW_INSTALLS[e.event_id];i++){const fs=start-Math.floor(1+r()*29)*DAY;players.push(mk(players.length,fs,fs));}
  const offers=OFFERS.filter(o=>o.event_id===e.event_id),price=(sku:string)=>offers.find(o=>o.sku===sku)!.price_usd;
  const ticketAtHigherPrice=price('cd_ticket')>1.99;
  const now=new Set<string>();
  for(const p of players){
   const fs=Date.parse(p.first_seen);
   if(fs>start)continue;
   const segment=fs>=start-30*DAY?'new':(k===0?Date.parse(p.last_active_2025)>=start-30*DAY:prev.has(p.player_id))?'active':'returning';
   if(r()>=JOIN[e.event_id][segment])continue;
   now.add(p.player_id);
   const app_version=pick(r,VERSIONS[e.event_id][p.platform]);
   participation.push({event_id:e.event_id,player_id:p.player_id,platform:p.platform,app_version,segment,
    sessions:1+Math.floor(r()*(segment==='active'?6:3)),minutes_played:Math.round(25+r()*(segment==='active'?160:90))});
   const demand=DEMAND[e.event_id]??1,store=p.platform==='android'?'google_play':'app_store';
   const lift=Math.min(2.5,0.6+0.4*p.spend);
   const wants:{sku:string,channel:string}[]=[];
   const boxed=p.web&&r()<P_BOX[segment]*lift*(BOX_FACTOR[e.event_id]??1)*demand;
   if(boxed)wants.push({sku:'cd_box_web',channel:'web_store'});
   const boxHasTicket=!ticketAtHigherPrice;
   if(!(boxed&&boxHasTicket)&&r()<P_TICKET[segment]*lift*(ticketAtHigherPrice?TICKET_PRICE_FACTOR[segment]:1)*(demand+1)/2)
    wants.push({sku:'cd_ticket',channel:p.web&&r()<0.4?'web_store':store});
   // Coin buyers: the chance and the number of purchases grow with how much the player tends to spend,
   // and bigger spenders buy bigger packs.
   const n=r()<Math.min(0.6,COIN_BUYER[segment]*lift*demand)?1+poisson(r,0.7*p.spend):0;
   for(let j=0;j<n;j++){
    const tier=Math.min(5,Math.max(0,Math.round(Math.log2(1+p.spend)+normal(r)*0.9)));
    wants.push({sku:COIN_PACKS[tier].sku,channel:p.web&&r()<0.5?'web_store':store});
   }
   for(const w of wants){
    // Most purchases happen during the three-hour event; some the day before, some just after.
    const x=r(),created=x<0.65?start+r()*(end-start):x<0.9?start-r()*24*36e5:end+r()*6*36e5;
    let channel=w.channel;
    for(let leg=0;leg<2;leg++){
     const order_id=`o${String(++orderSeq).padStart(7,'0')}`,at=created+leg*15*60e3;
     const broken=channel==='google_play'&&app_version==='0.393.1';
     let ok=false,code='';
     for(let n2=0;n2<2&&!ok;n2++){
      if(n2===1&&(CANCEL.has(code)||r()>RETRY))break;
      ok=r()<(broken?BROKEN_SUCCESS:SUCCESS[channel]);
      code=ok?'OK':pick(r,FAIL_CODES[broken?'google_play_broken':channel]);
      attempts.push({attempt_id:`a${String(++attemptSeq).padStart(7,'0')}`,order_id,provider:channel,response_code:code,
       latency_ms:Math.round((broken&&!ok?2400:850)*(0.6+r()*0.9)),attempted_at:new Date(at+n2*45e3).toISOString()});
     }
     orders.push({order_id,event_id:e.event_id,player_id:p.player_id,sku:w.sku,channel,price_usd:price(w.sku),
      status:ok?'completed':CANCEL.has(code)?'canceled':'failed',created_at:new Date(at).toISOString()});
     // A Web Store user whose app-store purchase failed sometimes buys the same item on the web instead.
     if(ok||CANCEL.has(code)||channel==='web_store'||!p.web||r()>SWITCH_TO_WEB)break;
     channel='web_store';
    }
   }
  }
  prev=now;
 }
 return {
  game:{players:players.map(({spend,web,...p})=>p),event_participation:participation,store_orders:orders},
  billing:{payment_attempts:attempts},
  liveops:{events:EVENTS,offers:OFFERS,releases:RELEASES}
 };
}
