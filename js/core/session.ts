export const DURATIONS = [60, 180, 300] as const;
export type SessionPhase = 'arrive' | 'move' | 'rest' | 'gate' | 'explore' | 'finale' | 'complete';
export type Route = { phase: SessionPhase; title: string; cue: string; safe: boolean; speed: number; progress: number; remaining: number; target: number };
export function routeAt(seconds: number, duration = 180, world = 'ocean'): Route {
  const p = Math.max(0, Math.min(1, seconds / duration));
  const section = p < 0.12 ? 'arrive' : p < 0.30 ? 'move' : p < 0.36 ? 'rest' : p < 0.48 ? 'gate' : p < 0.64 ? 'explore' : p < 0.70 ? 'rest' : p < 0.82 ? 'gate' : p < 1 ? 'finale' : 'complete';
  const titles: Record<string, string[]> = {
    ocean: ['The shallows', 'Coral gardens', 'A moment to drift', 'Current rings', 'The kelp passage', 'Follow the whale'],
    jungle: ['Into the clearing', 'The fern trail', 'A moment to wander', 'Vine arches', 'Along the stream', 'The sunlit grove'],
    space: ['Leaving the station', 'The mineral belt', 'A moment to float', 'Navigation gates', 'The orbital passage', 'Beyond the horizon'],
  };
  const index = { arrive: 0, move: 1, rest: 2, gate: 3, explore: 4, finale: 5, complete: 5 }[section];
  const cues = { arrive: 'Find your comfortable centre', move: 'Gently tilt · follow the trail', rest: 'Relax back to centre', gate: 'A gentle turn · then return', explore: world === 'jungle' ? 'A small chin lift to hop' : 'Explore at your own pace', finale: 'Enjoy the view · you’re nearly there', complete: 'A little movement goes a long way' };
  return { phase: section, title: (titles[world] || titles.ocean)[index], cue: cues[section], safe: ['arrive', 'rest', 'gate', 'finale', 'complete'].includes(section), speed: ['rest', 'gate'].includes(section) ? 22 : 36, progress: p, remaining: Math.max(0, Math.ceil(duration - seconds)), target: section === 'move' ? Math.sin(seconds * 0.17) * 6 : 0 };
}
export function corridorRow(target: number, width = 13) {
  // Each authored row retains a generous 10-unit opening inside reachable bounds.
  const centre = Math.max(-width + 5, Math.min(width - 5, target));
  return { centre, gap: 10, obstacles: [-width, width].filter(x => Math.abs(x - centre) > 5) };
}
