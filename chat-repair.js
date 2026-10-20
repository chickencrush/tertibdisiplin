/* Reuse existing chat payloads and controllers; guard status and late bodies. */
(() => {
  'use strict';
  const panel=document.getElementById('view-chat');if(!panel||window.__tdChatRepair)return;window.__tdChatRepair=true;
  const gate=document.getElementById('auth-gate-screen'),bar=document.createElement('div'),notice=document.createElement('p'),refresh=document.createElement('button');
  bar.className='modern-card';bar.style.marginBottom='12px';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');refresh.type='button';refresh.className='btn-secondary';refresh.textContent='Muat ulang pesan';bar.append(refresh,notice);panel.prepend(bar);
  const input=()=>panel.querySelector('.chat-input-bar textarea,.chat-input-bar input:not([type="file"]):not([type="hidden"]),form textarea,form input[type="text"]');
  let owner='',epoch=0,busy=false,loading=false,outcome=null,uncertain=false;
  function session(){const u=typeof AppState!=='undefined'?AppState.currentUser:null;let token='';try{token=localStorage.getItem('td_token')||'';}catch(_){}return u?.id&&(!gate||gate.classList.contains('hidden'))?JSON.stringify([String(u.id),token]):'';}
  const channel=()=>typeof AppState!=='undefined'?AppState.activeChatChannel:'#general';
  const same=(g,s)=>g===epoch&&s===owner&&s===session();
  function status(text,error=false){notice.textContent=text;notice.style.color=error?'#a11935':'#475569';}
  function controls(){refresh.disabled=!owner||busy||loading;const field=input();if(field)field.disabled=!owner||busy;panel.querySelectorAll('.chat-input-bar button,form button[type="submit"]').forEach(b=>{b.disabled=!owner||busy;});}
  function sync(){const s=session();if(s!==owner){owner=s;epoch++;busy=false;loading=false,outcome=null;uncertain=false;if(input())input().value='';panel.querySelector('.chat-stream-body')?.replaceChildren();status(owner?'Buka panel atau muat ulang pesan.':'Login untuk menggunakan chat.');}controls();return !!owner;}
  const upstream=window.fetch.bind(window);
  window.fetch=async function(request,init){
    let url;try{url=new URL(typeof request==='string'?request:request.url,location.href);}catch(_){return upstream(request,init);}
    if(url.origin!==location.origin||url.pathname!=='/api/chat/messages')return upstream(request,init);
    const method=String(init?.method||(typeof request!=='string'&&request.method)||'GET').toUpperCase(),g=epoch,s=session(),ch=url.searchParams.get('channel')||channel();
    function check(){if(!same(g,s)||method==='GET'&&ch!==channel())throw Error('Sesi atau saluran berubah; respons lama diabaikan.');}
    try{
      check();const response=await upstream(request,init);check();
      const data=await response.clone().json();check();
      if(!response.ok||data?.status==='error'){
        if(method==='POST')outcome=response.status>=500?'uncertain':'failed';
        const detail=[404,501].includes(response.status)?'Endpoint chat belum tersedia pada deployment Apps Script.':data?.detail||data?.message||'Chat gagal ('+response.status+').';status(detail,true);
        if(response.ok)return new Response(JSON.stringify({detail}),{status:422,headers:{'Content-Type':'application/json'}});return response;
      }
      if(method==='GET'){if(!Array.isArray(data))throw Error('Format chat tidak sesuai: server harus mengembalikan daftar pesan.');status(data.length?'Pesan dimuat dari server.':'Belum ada pesan pada saluran ini.');}
      if(method==='POST'){outcome=data?.status==='success'||data?.id||data?.message?.id?'confirmed':'uncertain';status(outcome==='confirmed'?'Server mengonfirmasi pesan terkirim.':'Hasil kirim belum pasti. Periksa riwayat sebelum mencoba lagi.',outcome!=='confirmed');}
      const read=response.json.bind(response);response.json=async function(){const body=await read();check();return body;};return response;
    }catch(error){if(same(g,s)){if(method==='POST')outcome='uncertain';status(error.message,true);}throw error;}
  };
  async function load(){if(!sync()||busy||loading||document.hidden||!panel.classList.contains('active'))return;const ch=channel();if(typeof canAccessChannel!=='function'||!canAccessChannel(ch)){status('Saluran tidak diizinkan.',true);return;}if(typeof loadChatMessages!=='function'){status('Controller pembaca chat tidak ditemukan.',true);return;}const g=epoch,s=owner;loading=true;controls();status('Memuat pesan...');try{await loadChatMessages(ch);}catch(error){if(same(g,s))status(error.message,true);}finally{if(same(g,s)){loading=false;controls();}else sync();}}
  async function send(event){event.preventDefault();event.stopImmediatePropagation();if(!sync()||busy)return;const field=input();if(!field||!field.value.trim())return status('Tulis pesan terlebih dahulu.',true);if(typeof canAccessChannel!=='function'||!canAccessChannel(channel()))return status('Saluran tidak diizinkan.',true);if(typeof sendChatMessage!=='function')return status('Controller pengirim chat tidak ditemukan.',true);if(uncertain&&!confirm('Pengiriman sebelumnya belum pasti. Sudah periksa riwayat dan tetap ingin mengirim?'))return;const text=field.value,g=epoch,s=owner;busy=true;outcome=null;controls();status('Mengirim pesan...');try{await sendChatMessage(event);if(!same(g,s))return;if(outcome!=='confirmed'){field.value=text;uncertain=outcome!=='failed';if(outcome===null)status('Belum ada konfirmasi server. Pesan dipertahankan.',true);}else uncertain=false;}catch(error){if(same(g,s)){field.value=text;uncertain=true;status(error.message+' Pesan dipertahankan; periksa riwayat.',true);}}finally{if(same(g,s)){busy=false;controls();if(outcome==='confirmed')load();}else sync();}}
  panel.addEventListener('submit',send,true);
  panel.addEventListener('keydown',event=>{if(event.target===input()&&event.key==='Enter'&&!event.shiftKey&&!event.isComposing)send(event);},true);
  panel.addEventListener('click',event=>{const b=event.target.closest('button');if(b&&/sendChatMessage/.test(b.getAttribute('onclick')||''))send(event);},true);
  refresh.addEventListener('click',load);
  new MutationObserver(()=>{sync();if(panel.classList.contains('active'))load();}).observe(panel,{attributes:true,attributeFilter:['class']});
  if(gate)new MutationObserver(()=>{sync();if(owner&&panel.classList.contains('active'))load();}).observe(gate,{attributes:true,attributeFilter:['class']});
  window.addEventListener('td-session-expired',()=>{owner='';epoch++;busy=false;loading=false;if(input())input().value='';panel.querySelector('.chat-stream-body')?.replaceChildren();status('Sesi berakhir. Login kembali.',true);controls();});
  window.addEventListener('storage',event=>{if(event.key==='td_token'||event.key===null)sync();});
  setInterval(()=>{if(sync()&&panel.classList.contains('active')&&!document.hidden)load();},15000);
  sync();if(owner&&panel.classList.contains('active'))load();
})();
