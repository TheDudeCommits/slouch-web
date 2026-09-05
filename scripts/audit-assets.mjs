import { readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
async function walk(dir){const entries=await readdir(dir,{withFileTypes:true});return (await Promise.all(entries.map(e=>e.isDirectory()?walk(`${dir}/${e.name}`):`${dir}/${e.name}`))).flat();}
const files=await walk('assets');const rows=[];
for(const file of files.filter(f=>f.endsWith('.glb'))){
  const b=await readFile(file);const len=b.readUInt32LE(12);const gltf=JSON.parse(b.subarray(20,20+len).toString());
  const primitives=(gltf.meshes||[]).flatMap(m=>m.primitives);
  rows.push({file,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex'),asset:gltf.asset,
    materials:gltf.materials?.length||0,primitives:primitives.length,triangles:primitives.reduce((n,p)=>n+(gltf.accessors?.[p.indices]?.count||0)/3,0),
    animations:(gltf.animations||[]).map(a=>a.name),status:file.endsWith('crosswing.glb')?'excluded-from-build':'existing-source-asset',
    sourceEvidence:'assets/ATTRIBUTION.txt; docs/asset-source-catalog.json where matched; embedded asset metadata',
  });
}
await writeFile('docs/asset-inventory.json',JSON.stringify(rows,null,2)+'\n');
const manifest={version:2,worlds:{}};
const common=files.filter(f=>/assets\/(rock|pickups|fx|sfx)\//.test(f));
for(const world of ['ocean','jungle','space']){
  const visual=files.filter(f=>world==='space'?/assets\/(ships|planets|sky)\//.test(f)&&!f.endsWith('crosswing.glb'):f.startsWith(`assets/packs/${world}/`));
  const music=files.filter(f=>f.startsWith('assets/music/')&&(world==='ocean'?/\/oc_/.test(f):world==='jungle'?/\/jg_/.test(f):!/(oc_|jg_)/.test(f)));
  const resources=[...new Set([...common,...visual,...music])];manifest.worlds[world]={resources:await Promise.all(resources.map(async path=>({path,bytes:(await stat(path)).size,sha256:createHash('sha256').update(await readFile(path)).digest('hex')})))};
}
const cameraFiles=await walk('vendor/vision');manifest.worlds.camera={resources:await Promise.all(cameraFiles.map(async path=>({path,bytes:(await stat(path)).size,sha256:createHash('sha256').update(await readFile(path)).digest('hex')})))};
await writeFile('assets/packs-manifest.json',JSON.stringify(manifest,null,2)+'\n');
const esc=s=>String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;');
const catalog=JSON.parse(await readFile('docs/asset-source-catalog.json','utf8'));
const entries=catalog.map(c=>`<li><a href="https://poly.pizza/m/${esc(c.id)}">${esc(c.title)}</a> by ${esc(c.author)} — ${esc(c.lic)}. ${c.files?.length?esc(c.files.join(', ')):'Source collection reference'}.</li>`).join('');
const credit=await readFile('assets/ATTRIBUTION.txt','utf8');
await writeFile('credits.html',`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Slouch · Credits</title><style>body{font:15px/1.7 system-ui;max-width:760px;margin:6vh auto;padding:24px;background:#f7f5ed;color:#143c36}pre{white-space:pre-wrap}a{color:inherit}</style><a href="./">← Back to Slouch</a><h1>Made with many good things.</h1><p>Slouch uses existing sourced models, music and textures. Layout, route composition and effects were revised for Slouch 2. Crosswing is retained in the source archive only and excluded from the distributed build.</p><h2>Model source collection</h2><ul>${entries}</ul><h2>Additional credits</h2><pre>${esc(credit)}</pre><p>Typography: DM Sans and Fraunces, SIL Open Font License. Runtime: Three.js (MIT), MediaPipe (Apache 2.0), Capacitor (MIT).</p></html>`);
console.log(`Audited ${rows.length} models; wrote hashed world manifests and credits.`);
