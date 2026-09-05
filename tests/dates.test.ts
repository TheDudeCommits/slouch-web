import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateSave,safeImport} from '../js/core/save.ts';
import {weeklyActivity} from '../js/core/history.ts';
test('existing unpadded dates survive export/import and work in calendar comparisons',()=>{
 const defaults={owned:[],settings:{comfort:{roll:14,pitch:12,yaw:18,tuck:2.4}},equipped:{skin:'skin_quadra'},best:{},boards:{},daily:{},goals:{},missions:{},streak:{}};
 const raw={version:2,points:0,owned:[],settings:{},totals:{},streak:{lastDay:'2026-9-4'},history:[{date:'2026-9-5',version:2,score:120,duration:60,moveSec:20,trackingPct:100,mode:'break',rom:{yawL:3}}]};
 const save=migrateSave(safeImport(JSON.stringify(raw)),defaults) as any;
 assert.equal(save.streak.lastDay,'2026-09-04');assert.equal(save.history[0].date,'2026-09-05');
 assert.equal(weeklyActivity(save.history,'2026-09-05').recent,20);
});
