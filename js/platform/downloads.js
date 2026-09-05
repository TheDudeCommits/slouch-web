import { isNative } from './native.js';
export const CONTENT_CACHE='slouch-content-v2';
let manifestPromise;
export function packManifest() { return manifestPromise ||= fetch('assets/packs-manifest.json').then(r=>{if(!r.ok)throw new Error('World list unavailable');return r.json();}); }
function key(resource) { const u=new URL(resource.path,document.baseURI);u.searchParams.set('slouch-hash',resource.sha256);return u.href; }
export async function packStatus(id) {
  const manifest=await packManifest();const resources=manifest.worlds[id].resources;
  if(isNative)return {ready:true,bytes:resources.reduce((n,r)=>n+r.bytes,0)};
  const cache=await caches.open(CONTENT_CACHE);
  const checks=await Promise.all(resources.map(r=>cache.match(key(r),{ignoreVary:true}).then(Boolean)));
  return {ready:checks.every(Boolean),bytes:resources.reduce((n,r)=>n+r.bytes,0)};
}
export async function downloadPack(id,onProgress,signal) {
  const manifest=await packManifest();const resources=manifest.worlds[id].resources;
  const cache=await caches.open(CONTENT_CACHE);let done=0,total=resources.reduce((n,r)=>n+r.bytes,0);
  // Commit only verified, content-addressed files. Interrupted packs can resume.
  for(const r of resources){
    if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
    if(!await cache.match(key(r),{ignoreVary:true})){
      const response=await fetch(r.path,{signal,cache:'no-cache'});if(!response.ok)throw new Error('Download interrupted');
      const bytes=await response.arrayBuffer();const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
      if(hash!==r.sha256)throw new Error('A world file changed. Reload Slouch and try again.');
      await cache.put(key(r),new Response(bytes,{headers:response.headers}));
    }
    done+=r.bytes;onProgress?.(done/total);
  }
  return packStatus(id);
}

export async function clearDownloads(){if(!isNative)await caches.delete(CONTENT_CACHE);}
