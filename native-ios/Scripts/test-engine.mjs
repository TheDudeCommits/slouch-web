import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
const base=path.resolve(import.meta.dirname,'..'),root=path.resolve(base,'..'),resources=path.join(base,'Slouch/GameResources');
const manifest=JSON.parse(fs.readFileSync(path.join(resources,'Models/manifest.json')));
let tests=0;
function test(name,f){f();tests++;console.log('PASS '+name)}
function host(world='space',save=null){
 let stored=save;
 const context=vm.createContext({nativeReadSave:()=>stored,nativeWriteSave:v=>stored=v});
 for(const file of ['runtime.js','engine.js'])vm.runInContext(fs.readFileSync(path.join(resources,file),'utf8'),context,{filename:file});
 context.assets=JSON.stringify(manifest);
 vm.runInContext('bridge.initialize(assets)',context);
 const run=s=>vm.runInContext(s,context);
 if(world!=='space')run('require("state").state().owned.push("world_'+world+'");bridge.equip("world_'+world+'")');
 return {run,save:()=>stored,frame:(time,pose={usingTouch:true,touchX:0,touchY:0})=>JSON.parse(run('bridge.tick('+time+','+JSON.stringify(JSON.stringify(pose))+')'))};
}
test('Original source hashes are unchanged',()=>{
 const m=JSON.parse(fs.readFileSync(path.join(resources,'source-manifest.json')));
 for(const [p,hash] of Object.entries(m.files))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex'),hash,p);
});
test('Every original GLB and required animation has a native model',()=>{
 for(const [key,a] of Object.entries(manifest)){
  assert(fs.existsSync(path.join(resources,'Models',a.file)),key);
  for(const [clip,f] of Object.entries(a.clips))assert(fs.existsSync(path.join(resources,'Models',f)),key+clip);
  assert(a.size.every(v=>Number.isFinite(v)&&v>=0));assert(a.radius>0);
 }
 assert.equal(Object.keys(manifest).length,45);
 for(const [hero,clip] of [['jungle__hero_bunny','Run'],['jungle__hero_bunny','Duck'],['jungle__hero_pig','Jump'],['ocean__hero_clown','Swimming_Fast'],['jungle__wolf','Gallop']])assert(manifest['packs__'+hero].clips[clip]);
});
test('Mulberry32 and FNV preserve original 32-bit arithmetic',()=>{
 const h=host();
 assert.deepEqual(Array.from(h.run('Array.from({length:5}, require("rng").mulberry32(12345))')),[0.9797282677609473,0.3067522644996643,0.484205421525985,0.817934412509203,0.5094283693470061]);
 assert.equal(h.run('require("rng").hashSeed("hello")'),1335831723);
});
test('Native worlds have original pool counts and bounds',()=>{
 for(const world of ['space','ocean','jungle']){
  const h=host(world);
  assert.deepEqual(JSON.parse(h.run('JSON.stringify(["asteroids","enemies","gates","crystals","powerups","walls"].map(k=>world[k].length))')),[64,6,3,14,6,5]);
  assert.equal(h.run('world.spawnZ'),-420);assert.equal(h.run('world.killZ'),14);
  h.run('bridge.start("techneck",12345,0)');
  for(let i=1;i<180;i++)h.frame(i*1000/60);
 }
});
test('Tech Neck and Casual preserve dead zones and signs',()=>{
 let h=host();h.run('bridge.start("techneck",1,0)');
 let f=h.frame(16,{usingTouch:false,hasFace:true,rYaw:0,rPitch:0,rRoll:4.49,rZ:0});
 assert.equal(f.nodes.find(n=>n.kind==='ship').p[0],0);
 f=h.frame(32,{usingTouch:false,hasFace:true,rYaw:0,rPitch:-16,rRoll:20,rZ:0});
 assert(f.nodes.find(n=>n.kind==='ship').p[0]>0);assert(f.nodes.find(n=>n.kind==='ship').p[1]>0);
 h=host();h.run('bridge.start("casual",1,0)');f=h.frame(16,{usingTouch:false,hasFace:true,rYaw:13,rPitch:0,rRoll:0,rZ:0});assert(f.nodes.find(n=>n.kind==='ship').p[0]<0);
});
test('Hyperdrive retains 2.8cm threshold and original cooldown',()=>{
 const h=host();h.run('bridge.start("techneck",123,0);bridge.debug("god")');
 const pose={usingTouch:false,hasFace:true,rYaw:0,rPitch:0,rRoll:0,rZ:-2.79};
 assert.equal(h.frame(16,pose).ui.shield,false);pose.rZ=-3;assert.equal(h.frame(32,pose).ui.shield,true);
 assert.equal(h.run('require("game").game.runStats.tucks'),1);pose.rZ=0;assert.equal(h.frame(48,pose).ui.shield,false);
 assert.equal(h.run('require("game").game._debug.shield.cooldown'),1.5);
});
test('Jungle jump is ballistic and cannot hover',()=>{
 const h=host('jungle');h.run('bridge.start("techneck",5,0);bridge.debug("god")');
 for(let i=1;i<100;i++)h.frame(i*16);
 h.frame(1600,{usingTouch:true,touchX:0,touchY:1});assert(h.run('world.ship.position.y')>-5.4);
 for(let i=101;i<260;i++)h.frame(i*16,{usingTouch:true,touchX:0,touchY:1});
 assert.equal(h.run('world.ship.position.y'),-5.4);
});
test('Pause freezes time; resume continues',()=>{
 const h=host();h.run('bridge.start("techneck",1,0)');const a=h.frame(16);h.run('bridge.pause(true)');const b=h.frame(3000);assert.equal(a.time,b.time);h.run('bridge.pause(false)');assert(h.frame(3016).time>b.time);
});
test('Touch reports cannot earn posture rings',()=>{
 const h=host();h.run('head.usingTouch=true;require("report").beginReport("techneck");for(let i=0;i<1000;i++)require("report").reportTick(.1,true,false)');
 const r=JSON.parse(h.run('JSON.stringify(require("report").buildReport(1000))'));
 assert.equal(r.touch,true);assert.equal(r.moveSec,0);assert.equal(r.stretchScore,0);
});
test('Boons, powerups and boss transitions survive the native host',()=>{
 const h=host();h.run('bridge.start("techneck",9,0);bridge.debug("god");bridge.debug("boon")');
 assert.equal(h.frame(16).ui.boons.length,2);h.run('bridge.choose(0)');assert.equal(h.frame(32).ui.boons.length,0);
 h.run('bridge.debug("power","magnet")');assert(h.frame(48).ui.powerups.magnet>7);
 h.run('bridge.debug("boss")');for(let i=4;i<60;i++)h.frame(i*16);assert.notEqual(h.run('require("game").game._debug.boss.phase'),'idle');
});
test('Rewards, reports, boards and purchases persist across relaunch',()=>{
 const h=host();h.run('bridge.start("casual",12,0);finishRun(1000,{touch:true,score:1000,rom:{},stretchScore:0,duration:40}, {runStats:{score:1000}});bridge.submit("TEST")');
 const s=JSON.parse(h.save());assert.equal(s.totals.runs,1);assert.equal(s.best.casual,1000);assert.equal(s.history.length,1);assert(s.achievements.first_flight);
 const next=host('space',h.save());assert.equal(next.run('require("state").state().best.casual'),1000);assert.equal(next.run('bridge.buy("world_ocean")'),false);
 next.run('require("state").addPoints(5000)');assert.equal(next.run('bridge.buy("world_ocean")'),true);assert.equal(next.run('bridge.equip("world_ocean")'),true);
});
test('All modes initialize and daily seeds stay stable',()=>{
 const h=host();for(const mode of ['techneck','casual','daily','weekly','duel']){h.run('bridge.start("'+mode+'",null,500)');assert.equal(h.run('require("game").game.mode'),mode);h.frame(16)}
 h.run('bridge.start("daily",null,0)');const seed=h.run('require("game").game.seed');h.run('bridge.quit("ACE");bridge.start("daily",null,0)');assert.equal(h.run('require("game").game.seed'),seed);
});
console.log('\n'+tests+' source and engine checks passed.');
