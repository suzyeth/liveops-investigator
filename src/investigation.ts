export const fixture = `WITH game_events AS (
SELECT 'before' AS period, 'new' AS cohort, 400 AS participants, 20 AS payers, 200 AS revenue
UNION ALL SELECT 'before','returning',600,80,800
UNION ALL SELECT 'after','new',900,18,180
UNION ALL SELECT 'after','returning',600,72,720
)`;
export const overviewSQL = `${fixture} SELECT period,SUM(participants) AS participants,SUM(payers) AS payers,SUM(revenue) AS revenue FROM game_events GROUP BY period ORDER BY period`;
export const cohortSQL = `${fixture} SELECT * FROM game_events ORDER BY cohort,period`;
const DECIMAL=/^\d+(\.\d+)?$/;
// SQL cells arrive as numbers or numeric strings. Blank, boolean, array or null cells
// must fail rather than coerce to 0/1 through Number().
export function parseMetric(value:unknown,error:string){
 const n=typeof value==='number'?value:typeof value==='string'&&DECIMAL.test(value.trim())?Number(value):NaN;
 if(!Number.isFinite(n)||n<0)throw Error(error);
 return n;
}
export function metrics(r:any){
 const [participants,payers,revenue]=['participants','payers','revenue'].map(k=>parseMetric(r[k],'Invalid metrics'));
 if(payers>participants)throw Error('Invalid metrics');
 return {participants,payers,revenue,conversion:participants?payers/participants:null,arppu:payers?revenue/payers:null};
}
// Cohorts are only queried after a revenue drop; without one there is nothing to reconcile.
export function reconcileCohorts(overview:any,cohorts:any[]){
 if(!overview.drillDown)return;
 if(cohorts.some(r=>r.period!=='before'&&r.period!=='after'))throw Error('Unexpected cohort period');
 for(const period of ['before','after']){
  const rows=cohorts.filter(r=>r.period===period).map(metrics);
  for(const key of ['participants','payers','revenue'] as const){
   if(rows.reduce((sum,row)=>sum+row[key],0)!==overview[period][key])throw Error('Cohort totals do not reconcile');
  }
 }
}
export function diagnose(rows:any[]){
 if(rows.length!==2||rows.filter(r=>r.period==='before').length!==1||rows.filter(r=>r.period==='after').length!==1)throw Error('Expected before and after');
 const before=metrics(rows.find(r=>r.period==='before')),after=metrics(rows.find(r=>r.period==='after'));
 return {before,after,drillDown:after.revenue<before.revenue};
}
