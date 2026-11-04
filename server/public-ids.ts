import type { FastifyInstance } from 'fastify';
import type { Store } from './db';
const fields = new Set([
  'id',
  'userId',
  'user_id',
  'teamId',
  'team_id',
  'projectId',
  'project_id',
  'documentId',
  'document_id',
  'revisionId',
  'revision_id',
  'current_revision',
  'base_revision',
  'accepted_by',
  'viewerId',
  'ticket',
]);
const inputFields = ['userId', 'teamId', 'projectId', 'documentId', 'revisionId'];
export function publicIds(app: FastifyInstance, store: Store) {
  app.addHook('preValidation', async (req: any) => {
    if (!req.url.startsWith('/api/')) return;
    for (const key of ['id', 'userId', 'inviteId'])
      if (typeof req.params?.[key] === 'string') req.params[key] = store.resolveId(req.params[key]);
    if (req.body && typeof req.body === 'object')
      for (const key of inputFields)
        if (typeof req.body[key] === 'string') req.body[key] = store.resolveId(req.body[key]);
  });
  app.addHook('onSend', async (req, reply, payload) => {
    const route = req.routeOptions.url || '';
    if (
      !route.startsWith('/api/') ||
      route.includes('/pages/') ||
      route.endsWith('/symbols') ||
      route.includes('/assets/') ||
      typeof payload !== 'string' ||
      !String(reply.getHeader('content-type')).includes('application/json')
    )
      return payload;
    let data: any;
    try {
      data = JSON.parse(payload);
    } catch {
      return payload;
    }
    if (route.endsWith('/manifest')) {
      for (const [key, legacy] of [
        ['projectId', 'legacyProjectId'],
        ['documentId', 'legacyDocumentId'],
        ['revisionId', 'legacyRevisionId'],
      ] as const) {
        const original = data[key];
        if (typeof original === 'string') {
          data[key] = store.publicId(original);
          if (original !== data[key]) data[legacy] = original;
        }
      }
      if (typeof data.viewerId === 'string') data.viewerId = store.publicId(data.viewerId);
    } else {
      function convert(value: any): any {
        if (Array.isArray(value)) return value.map(convert);
        if (value && typeof value === 'object') {
          const result: any = {};
          for (const [key, item] of Object.entries(value))
            result[key] =
              fields.has(key) && typeof item === 'string' ? store.publicId(item) : convert(item);
          if (typeof value.id === 'string' && value.id !== result.id) result.legacy_id = value.id;
          return result;
        }
        return value;
      }
      data = convert(data);
    }
    return JSON.stringify(data);
  });
}
