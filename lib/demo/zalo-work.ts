import { STAFF, UNITS, addDay, vnDayOfMs } from './world';
import { saveContact, createTask, createMeeting, answerMeeting, moveTask, writeZaloSetting, type Actor } from '../zalo-work';
import { logMessage } from '../zalo-chat';

export async function seedZaloWork(db: D1Database, now = Date.now()) {
  if (await db.prepare('SELECT id FROM zalo_contacts LIMIT 1').first()) return;
  const users = (await db.prepare("SELECT id,name,email FROM users WHERE email IN ('chu@demo.megatech.vn','giamdoc@demo.megatech.vn')").all<{ id: string; name: string; email: string }>()).results;
  if (users.length !== 2) return;
  const bosses: Actor[] = [];
  for (const u of users) bosses.push(await saveContact(db, { id: `boss-${u.id}`, name: STAFF.find(s => s.dept === 'boss' && s.level === (u.email.startsWith('chu@') ? 'tp' : 'gd'))!.name, kind: 'boss', user_id: u.id }, now));
  await writeZaloSetting(db, 'zalo_bosses_v1', users.map(u => u.id));
  const leaders: Actor[] = [], staff: Actor[] = [];
  for (const unit of ['sale-hn-1', 'sale-hn-2', 'sale-tn', 'cskh-hn-1', 'cskh-hn-2']) {
    const person = STAFF.find(s => s.unit === unit && s.level === 'leader')!;
    const leader = await saveContact(db, { id: `zalo-${person.id}`, name: person.name, kind: 'leader', team_id: `dept-${unit}`, team_name: UNITS[unit].name, dept: person.dept }, now);
    leaders.push(leader);
    for (const p of STAFF.filter(s => s.unit === unit && s.level === 'nv' && !s.left).slice(0, 3)) staff.push(await saveContact(db, { id: `zalo-${p.id}`, name: p.name, kind: 'staff', leader_id: leader.id, pos_seller_ids: JSON.stringify([p.id]) }, now));
  }
  const all = [...bosses, ...leaders, ...staff];
  await db.batch(all.map((c, i) => db.prepare('UPDATE zalo_contacts SET chat_id=?,linked_at=? WHERE id=?').bind(`demo-${i + 1}`, new Date(now).toISOString(), c.id)));
  const day = vnDayOfMs(now);
  // Gửi giả để tin giao việc/đổi trạng thái được ghi vào tab Chat (demo không gọi Zalo). Mỗi việc lùi 40 phút cho chat có thứ tự.
  const quiet = async () => undefined, at = (i: number) => now - (12 - i) * 40 * 60000;
  for (let i = 0; i < 10; i++) {
    const leader = leaders[i % 5], member = staff.find(s => s.leader_id === leader.id)!;
    const t = await createTask(db, i < 5 ? bosses[0] : leader, { title: ['Rà soát việc trong tuần', 'Chuẩn bị báo cáo team', 'Kiểm tra tiến độ', 'Tổng hợp phản hồi', 'Chuẩn bị nội dung họp'][i % 5], detail: 'Dữ liệu ảo để thử giao việc trên Zalo.', assigneeId: i < 5 ? leader.id : member.id, urgent: i === 0, dueDate: addDay(day, i < 2 ? -1 : i % 4) }, at(i), quiet);
    if (i === 2) await moveTask(db, bosses[0], t.no, 'chua_xong', 'Cần thêm thời gian rà soát', at(i) + 600000, quiet);
    if (i === 3 || i === 8) { await moveTask(db, i < 5 ? bosses[0] : leader, t.no, 'xong', '', at(i) + 600000, quiet); }
    if (i === 4) await moveTask(db, bosses[0], t.no, 'dang_lam', '', at(i) + 600000, quiet);
    if (i === 9) await moveTask(db, leader, t.no, 'da_nhan', '', at(i) + 600000, quiet);
  }
  for (const offset of [1, -1]) {
    const m = await createMeeting(db, bosses[0], { title: offset > 0 ? 'Họp kế hoạch tuần' : 'Họp rà soát tuần', place: 'Phòng họp demo', startAt: new Date(now + offset * 86400000).toISOString(), note: 'Chuẩn bị tiến độ của team.', inviteeIds: leaders.map(l => l.id) }, offset > 0 ? now - 50 * 60000 : at(0) - 3600000, quiet);
    for (let i = 0; i < 3; i++) await answerMeeting(db, leaders[i].id, m.no, i === 2 ? 'khong' : 'co', i === 2 ? 'Bận lịch khác' : '', now);
  }
  // Vài tin leader nhắn bot (tên ảo), có tin chưa đọc để thử đếm.
  const said: [number, string, number][] = [[0, 'Dạ em nhận, chiều em gửi báo cáo ạ', 30], [0, 'Em gửi file lên nhóm rồi anh xem giúp em', 12], [1, 'Team em hôm nay thiếu 1 bạn nghỉ ốm', 25], [2, 'Em cần thêm 1 ngày để rà soát hết khách cũ', 8], [3, 'Ok anh', 45]];
  for (const [li, body, minutes] of said) await logMessage(db, { contactId: leaders[li].id, dir: 'in', body, now: now - minutes * 60000 });
  await db.prepare("UPDATE zalo_messages SET read_at=? WHERE dir='in' AND created_at<?").bind(new Date(now).toISOString(), new Date(now - 40 * 60000).toISOString()).run();
}
