import assert from 'node:assert/strict';
import test from 'node:test';
import { linkAccountZalo, linkTeamZalo, teamZaloStates } from '@/lib/zalo/team-link';

// D1 giả tối giản: chỉ đủ cho các câu lệnh của team-link + saveContact + createPairCode.
type Row = Record<string, unknown>;
function fakeDb(saved: Record<string, string> = {}, users: Row[] = []) {
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
      if (/FROM pos_users WHERE user_id=\?/.test(sql)) {
        const u = users.find((x) => x.id === args[1]);
        return (u ? { id: args[0], name: u.name } : null) as T;
      }
      if (/FROM users WHERE id=\?/.test(sql))
        return (users.find((u) => u.id === args[0]) ?? null) as T;
      if (/app_settings/.test(sql)) {
        const v = settings.get('zalo_pair_v1');
        return (v ? { value: v } : null) as T;
      }
      return null as T;
    },
    async all<T>() {
      if (/SELECT key,value FROM app_settings/.test(sql))
        return {
          results: Object.entries(saved)
            .filter(([k]) => args.includes(k))
            .map(([key, value]) => ({ key, value })) as T[],
        };
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

void test('báo cáo Zalo: Leader nhận mọi team mình quản, Mentor nhận team mình, người cũ nhận như trước', async () => {
  const { reportTargets } = await import('@/lib/zalo/team-link');
  const base = { kind: 'leader' as const, leader_id: null, pos_seller_ids: '[]', chat_id: 'c', active: 1 };
  const contacts = [
    { ...base, id: 'k1', name: 'Leader', user_id: 'lead', team_id: 'wt_1', team_name: 'Team 1', dept: 'sale' },
    { ...base, id: 'k2', name: 'Mentor', user_id: 'men', team_id: 'wt_2', team_name: 'Team 2', dept: 'sale' },
    { ...base, id: 'k3', name: 'Cũ', user_id: null, team_id: 'hr_9', team_name: 'Team cũ', dept: 'cskh' },
  ];
  const teams = [
    { id: 'wt_1', name: 'Team 1', dept: 'sale' as const, office: null, memberIds: [], leaderUserId: 'lead' },
    { id: 'wt_2', name: 'Team 2', dept: 'sale' as const, office: null, memberIds: [], leaderUserId: 'lead', mentorUserId: 'men' },
    { id: 'wt_3', name: 'Team 3', dept: 'cskh' as const, office: null, memberIds: [] },
  ];
  assert.deepEqual(reportTargets(contacts, teams).map((c) => `${c.id}:${c.team_id}`), ['k1:wt_1', 'k1:wt_2', 'k2:wt_2', 'k3:hr_9']);
});

void test('báo cáo Zalo: Giám đốc kinh doanh nhận ảnh của mọi team', async () => {
  const { reportTargets } = await import('@/lib/zalo/team-link');
  const base = { leader_id: null, pos_seller_ids: '[]', chat_id: 'c', active: 1, dept: '', team_name: '', team_id: null };
  const leader = { ...base, kind: 'leader' as const, id: 'k1', name: 'Leader', user_id: null, team_id: 'hr_9', team_name: 'Team cũ', dept: 'cskh' };
  const director = { ...base, kind: 'boss' as const, id: 'boss-1', name: 'Giám đốc', user_id: 'dir' };
  const teams = [{ id: 'wt_1', name: 'Team 1', dept: 'sale' as const, office: null, memberIds: [] }];
  assert.deepEqual(reportTargets([leader], teams, [director]).map((c) => `${c.id}:${c.team_id}`), ['k1:hr_9', 'boss-1:wt_1', 'boss-1:hr_9']);
});

void test('gắn Zalo cho Mentor team MKT: tìm team MKT đã lưu, người nhận việc không gắn bộ phận', async () => {
  const { linkSavedTeamZalo } = await import('@/lib/zalo/team-link');
  const { db, contacts } = fakeDb(
    {
      marketing_teams_v1: JSON.stringify([
        { id: 'mkt_1', name: 'MKT A', memberIds: ['p1'], mentorUserId: 'u9' },
      ]),
    },
    [{ id: 'u9', name: 'Mentor MKT' }],
  );
  const out = await linkSavedTeamZalo(db, 'mkt_1', 'u9');
  assert.ok(!('error' in out));
  assert.equal(contacts[0].team_id, 'mkt_1');
  assert.equal(contacts[0].dept, '');
  const wrong = await linkSavedTeamZalo(db, 'mkt_1', 'u8');
  assert.ok('error' in wrong);
});

void test('nối Zalo cho Mentor là người trong team, chưa có tài khoản web (anh Vũ 06/11/2026)', async () => {
  const { linkSavedTeamZalo, reportTargets } = await import('@/lib/zalo/team-link');
  const { db, contacts } = fakeDb(
    { vandon_teams_v1: JSON.stringify([{ id: 'vd_1', name: 'Vận đơn A', memberIds: ['p1', 'p2'], mentorPosId: 'p1' }]) },
    [{ id: 'p1', name: 'Người thử' }],
  );
  const out = await linkSavedTeamZalo(db, 'vd_1', 'pos:p1');
  assert.ok(!('error' in out));
  assert.equal(contacts[0].user_id, 'pos:p1');
  assert.ok('error' in (await linkSavedTeamZalo(db, 'vd_1', 'pos:p2')), 'p2 không phải Mentor/Leader');
  const base = { kind: 'leader' as const, leader_id: null, pos_seller_ids: '[]', chat_id: 'c', active: 1 };
  const teams = [{ id: 'wt_1', name: 'Team 1', dept: 'sale' as const, office: null, memberIds: ['p5'], leaderPosId: 'p5' }];
  const k = { ...base, id: 'k1', name: 'Leader', user_id: 'pos:p5', team_id: 'wt_9', team_name: 'Cũ', dept: 'sale' };
  assert.deepEqual(reportTargets([k], teams).map((c) => c.team_id), ['wt_1']);
});

void test('nối Zalo ở trang Tài khoản: tài khoản chưa phụ trách team vẫn lấy được mã', async () => {
  const { db, contacts } = fakeDb({}, [{ id: 'u9', name: 'Leader Ảo' }]);
  const r = await linkAccountZalo(db, 'u9');
  assert.ok(!('error' in r));
  assert.equal(r.result.linked, false);
  assert.match(r.result.linked ? '' : r.result.code, /^\d{6}$/);
  assert.equal(contacts[0].user_id, 'u9');
  assert.equal(contacts[0].team_id, '');
  assert.deepEqual(await linkAccountZalo(db, 'khong-co'), { error: 'Tài khoản không còn dùng được.' });
  assert.deepEqual(await linkAccountZalo(db, ''), { error: 'Thiếu tài khoản.' });
});
