import test from 'node:test';
import assert from 'node:assert/strict';
import { fresh, stablePose, neutralPose, axis, TuckCycle, PoseHold } from '../js/core/movement.ts';
import { SimulationClock } from '../js/core/clock.ts';
const poses=Array.from({length:25},(_,i)=>({yaw:2,pitch:1,roll:0,z:-40,timestamp:i*40,valid:true}));
test('calibration requires fresh, sufficiently long, stable measurements',()=>{
  assert.equal(stablePose([],960),false);assert.equal(stablePose(poses.slice(-8),960),false);
  assert.equal(stablePose(poses,1400),false);assert.equal(stablePose(poses,960),true);
  assert.equal(stablePose(poses.map((p,i)=>({...p,yaw:i%2?15:-15})),960),false);
  assert.equal(fresh({...poses[0],yaw:NaN},0),false);
  assert.equal(fresh({...poses[0],timestamp:20},0),false);
  assert.deepEqual(neutralPose([...poses,{...poses[0],yaw:150}]),{yaw:2,pitch:1,roll:0,z:-40});
});
test('comfortable steering is bounded and neutral noise does not move the hero',()=>{
  assert.equal(axis(1.5,9),0);assert.equal(axis(9,9),1);assert.equal(axis(-100,9),-1);
  assert.equal(axis(5.5,9),.5);
});
test('a held retraction cannot repeatedly boost; a return completes one cycle',()=>{
  const c=new TuckCycle();let boosts=0;
  for(let i=0;i<20;i++)boosts+=Number(c.update(-3,0,.02,true));
  assert.equal(boosts,0);assert.equal(c.update(0,0,.02,true),true);
  for(let i=0;i<500;i++)boosts+=Number(c.update(-3,0,.02,true));assert.equal(boosts,0);
  c.update(0,0,.02,true);
  for(let i=0;i<20;i++)c.update(-3,0,.02,true);
  assert.equal(c.update(0,0,.02,true),true);
});
test('tilting down, stale tracking, and disconnected holds do not earn gestures',()=>{
  const c=new TuckCycle();for(let i=0;i<20;i++)c.update(-3,14,.02,true);assert.equal(c.update(0,0,.02,true),false);
  for(let i=0;i<20;i++)c.update(-3,0,.02,true);c.update(-3,0,.02,false);assert.equal(c.update(0,0,.02,true),false);
  const h=new PoseHold();h.update(true,.4,true);h.update(false,.2,true);assert.equal(h.update(true,.1,true),.1);
  assert.equal(h.update(true,.1,false),0);
});
test('30, 60 and 120 Hz devices simulate the same minute; stalls never catch up hazards',()=>{
  for(const hz of [30,60,120]){const clock=new SimulationClock();let n=0;for(let i=0;i<hz*60;i++)n+=clock.advance(1/hz).steps;assert.equal(n,3600);}
  const c=new SimulationClock();assert.deepEqual(c.advance(3),{steps:0,interrupted:true});assert.equal(c.advance(1/60).steps,1);
  c.advance(1/120);c.reset();assert.equal(c.advance(1/120).steps,0);
});
