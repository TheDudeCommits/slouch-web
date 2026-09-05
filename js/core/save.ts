export function safeImport(text: string) {
  if (text.length > 2_000_000) throw new Error('This save is too large.');
  const value = JSON.parse(text);
  const s = value?.format === 'slouch-save' ? value.save : value;
  if (!s || typeof s !== 'object' || Array.isArray(s) || !Array.isArray(s.owned) || !s.settings || !s.totals || !Array.isArray(s.history)) throw new Error('Choose a Slouch save export.');
  if (s.version > 2) throw new Error('Update Slouch before opening this save.');
  if (!Number.isFinite(s.points) || s.points < 0 || s.points > 1e10 || s.owned.length > 500 || s.history.length > 1000) throw new Error('This save contains invalid progress.');
  // Only JSON data is accepted. Imported labels are rendered as text, never markup.
  for (const r of s.history) {
    if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(r.date) || !Number.isFinite(r.score) || !Number.isFinite(r.duration) || !r.rom || Object.values(r.rom).some(v=>!Number.isFinite(v))) throw new Error('This save contains an invalid session.');
    for(const key of ['moveSec','stretchScore','trackingPct','tucks','gates']) if(r[key]!=null&&!Number.isFinite(r[key]))throw new Error('This save contains invalid movement data.');
  }
  if(s.owned.some((v: unknown)=>typeof v!=='string'))throw new Error('This save contains invalid items.');
  for(const board of Object.values(s.boards||{}))if(!Array.isArray(board)||board.some(r=>!Number.isFinite(r.score)||typeof r.tag!=='string'))throw new Error('This save contains invalid scores.');
  return s;
}
export function migrateSave<T extends Record<string, any>>(raw: Record<string, any>, defaults: T): T {
  const d = structuredClone(defaults);
  const result: Record<string, any> = { ...d, ...raw };
  for (const key of ['settings', 'streak', 'best', 'daily', 'goals', 'totals', 'adaptive', 'upgrades', 'equipped', 'missions', 'weekly', 'boards']) result[key] = { ...d[key], ...(raw[key] || {}) };
  result.settings.comfort = { ...d.settings.comfort, ...(raw.settings?.comfort || {}) };
  result.owned = [...new Set([...(Array.isArray(raw.owned) ? raw.owned : []), ...d.owned])];
  if (raw.version !== 2) {
    // Included launch worlds replace the former earned pack unlocks. Compensate existing owners once.
    result.points = (Number(raw.points) || 0) + (raw.owned?.includes('world_ocean') ? 2500 : 0) + (raw.owned?.includes('world_jungle') ? 3000 : 0);
    result.legacyBoards = structuredClone(raw.boards || {});
    result.boards = structuredClone(d.boards);
    result.best = structuredClone(d.best);
    result.legacyBest = structuredClone(raw.best || {});
  }
  result.version = 2;
  for(const key of ['music','sfx'])result.settings[key]=Math.max(0,Math.min(100,Number(result.settings[key])||0));
  result.settings.sensitivity=Math.max(50,Math.min(150,Number(result.settings.sensitivity)||100));
  if(![60,180,300].includes(result.settings.duration))result.settings.duration=180;
  if(!['camera','pointer'].includes(result.settings.input))result.settings.input='camera';
  if(!['auto','low','high'].includes(result.settings.quality))result.settings.quality='auto';
  for(const [key,min,max] of [['roll',6,20],['pitch',6,16],['yaw',8,25],['tuck',1,4]] as const)result.settings.comfort[key]=Math.max(min,Math.min(max,Number(result.settings.comfort[key])||d.settings.comfort[key]));
  result.oceanHero=['hero_clown','hero_tang','hero_mandarin'].includes(result.oceanHero)?result.oceanHero:'hero_clown';
  result.jungleHero=['hero_bunny','hero_pig'].includes(result.jungleHero)?result.jungleHero:'hero_bunny';
  if (result.equipped.skin === 'skin_crosswing' || !['skin_viper','skin_lance','skin_quadra','skin_shadow'].includes(result.equipped.skin)) result.equipped.skin = 'skin_quadra';
  if (!['space','ocean','jungle'].includes(result.equippedWorld)) result.equippedWorld = 'ocean';
  const date=(d: any)=>typeof d==='string'&&/^\d{4}-\d{1,2}-\d{1,2}$/.test(d)?d.split('-').map((v,i)=>i?v.padStart(2,'0'):v).join('-'):d;
  for(const key of ['daily','goals','missions'])result[key].day=date(result[key].day);
  result.streak.lastDay=date(result.streak.lastDay);
  result.history = Array.isArray(raw.history) ? raw.history.slice(0,365).map(r=>({...r,date:date(r.date)})) : [];
  return result as T;
}
