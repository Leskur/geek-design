type Recent = { id: string; time: number };
const recentKey = (userId: string) => `sketchpeek:recent:${userId}`;
export function recentDocuments(userId: string): Recent[] {
  try {
    const value = JSON.parse(localStorage.getItem(recentKey(userId)) || '[]');
    return Array.isArray(value)
      ? value.filter((r) => typeof r?.id === 'string' && typeof r?.time === 'number').slice(0, 30)
      : [];
  } catch {
    return [];
  }
}
export function rememberDocument(userId: string, id: string, legacyId?: string) {
  try {
    const entries = recentDocuments(userId).filter((r) => r.id !== id && r.id !== legacyId);
    localStorage.setItem(
      recentKey(userId),
      JSON.stringify([{ id, time: Date.now() }, ...entries].slice(0, 30)),
    );
  } catch {}
}
export function preferredSpace(userId: string, spaces: { id: string; legacy_id?: string }[]) {
  try {
    const saved = localStorage.getItem(`sketchpeek:team:${userId}`);
    const found = spaces.find((t) => t.id === saved || t.legacy_id === saved);
    if (found) return found.id;
  } catch {}
  return spaces[0]?.id;
}
/** @deprecated use preferredSpace */
export const preferredTeam = preferredSpace;
export function rememberSpace(userId: string, id: string) {
  try {
    localStorage.setItem(`sketchpeek:team:${userId}`, id);
  } catch {}
}
/** @deprecated use rememberSpace */
export const rememberTeam = rememberSpace;
export function migratePreferences(userId: string, legacyId?: string) {
  if (!legacyId) return;
  try {
    for (const category of ['recent', 'team']) {
      const next = `sketchpeek:${category}:${userId}`,
        old = localStorage.getItem(`sketchpeek:${category}:${legacyId}`);
      if (localStorage.getItem(next) === null && old !== null) localStorage.setItem(next, old);
    }
  } catch {}
}

export type DesignSort = 'updated' | 'name';
export function sortDesigns<T extends { name: string; updated?: number; created?: number }>(
  designs: T[],
  order: DesignSort,
): T[] {
  return [...designs].sort((a, b) =>
    order === 'name'
      ? a.name.localeCompare(b.name, 'zh-CN')
      : (b.updated || b.created || 0) - (a.updated || a.created || 0) ||
        a.name.localeCompare(b.name, 'zh-CN'),
  );
}
export function workspaceView(userId: string): { list: boolean; sort: DesignSort } {
  try {
    const value = JSON.parse(localStorage.getItem(`sketchpeek:view:${userId}`) || '{}');
    return { list: value?.list === true, sort: value?.sort === 'name' ? 'name' : 'updated' };
  } catch {
    return { list: false, sort: 'updated' };
  }
}
export function rememberWorkspaceView(userId: string, list: boolean, sort: DesignSort) {
  try {
    localStorage.setItem(`sketchpeek:view:${userId}`, JSON.stringify({ list, sort }));
  } catch {}
}

export function savedTeamOrder(userId: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(`sketchpeek:team-order:${userId}`) || '[]');
    return Array.isArray(value)
      ? [...new Set(value.filter((id: unknown): id is string => typeof id === 'string'))]
      : [];
  } catch {
    return [];
  }
}
export function orderTeams<T extends { id: string; legacy_id?: string }>(
  teams: T[],
  order: string[],
): T[] {
  const remaining = new Map(teams.map((t) => [t.id, t])),
    result: T[] = [];
  for (const id of order) {
    const team = remaining.get(id) || teams.find((t) => t.legacy_id === id && remaining.has(t.id));
    if (team) {
      result.push(team);
      remaining.delete(team.id);
    }
  }
  return [...result, ...remaining.values()];
}
export function moveTeam(order: string[], from: string, to: string, after = false): string[] {
  if (from === to || !order.includes(from) || !order.includes(to)) return [...order];
  const next = order.filter((id) => id !== from);
  next.splice(next.indexOf(to) + (after ? 1 : 0), 0, from);
  return next;
}
export function rememberTeamOrder(userId: string, order: string[]) {
  try {
    localStorage.setItem(`sketchpeek:team-order:${userId}`, JSON.stringify(order));
  } catch {}
}
