// Small statistics used to keep the agent from reading noise as a finding.
export const DROP_POINTS=5;      // a rate must fall by more than this many percentage points
export const MIN_ORDERS=200;     // and rest on at least this many orders in each period
export const Z_MIN=3;            // and pass a two-proportion z-test at |z| >= 3
export const MIN_BUYERS=30;      // a segment's buyer share is only compared above this many buyers

export const rate=(a:number,b:number)=>b?a/b:null;
// z statistic for p2 - p1 with a pooled proportion; 0 when either side is empty.
export function zTwoProportions(x1:number,n1:number,x2:number,n2:number){
 if(!n1||!n2)return 0;
 const p=(x1+x2)/(n1+n2),se=Math.sqrt(p*(1-p)*(1/n1+1/n2));
 return se?(x2/n2-x1/n1)/se:0;
}
// A completion rate fell: by more than DROP_POINTS, on enough orders, and beyond noise.
export function dropped(before:{ok:number,n:number},after:{ok:number,n:number}){
 if(before.n<MIN_ORDERS||after.n<MIN_ORDERS)return false;
 const b=before.ok/before.n,a=after.ok/after.n;
 return a<b-DROP_POINTS/100&&zTwoProportions(before.ok,before.n,after.ok,after.n)<=-Z_MIN;
}
