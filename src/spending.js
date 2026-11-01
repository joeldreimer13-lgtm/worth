// Spending is stored independently from balance snapshots. No bank credentials live here.
let spendingState=null,spendingMonths=[],spendingMonth=null,baselineChoice='average',spendingDay=null,categoriesExpanded=false,spendingGeometry=null,spendingImport=null;
const spendingChart=$('spend-chart'),spendingCtx=spendingChart.getContext('2d');
const categoryColors=['#00a63c','#38c775','#8adeb0','#b9ead0','#96cbfb','#339df8','#008cf0','#0674ce','#00579c','#7068d8','#a78ee5'];
const categoryPaths={
 shopping:'<path d="M6 7h12l1.5 14h-15L6 7Z"/><path d="M9 8V5a3 3 0 0 1 6 0v3"/>',
 groceries:'<path d="m4 10 2 11h12l2-11H4Zm-1 0h18M8 11l1 9m7-9-1 9M8 3l-4 7m12-7 4 7M12 11v9"/>',
 transportation:'<path d="m4 10 3-6h10l3 6M4 10h16l2 4v4h-3m-14 0H2v-4l2-4Zm3 8h10M9 4v6"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
 financial:'<path d="m2 8 10-5 10 5H2Zm2 13h16M5 11v7m7-7v7m7-7v7M3 18h18v3H3Z"/>',
 entertainment:'<path d="m4 8 2 13h12l2-13M8 9l1 11m7-11-1 11M12 9v11M4 8a3 3 0 0 1 2-5 3 3 0 0 1 5-1 3 3 0 0 1 5 0 3 3 0 0 1 4 5L16 9l-4-2-4 2-4-1Z"/>',
 education:'<path d="M5 3h14v18H6a2 2 0 0 1 0-4h13M5 3v16"/>',
 services:'<path d="M21 4a6 6 0 0 1-8 8l-8 8a2 2 0 0 1-3-3l8-8a6 6 0 0 1 8-8l-4 4 1 3 3 1 3-5Z"/>',
 dining_and_drinks:'<path d="M3 17h18M4 16a8 8 0 0 1 16 0M12 5v2M2 19h20M9 3h6"/>',
 housing:'<path d="m2 10 10-7 10 7M5 8v13h14V8M9 21v-7h6v7"/>',
 health_and_wellness:'<path d="M12 21S2 15 2 8a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 7-10 13-10 13Z"/>',
 bills_and_utilities:'<path d="m13 2-9 12h7l-1 8 10-13h-8l1-7Z"/>',
 other:'<circle cx="12" cy="12" r="9"/><path d="M7 12h.01M12 12h.01M17 12h.01"/>'
};
function monthLabel(month,year=false){return new Intl.DateTimeFormat('en-US',{month:'long',...(year?{year:'numeric'}:{}),timeZone:'UTC'}).format(new Date(dateToTime(month+'-01')));}
function monthOptionLabel(month){return monthLabel(month,month.slice(0,4)!==spendingMonths[0]?.month.slice(0,4));}
function spendMonthRecord(){return spendingMonths.find(m=>m.month===spendingMonth);}
function baselineRecord(){
 const m=spendMonthRecord();if(!m)return null;
 if(baselineChoice==='average')return averageSpending(spendingMonths,m.month);
 const b=spendingMonths.find(m=>m.month===baselineChoice);return b?{label:monthOptionLabel(b.month),months:[b.month],daily:Array.from({length:monthDays(m.month)+1},(_,day)=>({day,total:b.daily[Math.min(day,b.daysElapsed)].total}))}:null;
}
function option(value,label){const o=document.createElement('option');o.value=value;o.textContent=label;return o;}
function setMonthOptions(){
 for(const id of ['category-month','spend-month']){const select=$(id);select.replaceChildren(...spendingMonths.map(m=>option(m.month,monthOptionLabel(m.month))));select.value=spendingMonth;select.disabled=false;}
 const previous=spendingMonths.filter(m=>m.month!==spendingMonth),average=averageSpending(spendingMonths,spendingMonth);
 $('spend-baseline').replaceChildren(...(average?[option('average','Average month')]:[]),...previous.map(m=>option(m.month,monthOptionLabel(m.month))));
 if((baselineChoice==='average'&&!average)||(baselineChoice===spendingMonth)||!['average',...previous.map(m=>m.month)].includes(baselineChoice))baselineChoice=previous.find(m=>m.month===previousMonth(spendingMonth))?.month||previous[0]?.month||'';
 $('spend-baseline').value=baselineChoice;$('spend-baseline').disabled=!$('spend-baseline').options.length;
}
async function loadSpending(preserve=false){
 try{const res=await localRequest('spending');if(!res.ok)throw new Error((await res.json()).error||'Could not open local spending.');const data=await res.json();if(!data.months.length){spendingState=data;spendingMonths=[];$('spending').hidden=true;return;}$('spending').hidden=false;$('setup-card').hidden=true;const normalized=normalizeSpending(data);spendingState={...data,...normalized};spendingMonths=adjustedSpending(normalized);if(!preserve||!spendingMonths.some(m=>m.month===spendingMonth))spendingMonth=spendingMonths[0].month;
 spendingDay=null;setMonthOptions();renderCategories();updateSpendingReadout();drawSpending();$('spending-error').hidden=true;
 $('spending-asof').textContent='Imported through '+dateText(data.asOf,true);$('spending-coverage').textContent='Spending history: '+monthLabel(spendingMonths.at(-1).month,true)+'–'+monthLabel(spendingMonths[0].month,true)+'. Imported through '+dateText(data.asOf)+'. Average month uses the three complete months before the selected month, compared at the same day. A shorter month holds its final total for later days.';
 }catch(e){$('spending-error').textContent=e.message;$('spending-error').hidden=false;$('spending-asof').textContent='Unavailable';}
}
function renderCategories(){
 const m=spendMonthRecord();if(!m)return;
 $('spending-total').textContent=money(m.total);const positive=m.categories.filter(c=>c.amount>0),sum=positive.reduce((s,c)=>s+c.amount,0);
 $('category-strip').replaceChildren();for(const [i,c]of m.categories.entries()){if(c.amount<=0)continue;const segment=document.createElement('span');segment.className='category-segment';segment.style.flexGrow=String(c.amount/sum);segment.style.background=categoryColors[i%categoryColors.length];segment.title=c.label+': '+money(c.amount);$('category-strip').append(segment);}
 $('category-strip').setAttribute('aria-label',m.categories.map(c=>c.label+' '+money(c.amount)).join(', '));
 $('category-list').replaceChildren();for(const [i,c]of m.categories.entries()){if(!categoriesExpanded&&i>=5)break;const row=document.createElement('div');row.className='category-row';const icon=document.createElement('span');icon.className='category-icon';icon.setAttribute('aria-hidden','true');icon.innerHTML='<svg viewBox="0 0 24 24">'+(categoryPaths[c.key]||categoryPaths[c.key.replaceAll('-','_')]||categoryPaths[c.key.includes('dining')?'dining_and_drinks':c.key.includes('health')?'health_and_wellness':c.key.includes('bills')?'bills_and_utilities':'other'])+'</svg>';
 const main=document.createElement('div');main.className='category-main';const line=document.createElement('div');line.className='category-line';const name=document.createElement('span');name.className='category-name';name.textContent=c.label;const value=document.createElement('span');value.className='category-amount';value.textContent=money(c.amount);line.append(name,value);const track=document.createElement('div');track.className='category-track';track.setAttribute('aria-hidden','true');const fill=document.createElement('div');fill.className='category-fill';fill.style.width=Math.max(0,sum?c.amount/sum*100:0)+'%';fill.style.background=categoryColors[i%categoryColors.length];if(c.amount<=0)fill.style.display='none';track.append(fill);main.append(line,track);row.append(icon,main);$('category-list').append(row);}
 const toggle=$('show-categories');toggle.hidden=m.categories.length<=5;toggle.setAttribute('aria-expanded',String(categoriesExpanded));toggle.textContent=categoriesExpanded?'Show less':'Show all '+m.categories.length+' categories';const chevron=document.createElement('span');chevron.setAttribute('aria-hidden','true');chevron.textContent=categoriesExpanded?'⌃':'⌄';toggle.append(chevron);
 $('category-footnote').textContent='Net posted spending · '+m.daysElapsed+' '+(m.daysElapsed===1?'day':'days')+(m.adjustments.length?' · includes '+money(m.adjustments.reduce((s,a)=>s+a.amount,0))+' confirmed cash spending':'');
}
function selectSpendingMonth(month){spendingMonth=month;spendingDay=null;categoriesExpanded=false;setMonthOptions();renderCategories();updateSpendingReadout();drawSpending();}
function updateSpendingReadout(){
 const m=spendMonthRecord();if(!m)return;const b=baselineRecord(),day=spendingDay??m.daysElapsed,current=m.daily[day].total,previous=b?.daily[day]?.total;
 $('spend-current').textContent=money(current);$('spend-previous').textContent=previous===undefined?'—':money(previous);$('spend-delta').textContent=previous===undefined?'':(current-previous>0?'+':current-previous<0?'−':'')+money(Math.abs(cents(current-previous)));$('spend-delta').classList.toggle('under',previous!==undefined&&current<=previous);
 $('spend-date').textContent=(spendingDay===null?'Through ':day===0?'Start of ':'')+(day===0?monthLabel(m.month,true):dateText(m.month+'-'+String(day).padStart(2,'0')));$('clear-spending').hidden=spendingDay===null;
 const names=b?.months.map(s=>new Intl.DateTimeFormat('en-US',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(dateToTime(s+'-01')))).reverse().join(', ');
 $('baseline-note').textContent=b?(baselineChoice==='average'?'Average of '+names+'. ':'Compared with '+monthLabel(b.months[0],true)+'. ')+(spendingDay===null?'Values compare the same day of each month.':'Showing cumulative net spending on day '+day+'.'):'No complete comparison month is available.';
 spendingChart.setAttribute('aria-label',monthLabel(m.month,true)+' cumulative net spending, '+money(current)+' at '+(day===0?'the start of the month':'day '+day)+(previous===undefined?'':', versus '+money(previous)+' for '+b.label)+'. Drag or use left and right arrow keys to inspect. Escape clears selection.');
}
function drawSpending(){
 const m=spendMonthRecord();if(!m)return;const b=baselineRecord(),palette=chartPalette(),box=spendingChart.getBoundingClientRect(),w=box.width,h=box.height,dpr=Math.min(devicePixelRatio||1,3);if(!w||!h)return;
 spendingChart.width=Math.round(w*dpr);spendingChart.height=Math.round(h*dpr);const c=spendingCtx;c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
 const pad={l:8,r:52,t:17,b:30},pw=w-pad.l-pad.r,ph=h-pad.t-pad.b,days=monthDays(m.month),all=[...m.daily,...(b?.daily||[])].map(p=>p.total);
 const highest=Math.max(1,...all),lowest=Math.min(0,...all),rawStep=(highest-lowest)/4,power=10**Math.floor(Math.log10(rawStep)),step=[1,1.5,2,2.5,5,10].map(n=>n*power).find(n=>n>=rawStep)||power*10,min=Math.floor(lowest/step)*step,max=Math.ceil(highest/step)*step;
 const x=day=>pad.l+day/days*pw,y=value=>pad.t+(max-value)/(max-min)*ph;
 spendingGeometry={pad,pw,days,w,h,x,y};c.font='11px -apple-system,BlinkMacSystemFont,sans-serif';c.textBaseline='middle';c.lineWidth=1;
 for(let value=min;value<=max+.001;value+=step){const yy=y(value);c.strokeStyle=palette.grid;c.setLineDash([4,5]);c.beginPath();c.moveTo(pad.l,yy);c.lineTo(w-pad.r,yy);c.stroke();c.setLineDash([]);c.fillStyle=palette.muted;c.textAlign='left';const label=Math.abs(value)>=1000?'$'+(value/1000).toFixed(value%1000?1:0)+'K':compact(value);c.fillText(label,w-pad.r+8,yy);}
 const line=(series,color,width)=>{if(!series?.length)return;c.beginPath();series.forEach((p,i)=>{if(i===0)c.moveTo(x(p.day),y(p.total));else c.lineTo(x(p.day),y(p.total));});c.strokeStyle=color;c.lineWidth=width;c.lineJoin='round';c.lineCap='round';c.stroke();};
 if(b)line(b.daily,palette.comparison,2.7);
 const gradient=c.createLinearGradient(0,pad.t,0,h-pad.b);gradient.addColorStop(0,palette['fill-top']);gradient.addColorStop(1,palette['fill-bottom']);c.beginPath();c.moveTo(x(0),y(min));for(const p of m.daily)c.lineTo(x(p.day),y(p.total));c.lineTo(x(m.daysElapsed),y(min));c.closePath();c.fillStyle=gradient;c.fill();line(m.daily,palette.green,3);
 for(const day of [1,Math.round(days/2),days]){c.textAlign=day===1?'left':day===days?'right':'center';c.fillStyle=palette.muted;c.fillText(new Intl.DateTimeFormat('en-US',{month:'short',timeZone:'UTC'}).format(new Date(dateToTime(m.month+'-01')))+' '+day,x(day),h-9);}
 if(spendingDay!==null){const xx=x(spendingDay);c.strokeStyle=palette.crosshair;c.lineWidth=1.2;c.beginPath();c.moveTo(xx,pad.t);c.lineTo(xx,h-pad.b);c.stroke();for(const [value,color]of [[b?.daily[spendingDay]?.total,palette.comparison],[m.daily[spendingDay]?.total,palette.green]]){if(value===undefined)continue;c.beginPath();c.arc(xx,y(value),5.5,0,Math.PI*2);c.fillStyle=color;c.fill();c.lineWidth=3;c.strokeStyle=palette.card;c.stroke();}}
}
function inspectSpending(clientX){const m=spendMonthRecord();if(!m||!spendingGeometry)return;const g=spendingGeometry,x=clientX-spendingChart.getBoundingClientRect().left;spendingDay=Math.max(0,Math.min(m.daysElapsed,Math.round((x-g.pad.l)/g.pw*g.days)));updateSpendingReadout();drawSpending();}
let spendingPointer=null;
spendingChart.addEventListener('pointerdown',e=>{if(!spendingState)return;spendingPointer=e.pointerId;spendingChart.setPointerCapture(e.pointerId);inspectSpending(e.clientX);});
spendingChart.addEventListener('pointermove',e=>{if(e.pointerId===spendingPointer||(e.pointerType==='mouse'&&!e.buttons))inspectSpending(e.clientX);});
for(const name of ['pointerup','pointercancel','lostpointercapture'])spendingChart.addEventListener(name,()=>spendingPointer=null);
spendingChart.addEventListener('keydown',e=>{const m=spendMonthRecord();if(!m)return;let day=spendingDay??m.daysElapsed;if(e.key==='ArrowLeft')day--;else if(e.key==='ArrowRight')day++;else if(e.key==='Home')day=0;else if(e.key==='End')day=m.daysElapsed;else if(e.key==='Escape'){spendingDay=null;updateSpendingReadout();drawSpending();return;}else return;e.preventDefault();spendingDay=Math.min(m.daysElapsed,Math.max(0,day));updateSpendingReadout();drawSpending();});
$('category-month').onchange=e=>selectSpendingMonth(e.target.value);$('spend-month').onchange=e=>selectSpendingMonth(e.target.value);$('spend-baseline').onchange=e=>{baselineChoice=e.target.value;updateSpendingReadout();drawSpending();};$('show-categories').onclick=()=>{categoriesExpanded=!categoriesExpanded;renderCategories();};$('clear-spending').onclick=()=>{spendingDay=null;updateSpendingReadout();drawSpending();};
new ResizeObserver(drawSpending).observe(spendingChart);window.addEventListener('worth-theme-change',drawSpending);
$('refresh').onclick=async()=>{$('refresh').disabled=true;await Promise.all([loadHistory(true),loadSpending(true)]);$('refresh').disabled=false;};
const originalPreview=$('preview-import').onclick,originalSave=$('save-import').onclick;
$('spending-import-text').addEventListener('input',()=>{spendingImport=null;resetPreview();});
$('spending-import-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>3000000)return feedback('Choose a file smaller than 3 MB.',true);$('spending-import-text').value=await file.text();spendingImport=null;resetPreview();feedback('Loaded '+file.name+'. Preview before saving.');};
$('preview-import').onclick=()=>{
 if(activeTab!=='spending')return originalPreview();
 try{if(!spendingState)throw new Error('Load spending before importing.');spendingImport=normalizeSpending(JSON.parse($('spending-import-text').value));const preview=previewSpending(spendingState,spendingImport);$('preview-summary').textContent=preview.added+' new · '+preview.revised+' revised · '+preview.unchanged+' unchanged spending records';$('preview-table').replaceChildren(tableHtml(preview.changes.slice(0,100),['Month / cash date','Saved','Imported'],r=>[r.date.slice(8)==='01'?monthLabel(r.date.slice(0,7),true):dateText(r.date),r.before===null?'New':money(r.before),money(r.after)]));$('revision-label').hidden=!preview.revised;$('allow-revisions').checked=false;$('import-preview').hidden=false;$('save-import').hidden=!(preview.added+preview.revised);$('preview-import').hidden=true;feedback(preview.added+preview.revised?'Review the changes, then save. Earlier months and cash corrections are preserved.':'Everything already matches. Spending is up to date.');}catch(e){feedback(e instanceof SyntaxError?'Paste valid spending JSON first.':e.message,true);}
};
$('save-import').onclick=async()=>{
 if(activeTab!=='spending')return originalSave();if(!spendingImport)return;const preview=previewSpending(spendingState,spendingImport);if(preview.revised&&!$('allow-revisions').checked)return feedback('Allow revisions to update existing spending records.',true);
 $('save-import').disabled=true;try{const res=await localRequest('spending',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...spendingImport,expectedRevision:spendingState.revision,allowRevisions:$('allow-revisions').checked})}),result=await res.json();if(!res.ok)throw new Error(result.error||'Could not save spending.');await loadSpending(true);$('import-dialog').close();toast('Saved spending: '+result.added+' new, '+result.revised+' revised.');}catch(e){feedback(e.message,true);}finally{$('save-import').disabled=false;}
};
$('export-spending').onclick=()=>{if(spendingState)download('spending-'+spendingState.asOf+'.json',JSON.stringify(spendingState,null,2),'application/json');};
await loadSpending();
