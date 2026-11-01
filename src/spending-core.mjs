import {dateToTime} from './core.mjs';
// Shared by the browser, private API, and update tools. Dollars are rounded once.
export const cents = v => Math.round((v + Number.EPSILON) * 100) / 100;
export function monthDays(month){dateToTime(month+'-01');return new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();}
function amount(v){if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>1e12)throw new Error('Spending needs finite dollar amounts.');return cents(v);}
function cleanText(v,max=150){return String(v||'').slice(0,max);}
export function previousMonth(month,n=1){const d=new Date(dateToTime(month+'-01'));d.setUTCMonth(d.getUTCMonth()-n);return d.toISOString().slice(0,7);}
export function normalizeSpending(payload){
  if(payload?.categoryData&&payload?.comparisonData)return normalizeSpending(fromSpendingWidgets(payload));
  if(!Array.isArray(payload?.months)||!payload.months.length||payload.months.length>600)throw new Error('Spending JSON needs 1–600 monthly records.');
  const seen=new Set();
  const months=payload.months.map(m=>{
    if(!/^\d{4}-\d{2}$/.test(m.month||''))throw new Error('Use YYYY-MM for a spending month.');
    const days=monthDays(m.month);if(seen.has(m.month))throw new Error('Duplicate spending month: '+m.month);seen.add(m.month);
    const daysElapsed=m.daysElapsed??days;
    if(!Number.isInteger(daysElapsed)||daysElapsed<0||daysElapsed>days)throw new Error('Invalid elapsed days for '+m.month);
    if(!Array.isArray(m.categories)||m.categories.length>100)throw new Error('Each month needs a categories array.');
    const keys=new Set(),categories=m.categories.map(c=>{
      if(!/^[a-z0-9_-]{1,60}$/.test(c.key||'')||keys.has(c.key))throw new Error('Category keys must be unique simple names.');keys.add(c.key);
      return{key:c.key,label:cleanText(c.label||c.key,80),amount:amount(c.amount)};
    }).sort((a,b)=>b.amount-a.amount||a.key.localeCompare(b.key));
    const total=amount(m.total);
    if(Math.abs(cents(categories.reduce((s,c)=>s+c.amount,0))-total)>.02)throw new Error('Category totals do not match '+m.month+'.');
    if(!Array.isArray(m.daily)||m.daily.length!==daysElapsed+1)throw new Error('Include day 0 through each elapsed day for '+m.month+'.');
    const daily=m.daily.map((p,i)=>{if(p.day!==i)throw new Error('Daily spending must be consecutive from day 0.');return{day:i,total:amount(p.total)};});
    if(daily[0].total!==0||Math.abs(daily.at(-1).total-total)>.01)throw new Error('Daily spending must start at zero and finish at the monthly total.');
    return{month:m.month,daysElapsed,total,categories,daily};
  }).sort((a,b)=>b.month.localeCompare(a.month));
  let asOf=payload.asOf||months[0].month+'-'+String(Math.max(1,months[0].daysElapsed)).padStart(2,'0');dateToTime(asOf);
  const adjustments=(payload.adjustments||[]).map(a=>({id:cleanText(a.id,100),date:a.date,amount:amount(a.amount),key:cleanText(a.key,60),label:cleanText(a.label,80),note:cleanText(a.note,500)}));
  const ids=new Set();for(const a of adjustments){dateToTime(a.date);if(!a.id||ids.has(a.id)||!/^[a-z0-9_-]{1,60}$/.test(a.key))throw new Error('Cash adjustments need unique IDs and category keys.');ids.add(a.id);}
  return{schemaVersion:1,type:'spending',currency:'USD',asOf,source:cleanText(payload.source||'connected-accounts'),months,adjustments};
}
export function fromSpendingWidgets(payload){
  const unwrap=v=>v?.data||v,category=unwrap(payload.categoryData),comparison=unwrap(payload.comparisonData);
  if(!category?.month_views||!comparison?.month_views)throw new Error('Include both category and comparison month views.');
  const months=comparison.month_views.map(m=>{
    const c=category.month_views.find(c=>c.month_start===m.month_start);if(!c)throw new Error('Missing categories for '+m.month_start);
    const month=m.month_start.slice(0,7),elapsed=Math.min(m.days_elapsed,monthDays(month));
    return{month,daysElapsed:elapsed,total:m.total_spend,categories:c.categories.map(c=>({key:c.primary_category_key,label:c.primary_category,amount:c.amount_value})),daily:m.points.filter(p=>p.day<=elapsed).map(p=>({day:p.day,total:p.cumulative_spend}))};
  });
  return{type:'spending',asOf:payload.asOf,months,adjustments:payload.adjustments||[]};
}
export function previewSpending(current,incoming){
  const byMonth=new Map((current?.months||[]).map(m=>[m.month,m]));let added=0,revised=0,unchanged=0;const changes=[];
  for(const m of incoming.months){const old=byMonth.get(m.month);if(!old)added++;else if(JSON.stringify(old)===JSON.stringify(m))unchanged++;else revised++;if(!old||JSON.stringify(old)!==JSON.stringify(m))changes.push({date:m.month+'-01',before:old?.total??null,after:m.total});}
  const oldAdjustments=new Map((current?.adjustments||[]).map(a=>[a.id,a]));
  for(const a of incoming.adjustments||[]){const old=oldAdjustments.get(a.id);if(!old)added++;else if(JSON.stringify(old)===JSON.stringify(a))unchanged++;else revised++;if(!old||JSON.stringify(old)!==JSON.stringify(a))changes.push({date:a.date,before:old?.amount??null,after:a.amount,label:a.note});}
  return{added,revised,unchanged,changes};
}
export function mergeSpendingMonths(current,incoming){return[...new Map([...current,...incoming].map(m=>[m.month,m])).values()].sort((a,b)=>b.month.localeCompare(a.month));}
export function adjustedSpending(data){
  return data.months.map(original=>{
    const m={...original,categories:original.categories.map(c=>({...c})),daily:original.daily.map(p=>({...p})),adjustments:[]};
    for(const a of data.adjustments||[]){const day=Number(a.date.slice(8));if(a.date.slice(0,7)!==m.month||day>m.daysElapsed)continue;
      m.adjustments.push(a);m.total=cents(m.total+a.amount);let c=m.categories.find(c=>c.key===a.key);if(!c){c={key:a.key,label:a.label,amount:0};m.categories.push(c);}c.amount=cents(c.amount+a.amount);
      for(const p of m.daily)if(p.day>=day)p.total=cents(p.total+a.amount);
    }
    m.categories.sort((a,b)=>b.amount-a.amount);return m;
  });
}
export function averageSpending(months,month){
  const previous=[1,2,3].map(n=>months.find(m=>m.month===previousMonth(month,n)));if(previous.some(m=>!m||m.daysElapsed!==monthDays(m.month)))return null;
  return{label:'Average month',months:previous.map(m=>m.month),daily:Array.from({length:monthDays(month)+1},(_,day)=>({day,total:cents(previous.reduce((s,m)=>s+m.daily[Math.min(day,m.daysElapsed)].total,0)/3)}))};
}
