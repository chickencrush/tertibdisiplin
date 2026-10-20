/* Enable profile text drafts without bypassing the original save permission. */
(() => {
  'use strict';
  const root=document.getElementById('td-personal-profile-host')?.shadowRoot;
  if(!root||root.__tdTextRepair)return;
  const form=root.getElementById('form'),legacy=root.getElementById('fields'),serverStatus=root.getElementById('status');
  if(!form||!legacy||!serverStatus)return;
  root.__tdTextRepair=true;
  const ids=['name','email','phone','address'],draft=new Map();
  const fields=document.createElement('fieldset'),legend=document.createElement('legend'),hint=document.createElement('p');
  legend.textContent='Edit data diri';fields.append(legend);hint.setAttribute('role','status');hint.setAttribute('aria-live','polite');
  form.insertBefore(fields,legacy);form.insertBefore(hint,legacy);
  ids.forEach(id=>{const input=root.getElementById(id),label=input?.closest('label');if(label)fields.append(label);});
  const oldLegend=legacy.querySelector('legend');if(oldLegend)oldLegend.textContent='Validasi dan penyimpanan';
  const gate=document.getElementById('auth-gate-screen');let owner='',queued=false,sawSaving=false;
  function session(){const user=typeof AppState!=='undefined'?AppState.currentUser:null;let token='';try{token=localStorage.getItem('td_token')||'';}catch(_){}return user?.id&&(!gate||gate.classList.contains('hidden'))?JSON.stringify([String(user.id),token]):'';}
  function render(){
    queued=false;const next=session();if(next!==owner){owner=next;draft.clear();sawSaving=false;}
    const saving=serverStatus.textContent==='Menyimpan profil...';
    if(saving)sawSaving=true;
    if(sawSaving&&serverStatus.textContent.startsWith('Profil tersimpan di server.')){draft.clear();sawSaving=false;}
    if(!saving&&serverStatus.textContent.includes('sebelum mencoba lagi'))sawSaving=false;
    fields.disabled=!owner||saving;
    for(const [id,value] of draft){const field=root.getElementById(id);if(field&&field.value!==value)field.value=value;}
    const text=!owner?'Login untuk mengisi profil.':saving?'Sedang menyimpan profil ke server.':legacy.disabled?'Anda dapat mengetik draf. Simpan masih menunggu validasi server; lihat status di atas.':'Draf siap. Klik Simpan profil untuk meminta penyimpanan ke server.';
    if(hint.textContent!==text)hint.textContent=text;
  }
  function schedule(){if(!queued){queued=true;queueMicrotask(render);}}
  fields.addEventListener('input',event=>{if(ids.includes(event.target.id)){if(session()!==owner){owner=session();draft.clear();}draft.set(event.target.id,event.target.value);}});
  form.addEventListener('reset',event=>{if(owner&&owner===session()&&draft.size)event.preventDefault();},true);
  new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
  new MutationObserver(schedule).observe(legacy,{attributes:true,attributeFilter:['disabled']});
  if(gate)new MutationObserver(schedule).observe(gate,{attributes:true,attributeFilter:['class']});
  window.addEventListener('td-session-expired',()=>{owner='';draft.clear();fields.disabled=true;});
  window.addEventListener('storage',event=>{if(event.key==='td_token'||event.key===null){owner='';draft.clear();schedule();}});
  render();
})();
