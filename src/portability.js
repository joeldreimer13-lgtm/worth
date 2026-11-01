let restoreCandidate=null,restoreExpected=null;
async function exportFullBackup(){try{const data=await readLocalLedger();if(!data.history.points.length&&!data.spending.months.length)return toast('Add records or restore a backup first.');download('Worth_Backup_'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({...data,exportedAt:new Date().toISOString()},null,2),'application/json');toast('Backup downloaded. Keep it in Files.');}catch(e){toast(e.message);}}
function openBackupChooser(){$('restore-file').value='';$('restore-file').click();}
for(const b of document.querySelectorAll('[data-open-backup]'))b.onclick=openBackupChooser;
$('backup-dialog-export').onclick=exportFullBackup;
$('start-manual').onclick=()=>{openImport();document.querySelector('[data-tab="manual"]').click();};
$('restore-file').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 try{if(file.size>8000000)throw new Error('Choose a backup smaller than 8 MB.');restoreCandidate=normalizeBackup(JSON.parse(await file.text()));const state=await readLocalLedger(),preview=previewBackup(state,restoreCandidate);restoreExpected={history:state.history.revision,spending:state.spending.revision};
 $('restore-summary').textContent=restoreCandidate.history.points.length+' daily snapshots and '+(restoreCandidate.spending?.months.length||0)+' spending months. '+(preview.history.added+preview.spending.added)+' new records; '+preview.revised+' revisions; '+(preview.history.unchanged+preview.spending.unchanged)+' unchanged.';
 $('restore-revision-label').hidden=!preview.revised;$('restore-revisions').checked=false;$('restore-feedback').hidden=true;
 if($('import-dialog').open)$('import-dialog').close();$('restore-dialog').showModal();
 }catch(e){toast(e instanceof SyntaxError?'This file is not valid JSON.':e.message);}
};
$('restore-confirm').onclick=async()=>{
 if(!restoreCandidate)return;$('restore-confirm').disabled=true;
 try{await changeLocalLedger(old=>({data:restoreLocal(old,restoreCandidate,restoreExpected,$('restore-revisions').checked),result:{saved:true}}));await loadHistory();await loadSpending();$('restore-dialog').close();toast('Backup restored on this device. No records were uploaded.');}
 catch(e){$('restore-feedback').textContent=e.message;$('restore-feedback').hidden=false;}
 finally{$('restore-confirm').disabled=false;}
};
$('request-persistence').onclick=async()=>{try{const granted=await navigator.storage?.persist?.();$('persistence-status').textContent=granted?'Browser persistence granted. Keep an exported backup as well.':'Your browser decides retention automatically. Keep an exported backup in Files.';}catch{$('persistence-status').textContent='Persistence cannot be requested here. Keep an exported backup in Files.';}};
