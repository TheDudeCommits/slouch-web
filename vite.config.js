import { defineConfig } from 'vite';
import { cpSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

export default defineConfig({
  base: './', publicDir: false,
  server: { port: 8901, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  plugins: [{
    name: 'slouch-static-assets',
    closeBundle() {
      for (const dir of ['assets', 'icons', 'vendor']) cpSync(dir, `dist/${dir}`, {
        recursive: true, filter: p => !p.endsWith('crosswing.glb'),
      });
      for (const f of ['manifest.webmanifest', 'privacy.html', 'credits.html']) cpSync(f, `dist/${f}`);
      // Keep downloaded assets in a separate cache across shell updates.
      const html=readFileSync('dist/index.html','utf8').replace(/\.\/assets\/manifest-[^"]+\.webmanifest/,'./manifest.webmanifest');
      writeFileSync('dist/index.html',html);
      const revision = createHash('sha256').update(html).digest('hex').slice(0, 12);
      const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${dir}/${e.name}`):`${dir}/${e.name}`);
      const all=walk('dist').map(p=>p.slice(5));
      const shell=[...new Set(['./','index.html','privacy.html','credits.html','manifest.webmanifest','assets/packs-manifest.json',...all.filter(p=>/\.(js|css|woff2|webmanifest)$/.test(p)&&!p.startsWith('vendor/')), ...all.filter(p=>p.startsWith('icons/')||/^assets\/(ocean|jungle|space)-[^/]+\.jpg$/.test(p))])];
      const hashes=Object.fromEntries(all.filter(p=>/^(assets|vendor)\//.test(p)&&!shell.includes(p)).map(p=>[p,createHash('sha256').update(readFileSync(`dist/${p}`)).digest('hex')]));
      const worker=readFileSync('sw.js','utf8').replace('__BUILD__',revision).replace('/*__SHELL__*/[]',JSON.stringify(shell)).replace('/*__HASHES__*/{}',JSON.stringify(hashes));
      writeFileSync('dist/sw.js', worker);
      writeFileSync('dist/build.json', JSON.stringify({ version: '2.0.0', revision, commit: execSync('git rev-parse HEAD').toString().trim() }));
    },
  }],
});
