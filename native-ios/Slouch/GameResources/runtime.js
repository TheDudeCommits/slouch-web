// Native host adapters. Gameplay modules in engine.js are generated from the original source.
const factories={}, modules={};
function define(id,f){factories[id]=f;}
function require(id){if(!modules[id]){const e={};modules[id]=e;factories[id](require,e);}return modules[id];}
if(typeof structuredClone==='undefined')globalThis.structuredClone=x=>JSON.parse(JSON.stringify(x));
let nativeNow=0, rafID=0, frames=new Map(), events=[];
const performance={now:()=>nativeNow};
function requestAnimationFrame(fn){const id=++rafID;frames.set(id,fn);return id;}
function cancelAnimationFrame(id){frames.delete(id);}
const document={body:{classList:{add(){},remove(){}}}};
const navigator={vibrate:p=>events.push({kind:'haptic',data:p})};
const localStorage={getItem:()=>nativeReadSave(),setItem:(k,v)=>nativeWriteSave(v)};
function emit(kind,data){events.push({kind,data});}
function vec(x=0,y=0,z=0){return {x,y,z,set(x,y,z){Object.assign(this,{x,y,z});return this},setScalar(v){return this.set(v,v,v)},copy(v){return this.set(v.x,v.y,v.z)}};}
function mat(){return {opacity:1,color:{setHex(){}}};}
let objectId=0;
function obj(kind){return {id:++objectId,kind,position:vec(),rotation:vec(),scale:vec(1,1,1),visible:false,children:[],userData:{},lookAt(x,y,z){this.rotation.y=Math.atan2(x-this.position.x,z-this.position.z)}};}
let assetInfo={};
const world={ship:obj('ship'),shipShield:obj('shield'),boss:obj('boss'),bounds:{x:13,y:7.5},spawnZ:-420,killZ:14,packMode:'space',grounded:false,groundY:-6.5,floorY:-9.5,spinObstacles:true,asteroids:[],enemies:[],gates:[],crystals:[],powerups:[],walls:[]};
let camera={x:0,y:2.6,z:9,fov:72,lookX:0,lookY:0,roll:0},hyperLevel=0,hyperTarget=0,camKick=0,heroMotion='base',heroSpeed=1,revision=0;
function configureWorld(){
 const st=require('state').state(),mode=st.equippedWorld||'space',pack=require('packs').PACKS[mode];
 world.packMode=mode;world.grounded=!!pack?.grounded;world.spinObstacles=mode==='space';world.floorY=pack?.env.floorY??-9.5;
 const sizes=[1.5,2.4,3.6,5.2];
 function appearance(o,key,opts={}){key=key.replace(/\.glb$/,'');const a=assetInfo[key];if(!a)throw Error('Missing converted asset '+key);o.asset=key;o.len=opts.len??null;o.r=opts.r??null;o.yaw=opts.yaw??0;o.clip=opts.clip??null;const scale=opts.len?opts.len/Math.max(...a.size):opts.r?opts.r/a.radius:1;o.userData.halfH=a.size[1]*scale/2;}
 world.asteroids=Array.from({length:64},()=>{const a=obj('asteroid'),size=sizes[Math.floor(Math.random()*4)];a.userData={active:false,radius:size*1.05,size,rx:(Math.random()-.5)*1.4,ry:(Math.random()-.5)*1.4};
 if(pack){const d=pack.obstacles[Math.floor(Math.random()*pack.obstacles.length)];appearance(a,`packs__${mode}__${d.file}`,d.tall?{len:size*2.6}:{r:d.low?Math.min(size,2.3)*.75:size});Object.assign(a.userData,{tall:!!d.tall,low:!!d.low,anchor:d.anchor||(pack.grounded?'floor':'free'),bobFloat:!!d.bob});if(d.low)a.userData.radius=Math.min(size,2.3)*.8;
 }else{a.asset='rock';a.r=size;}return a;});
 world.enemies=Array.from({length:6},()=>{const e=obj('enemy');e.userData={active:false,radius:1.5};if(pack){const d=pack.enemies[Math.floor(Math.random()*pack.enemies.length)];appearance(e,`packs__${mode}__${d.file}`,d);e.userData.bob=!!d.bob;}return e;});
 world.gates=Array.from({length:3},()=>{const g=obj('gate');g.userData={active:false,radius:5.2,holder:{scale:vec(1,1,1)}};return g;});
 world.crystals=Array.from({length:14},()=>{const c=obj('crystal');c.userData={active:false,radius:1.8,spin:2+Math.random()*3};if(pack?.coin)appearance(c,`packs__${mode}__${pack.coin.file}`,{r:pack.coin.r});else appearance(c,'pickups__coin',{r:1.7});return c;});
 world.powerups=Array.from({length:6},()=>{const p=obj('powerup');p.userData={active:false,radius:2.3,mat:mat(),glowMat:mat(),setType(type){const file={magnet:'magnet',focus:'hourglass',doubler:'crown',shard:'star'}[type];appearance(p,'pickups__'+file,{r:type==='shard'?1.5:2.1});}};return p;});
 world.walls=Array.from({length:5},()=>{const w=obj('wall');w.userData={active:false,mat:mat(),gapAxis:'x',gapCenter:0,gapHalf:3.4};return w;});
 world.ship=obj('ship');world.ship.visible=true;world.boss=obj('boss');
 if(pack){let id=mode==='ocean'?st.oceanHero:st.jungleHero;const def=pack.heroes[id]||Object.values(pack.heroes)[0];appearance(world.ship,`packs__${mode}__${def.file}`,{len:def.len,yaw:def.yaw});world.ship.clipMap=def.clips||pack.heroClips;world.ship.animSpeed=def.animSpeed||1;world.ship.bounce=!!def.bounce;appearance(world.boss,`packs__${mode}__${pack.boss.file}`,pack.boss);
 }else{const name=require('state').cosmetics().skin.model;appearance(world.ship,'ships__'+name);world.ship.shipLength=['quadra','shadow'].includes(name)?3.45:3.6;world.ship.yaw=name==='crosswing'?0:Math.PI;}
 camera={x:0,y:2.6,z:9,fov:72,lookX:0,lookY:0,roll:0};revision++;return true;
}
function updateWorld(dt,speed,shipVel){
 const ship=world.ship,now=nativeNow;
 if(world.boss.visible){world.boss.position.x=Math.sin(now*.0004)*6;world.boss.position.y=world.grounded?world.groundY+4:Math.cos(now*.0005)*3+2;}
 hyperLevel+=(hyperTarget-hyperLevel)*Math.min(1,dt*5);camera.fov=72+hyperLevel*16;
 const shake=hyperLevel*.09+camKick;camKick=Math.max(0,camKick-dt*1.6);
 camera.x+=(ship.position.x*.86-camera.x)*Math.min(1,dt*6)+(Math.random()-.5)*shake;
 camera.y+=(ship.position.y*.82+2.6-camera.y)*Math.min(1,dt*6)+(Math.random()-.5)*shake;
 camera.z=ship.position.z+9;camera.lookX=ship.position.x*.5;camera.lookY=ship.position.y*.5;camera.roll=-shipVel.x*.006;
}
define('world',(_,exports)=>Object.assign(exports,{world,updateWorld,POWERUP_TYPES:{magnet:{color:0xffd54d,label:'MAGNET'},focus:{color:0x8ab8ff,label:'FOCUS'},doubler:{color:0xff5ce0,label:'SCORE ×2'}},render(){},explodeAt(p){emit('explosion',{x:p.x,y:p.y,z:p.z})},setShieldVisual(){},setHyper(active){hyperTarget=active?1:0},armWall(g,axis,center){Object.assign(g.userData,{gapAxis:axis,gapCenter:center,gapHalf:3.2});},kickCamera(s=.35){camKick=Math.min(.8,camKick+s)},setGateArrow(g,d){g.direction=d;},randomizeBackdrop(){emit('backdrop',{})},setHeroMotion(m){heroMotion=m},setHeroSpeed(s){heroSpeed=s}}));
const head={ready:false,hasFace:false,usingTouch:false,rYaw:0,rPitch:0,rRoll:0,rZ:0,touchX:0,touchY:0};
define('head',(_,e)=>Object.assign(e,{head,updateHead(){if(head.usingTouch){head.rYaw=-head.touchX*30;head.rRoll=head.touchX*30;head.rPitch=-head.touchY*20;head.rZ=0;head.hasFace=true;}}}));
define('audio',(_,e)=>{const slots={ui:['ui',.7],buy:['buy',.8],denied:['denied',.7],gate:['gate',.85],shieldUp:['shieldup',.8],shieldDown:['shielddown',.6],warn:['warn',.7],crash:['crash',.9],smash:['smash',.75],powerup:['powerup',.8],bossWarn:['bosswarn',.85],bossDown:['bossdown',.9],laser:['laser',.55],revive:['revive',.9],levelup:['levelup',.85]};const sfx={};for(const [k,[file,gain]] of Object.entries(slots))sfx[k]=()=>emit('sound',{file,gain,rate:k==='bossWarn'?.85:k==='smash'?.9+Math.random()*.25:1});sfx.nearMiss=(step=0)=>emit('sound',{file:'near',gain:.65,rate:2**([0,2,4,7,9,12,14,16,19,21,24][Math.min(10,step)]/12)});Object.assign(e,{sfx,setMusicIntensity(v){ui.intensity=v},musicEvent(ev){emit('music',ev)}});});
const ui={score:0,mult:1,flow:0,energy:1,shield:false,slouch:false,faceLost:false,gate:null,gateProgress:0,boss:null,boons:[],lean:0,leanProgress:0,powerups:{},pace:null,intensity:0};
let lastRun=null;
function missionsToday(){const ST=require('state'),s=ST.state(),today=ST.dayStamp();if(s.missions.day!==today){const rand=require('rng').mulberry32(require('rng').todaySeed()^0x9e37),pool=[...require('content').MISSION_POOL],ids=[];for(let i=0;i<3;i++)ids.push(pool.splice(Math.floor(rand()*pool.length),1)[0].id);s.missions={day:today,ids,done:{}};ST.save();}return s.missions;}
function finishRun(score,report,extra){
 const ST=require('state'),s=ST.state(),mode=require('game').game.mode,C=require('content');s.totals.runs++;
 const evMult=ST.activeEvent()?.stardustMult??1;let earned=Math.round(score/10)*evMult;ST.tickStreak(true);
 if(report&&!report.touch)ST.addGoalProgress({moveSec:report.moveSec,tucks:report.tucks,stretches:report.gates});if(report)ST.addReport(report);
 const m=missionsToday(),freshMissions=[];for(const id of m.ids){if(m.done[id])continue;const def=C.MISSION_POOL.find(x=>x.id===id);if((extra.runStats?.[def.stat]??0)>=def.target){m.done[id]=true;earned+=150;freshMissions.push(def);}}
 ST.addPoints(earned);const before=C.levelFromXp(s.xp),xpGain=Math.round(score/100)+freshMissions.length*50;ST.addXp(xpGain);const after=C.levelFromXp(s.xp);
 const boardMode=['casual','techneck'].includes(mode)?mode:null;let isBest=boardMode?score>s.best[boardMode]:false;
 if(mode==='daily'||mode==='weekly'){const d=mode==='daily'?ST.dailyToday():ST.weeklyNow();if(mode==='daily')d.runs++;isBest=score>d.best;if(isBest)d.best=score;d.list.push({tag:s.lastTag,score});d.list.sort((a,b)=>b.score-a.score);d.list=d.list.slice(0,10);ST.save();}
 let won=null;if(mode==='duel'){won=score>(require('game').game.duelTarget||0);if(won){s.totals.duelsWon++;ST.save();}}
 const fresh=require('achievements').checkAchievements({score,stretchScore:report?.stretchScore??0});
 lastRun={score,mode,report,extra,earned,evMult,xpGain,ranked:after.level>before.level,rank:after,isBest,won,fresh,freshMissions,submitted:false};
 emit('gameover',lastRun);
}
const hooks={onScore(s,m){ui.score=s;ui.mult=m},onFlow(v){ui.flow=v},onShield(e,a){ui.energy=e;ui.shield=a},onSlouch(v){ui.slouch=v},onFaceLost(v){ui.faceLost=v},onGate(v){ui.gate=v},onGateProgress(v){ui.gateProgress=v},onBoss(v){ui.boss=v},onBoonOffer(a,b){ui.boons=a?[a,b]:[]},onBoonLean(d,v){ui.lean=d;ui.leanProgress=v},onPowerups(v){ui.powerups={...v}},onPace(p,s){ui.pace=p===null?null:s-Math.round(p)},onToast(t){emit('toast',t)},onGameOver:finishRun};
function snapshot(){const G=require('game').game;const serialize=o=>({id:o.id,kind:o.kind,p:[o.position.x,o.position.y,o.position.z],r:[o.rotation.x,o.rotation.y,o.rotation.z],s:[o.scale.x,o.scale.y,o.scale.z],asset:o.asset??null,len:o.len??null,radius:o.r??null,yaw:o.yaw??0,clip:o.clip??null,shipLength:o.shipLength??null,halfH:o.userData.halfH??null,direction:o.direction??null,gapAxis:o.userData.gapAxis??null,gapCenter:o.userData.gapCenter??null,gapHalf:o.userData.gapHalf??null,type:o.userData.type??null,spin:o.userData.spin??null,bob:o.userData.bob||o.userData.bobFloat||false,bounce:o.bounce||false,clipMap:o.clipMap||{},animSpeed:o.animSpeed||1});
 const nodes=[world.ship,world.boss,...world.asteroids,...world.enemies,...world.gates,...world.crystals,...world.powerups,...world.walls].filter(o=>o.visible).map(serialize);
 const e=events;events=[];return JSON.stringify({revision,world:world.packMode,grounded:world.grounded,floorY:world.floorY,running:G.running,paused:G.paused,over:G.over,time:G.time,speed:G.speed,sector:G.sector,hyper:hyperLevel,heroMotion,heroSpeed,camera,nodes,ui,events:e});}
