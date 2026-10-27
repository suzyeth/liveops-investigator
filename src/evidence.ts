import {parseMetric} from './investigation.ts';
// Builds the visible derivation for one finished case. Every number carries a ref to the
// Zetaris query, period and column it was read from, so the page can show its source.
// The findings are recomputed here from the returned rows and must agree with evaluate().
export const PAYMENT_DROP_POINTS=5;
export const ORDER_RULE='If a recalled record is tagged payment-drop, check payment first; otherwise check the event config first.';
type Ref={query:string,period:string,column:string};
type Cell={value:number,ref:Ref};

function row(trace:any[],query:string,period:string){
 const found=trace.find(t=>t.kind===query)?.rows?.find((r:any)=>r.period===period);
 if(!found)throw Error(`Missing ${query} evidence for ${period}`);
 return found;
}
function cell(trace:any[],query:string,period:string,column:string):Cell{
 return {value:parseMetric(row(trace,query,period)[column],`Invalid ${query} evidence`),ref:{query,period,column}};
}
function ratio(trace:any[],query:string,period:string,num:string,den:string){
 const n=cell(trace,query,period,num),d=cell(trace,query,period,den);
 return {num:n,den:d,value:d.value?n.value/d.value:null};
}
function sum(trace:any[],period:string,column:string){
 return (trace.find(t=>t.kind==='cohorts')?.rows||[]).filter((r:any)=>r.period===period).reduce((s:number,r:any)=>s+parseMetric(r[column],'Invalid cohorts evidence'),0);
}
const pct=(x:number|null)=>x===null?'n/a':`${Math.round(x*1000)/10}%`;
const label:Record<string,string>={version:'version',price:'price',reward_units:'reward units'};

export function explain(result:any){
 const t=result.trace;
 const symptom=['participants','payers','revenue'].map(column=>({metric:column,before:cell(t,'overview','before',column),after:cell(t,'overview','after',column)}));
 const revenueFell=symptom[2].after.value<symptom[2].before.value;
 const success={before:ratio(t,'checkout','before','successes','attempts'),after:ratio(t,'checkout','after','successes','attempts')};
 const intent={before:ratio(t,'checkout','before','attempts','shop_views'),after:ratio(t,'checkout','after','attempts','shop_views')};
 const funnel=['shop_views','attempts','successes'].map(column=>({stage:column,before:cell(t,'checkout','before',column),after:cell(t,'checkout','after',column)}));
 const config=['version','price','reward_units'].map(column=>{
  const b=String(row(t,'offer','before')[column]).trim(),a=String(row(t,'offer','after')[column]).trim();
  // Same comparison as evaluate(): numbers by value, the version as trimmed text.
  const changed=column==='version'?b!==a:parseMetric(b,'Invalid offer evidence')!==parseMetric(a,'Invalid offer evidence');
  return {field:column,before:{value:b,ref:{query:'offer',period:'before',column}},after:{value:a,ref:{query:'offer',period:'after',column}},changed};
 });
 const points=success.before.value!==null&&success.after.value!==null?(success.after.value-success.before.value)*100:null;
 // Same expression as evaluate(), so the two cannot disagree at the threshold through rounding.
 const paymentDrop=success.before.value!==null&&success.after.value!==null&&success.after.value<success.before.value-PAYMENT_DROP_POINTS/100,configChanged=config.some(f=>f.changed);
 if(paymentDrop!==result.verdict.paymentDrop||configChanged!==result.verdict.configChanged)throw Error('Evidence does not match the recorded verdict');
 const checks=[
  {id:'payment',question:'Did the payment step start failing?',rule:`Supported only if payment success (successes ÷ attempts) fell by more than ${PAYMENT_DROP_POINTS} percentage points.`,supported:paymentDrop,verdict:result.verdict.checkout,success,points},
  {id:'config',question:'Did the event offer change?',rule:'Supported if the version, price or reward units differ between the two periods.',supported:configChanged,verdict:result.verdict.offer,fields:config}
 ];
 const reconciliations=[] as {label:string,left:number,right:number,ok:boolean}[];
 if(t.some((x:any)=>x.kind==='cohorts'))for(const period of ['before','after'])for(const column of ['participants','payers','revenue']){
  const left=sum(t,period,column),right=cell(t,'overview',period,column).value;
  reconciliations.push({label:`Cohort ${column} add up to the overview (${period})`,left,right,ok:left===right});
 }
 for(const period of ['before','after']){
  const left=cell(t,'checkout',period,'successes').value,right=cell(t,'overview',period,'payers').value;
  reconciliations.push({label:`Payment successes equal payers (${period})`,left,right,ok:left===right});
 }
 const recalled=result.prior.map((m:any)=>({id:m.id,source:m.source,tags:m.tags||[]}));
 const memory={recalled,rule:ORDER_RULE,triggered:recalled.some((m:any)=>m.tags.includes('payment-drop')),order:result.order,baseline:result.baseline,
  model:{name:result.model.name,suggestion:result.model.suggestion,attempts:result.model.attempts.length},
  stored:{id:result.storedId,tag:result.verdict.paymentDrop?'payment-drop':'payment-healthy',persisted:result.persisted}};
 return {symptom,revenueFell,checks,funnel,intent,reconciliations,memory,finding:finding(revenueFell,checks[0],config,intent)};
}

function finding(revenueFell:boolean,payment:any,config:any[],intent:any){
 if(!revenueFell)return 'Revenue did not fall, so there is no revenue drop to explain.';
 const rate=`payment success went from ${pct(payment.success.before.value)} to ${pct(payment.success.after.value)}`;
 const changed=config.filter(f=>f.changed).map(f=>`${label[f.field]} ${f.before.value} → ${f.after.value}`).join(', ');
 const tried=`the share of shop visitors who tried to buy went from ${pct(intent.before.value)} to ${pct(intent.after.value)}`;
 if(payment.supported&&!changed)return `Look at the payment step first: ${rate} while the event offer stayed the same. This shows where to look, not what the fault is.`;
 if(!payment.supported&&changed)return `Payment is not the lead this time: ${rate}. The event offer changed (${changed}) and ${tried}. Treat the offer change as the lead to test, not as a proven cause.`;
 if(payment.supported)return `Both explanations are supported: ${rate}, and the event offer changed (${changed}). Each needs its own follow-up.`;
 return `Neither explanation is supported: ${rate} and the event offer did not change. The revenue drop needs other checks.`;
}
