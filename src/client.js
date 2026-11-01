const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2}).format(value);
const compact = value => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
const dateText = (date, short=false) => new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',...(short?{}:{year:'numeric'}),timeZone:'UTC'}).format(new Date(dateToTime(date)));
const iso = time => new Date(time).toISOString().slice(0,10);
let history, points=[], view=[0,1], selected=null, activeRange='ALL', geometry, importPoints=[], activeTab='paste', pointerMode=null, pointerStart, pinchStart;
const pointers=new Map();
const chart=$('chart'), ctx=chart.getContext('2d');
const systemTheme=matchMedia('(prefers-color-scheme: dark)');
function syncThemeControls(){const dark=document.documentElement.dataset.theme==='dark';$('theme-toggle').setAttribute('aria-label','Switch to '+(dark?'light':'dark')+' mode');$('theme-toggle').title='Switch to '+(dark?'light':'dark')+' mode';$('theme-system').setAttribute('aria-pressed',String(document.documentElement.dataset.themeChoice==='system'));document.querySelector('meta[name="theme-color"]').content=dark?'#09090b':'#f7f7f8';}
function chooseTheme(choice){document.documentElement.dataset.themeChoice=choice;document.documentElement.dataset.theme=choice==='dark'||(choice==='system'&&systemTheme.matches)?'dark':'light';try{localStorage.setItem('worth-theme',choice);}catch{}syncThemeControls();scheduleDraw();window.dispatchEvent(new Event('worth-theme-change'));}
$('theme-toggle').onclick=()=>chooseTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');$('theme-system').onclick=()=>chooseTheme('system');systemTheme.addEventListener('change',()=>{if(document.documentElement.dataset.themeChoice==='system')chooseTheme('system');});syncThemeControls();
function chartPalette(){const s=getComputedStyle(document.documentElement);return Object.fromEntries(['grid','muted','green','card','comparison','crosshair','fill-top','fill-bottom'].map(k=>[k,s.getPropertyValue('--'+k).trim()]));}
let frame=0, toastTimer, labelTimer;
function scheduleDraw(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;draw();});}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4000);}
function showError(message){$('chart-error').textContent=message;$('chart-error').hidden=false;}
async function loadHistory(preserve=false){
  $('refresh').disabled=true;
  try{
    const res=await localRequest('history');
    if(!res.ok)throw new Error((await res.json()).error||'Could not open local records.');
    const data=await res.json();
    history=data;points=data.points.length?normalizePoints(data):[];$('chart-error').hidden=true;
    for(const b of document.querySelectorAll('[data-range],#zoom-in,#zoom-out,#latest,#example,#open-records,#export-csv'))b.disabled=!points.length;
    $('setup-card').hidden=!!points.length;
    if(!points.length){$('hero-value').textContent='—';$('change').textContent='Import a backup or add your first snapshot';$('change-period').textContent='';$('asof').textContent='No snapshots yet';$('range-caption').textContent='Your timeline will appear here';$('points-label').textContent='';$('save-status').textContent='On this device only · export a backup to keep a separate copy';return;}

    const min=dateToTime(points[0].date),max=dateToTime(points.at(-1).date);
    view=preserve?clampWindow(view[0],view[1],min,max):[min,max];
    selected=null;
    updateSummary();scheduleDraw();
  }catch(e){showError(e.message);$('asof').textContent='Unavailable';}
  finally{$('refresh').disabled=false;}
}
function updateSummary(){
  if(!points.length)return;
  const last=points.at(-1), first=points[0], peak=points.reduce((a,b)=>a.netWorth>b.netWorth?a:b);
  const grow=last.netWorth-first.netWorth;
  $('asof').textContent='As of '+dateText(last.date,true);
  $('total-growth').textContent=(grow>=0?'+':'−')+compact(Math.abs(grow));
  $('growth-caption').textContent=(first.netWorth?((grow/Math.abs(first.netWorth))*100).toFixed(1)+'% · ':'')+'since '+dateText(first.date);
  $('peak-value').textContent=compact(peak.netWorth);$('peak-date').textContent=dateText(peak.date);
  $('first-date').textContent=dateText(first.date);$('history-count').textContent=points.length+' daily snapshots';
  $('earliest-note').textContent='The connected service’s earliest recorded snapshot is '+dateText(first.date)+'. Older transaction history is not treated as verified daily balance history.';
  $('save-status').textContent='Saved on this device · '+points.length+' snapshots · export a backup to move devices';
  $('manual-date').value=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  updateReadout();
}
function updateReadout(){
  if(!points.length)return;
  const last=points.at(-1), chosen=selected||last;
  const val=money(chosen.netWorth), dot=val.lastIndexOf('.');
  $('hero-value').replaceChildren();
  $('hero-value').append(document.createTextNode(val.slice(0,dot)));
  const cents=document.createElement('span');cents.className='cents';cents.textContent=val.slice(dot);$('hero-value').append(cents);
  $('value-label').textContent=selected?'RECORDED '+dateText(selected.date).toUpperCase():'LATEST RECORDED';
  const start=nearestPoint(points,view[0]),end=nearestPoint(points,view[1]);
  const change=end.netWorth-start.netWorth, pct=start.netWorth?change/Math.abs(start.netWorth)*100:null;
  $('change').textContent=(change>=0?'↗ +':'↘ −')+compact(Math.abs(change))+(pct===null?'':' ('+(pct>=0?'+':'')+pct.toFixed(1)+'%)');
  $('change').classList.toggle('negative',change<0);
  $('change-period').textContent='in visible period';
  const span=view[1]-view[0];
  $('range-caption').textContent=dateText(iso(view[0]))+' – '+dateText(iso(view[1]));
  const count=points.filter(p=>dateToTime(p.date)>=view[0]&&dateToTime(p.date)<=view[1]).length;
  $('points-label').textContent=count+' snapshots';
  $('clear-selection').hidden=!selected;
  document.querySelectorAll('[data-range]').forEach(b=>{const on=b.dataset.range===activeRange;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
  const whole=dateToTime(points.at(-1).date)-dateToTime(points[0].date);
  $('zoom-out').disabled=span>=whole-1;$('zoom-in').disabled=span<=Math.min(2*DAY,whole)+1;
  chart.setAttribute('aria-label','Net worth from '+dateText(start.date)+' to '+dateText(end.date)+'. Latest '+money(last.netWorth)+'. '+(selected?'Selected '+dateText(selected.date)+', '+money(selected.netWorth)+'. ':'')+'Arrow keys move timeline. Plus and minus zoom. Home resets.');
}
function setView(start,end,range=null){
  if(!points.length)return;
  view=clampWindow(start,end,dateToTime(points[0].date),dateToTime(points.at(-1).date));
  activeRange=range;selected=null;updateReadout();scheduleDraw();
}
function snapRange(range){
  const end=dateToTime(points.at(-1).date);let start=dateToTime(points[0].date);
  if(range==='1W')start=end-6*DAY;
  if(range==='1M'){const d=new Date(end);const day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-1);const lastDay=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,lastDay));start=d.getTime();}
  if(range==='1Y')start=end-365*DAY;
  setView(start,end,range);
  if(range==='1Y'&&start<dateToTime(points[0].date))toast('Showing all available history. A full year has not accumulated yet.');
}
function zoom(factor,anchor=.5){const span=view[1]-view[0],a=view[0]+span*anchor;setView(a-span*factor*anchor,a+span*factor*(1-anchor));}
function dataAt(time){return nearestPoint(points,time);}
function draw(){
  if(!points.length)return;
  const palette=chartPalette(),box=chart.getBoundingClientRect(),w=box.width,h=box.height,dpr=Math.min(window.devicePixelRatio||1,3);
  if(!w||!h)return;
  chart.width=Math.round(w*dpr);chart.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const pad={l:9,r:58,t:20,b:36},pw=w-pad.l-pad.r,ph=h-pad.t-pad.b,span=Math.max(view[1]-view[0],DAY);
  const visible=points.filter(p=>{const t=dateToTime(p.date);return t>=view[0]&&t<=view[1]});
  const relevant=[...visible,dataAt(view[0]),dataAt(view[1])].filter(Boolean);
  let min=Math.min(...relevant.map(p=>p.netWorth)),max=Math.max(...relevant.map(p=>p.netWorth));
  const margin=Math.max((max-min)*.17,200);min-=margin;max+=margin;
  const rawStep=(max-min)/4,exp=10**Math.floor(Math.log10(rawStep)),step=[1,2,2.5,5,10].map(n=>n*exp).find(n=>n>=rawStep)||exp*10;
  min=Math.floor(min/step)*step;max=Math.ceil(max/step)*step;
  const x=t=>pad.l+(t-view[0])/span*pw,y=v=>pad.t+(max-v)/(max-min)*ph;
  geometry={w,h,pad,pw,ph,x,y,min,max};
  ctx.lineWidth=1;ctx.font='10px -apple-system, BlinkMacSystemFont, sans-serif';ctx.textBaseline='middle';
  for(let v=min;v<=max+.01;v+=step){const yy=y(v);ctx.strokeStyle=palette.grid;ctx.setLineDash([4,5]);ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=palette.muted;ctx.textAlign='right';ctx.fillText('$'+(Math.abs(v)>=1000?(v/1000).toFixed(v%1000?1:0)+'k':Math.round(v)),w-2,yy);}
  const labelCount=w<450?3:5;
  for(let i=0;i<labelCount;i++){const t=view[0]+span*i/(labelCount-1),xx=x(t);ctx.textAlign=i===0?'left':i===labelCount-1?'right':'center';ctx.fillStyle=palette.muted;ctx.fillText(dateText(iso(t),true),xx,h-12);}
  const all=points.map(p=>({...p,t:dateToTime(p.date)}));
  ctx.save();ctx.beginPath();ctx.rect(pad.l,pad.t,pw,ph);ctx.clip();
  const gradient=ctx.createLinearGradient(0,pad.t,0,h-pad.b);gradient.addColorStop(0,palette['fill-top']);gradient.addColorStop(1,palette['fill-bottom']);
  ctx.beginPath();ctx.moveTo(x(all[0].t),h-pad.b);for(const p of all)ctx.lineTo(x(p.t),y(p.netWorth));ctx.lineTo(x(all.at(-1).t),h-pad.b);ctx.closePath();ctx.fillStyle=gradient;ctx.fill();
  ctx.strokeStyle=palette.green;ctx.lineWidth=2.8;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();let prev=null;
  for(const p of all){if(!prev||p.t-prev.t>DAY*1.5){if(prev)ctx.stroke();ctx.beginPath();ctx.moveTo(x(p.t),y(p.netWorth));}else ctx.lineTo(x(p.t),y(p.netWorth));prev=p;}ctx.stroke();
  for(let i=1;i<all.length;i++)if(all[i].t-all[i-1].t>DAY*1.5){ctx.save();ctx.setLineDash([3,5]);ctx.strokeStyle=palette.comparison;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x(all[i-1].t),y(all[i-1].netWorth));ctx.lineTo(x(all[i].t),y(all[i].netWorth));ctx.stroke();ctx.restore();}
  ctx.restore();
  const endpoint=all.at(-1);if(endpoint.t>=view[0]&&endpoint.t<=view[1]){ctx.beginPath();ctx.arc(x(endpoint.t),y(endpoint.netWorth),4,0,Math.PI*2);ctx.fillStyle=palette.green;ctx.fill();}
  if(selected&&dateToTime(selected.date)>=view[0]&&dateToTime(selected.date)<=view[1]){
    const sx=x(dateToTime(selected.date)),sy=y(selected.netWorth);ctx.strokeStyle=palette.crosshair;ctx.lineWidth=1;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(sx,pad.t);ctx.lineTo(sx,h-pad.b);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.arc(sx,sy,6,0,Math.PI*2);ctx.fillStyle=palette.card;ctx.fill();ctx.strokeStyle=palette.green;ctx.lineWidth=2;ctx.stroke();
    const tip=$('chart-tooltip');$('tooltip-date').textContent=dateText(selected.date);$('tooltip-value').textContent=money(selected.netWorth);tip.hidden=false;tip.style.left=Math.max(77,Math.min(w-77,sx))+'px';tip.style.top=Math.max(0,Math.min(h-122,sy-104))+'px';
  }else $('chart-tooltip').hidden=true;
}
function position(e){const r=chart.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
function inspectAt(px){if(!geometry)return;const fraction=Math.max(0,Math.min(1,(px-geometry.pad.l)/geometry.pw));const visible=points.filter(p=>dateToTime(p.date)>=view[0]&&dateToTime(p.date)<=view[1]);selected=nearestPoint(visible,view[0]+fraction*(view[1]-view[0]));updateReadout();scheduleDraw();}
function announceGesture(text){$('gesture-label').textContent=text;$('gesture-label').hidden=false;clearTimeout(labelTimer);labelTimer=setTimeout(()=>$('gesture-label').hidden=true,1800);}
chart.addEventListener('pointerdown',e=>{
  if(!points.length||!geometry)return;e.preventDefault();chart.setPointerCapture(e.pointerId);const p=position(e);pointers.set(e.pointerId,p);
  if(pointers.size===2){const pair=[...pointers.values()];pinchStart={distance:Math.max(1,Math.hypot(pair[1].x-pair[0].x,pair[1].y-pair[0].y)),mid:(pair[0].x+pair[1].x)/2,view:[...view]};pointerMode='pinch';selected=null;announceGesture('Pinch to zoom');return;}
  const time=view[0]+Math.max(0,Math.min(1,(p.x-geometry.pad.l)/geometry.pw))*(view[1]-view[0]);
  const lineY=geometry.y(lineHitValue(points,time));pointerMode=p.y<=lineY+14?'inspect':'pan';pointerStart={p,view:[...view]};
  if(pointerMode==='inspect')inspectAt(p.x);else {selected=null;announceGesture('Move timeline');updateReadout();scheduleDraw();}
});
chart.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId)){if(e.pointerType==='mouse'&&!e.buttons&&geometry){const p=position(e),time=view[0]+(p.x-geometry.pad.l)/geometry.pw*(view[1]-view[0]);if(p.y<=geometry.y(lineHitValue(points,time))+14&&p.x>=geometry.pad.l&&p.x<=geometry.w-geometry.pad.r)inspectAt(p.x);}return;}
  e.preventDefault();const p=position(e);pointers.set(e.pointerId,p);
  if(pointerMode==='pinch'&&pointers.size>=2){const pair=[...pointers.values()],distance=Math.max(1,Math.hypot(pair[1].x-pair[0].x,pair[1].y-pair[0].y)),mid=(pair[0].x+pair[1].x)/2;
    const oldSpan=pinchStart.view[1]-pinchStart.view[0],newSpan=oldSpan*pinchStart.distance/distance,anchor=(pinchStart.mid-geometry.pad.l)/geometry.pw;
    const anchorTime=pinchStart.view[0]+oldSpan*anchor,newStart=anchorTime-newSpan*anchor-(mid-pinchStart.mid)/geometry.pw*newSpan;setView(newStart,newStart+newSpan);return;
  }
  if(pointerMode==='inspect')inspectAt(p.x);
  else if(pointerMode==='pan'){const delta=-(p.x-pointerStart.p.x)/geometry.pw*(pointerStart.view[1]-pointerStart.view[0]);setView(pointerStart.view[0]+delta,pointerStart.view[1]+delta);}
});
function endPointer(e){pointers.delete(e.pointerId);if(pointers.size===0){pointerMode=null;pinchStart=null;}else if(pointerMode==='pinch'){pointerMode='paused';}}
chart.addEventListener('pointerup',endPointer);chart.addEventListener('pointercancel',endPointer);chart.addEventListener('lostpointercapture',endPointer);
chart.addEventListener('wheel',e=>{if(!points.length||!geometry)return;e.preventDefault();const r=position(e),anchor=Math.max(0,Math.min(1,(r.x-geometry.pad.l)/geometry.pw));zoom(Math.exp(e.deltaY*.002),anchor);},{passive:false});
chart.addEventListener('keydown',e=>{const span=view[1]-view[0];if(e.key==='+'||e.key==='='){e.preventDefault();zoom(.7);}else if(e.key==='-'){e.preventDefault();zoom(1.4);}else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const dir=e.key==='ArrowRight'?1:-1;setView(view[0]+dir*span*.2,view[1]+dir*span*.2);}else if(e.key==='Home'){e.preventDefault();snapRange('ALL');}else if(e.key==='Escape'){selected=null;updateReadout();scheduleDraw();}});
new ResizeObserver(scheduleDraw).observe(chart);
document.querySelectorAll('[data-range]').forEach(b=>b.addEventListener('click',()=>snapRange(b.dataset.range)));
$('zoom-in').onclick=()=>zoom(.7);$('zoom-out').onclick=()=>zoom(1.4);$('latest').onclick=()=>{const end=dateToTime(points.at(-1).date);setView(end-(view[1]-view[0]),end);};$('clear-selection').onclick=()=>{selected=null;updateReadout();scheduleDraw();};$('refresh').onclick=()=>loadHistory(true);
function parseData(text){
  const raw=text.trim();if(!raw)throw new Error('Paste data or choose a file first.');
  if(raw.startsWith('{')||raw.startsWith('['))return normalizePoints(JSON.parse(raw));
  const lines=raw.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());
  const delimiter=lines[0].includes('\t')?'\t':',';
  const split=line=>{const cells=[];let cell='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===delimiter&&!quoted){cells.push(cell.trim());cell='';}else cell+=c;}cells.push(cell.trim());return cells;};
  const headers=split(lines[0]).map(x=>x.toLowerCase().replace(/[_\s-]/g,''));const di=headers.indexOf('date'),vi=headers.findIndex(x=>['networth','value'].includes(x));
  if(di<0||vi<0)throw new Error('CSV needs date and netWorth columns.');
  return normalizePoints(lines.slice(1).map(line=>{const row=split(line);const value=row[vi]?.replace(/[$,]/g,'');if(value===undefined||value==='')throw new Error('Missing net worth value.');return{date:row[di],netWorth:Number(value),source:'csv-import'};}));
}
function feedback(message,error=false){$('import-feedback').textContent=message;$('import-feedback').classList.toggle('error',error);$('import-feedback').hidden=false;}
function resetPreview(){importPoints=[];$('import-preview').hidden=true;$('save-import').hidden=true;$('preview-import').hidden=activeTab==='connect';$('import-feedback').hidden=true;}
function openImport(){resetPreview();$('import-dialog').showModal();}
$('open-import').onclick=openImport;
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{activeTab=b.dataset.tab;document.querySelectorAll('[data-tab]').forEach(t=>{const on=t===b;t.classList.toggle('active',on);t.setAttribute('aria-pressed',String(on));});document.querySelectorAll('.tab-panel').forEach(s=>s.hidden=s.id!=='tab-'+activeTab);resetPreview();});
for(const id of ['import-text','manual-date','manual-value','manual-note'])$(id).addEventListener('input',resetPreview);
$('import-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>3000000)return feedback('Choose a file smaller than 3 MB.',true);$('import-text').value=await file.text();resetPreview();feedback('Loaded '+file.name+'. Preview it before saving.');};
$('example').onclick=()=>{$('import-text').value=JSON.stringify({points:[{date:points.at(-1).date,netWorth:points.at(-1).netWorth}]},null,2);resetPreview();feedback('This example repeats your latest point, so it will make no change. Replace it with a new snapshot.');};
function tableHtml(entries,head,body){const table=document.createElement('table'),thead=document.createElement('thead'),tr=document.createElement('tr');head.forEach(h=>{const th=document.createElement('th');th.textContent=h;tr.append(th);});thead.append(tr);table.append(thead);const tb=document.createElement('tbody');for(const row of entries){const r=document.createElement('tr');for(const text of body(row)){const td=document.createElement('td');td.textContent=text;r.append(td);}tb.append(r);}table.append(tb);return table;}
$('preview-import').onclick=()=>{
  try{
    if(!history)throw new Error('Load your history before importing.');
    if(activeTab==='manual'){const val=$('manual-value').value;if(val==='')throw new Error('Enter the net worth amount.');importPoints=normalizePoints([{date:$('manual-date').value,netWorth:Number(val),note:$('manual-note').value,source:'manual'}]);}
    else importPoints=parseData($('import-text').value);
    const preview=previewMerge(points,importPoints);$('preview-summary').textContent=preview.added+' new · '+preview.revised+' revised · '+preview.unchanged+' unchanged';
    $('preview-table').replaceChildren(tableHtml(preview.changes.slice(0,100),['Date','Saved','Imported'],r=>[dateText(r.date),r.before===null?'New':money(r.before),money(r.after)]));
    $('revision-label').hidden=!preview.revised;$('allow-revisions').checked=false;$('import-preview').hidden=false;$('save-import').hidden=!(preview.added+preview.revised);$('preview-import').hidden=true;
    feedback(preview.added+preview.revised?'Review the changes, then save. Existing dates outside this import will be preserved.':'Everything already matches. Your timeline is up to date.');
  }catch(e){feedback(e.message,true);}
};
$('save-import').onclick=async()=>{
  const preview=previewMerge(points,importPoints);if(preview.revised&&!$('allow-revisions').checked)return feedback('Check the revision box to update existing dates.',true);
  $('save-import').disabled=true;
  try{const res=await localRequest('history',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({points:importPoints,expectedRevision:history.revision,allowRevisions:$('allow-revisions').checked,source:'web-import'})});const result=await res.json();if(!res.ok)throw new Error(result.error||'Could not save.');await loadHistory(true);$('import-dialog').close();toast('Saved '+result.added+' new and '+result.revised+' revised snapshots.');}
  catch(e){feedback(e.message,true);}finally{$('save-import').disabled=false;}
};
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
$('export-json').onclick=()=>exportFullBackup();
$('export-csv').onclick=()=>download('net-worth-'+points.at(-1).date+'.csv','date,netWorth\n'+points.map(p=>p.date+','+p.netWorth.toFixed(2)).join('\n'),'text/csv');
$('open-records').onclick=()=>{$('records-table').replaceChildren(tableHtml([...points].reverse(),['Date','Net worth'],p=>[dateText(p.date),money(p.netWorth)]));$('records-dialog').showModal();};
$('manual-date').value=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
await loadHistory();
