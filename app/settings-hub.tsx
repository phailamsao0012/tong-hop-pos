'use client';

// Trang Cài đặt gọn lại (anh Vũ 31/10/2026, học cách xếp của Shopify, Stripe, GitHub): trang đầu là mục lục có ô tìm,
// chia "Công ty" và "Của tôi"; bấm một mục mới mở các phần chỉnh của mục đó. Các phần chỉnh giữ nguyên, chỉ xếp lại chỗ.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Bell, ChevronLeft, ChevronRight, Database, Search, Server, Sparkles, Target, UserRound, Users, type LucideIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { vi } from './ui-kit';

export type SettingsSection = 'team' | 'kpi' | 'data' | 'alert' | 'sys' | 'me' | 'look';
export type Pill = { text: string; tone: 'ok' | 'warn' | 'bad' };
type Tone = 'green' | 'orange' | 'blue' | 'purple' | 'teal' | 'gray';

const SECTIONS: { id: SettingsSection; group: 'Công ty' | 'Của tôi'; name: string; sub: string; icon: LucideIcon; tone: Tone; keys: string }[] = [
  { id: 'team', group: 'Công ty', name: 'Team & tài khoản', sub: 'Chia team, team MKT, tài khoản, web nhân sự', icon: Users, tone: 'green', keys: 'chia team mentor leader trưởng nhóm marketing mkt tài khoản phân quyền mật khẩu vai trò pos được xem web nhân sự hồ sơ' },
  { id: 'kpi', group: 'Công ty', name: 'Mục tiêu & chỉ số', sub: 'Mục tiêu tháng, cách tính từng con số', icon: Target, tone: 'orange', keys: 'mục tiêu tháng kpi doanh số đơn chốt chỉ số cách tính tỉ lệ hoàn hủy ngưỡng' },
  { id: 'data', group: 'Công ty', name: 'Dữ liệu Pancake', sub: 'Kết nối POS, đồng bộ nền, danh mục', icon: Database, tone: 'blue', keys: 'pancake api key shop id kết nối pos đồng bộ lịch sử đơn khách ghi chú cuộc gọi danh mục sản phẩm' },
  { id: 'alert', group: 'Công ty', name: 'Cảnh báo', sub: 'Telegram, đơn kẹt, canh máy', icon: Bell, tone: 'purple', keys: 'telegram cảnh báo đơn kẹt chờ xác nhận canh gác canh máy nhắn tin' },
  { id: 'sys', group: 'Công ty', name: 'Hệ thống', sub: 'Sao lưu, khôi phục', icon: Server, tone: 'teal', keys: 'sao lưu khôi phục backup bản sao google drive' },
  { id: 'me', group: 'Của tôi', name: 'Tài khoản của tôi', sub: 'Mật khẩu, Face ID, thiết bị tin cậy', icon: UserRound, tone: 'gray', keys: 'đổi mật khẩu passkey face id thiết bị tin cậy mã ứng dụng tự khóa màn hình bảo mật' },
  { id: 'look', group: 'Của tôi', name: 'Hiển thị', sub: 'Con vật chờ tải', icon: Sparkles, tone: 'gray', keys: 'con vật chờ tải người que hình chờ' },
];
const TONE: Record<Tone, string> = { green: 'bg-t-green-bg text-t-green', orange: 'bg-t-orange-bg text-t-orange', blue: 'bg-t-blue-bg text-t-blue', purple: 'bg-t-purple-bg text-t-purple', teal: 'bg-t-teal-bg text-t-teal', gray: 'bg-t-gray-bg text-t-gray' };
const PILL: Record<Pill['tone'], string> = { ok: 'bg-good-bg text-good', warn: 'bg-warn-bg text-warn', bad: 'bg-bad-bg text-bad' };
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
export const sectionOf = (id: SettingsSection) => SECTIONS.find((s) => s.id === id)!;

