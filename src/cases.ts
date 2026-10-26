import {parseMetric} from './investigation.ts';
// Synthetic aggregate fixtures: one attempted purchase per player per period.
export const cases = [
 {id:'payment-incident',title:'案例一：支付成功率下降',before:[1000,100,1000],after:[1500,90,900],funnel:[[500,125,100],[750,150,90]],config:[['v1',10,100],['v1',10,100]]},
 {id:'offer-regression',title:'案例二：相似症状，不同证据',before:[1500,120,1200],after:[1800,80,800],funnel:[[750,150,120],[900,100,80]],config:[['v1',10,100],['v2',10,60]]}
];
function table(name:string,columns:string[],rows:any[][]){
 const literal=(v:any)=>typeof v==='number'?String(v):`'${String(v).replace(/'/g,"''")}'`;
 return `WITH ${name} AS (${rows.map((row,i)=>'SELECT '+row.map((v,j)=>literal(v)+(i===0?' AS '+columns[j]:'')).join(',')).join(' UNION ALL ')}) SELECT * FROM ${name}`;
}
export function sqlFor(c:any,kind:string){
 if(kind==='cohorts')return table('player_cohorts',['period','cohort','participants','payers','revenue'],c.id==='payment-incident'?[['before','new',400,20,200],['before','returning',600,80,800],['after','new',900,18,180],['after','returning',600,72,720]]:[['before','new',600,40,400],['before','returning',900,80,800],['after','new',900,30,300],['after','returning',900,50,500]]);
 if(kind==='overview')return table('metrics',['period','participants','payers','revenue'],[['before',...c.before],['after',...c.after]]);
 if(kind==='checkout')return table('payment_funnel',['period','shop_views','attempts','successes'],c.funnel.map((r:any,i:number)=>[i?'after':'before',...r]));
 if(kind==='offer')return table('event_config',['period','version','price','reward_units'],c.config.map((r:any,i:number)=>[i?'after':'before',...r]));
 throw Error('Unknown query');
}
export function pair(rows:any[]){
 if(rows.length!==2||rows.filter(r=>r.period==='before').length!==1||rows.filter(r=>r.period==='after').length!==1)throw Error('Incomplete period evidence');
 return [rows.find(r=>r.period==='before'),rows.find(r=>r.period==='after')];
}
const numbers=(row:any,keys:string[],error:string)=>Object.fromEntries(keys.map(k=>[k,parseMetric(row[k],error)]));
// A missing version must not read as "unchanged" (undefined===undefined).
function configVersion(row:any){
 const v=row.version;
 if(typeof v==='number'&&Number.isFinite(v))return String(v);
 if(typeof v!=='string'||!v.trim())throw Error('Invalid config: missing version');
 return v.trim();
}
export function evaluate(funnel:any[],config:any[],overview:any){
 const [rawBefore,rawAfter]=pair(funnel),[rawConfigBefore,rawConfigAfter]=pair(config);
 const [b,a]=[rawBefore,rawAfter].map(r=>numbers(r,['shop_views','attempts','successes'],'Invalid funnel'));
 for(const [r,m] of [[b,overview.before],[a,overview.after]]){
  if(r.successes>r.attempts||r.attempts>r.shop_views||r.shop_views>m.participants||r.successes!==m.payers)throw Error('Funnel does not reconcile with metrics');
 }
 const [cb,ca]=[rawConfigBefore,rawConfigAfter].map(r=>({version:configVersion(r),...numbers(r,['price','reward_units'],'Invalid config')}));
 const rate=(x:number,y:number)=>y?x/y:null;
 const before=rate(b.successes,b.attempts),after=rate(a.successes,a.attempts);
 const intentBefore=rate(b.attempts,b.shop_views),intentAfter=rate(a.attempts,a.shop_views);
 const paymentDrop=before!==null&&after!==null&&after<before-0.05;
 const configChanged=cb.version!==ca.version||cb.price!==ca.price||cb.reward_units!==ca.reward_units;
 return {before,after,intentBefore,intentAfter,paymentDrop,configChanged,
 checkout:before===null||after===null?'证据不足：没有支付尝试':paymentDrop?'支持支付环节异常：成功率明显下降；尚不能确定具体故障原因':'本次不支持支付成功率下降假设',
 offer:configChanged?'发现配置变更：需通过对照实验验证其影响':'配置未改变：不支持配置变更假设',
 rewardBefore:cb.reward_units,rewardAfter:ca.reward_units};
}
export function plan(prior:any[]){return prior.some(m=>m.tags?.includes('payment-drop'))?['checkout','offer']:['offer','checkout'];}
