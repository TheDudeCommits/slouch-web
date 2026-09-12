import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..'), out=path.join(root,'native-ios/Slouch/GameResources');
fs.mkdirSync(out,{recursive:true});
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const modules=['rng','state','content','achievements','report','ghost','game'];
let bundle='// Generated from original Slouch. Run Scripts/prepare.mjs; do not edit.\n';
for(const id of modules){
 let src=read(`js/${id}.js`), exports=[];
 src=src.replace(/import\s+\{([^}]+)\}\s+from\s+['"]\.\/([^'"]+)\.js['"];?/g,(_,names,mod)=>`const {${names}} = require('${mod}');`);
 src=src.replace(/export\s+(async\s+)?(function|const|let|class)\s+(\w+)/g,(_,a='',k,n)=>{exports.push(n);return `${a}${k} ${n}`});
 bundle+=`define('${id}', function(require,exports){\n${src}\nObject.assign(exports,{${exports.join(',')}});\n});\n`;
}
const packs=read('js/packs.js');
const packData=packs.slice(packs.indexOf('export const WORLD_TEXT'),packs.indexOf('// ── loading'));
// Extract declarations using their balanced semicolon-terminated boundaries, without loader code.
const extract=(src,name)=>{let start=src.indexOf(`const ${name} = `); if(start<0)throw Error(name);let end=src.indexOf('\n};',start);return src.slice(start,end+3);};
bundle+=`define('packs',function(require,exports){${extract(packs,'WORLD_TEXT')}\n${extract(packs,'PACKS')}\nObject.assign(exports,{WORLD_TEXT,PACKS});});\n`;
fs.writeFileSync(path.join(out,'engine.js'),bundle);
const hashes={baseline:'670ed9dea09979131c9cb0c485370605f0d285a8',files:{}};
for(const folder of ['js','css','assets']){
 const walk=p=>{for(const e of fs.readdirSync(path.join(root,p),{withFileTypes:true})){let f=path.join(p,e.name);if(e.isDirectory())walk(f);else hashes.files[f]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');}};walk(folder);
}
hashes.files['index.html']=crypto.createHash('sha256').update(read('index.html')).digest('hex');
fs.writeFileSync(path.join(out,'source-manifest.json'),JSON.stringify(hashes,null,2));
// Xcode references ../assets directly: original audio, textures and attribution.
console.log(`Bundled ${modules.length} original gameplay modules; original assets are referenced by Xcode.`);
