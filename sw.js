// Build-generated shell and content hashes. Only unchanged downloaded assets survive updates.
const SHELL='slouch-shell-__BUILD__';
const ASSETS='slouch-content-v2';
const CORE=/*__SHELL__*/[];
const HASHES=/*__HASHES__*/{};
const root=new URL('./',self.location.href);
self.addEventListener('install',event=>event.waitUntil(caches.open(SHELL).then(c=>c.addAll(CORE))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('slouch-shell-')&&k!==SHELL).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const r=event.request,u=new URL(r.url);if(r.method!=='GET'||u.origin!==root.origin)return;
  const path=u.pathname.slice(root.pathname.length),hash=HASHES[path];if(path==='sw.js')return;
  event.respondWith((async()=>{
    const cache=await caches.open(hash?ASSETS:SHELL);
    const key=new URL(u);key.search='';if(hash)key.searchParams.set('slouch-hash',hash);
    const hit=await cache.match(hash?key.href:r,{ignoreVary:true});
    if(hit){
      const range=r.headers.get('range');
      if(range){const b=await hit.arrayBuffer(),m=/^bytes=(\d+)-(\d*)$/.exec(range);if(m){const start=Number(m[1]),end=m[2]?Math.min(Number(m[2]),b.byteLength-1):b.byteLength-1;
        if(start<=end)return new Response(b.slice(start,end+1),{status:206,headers:{'Content-Type':hit.headers.get('content-type')||'application/octet-stream','Content-Range':`bytes ${start}-${end}/${b.byteLength}`,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes'}});
      }}else return hit;
    }
    try{
      const response=await fetch(r);
      if(response.ok&&response.status===200&&!r.headers.has('range')){
        if(hash){const b=await response.clone().arrayBuffer(),actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(v=>v.toString(16).padStart(2,'0')).join('');if(actual===hash)await cache.put(key.href,response.clone());}
        else await cache.put(r,response.clone());
      }
      return response;
    }catch{return hit||(r.mode==='navigate'?await cache.match(new URL('index.html',root).href,{ignoreVary:true}):null)||new Response('This world file is not downloaded yet.',{status:503});}
  })());
});
self.addEventListener('message',event=>{if(event.data==='activate-update')self.skipWaiting();});
