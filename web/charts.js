// Inline SVG charts, no dependencies. Every chart compares two values per group (by default the
// event before and the event after).
const Charts=(()=>{
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 // groups: [{label, before, after}], values are numbers (null = no data).
 // opts: {format: v => string, max?: number, label?: string}
 function bars(groups,opts){
  const fmt=opts.format,H=190,top=26,bottom=34,bar=38,gap=10,groupW=bar*2+gap+44,left=8;
  const W=left*2+groups.length*groupW;
  const max=opts.max??Math.max(1e-9,...groups.flatMap(g=>[g.before??0,g.after??0]));
  const y=v=>top+(H-top-bottom)*(1-(v??0)/max);
  const parts=[];
  groups.forEach((g,i)=>{
   const x0=left+i*groupW+22;
   [['before',g.before],['after',g.after]].forEach(([k,v],j)=>{
    const x=x0+j*(bar+gap),yy=y(v);
    parts.push(`<rect class="bar ${k}" x="${x}" y="${yy}" width="${bar}" height="${Math.max(0,H-bottom-yy)}" rx="3"><title>${esc(g.label)}: ${esc(v===null?'n/a':fmt(v))}</title></rect>`);
    parts.push(`<text class="val" x="${x+bar/2}" y="${yy-7}" text-anchor="middle">${esc(v===null?'n/a':fmt(v))}</text>`);
   });
   parts.push(`<text class="lbl" x="${x0+bar+gap/2}" y="${H-12}" text-anchor="middle">${esc(g.label)}</text>`);
  });
  parts.push(`<line class="axis" x1="${left}" x2="${W-left}" y1="${H-bottom}" y2="${H-bottom}"/>`);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" style="width:${Math.round(W*1.2)}px" role="img" aria-label="${esc(opts.label||'Comparison')}">${parts.join('')}</svg>`;
 }
 const legend=(a='Before the event',b='After the event')=>`<div class="legend"><span><i class="before"></i>${esc(a)}</span><span><i class="after"></i>${esc(b)}</span></div>`;
 return {bars,legend,esc};
})();
