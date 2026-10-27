const DECIMAL=/^\d+(\.\d+)?$/;
// Zetaris returns cells as numbers or numeric strings. Blank, boolean, array or null cells
// must fail rather than coerce to 0/1 through Number().
export function parseMetric(value:unknown,error:string){
 const n=typeof value==='number'?value:typeof value==='string'&&DECIMAL.test(value.trim())?Number(value):NaN;
 if(!Number.isFinite(n)||n<0)throw Error(error);
 return n;
}
