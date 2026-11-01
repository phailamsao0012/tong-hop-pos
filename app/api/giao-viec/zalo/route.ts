import { env } from 'cloudflare:workers';
import { bossRoute } from '../me/route';
import { listContacts, saveContact, deactivateContact, createPairCode, readZaloSetting, saveZaloSettings, saveBosses, DEFAULT_ZALO_SETTINGS, type Contact } from '@/lib/zalo/zalo-work';
export async function GET(request: Request) {
  return bossRoute(request, async (db, _actor, user) => ({
    contacts: await listContacts(db), settings: { ...DEFAULT_ZALO_SETTINGS, ...await readZaloSetting(db, 'zalo_settings_v1', {}) },
    owner: user.role === 'owner', demo: env.DEMO_MODE === '1', hasToken: user.role === 'owner' ? !!env.ZALO_BOT_TOKEN?.trim() : undefined,
    bosses: user.role === 'owner' ? await readZaloSetting(db, 'zalo_bosses_v1', []) : undefined,
    users: user.role === 'owner' ? (await db.prepare("SELECT id,name,role FROM users WHERE disabled=0 AND role IN ('owner','director','lead') ORDER BY name").all()).results : undefined,
    outbox: env.DEMO_MODE === '1' ? (await readZaloSetting<unknown[]>(db, 'demo_zalo_outbox', [])).slice(-30).reverse() : [],
  }));
}
export async function POST(request: Request) {
  return bossRoute(request, async (db) => {
    const input = await request.json() as Partial<Contact> & Pick<Contact, 'kind' | 'name'> & { action?: string; contactId: string };
    if (input.action === 'pair') return { code: await createPairCode(db, input.contactId) };
    if (input.kind === 'boss') throw new Error('Thêm sếp qua danh sách Người được giao việc.');
    return saveContact(db, { ...input, id: undefined, user_id: null, active: 1 });
  });
}
export async function PATCH(request: Request) {
  return bossRoute(request, async db => {
    const input = await request.json() as Partial<Contact> & Pick<Contact, 'kind' | 'name'> & { action?: string; contactId: string };
    const current = (await listContacts(db)).find(c => c.id === input.id);
    if (!current || current.kind === 'boss' || input.kind && input.kind !== current.kind) throw new Error('Danh bạ không hợp lệ.');
    if (input.active === 0) return deactivateContact(db, current.id);
    return saveContact(db, { ...current, ...input, user_id: current.user_id, kind: current.kind });
  });
}
export async function PUT(request: Request) {
  return bossRoute(request, async (db, _actor, user) => {
    const input = await request.json() as typeof DEFAULT_ZALO_SETTINGS & { bosses?: string[] };
    if (input.bosses !== undefined) { if (user.role !== 'owner') throw new Error('Chỉ chủ hệ thống được cấp quyền.'); await saveBosses(db, input.bosses); }
    else await saveZaloSettings(db, input);
  });
}
