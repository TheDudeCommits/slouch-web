import test from 'node:test';
import assert from 'node:assert/strict';
import { DURATIONS, routeAt, corridorRow } from '../js/core/session.ts';
import { weeklyActivity } from '../js/core/history.ts';
import { migrateSave, safeImport } from '../js/core/save.ts';
test('all break durations provide protected opening, recovery, turns, and finite destination',()=>{
  for(const duration of DURATIONS)for(const world of ['ocean','jungle','space']){
    assert.equal(routeAt(0,duration,world).safe,true);assert.equal(routeAt(duration*.32,duration,world).phase,'rest');
    assert.equal(routeAt(duration*.4,duration,world).safe,true);assert.equal(routeAt(duration*.9,duration,world).phase,'finale');
    assert.equal(routeAt(duration,duration,world).phase,'complete');assert.equal(routeAt(duration+5,duration,world).remaining,0);
  }
});
test('authored corridor never asks for an unreachable centre',()=>{
  for(let target=-100;target<=100;target++){const row=corridorRow(target);assert.ok(Math.abs(row.centre)<=8);assert.ok(row.obstacles.every(x=>Math.abs(x-row.centre)>5));}
});
test('weekly comparison uses dates and ignores legacy, touch and low coverage',()=>{
  const r={date:'2026-09-05',version:2,touch:false,trackingPct:100,duration:180,moveSec:60,mode:'break'};
  const stats=weeklyActivity([r,{...r,date:'2026-09-04'},{...r,date:'2026-08-29',moveSec:30},{...r,date:'2026-08-22'}, {...r,touch:true},{...r,version:1},{...r,trackingPct:30}],r.date);
  assert.deepEqual(stats,{recent:120,previous:30,delta:90});
});
const defaults={version:2,points:0,owned:['skin_quadra','world_ocean','world_jungle'],equipped:{skin:'skin_quadra'},equippedWorld:'ocean',settings:{duration:180,input:'camera',quality:'auto',comfort:{roll:14,pitch:12,yaw:18,tuck:2.4}},best:{techneck:0,casual:0},boards:{techneck:[],casual:[]},history:[]};
test('legacy migration preserves earned items and history, archives scores, compensates only once',()=>{
  const raw={points:100,owned:['world_ocean','hero_tang','skin_crosswing'],equipped:{skin:'skin_crosswing'},best:{techneck:12345},boards:{techneck:[{score:12345}]},history:[{date:'2026-08-25',score:1200}],xp:123,totals:{runs:5}};
  const m=migrateSave(raw,defaults);assert.equal(m.points,2600);assert.ok(m.owned.includes('hero_tang'));assert.equal(m.equipped.skin,'skin_quadra');assert.deepEqual(m.history,raw.history);
  assert.equal(m.best.techneck,0);assert.equal((m as any).legacyBest.techneck,12345);assert.equal((m as any).xp,123);
  assert.equal(migrateSave(m,defaults).points,2600);assert.equal(raw.points,100);
});
test('import rejects malformed or oversized progress before mutation',()=>{
  assert.throws(()=>safeImport('{}'));assert.throws(()=>safeImport(' '.repeat(2_000_001)));
  const save={...defaults,totals:{},history:[{date:'2026-09-05',score:10,duration:60,rom:{yawL:2},stretchScore:'<img>'}]};
  assert.throws(()=>safeImport(JSON.stringify(save)));
  save.history=[];assert.deepEqual(safeImport(JSON.stringify({format:'slouch-save',save})),save);
});
