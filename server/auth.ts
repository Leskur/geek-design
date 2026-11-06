import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Store, User } from './db';
const scrypt = promisify(scryptCallback);
export function fail(statusCode: number, message: string): never {
  throw Object.assign(new Error(message), { statusCode });
}
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return salt + ':' + key.toString('hex');
}
export async function checkPassword(password: string, stored: string) {
  const [salt, hex] = stored.split(':');
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeEqual(actual, Buffer.from(hex, 'hex'));
}
export function session(store: Store, userId: string) {
  const token = randomBytes(32).toString('hex');
  store.run(
    'INSERT INTO sessions VALUES(?,?,?)',
    hashToken(token),
    userId,
    Date.now() + 7 * 86400000,
  );
  return token;
}
export function authenticate(store: Store, token: string | undefined): User {
  if (!token) fail(401, '请先登录');
  const user = store.one(
    'SELECT u.id,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires>?',
    hashToken(token),
    Date.now(),
  );
  if (!user) fail(401, '登录已过期，请重新登录');
  return user;
}
export function spaceAccess(store: Store, user: User, spaceId: string, owner = false) {
  const member = store.one(
    'SELECT s.*,m.role FROM spaces s JOIN space_members m ON m.space_id=s.id WHERE s.id=? AND m.user_id=?',
    spaceId,
    user.id,
  );
  if (!member) fail(404, '空间不存在或无权访问');
  if (owner && member.role !== 'owner') fail(403, '需要空间拥有者权限');
  return member;
}
export function folderAccess(store: Store, user: User, folderId: string) {
  const folder = store.one('SELECT * FROM folders WHERE id=?', folderId);
  if (!folder) fail(404, '文件夹不存在或无权访问');
  const space = spaceAccess(store, user, folder.space_id);
  return { folder, space };
}
export function designAccess(store: Store, user: User, designId: string) {
  const design = store.one('SELECT * FROM designs WHERE id=?', designId);
  if (!design) fail(404, '设计不存在或无权访问');
  const space = spaceAccess(store, user, design.space_id);
  const folder = design.folder_id
    ? store.one('SELECT * FROM folders WHERE id=?', design.folder_id) || null
    : null;
  return { design, folder, space };
}
export function canDeleteDesign(
  space: { role: string },
  design: { created_by: string },
  user: User,
) {
  return space.role === 'owner' || design.created_by === user.id;
}
