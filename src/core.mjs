export const DAY = 86400000;
export function dateToTime(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Use dates in YYYY-MM-DD format.');
  const t = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0,10) !== date) throw new Error('Invalid calendar date: ' + date);
  return t;
}
export function normalizePoints(payload) {
  const input = Array.isArray(payload) ? payload : payload?.points ?? payload?.chart_points ?? payload?.data?.interval_views?.MAX?.chart_points ?? payload?.interval_views?.MAX?.chart_points;
  if (!Array.isArray(input) || !input.length) throw new Error('Add at least one point with date and netWorth.');
  if (input.length > 50000) throw new Error('Import at most 50,000 daily points at a time.');
  const byDate = new Map();
  for (const p of input) {
    const date = p.date;
    dateToTime(date);
    const value = p.netWorth ?? p.net_worth;
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e12) throw new Error('netWorth must be a finite dollar number for ' + date);
    const point = {date, netWorth: Math.round(value * 100) / 100, source: String(p.source || payload?.source || 'import').slice(0,120)};
    if (p.note) point.note = String(p.note).slice(0,500);
    if (byDate.has(date) && byDate.get(date).netWorth !== point.netWorth) throw new Error('Conflicting values for ' + date + ' in the same import.');
    byDate.set(date,point);
  }
  return [...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
export function previewMerge(current, incoming) {
  const existing = new Map(current.map(p=>[p.date,p]));
  const result = {added:0,revised:0,unchanged:0,changes:[]};
  for (const p of incoming) {
    const old=existing.get(p.date);
    if (!old) {result.added++;result.changes.push({date:p.date,before:null,after:p.netWorth});}
    else if (old.netWorth !== p.netWorth) {result.revised++;result.changes.push({date:p.date,before:old.netWorth,after:p.netWorth});}
    else result.unchanged++;
  }
  return result;
}
export function mergePoints(current, incoming) {
  const map=new Map(current.map(p=>[p.date,p]));
  for(const p of incoming) {if(map.get(p.date)?.netWorth !== p.netWorth) map.set(p.date,p);}
  return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
export function clampWindow(start,end,min,max) {
  const whole=Math.max(0,max-min);
  const span=Math.min(Math.max(end-start,Math.min(2*DAY,whole)),whole);
  const lo=Math.max(min,Math.min(start,max-span));
  return [lo,lo+span];
}
export function nearestPoint(points,time) {
  if(!points.length) return null;
  let lo=0,hi=points.length-1;
  while(lo<hi){const m=Math.floor((lo+hi)/2);if(dateToTime(points[m].date)<time)lo=m+1;else hi=m;}
  if(lo===0)return points[0];
  return Math.abs(dateToTime(points[lo].date)-time)<Math.abs(dateToTime(points[lo-1].date)-time)?points[lo]:points[lo-1];
}
// Used only to distinguish touch regions along the drawn line. Displayed dollar
// values always come from nearestPoint; this never creates a historical record.
export function lineHitValue(points,time) {
  if(!points.length)return 0;
  if(time<=dateToTime(points[0].date))return points[0].netWorth;
  for(let i=1;i<points.length;i++){
    const end=dateToTime(points[i].date);
    if(time<=end){const start=dateToTime(points[i-1].date),ratio=(time-start)/(end-start);return points[i-1].netWorth+(points[i].netWorth-points[i-1].netWorth)*ratio;}
  }
  return points.at(-1).netWorth;
}
