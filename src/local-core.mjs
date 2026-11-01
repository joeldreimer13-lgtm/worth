import {normalizePoints,previewMerge,mergePoints} from './core.mjs';
import {normalizeSpending,previewSpending,mergeSpendingMonths} from './spending-core.mjs';
export function localRevision(){return [...crypto.getRandomValues(new Uint8Array(16))].map(v=>v.toString(16).padStart(2,'0')).join('');}
export function emptyLedger(){return{format:'worth-backup-v1',schemaVersion:1,history:{schemaVersion:1,currency:'USD',scope:'Cash and savings minus cards; retirement excluded.',points:[],revision:localRevision(),storageReady:true},spending:{schemaVersion:1,type:'spending',currency:'USD',months:[],adjustments:[],revision:localRevision(),storageReady:true}};}
function conflict(message){const e=new Error(message);e.status=409;throw e;}
export function mergeLocalHistory(current,payload){
 const points=normalizePoints(payload),preview=previewMerge(current.points,points);
 if(payload.expectedRevision&&payload.expectedRevision!==current.revision)conflict('Records changed in another tab. Refresh and preview again.');
 if(preview.revised&&(!payload.allowRevisions||!payload.expectedRevision))conflict('Explicitly allow revisions and preview the current records before changing balances.');
 if(!preview.added&&!preview.revised)return{data:current,result:{...preview,revision:current.revision,asOf:current.asOf,total:current.points.length}};
 const merged=mergePoints(current.points,points),data={...current,points:merged,asOf:merged.at(-1).date,revision:localRevision(),updatedAt:new Date().toISOString()};
 return{data,result:{...preview,revision:data.revision,asOf:data.asOf,total:merged.length}};
}
export function mergeLocalSpending(current,payload){
 const incoming=normalizeSpending(payload),preview=previewSpending(current,incoming);
 if(payload.expectedRevision&&payload.expectedRevision!==current.revision)conflict('Spending changed in another tab. Refresh and preview again.');
 if(preview.revised&&(!payload.allowRevisions||!payload.expectedRevision))conflict('Explicitly allow revisions and preview the current spending before changing it.');
 if(!preview.added&&!preview.revised)return{data:current,result:{...preview,revision:current.revision,asOf:current.asOf,total:current.months.length}};
 const data={...current,...incoming,months:mergeSpendingMonths(current.months,incoming.months),adjustments:[...new Map([...current.adjustments,...incoming.adjustments].map(a=>[a.id,a])).values()],asOf:incoming.asOf>(current.asOf||'')?incoming.asOf:current.asOf,revision:localRevision(),updatedAt:new Date().toISOString(),storageReady:true};
 return{data,result:{...preview,revision:data.revision,asOf:data.asOf,total:data.months.length}};
}
export function normalizeBackup(payload){
 if(payload?.format!=='worth-backup-v1'||payload.schemaVersion!==1)throw new Error('Choose a Worth full backup JSON file. Individual history and spending files go in Add data.');
 const points=payload.history?.points?.length?normalizePoints(payload.history):[];
 const spending=payload.spending?.months?.length?normalizeSpending(payload.spending):null;
 if(!points.length&&!spending)throw new Error('This backup has no financial records.');
 return{format:'worth-backup-v1',schemaVersion:1,history:{points},spending};
}
export function previewBackup(current,backup){
 const h=backup.history.points.length?previewMerge(current.history.points,backup.history.points):{added:0,revised:0,unchanged:0};
 const s=backup.spending?previewSpending(current.spending,backup.spending):{added:0,revised:0,unchanged:0};
 return{history:h,spending:s,revised:h.revised+s.revised};
}
export function restoreLocal(current,backup,expectedRevision,allowRevisions=false){
 if(current.history.revision!==expectedRevision.history||current.spending.revision!==expectedRevision.spending)conflict('Records changed after the backup preview. Open the file again.');
 const history=backup.history.points.length?mergeLocalHistory(current.history,{...backup.history,expectedRevision:current.history.revision,allowRevisions}).data:current.history;
 const spending=backup.spending?mergeLocalSpending(current.spending,{...backup.spending,expectedRevision:current.spending.revision,allowRevisions}).data:current.spending;
 return{...current,history,spending};
}
