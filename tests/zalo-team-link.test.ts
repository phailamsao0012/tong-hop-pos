import assert from 'node:assert/strict';
import test from 'node:test';
import { linkTeamZalo, teamZaloStates } from '@/lib/zalo/team-link';

// D1 giả tối giản: chỉ đủ cho các câu lệnh của team-link + saveContact + createPairCode.
type Row = Record<string, unknown>;
function fakeDb() {
  const contacts: Row[] = [];
  const settings = new Map<string, string>();
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    async first<T>() {
      if (
        /FROM zalo_contacts WHERE kind='leader' AND active=1 AND user_id=\?/.test(
          sql,
        )
      )
        return (contacts
          .filter(
            (c) =>
              c.kind === 'leader' && c.active === 1 && c.user_id === args[0],
          )
          .sort((a, b) => Number(!a.chat_id) - Number(!b.chat_id))[0] ??
          null) as T;
      if (/FROM zalo_contacts WHERE id=\?/.test(sql))
        return (contacts.find((c) => c.id === args[0] && c.active === 1) ??
          null) as T;
      if (/app_settings/.test(sql)) {
        const v = settings.get('zalo_pair_v1');
        return (v ? { value: v } : null) as T;
      }
      return null as T;
    },
    async all<T>() {
      return {
        results: contacts.filter(
          (c) => c.kind === 'leader' && c.active === 1 && c.user_id,
        ) as T[],
      };
    },
    async run() {
      if (/INSERT INTO zalo_contacts/.test(sql)) {
        const [
          id,
          name,
          kind,
          user_id,
          team_id,
          team_name,
          dept,
          leader_id,
          pos,
          active,
        ] = args;
        contacts.push({
          id,
          name,
          kind,
          user_id,
          team_id,
          team_name,
          dept,
          leader_id,
          pos_seller_ids: pos,
          active,
          chat_id: null,
          created_at: String(contacts.length),
        });
      } else if (/app_settings/.test(sql)) {
        const v = args.find((x) => typeof x === 'string' && x.startsWith('{'));
        if (typeof v === 'string') settings.set('zalo_pair_v1', v);
      }
      return { meta: { changes: 1, rows_written: 1 } };
    },
  });
  return {
    db: {
      prepare: (sql: string) => stmt(sql),
      batch: async (s: { run: () => Promise<unknown> }[]) =>
        Promise.all(s.map((x) => x.run())),
    } as unknown as D1Database,
    contacts,
  };
}

void test('gắn Zalo: tạo người nhận việc cho Mentor và cấp mã 6 số', async () => {
  const { db, contacts } = fakeDb();
  const r = await linkTeamZalo(db, {
    userId: 'u1',
    name: 'Mentor A',
    teamId: 'wt_1',
    teamName: 'Team 1',
    dept: 'cskh',
  });
  assert.equal(r.linked, false);
  assert.match(r.linked ? '' : r.code, /^\d{6}$/);
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].kind, 'leader');
  assert.equal(contacts[0].user_id, 'u1');
  assert.equal(contacts[0].team_id, 'wt_1');
});

void test('gắn Zalo lần hai dùng lại người cũ, đã nối thì báo đã nối', async () => {
  const { db, contacts } = fakeDb();
  await linkTeamZalo(db, {
    userId: 'u1',
    name: 'Mentor A',
    teamId: 'wt_1',
    teamName: 'Team 1',
    dept: 'sale',
  });
  await linkTeamZalo(db, {
    userId: 'u1',
    name: 'Mentor A',
    teamId: 'wt_2',
    teamName: 'Team 2',
    dept: 'sale',
  });
  assert.equal(contacts.length, 1);
  contacts[0].chat_id = 'chat-ao';
  const r = await linkTeamZalo(db, {
    userId: 'u1',
    name: 'Mentor A',
    teamId: 'wt_1',
    teamName: 'Team 1',
    dept: 'sale',
  });
  assert.deepEqual(r, { linked: true, teamName: 'Team 1' });
  assert.deepEqual(await teamZaloStates(db), [
    { userId: 'u1', linked: true, teamName: 'Team 1' },
  ]);
});
