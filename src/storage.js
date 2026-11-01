// All financial state is browser-local. No API, login, or cloud database.
let dbPromise;
function openLedgerDB(){
 if(dbPromise)return dbPromise;
 dbPromise=new Promise((resolve,reject)=>{
  const req=indexedDB.open('worth-standalone-v1',1);
  req.onupgradeneeded=()=>{const db=req.result;db.createObjectStore('ledger').put(emptyLedger(),'current');db.createObjectStore('backups');};
  req.onsuccess=()=>{req.result.onversionchange=()=>req.result.close();resolve(req.result);};
  req.onerror=()=>reject(new Error('Safari could not open local storage. Use normal browsing and keep an exported backup.'));
  req.onblocked=()=>reject(new Error('Close other Worth tabs, then reload to open storage.'));
 });return dbPromise;
}
async function readLocalLedger(){const db=await openLedgerDB();return new Promise((resolve,reject)=>{const req=db.transaction('ledger','readonly').objectStore('ledger').get('current');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function changeLocalLedger(reduce){
 const db=await openLedgerDB();return new Promise((resolve,reject)=>{
  const tx=db.transaction(['ledger','backups'],'readwrite'),store=tx.objectStore('ledger'),request=store.get('current');let output,error;
  request.onsuccess=()=>{try{const old=request.result,{data,result}=reduce(old);output=result;if(data.history.revision!==old.history.revision||data.spending.revision!==old.spending.revision){tx.objectStore('backups').put(old,new Date().toISOString()+'-'+localRevision());store.put(data,'current');}}catch(e){error=e;tx.abort();}};
  tx.oncomplete=()=>resolve(output);tx.onabort=()=>reject(error||new Error('Could not save. Your previous records are unchanged. Export a backup and check device storage.'));tx.onerror=()=>{error=error||tx.error;};
 });
}
async function localRequest(kind,options={}){
 try{
  let value;
  if(options.method==='POST'){const payload=JSON.parse(options.body);value=await changeLocalLedger(old=>{const merged=kind==='history'?mergeLocalHistory(old.history,payload):mergeLocalSpending(old.spending,payload);return{data:{...old,[kind]:merged.data},result:merged.result};});}
  else value=(await readLocalLedger())[kind];
  return{ok:true,status:200,json:async()=>value};
 }catch(e){return{ok:false,status:e.status||400,json:async()=>({error:e.message})};}
}
