// Inline SVG charts, no dependencies. Every chart compares a "before" and an "after" value per group.
const Charts=(()=>{
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 // groups: [{label, before, after}], values are numbers (null = no data).
 // opts: {format: v => string, max?: number, threshold?: {value, label}}
 function bars(groups,opts){
  const fmt=opts.format,H=190,top=26,bottom=34,bar=38,gap=10,groupW=bar*2+gap+44,left=8;
  const W=left*2+groups.length*groupW;
  const max=opts.max??Math.max(1,...groups.flatMap(g=>[g.before??0,g.after??0]));
  const y=v=>top+(H-top-bottom)*(1-(v??0)/max);
  const parts=[];
  groups.forEach((g,i)=>{
   const x0=left+i*groupW+22;
   [['before',g.before],['after',g.after]].forEach(([k,v],j)=>{
    const x=x0+j*(bar+gap),yy=y(v);
    parts.push(`<rect class="bar ${k}" x="${x}" y="${yy}" width="${bar}" height="${Math.max(0,H-bottom-yy)}" rx="3"><title>${esc(g.label)} ${k}: ${esc(v===null?'n/a':fmt(v))}</title></rect>`);
    parts.push(`<text class="val" x="${x+bar/2}" y="${yy-7}" text-anchor="middle">${esc(v===null?'n/a':fmt(v))}</text>`);
   });
   parts.push(`<text class="lbl" x="${x0+bar+gap/2}" y="${H-12}" text-anchor="middle">${esc(g.label)}</text>`);
  });
  if(opts.threshold){
   const ty=y(opts.threshold.value);
   parts.push(`<line class="threshold" x1="${left}" x2="${W-left}" y1="${ty}" y2="${ty}"/><text class="tlbl" x="${W-left}" y="${ty-5}" text-anchor="end">${esc(opts.threshold.label)}</text>`);
  }
  parts.push(`<line class="axis" x1="${left}" x2="${W-left}" y1="${H-bottom}" y2="${H-bottom}"/>`);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" style="width:${Math.round(W*1.25)}px" role="img" aria-label="${esc(opts.label||'Before and after comparison')}">${parts.join('')}</svg>`;
 }
 const legend='<div class="legend"><span><i class="before"></i>Before the event</span><span><i class="after"></i>After the event</span></div>';
 return {bars,legend,esc};
})();