function Badge({ icon: Icon, tone, big }: { icon: LucideIcon; tone: Tone; big?: boolean }) {
  return <span className={`grid shrink-0 place-items-center rounded-xl ${big ? 'size-12' : 'size-10'} ${TONE[tone]}`}><Icon size={big ? 22 : 19} strokeWidth={1.9} /></span>;
}
export function StatusPill({ pill }: { pill?: Pill }) {
  if (!pill) return null;
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${PILL[pill.tone]}`}><i aria-hidden="true" className="size-1.5 rounded-full bg-current" />{pill.text}</span>;
}

/** Trang đầu: ô tìm + ô bấm từng mục. */
export function SettingsHub({ onOpen, pills }: { onOpen: (s: SettingsSection) => void; pills: Partial<Record<SettingsSection, Pill>> }) {
  const [q, setQ] = useState('');
  const hits = useMemo(() => { const n = norm(q.trim()); return n ? SECTIONS.filter((s) => norm(`${s.name} ${s.sub} ${s.keys}`).includes(n)) : null; }, [q]);
  const groups = hits ? [[`${hits.length} mục khớp`, hits] as const] : (['Công ty', 'Của tôi'] as const).map((g) => [g, SECTIONS.filter((s) => s.group === g)] as const);
  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl bg-sb p-3 text-sb-ink">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 size-56 rounded-full bg-[radial-gradient(circle,rgba(217,243,109,.22),transparent_65%)]" />
        <div className="relative flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 focus-within:border-lime">
          <Search size={17} className="shrink-0 text-sb-ink-2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm cài đặt: telegram, mentor, sao lưu…" aria-label="Tìm cài đặt" className="h-10 border-0 bg-transparent px-0 text-[15px] text-sb-ink shadow-none placeholder:text-sb-ink-2 focus-visible:ring-0" />
        </div>
      </div>
      {groups.map(([title, list]) => (
        <section key={title}>
          <h2 className="mb-2 px-0.5 text-[11.5px] font-semibold uppercase tracking-[.07em] text-ink-3">{title}</h2>
          {list.length ? (
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((s) => (
                <button key={s.id} type="button" onClick={() => onOpen(s.id)} className="card flex items-center gap-3 p-3.5 text-left transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-raise focus-visible:outline-2 focus-visible:outline-primary">
                  <Badge icon={s.icon} tone={s.tone} />
                  <span className="min-w-0 flex-1">
                    <b className="block text-[15px] font-semibold text-ink">{s.name}</b>
                    <span className="block text-[12.5px] text-ink-3">{s.sub}</span>
                    {pills[s.id] && <span className="mt-1.5 block"><StatusPill pill={pills[s.id]} /></span>}
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-ink-3" />
                </button>
              ))}
            </div>
          ) : <p className="rounded-2xl border border-dashed border-line-2 p-5 text-center text-sm text-ink-3">Không thấy cài đặt nào khớp “{q}”</p>}
        </section>
      ))}
    </div>
  );
}

/** Đầu trang một mục: nút quay lại, biểu tượng, tên, nhãn tình trạng. */
export function SettingsSectionHeader({ section, onBack, pill, actions }: { section: SettingsSection; onBack: () => void; pill?: Pill; actions?: ReactNode }) {
  const s = sectionOf(section);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-0.5 rounded-lg py-1 pr-2 text-[13px] text-ink-2 hover:text-ink" aria-label="Về trang Cài đặt"><ChevronLeft size={18} />Cài đặt</button>
        <Badge icon={s.icon} tone={s.tone} big />
        <div className="min-w-0">
          <h1 className="display text-xl font-semibold tracking-[-.02em] text-ink">{s.name}</h1>
          {pill ? <StatusPill pill={pill} /> : <p className="text-[12.5px] text-ink-3">{s.sub}</p>}
        </div>
      </div>
      {actions}
    </div>
  );
}

type Teams = { teams?: unknown[]; accounts?: unknown[] };
type Sched = { lastRunAt?: number | null; lastError?: string | null; writeBlockedUntil?: number | null };
type Backup = { configured?: boolean; status?: { status?: string; finishedAt?: string; startedAt?: string; bytes?: number } | null };
const hm = (ms: number) => new Date(ms).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' });
const mb = (b = 0) => `${(b / 1048576).toFixed(0)} MB`;

/** Nhãn tình trạng cho trang đầu, lấy từ ba API sẵn có; chỉ gọi khi mở trang Cài đặt. */
export function useSettingsPills(enabled: boolean): Partial<Record<SettingsSection, Pill>> {
  const [pills, setPills] = useState<Partial<Record<SettingsSection, Pill>>>({});
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const get = <T,>(url: string) => fetch(url, { cache: 'no-store' }).then((r) => r.ok ? r.json() as Promise<T> : null).catch(() => null);
    void Promise.all([get<Teams>('/api/web-teams'), get<Sched>('/api/sync/scheduler'), get<Backup>('/api/backup')]).then(([t, s, b]) => {
      if (!live) return;
      const next: Partial<Record<SettingsSection, Pill>> = {};
      if (t?.teams) next.team = { text: `${vi.format(t.teams.length)} team · ${vi.format(t.accounts?.length ?? 0)} tài khoản`, tone: t.teams.length ? 'ok' : 'warn' };
      if (s) next.data = s.writeBlockedUntil && s.writeBlockedUntil > Date.now() ? { text: 'Hết hạn mức ghi hôm nay', tone: 'bad' } : s.lastError ? { text: 'Lần chạy gần nhất lỗi', tone: 'bad' } : s.lastRunAt ? { text: `Đồng bộ lúc ${hm(s.lastRunAt)}`, tone: 'ok' } : { text: 'Chưa chạy', tone: 'warn' };
      if (b) { const st = b.status; next.sys = !b.configured ? { text: 'Chưa cài sao lưu', tone: 'warn' } : st?.status === 'ok' ? { text: `Sao lưu ${hm(Date.parse(st.finishedAt ?? st.startedAt ?? ''))} · ${mb(st.bytes)}`, tone: 'ok' } : st?.status === 'fail' ? { text: 'Sao lưu gần nhất lỗi', tone: 'bad' } : { text: 'Chưa có bản sao lưu', tone: 'warn' }; }
      setPills(next);
    });
    return () => { live = false; };
  }, [enabled]);
  return pills;
}
