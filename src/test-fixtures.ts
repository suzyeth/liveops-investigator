import {cases,evaluate,plan} from './cases.ts';
import {diagnose} from './investigation.ts';
// Zetaris returns every cell as a string; the fake trace does the same.
const rows=(columns:string[],data:any[][])=>data.map(r=>Object.fromEntries(columns.map((c,i)=>[c,String(r[i])])));
const periods=(list:any[][])=>list.map((r,i)=>[i?'after':'before',...r]);
export function fakeResult(c:any,prior:any[]=[]){
 const trace=[
  {kind:'overview',sql:'',ms:1,rows:rows(['period','participants','payers','revenue'],periods([c.before,c.after]))},
  {kind:'cohorts',sql:'',ms:1,rows:rows(['period','cohort','participants','payers','revenue'],c.cohorts)},
  {kind:'checkout',sql:'',ms:1,rows:rows(['period','shop_views','attempts','successes'],periods(c.funnel))},
  {kind:'offer',sql:'',ms:1,rows:rows(['period','version','price','reward_units'],periods(c.config))}
 ];
 const overview=diagnose(trace[0].rows),verdict=evaluate(trace[2].rows,trace[3].rows,overview);
 return {id:c.id,title:c.title,overview,trace,verdict,order:plan(prior),baseline:plan([]),prior,model:{name:'meterless/local',suggestion:['checkout','offer'],attempts:['["checkout","offer"]']},storedId:'mem-1',persisted:true};
}

export {cases};