function submitPending(tag){if(!lastRun||lastRun.submitted)return;lastRun.submitted=true;const ST=require('state'),mode=lastRun.mode;if(!['casual','techneck'].includes(mode))return;const name=(tag.trim().toUpperCase()||'ACE').slice(0,8);if(ST.qualifiesForBoard(mode,lastRun.score))ST.submitScore(mode,name,lastRun.score);else if(lastRun.score>ST.state().best[mode]){ST.state().best[mode]=lastRun.score;ST.save();}}
const bridge={
 initialize(assets){assetInfo=JSON.parse(assets);require('state').tickStreak();this.menu();configureWorld();require('game').startIdle();return this.catalog()},
 catalog(){const ST=require('state'),C=require('content');return JSON.stringify({...Object.fromEntries(['THEMES','WORLD_PACKS','OCEAN_HEROES','JUNGLE_HEROES','SKINS','TRAILS','BOOMS','UPGRADES','STORE_EXTRAS','GOAL_TARGETS'].map(k=>[k,ST[k]])),...C,WORLD_TEXT:require('packs').WORLD_TEXT,PACKS:require('packs').PACKS,ACHIEVEMENTS:require('achievements').ACHIEVEMENTS})},
 menu(){const ST=require('state');ST.dailyToday();ST.goalsToday();ST.weeklyNow();missionsToday();return JSON.stringify({save:ST.state(),rank:require('content').levelFromXp(ST.state().xp),mutator:require('content').MUTATORS[new Date().getDay()],event:ST.activeEvent(),lastRun})},
 start(mode,seed,target){const G=require('game'),rng=require('rng');G.stopIdle();ui.boons=[];ui.gate=null;ui.boss=null;ui.slouch=false;ui.faceLost=false;const s=seed??(mode==='daily'?rng.todaySeed():mode==='weekly'?rng.hashSeed(require('state').isoWeek()):null);G.startGame(mode,hooks,{seed:s,duelTarget:target||0})},
 tick(now,pose){nativeNow=now;Object.assign(head,JSON.parse(pose));const callbacks=[...frames.values()];frames.clear();for(const f of callbacks)f(now);return snapshot()},
 pause(value){require('game').pauseGame(value)},
 quit(tag){submitPending(tag);require('game').stopGame();for(const key of ['asteroids','enemies','gates','crystals','powerups','walls'])for(const o of world[key])o.visible=false;require('state').save();require('game').startIdle();return this.menu()},
 submit:submitPending,
 choose(index){require('game').chooseBoon(index)},
 setting(key,value){const ST=require('state');if(Object.hasOwn(ST.state().settings,key)){ST.state().settings[key]=value;ST.save();}},
 buy(id){const ST=require('state');let success=false;if(ST.UPGRADES[id])success=ST.buyUpgrade(id);else{const item=ST.THEMES[id]||ST.WORLD_PACKS[id]||ST.SKINS[id]||ST.TRAILS[id]||ST.BOOMS[id]||ST.OCEAN_HEROES[id]||ST.JUNGLE_HEROES[id]||ST.STORE_EXTRAS.find(x=>x.id===id);if(item&&!ST.state().owned.includes(id))success=ST.buy(id,item.price);}require('audio').sfx[success?'buy':'denied']();return success},
 equip(id){const ST=require('state'),s=ST.state();if(!s.owned.includes(id))return false;let ok=false;if(ST.THEMES[id]){ST.equipWorld('space');ok=ST.equipTheme(id)}else if(ST.WORLD_PACKS[id])ok=ST.equipWorld(ST.WORLD_PACKS[id].world);else if(ST.SKINS[id])ok=ST.equipCosmetic('skin',id);else if(ST.TRAILS[id])ok=ST.equipCosmetic('trail',id);else if(ST.BOOMS[id])ok=ST.equipCosmetic('boom',id);else if(ST.OCEAN_HEROES[id]){s.oceanHero=id;ST.save();ok=true}else if(ST.JUNGLE_HEROES[id]){s.jungleHero=id;ST.save();ok=true}if(ok)configureWorld();return ok},
 space(){require('state').equipWorld('space');configureWorld()},
 calibrate(){require('state').state().calibrated=true;require('state').save()},
 duelLink(){const ST=require('state'),tag=ST.state().lastTag||'ACE',score=lastRun?.score||0;const seed=require('rng').hashSeed(score+'|'+ST.dayStamp()+'|'+tag);return 'slouch://challenge?duel='+seed+'&s='+score+'&by='+encodeURIComponent(tag)},
 trend(){return require('report').weeklyTrend()},
 exportSave(){return JSON.stringify(require('state').state())},
 reset(){require('game').stopGame();require('state').resetAll();lastRun=null;configureWorld();require('game').startIdle()},
 debug(command,arg){const G=require('game').game;if(command==='god')G._debug.god();if(command==='boss')G._debug.forceBoss();if(command==='boon')G._debug.forceBoon();if(command==='sector')G._debug.forceSector(arg);if(command==='power')G._debug.forcePowerup(arg)},
};
