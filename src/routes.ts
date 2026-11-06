export type Route = {
  kind: 'local' | 'space' | 'design' | 'missing';
  spaceId?: string;
  folderId?: string;
  designId?: string;
  section?: 'overview' | 'resources';
  auth?: 'login' | 'register';
  inviteToken?: string;
};

function env(name: keyof ImportMetaEnv | 'BASE_URL') {
  try {
    return import.meta.env?.[name];
  } catch {
    return undefined;
  }
}

export const localOnly = env('VITE_LOCAL_ONLY') === '1';

export function stripBase(pathname: string) {
  const raw = env('BASE_URL') || '/';
  const base = raw.endsWith('/') ? raw.slice(0, -1) : raw;
  if (!base) return pathname;
  if (pathname === base || pathname === base + '/') return '/';
  if (pathname.startsWith(base + '/')) {
    const rest = pathname.slice(base.length);
    return rest.startsWith('/') ? rest : `/${rest}`;
  }
  return pathname;
}

export function withBase(path: string) {
  if (/^https?:\/\//.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const raw = env('BASE_URL') || '/';
  if (raw === '/') return normalized;
  const base = raw.endsWith('/') ? raw.slice(0, -1) : raw;
  return `${base}${normalized}`;
}

const part = (id: string) => encodeURIComponent(id);
export const spacePath = (spaceId: string) => `/spaces/${part(spaceId)}`;
export const folderPath = (folderId: string) => `/folders/${part(folderId)}`;
export const designPath = (spaceId: string, designId: string) =>
  `${spacePath(spaceId)}/designs/${part(designId)}`;

export function routeFor(pathname: string, _search = ''): Route {
  const path = stripBase(pathname);
  if (path === '/') {
    if (localOnly) return { kind: 'local' };
    return { kind: 'space' };
  }
  const parts = path.replace(/\/$/, '').split('/').slice(1);
  try {
    for (let i = 0; i < parts.length; i++) {
      parts[i] = decodeURIComponent(parts[i]);
      if (!parts[i] || /[\\/]/.test(parts[i])) return { kind: 'missing' };
    }
  } catch {
    return { kind: 'missing' };
  }
  if (parts.length === 1 && parts[0] === 'local') return { kind: 'local' };
  if (parts.length === 1 && ['login', 'register'].includes(parts[0]))
    return { kind: 'space', auth: parts[0] as 'login' | 'register' };
  if (parts[0] === 'invite' && parts.length === 2) return { kind: 'space', inviteToken: parts[1] };
  if (parts[0] === 'spaces') {
    if (parts.length === 1) return { kind: 'space' };
    if (parts.length === 2) return { kind: 'space', spaceId: parts[1], section: 'overview' };
    if (parts.length === 3 && parts[2] === 'resources')
      return { kind: 'space', spaceId: parts[1], section: 'resources' };
    if (parts.length === 4 && parts[2] === 'designs')
      return { kind: 'design', spaceId: parts[1], designId: parts[3] };
  }
  if (parts[0] === 'folders' && parts.length === 2) return { kind: 'space', folderId: parts[1] };
  return { kind: 'missing' };
}
export function safeReturnPath(next: string | null) {
  if (!next || next === '/' || !next.startsWith('/') || next.startsWith('//')) return null;
  const url = new URL(next, 'http://local');
  if (url.origin !== 'http://local') return null;
  const r = routeFor(url.pathname, url.search);
  return r.kind === 'design' || (r.kind === 'space' && !r.auth) ? url.pathname + url.search : null;
}

export const matchesId = (id: string | undefined, entity: { id: string }) => id === entity.id;
