'use client';

// Cài đặt báo cáo Zalo (Giao việc, anh Vũ 28/10/2026: "báo cáo lúc nào, báo cáo lặp lại hay k, báo cáo tùy chỉnh, báo cáo những gì").
// Chỉnh lịch và nội dung của hai báo cáo đang chạy: báo cáo sáng và báo cáo ca (lib/zalo/zalo-tick.ts). Mở phần tổng quan trước,
// chữ giải thích để cuối trang. Lưu ở app_settings (lib/zalo/report-schedule.ts), không gửi tin khi lưu.
import { useEffect, useState } from 'react';
import { CalendarClock, Plus, Save, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { NativeSelect } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';
import {
  DEFAULT_REPORT_SCHEDULE, MAX_SLOTS, REPORT_SECTIONS, SECTION_KEYS, TIME_OPTIONS, WEEKDAY_SHORT, previousTime, repeatLabel, timeLabel,
  type Repeat, type ReportSchedule, type ReportSection,
} from '@/lib/zalo/report-schedule';
import { ChartCard, Definitions, ErrorBox, SegmentedControl, SkeletonTable, StatusChip, toast } from './ui-kit';
import { workApi } from './giao-viec-view';

type Data = { schedule: ReportSchedule; customized: boolean; morningBrief: boolean; slotReports: boolean; remindBeforeMeetingMin: number; owner: boolean };
/** Phút nhắc trước giờ họp; giá trị đang lưu lạ (đặt ở Danh bạ Zalo) vẫn hiện được. */
const REMIND_OPTIONS = [15, 30, 45, 60, 90, 120];
const DEFAULT_REMIND = 60;
type Part = 'morning' | 'slots';
const REPEAT_MODES: { value: Repeat['mode']; label: string }[] = [
  { value: 'daily', label: 'Hằng ngày' }, { value: 'days', label: 'Chọn thứ' }, { value: 'once', label: 'Một lần' },
];
/** Thứ Hai đứng đầu như lịch Việt Nam. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const vnToday = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const switchRepeat = (mode: Repeat['mode'], current: Repeat): Repeat =>
  mode === 'daily' ? { mode } : mode === 'days' ? { mode, days: current.mode === 'days' ? current.days : [1, 2, 3, 4, 5, 6] } : { mode, date: current.mode === 'once' ? current.date : vnToday() };

function RepeatPicker({ id, value, onChange }: { id: string; value: Repeat; onChange: (r: Repeat) => void }) {
  return (
    <div className="space-y-2">
      <SegmentedControl<Repeat['mode']> size="sm" ariaLabel="Lặp lại" value={value.mode} options={REPEAT_MODES} onChange={(mode) => onChange(switchRepeat(mode, value))} />
      {value.mode === 'days' && (
        <fieldset className="flex flex-wrap gap-1.5">
          <legend className="sr-only">Các thứ gửi</legend>
          {WEEK_ORDER.map((d) => {
            const on = value.days.includes(d);
            return (
              <button key={d} type="button" aria-pressed={on} className={`btn sm tap min-w-10 ${on ? 'primary' : ''}`}
                onClick={() => onChange({ mode: 'days', days: on ? value.days.filter((x) => x !== d) : [...value.days, d].sort((a, b) => a - b) })}>
                {WEEKDAY_SHORT[d]}
              </button>
            );
          })}
        </fieldset>
      )}
      {value.mode === 'once' && (
        <label htmlFor={`${id}-date`} className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
          Gửi vào ngày
          <Input id={`${id}-date`} type="date" className="h-9 w-44" value={value.date} onChange={(e) => onChange({ mode: 'once', date: e.target.value })} />
        </label>
      )}
    </div>
  );
}

function Sections({ part, value, onChange }: { part: Part; value: ReportSection[]; onChange: (v: ReportSection[]) => void }) {
  return (
    <fieldset className="space-y-1">
      <legend className="mb-1 text-sm text-ink-2">Mục trong báo cáo</legend>
      {SECTION_KEYS.map((k) => (
        <label key={k} htmlFor={`${part}-sec-${k}`} className="tap flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[13px] text-ink hover:bg-surface-2">
          <Checkbox id={`${part}-sec-${k}`} checked={value.includes(k)} onCheckedChange={(on) => onChange(on ? SECTION_KEYS.filter((s) => s === k || value.includes(s)) : value.filter((s) => s !== k))} />
          {REPORT_SECTIONS[k]}
        </label>
      ))}
    </fieldset>
  );
}

export function GiaoViecBaoCaoView() {
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState('');
  const [schedule, setSchedule] = useState<ReportSchedule>(DEFAULT_REPORT_SCHEDULE);
  const [on, setOn] = useState({ morning: true, slots: true }), [busy, setBusy] = useState(false);
  const [remind, setRemind] = useState(DEFAULT_REMIND);
  useEffect(() => {
    void workApi<Data>('/api/giao-viec/bao-cao').then((d) => { setData(d); setSchedule(d.schedule); setOn({ morning: d.morningBrief, slots: d.slotReports }); setRemind(d.remindBeforeMeetingMin); }).catch((e: Error) => setError(e.message));
  }, []);
  if (!data) return error ? <ErrorBox error={error} /> : <SkeletonTable rows={6} />;

  const m = schedule.morning, s = schedule.slots;
  const setMorning = (patch: Partial<ReportSchedule['morning']>) => setSchedule((x) => ({ ...x, morning: { ...x.morning, ...patch } }));
  const setSlots = (patch: Partial<ReportSchedule['slots']>) => setSchedule((x) => ({ ...x, slots: { ...x.slots, ...patch } }));
  const setBoss = (patch: Partial<ReportSchedule['boss']>) => setSchedule((x) => ({ ...x, boss: { ...x.boss, ...patch } }));
  const b = schedule.boss, od = schedule.overdue;
  const freeTimes = TIME_OPTIONS.filter((t) => t !== m.time && !s.times.includes(t));
  const save = async () => {
    setBusy(true);
    try {
      const saved = await workApi<{ schedule: ReportSchedule }>('/api/giao-viec/bao-cao', 'PUT', { schedule: { morning: m, slots: { ...s, times: [...s.times].sort() }, boss: b, overdue: od }, morningBrief: on.morning, slotReports: on.slots, remindBeforeMeetingMin: remind });
      setSchedule(saved.schedule); setData({ ...data, schedule: saved.schedule, customized: true, morningBrief: on.morning, slotReports: on.slots, remindBeforeMeetingMin: remind });
      toast('Đã lưu cài đặt báo cáo. Lượt gửi kế tiếp dùng lịch mới.');
    } catch (e) { toast((e as Error).message, { kind: 'error' }); } finally { setBusy(false); }
  };
  const sortedSlots = [...s.times].sort();
  const windows = sortedSlots.map((t) => { const p = previousTime(schedule, t); return `${p ? timeLabel(p) : '0h'}–${timeLabel(t)}`; });

  return (
    <section className="min-w-0 space-y-4">
      <ChartCard icon={CalendarClock} title="Tổng quan lịch gửi" subtitle={data.customized ? 'Theo cài đặt đã lưu' : 'Chưa chỉnh: đang dùng lịch mặc định'}>
        <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
          <div className="rounded-lg bg-surface-2 p-3">
            <dt className="flex flex-wrap items-center gap-2 font-semibold text-ink">Báo cáo sáng <StatusChip tone={on.morning ? 'green' : 'gray'}>{on.morning ? 'Đang bật' : 'Đang tắt'}</StatusChip></dt>
            <dd className="mt-1 text-ink-2">{m.time} · {repeatLabel(m.repeat)} · {m.sections.length}/{SECTION_KEYS.length} mục</dd>
          </div>
          <div className="rounded-lg bg-surface-2 p-3">
            <dt className="flex flex-wrap items-center gap-2 font-semibold text-ink">Báo cáo ca <StatusChip tone={on.slots ? 'green' : 'gray'}>{on.slots ? 'Đang bật' : 'Đang tắt'}</StatusChip></dt>
            <dd className="mt-1 text-ink-2">{sortedSlots.join(', ')} · {repeatLabel(s.repeat)} · {s.sections.length}/{SECTION_KEYS.length} mục</dd>
          </div>
          <div className="rounded-lg bg-surface-2 p-3 sm:col-span-2">
            <dt className="flex flex-wrap items-center gap-2 font-semibold text-ink">Báo cáo gộp cho sếp và nhắc nhở <StatusChip tone={b.send ? 'green' : 'gray'}>{b.send ? 'Gộp: đang bật' : 'Gộp: đang tắt'}</StatusChip></dt>
            <dd className="mt-1 text-ink-2">Gộp mỗi ca{b.cumulative ? ', có luỹ kế' : ', không luỹ kế'} · Nhắc việc quá hạn {od.time} · Nhắc họp trước {remind} phút</dd>
          </div>
        </dl>
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Báo cáo sáng" subtitle="Số của hôm qua, gửi leader từng team">
          <div className="space-y-4">
            <label htmlFor="bc-morning-on" className="tap flex cursor-pointer items-center justify-between gap-3 text-sm text-ink">
              Gửi báo cáo sáng
              <Switch id="bc-morning-on" checked={on.morning} onCheckedChange={(v) => setOn((x) => ({ ...x, morning: v }))} />
            </label>
            <label htmlFor="bc-morning-time" className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
              Giờ gửi
              <NativeSelect id="bc-morning-time" className="w-28" value={m.time} onChange={(e) => setMorning({ time: e.target.value })}>
                {TIME_OPTIONS.filter((t) => t === m.time || !s.times.includes(t)).map((t) => <option key={t} value={t}>{t}</option>)}
              </NativeSelect>
            </label>
            <RepeatPicker id="bc-morning" value={m.repeat} onChange={(repeat) => setMorning({ repeat })} />
            <Sections part="morning" value={m.sections} onChange={(sections) => setMorning({ sections })} />
          </div>
        </ChartCard>

        <ChartCard title="Báo cáo theo ca" subtitle="Số từ 0h tới giờ gửi; sếp nhận bản gộp các team">
          <div className="space-y-4">
            <label htmlFor="bc-slots-on" className="tap flex cursor-pointer items-center justify-between gap-3 text-sm text-ink">
              Gửi báo cáo ca
              <Switch id="bc-slots-on" checked={on.slots} onCheckedChange={(v) => setOn((x) => ({ ...x, slots: v }))} />
            </label>
            <div className="space-y-2">
              <p className="text-sm text-ink-2">Giờ gửi</p>
              <div className="flex flex-wrap items-center gap-2">
                {s.times.map((t, i) => (
                  <span key={`${i}-${t}`} className="inline-flex items-center gap-1">
                    <NativeSelect aria-label={`Giờ ca ${i + 1}`} className="w-28" value={t}
                      onChange={(e) => setSlots({ times: s.times.map((x, j) => (j === i ? e.target.value : x)) })}>
                      {[t, ...freeTimes].sort().map((o) => <option key={o} value={o}>{o}</option>)}
                    </NativeSelect>
                    {s.times.length > 1 && (
                      <button type="button" className="btn sm icon tap" aria-label={`Bỏ giờ ${t}`} onClick={() => setSlots({ times: s.times.filter((_, j) => j !== i) })}><X size={14} /></button>
                    )}
                  </span>
                ))}
                {s.times.length < MAX_SLOTS && freeTimes.length > 0 && (
                  <button type="button" className="btn sm tap" onClick={() => setSlots({ times: [...s.times, freeTimes.find((t) => t > (sortedSlots.at(-1) ?? m.time)) ?? freeTimes[0]] })}>
                    <Plus size={14} />Thêm giờ
                  </button>
                )}
              </div>
              {windows.length > 0 && <p className="text-xs text-ink-3">Khung báo cáo gộp cho sếp: {windows.join(' · ')}</p>}
            </div>
            <RepeatPicker id="bc-slots" value={s.repeat} onChange={(repeat) => setSlots({ repeat })} />
            <Sections part="slots" value={s.sections} onChange={(sections) => setSlots({ sections })} />
          </div>
        </ChartCard>
      </div>

      <ChartCard title="Báo cáo gộp cho sếp và nhắc nhở" subtitle="Sếp nhận một bản gộp các team ở mỗi giờ ca">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            <label htmlFor="bc-boss-on" className="tap flex cursor-pointer items-center justify-between gap-3 text-sm text-ink">
              Gửi báo cáo gộp cho sếp mỗi ca
              <Switch id="bc-boss-on" checked={b.send} onCheckedChange={(v) => setBoss({ send: v })} />
            </label>
            <label htmlFor="bc-boss-cum" className="tap flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[13px] text-ink hover:bg-surface-2">
              <Checkbox id="bc-boss-cum" checked={b.cumulative} disabled={!b.send} onCheckedChange={(v) => setBoss({ cumulative: v === true })} />
              Có số luỹ kế từ 0h của từng team
            </label>
          </div>
          <div className="space-y-3">
            <label htmlFor="bc-overdue-time" className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
              Nhắc việc quá hạn, tới hạn hôm nay lúc
              <NativeSelect id="bc-overdue-time" className="w-28" value={od.time} onChange={(e) => setSchedule((x) => ({ ...x, overdue: { time: e.target.value } }))}>
                {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </NativeSelect>
            </label>
            <label htmlFor="bc-remind" className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
              Nhắc họp trước
              <NativeSelect id="bc-remind" className="w-28" value={String(remind)} onChange={(e) => setRemind(Number(e.target.value))}>
                {[...new Set([...REMIND_OPTIONS, remind])].sort((x, y) => x - y).map((n) => <option key={n} value={n}>{n} phút</option>)}
              </NativeSelect>
            </label>
          </div>
        </div>
      </ChartCard>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn primary" disabled={busy} onClick={() => void save()}><Save size={14} />{busy ? 'Đang lưu…' : 'Lưu cài đặt'}</button>
        <button type="button" className="btn" disabled={busy} onClick={() => { setSchedule(DEFAULT_REPORT_SCHEDULE); setOn({ morning: true, slots: true }); setRemind(DEFAULT_REMIND); }}>Về lịch mặc định</button>
      </div>

      <Definitions items={[
        'Mặc định (chưa chỉnh): báo cáo sáng 08:00, báo cáo ca 12:00, 17:00, 22:00, hằng ngày, đủ mọi mục; sếp nhận bản gộp có luỹ kế; nhắc việc quá hạn 08:00; nhắc họp trước 60 phút — đúng như trước khi có trang này.',
        'Máy chủ xét lịch mỗi phút và gửi đúng phút đã chọn; mỗi báo cáo gửi tối đa một lần mỗi ngày. Đổi giờ có hiệu lực từ lượt gửi kế tiếp.',
        'Báo cáo sáng: số của ngày hôm qua. Báo cáo ca: số từ 0h tới giờ gửi, so với cùng giờ hôm qua và cùng giờ tuần trước. Bản gộp cho sếp tính khung từ giờ báo cáo liền trước (báo cáo sáng hoặc ca trước).',
        'Giờ báo cáo sáng luôn chụp số của team để làm mốc cho ca đầu tiên, kể cả khi tắt báo cáo sáng hoặc hôm đó không gửi.',
        'Mục bỏ chọn không hiện ở cả ảnh và bản chữ gửi leader. Dòng doanh số đầu báo cáo luôn có. Báo cáo gộp cho sếp: doanh số từng team trong khung, kèm luỹ kế từ 0h nếu chọn.',
        'Công tắc bật / tắt và số phút nhắc họp dùng chung với "Cài đặt thông báo" ở Danh bạ Zalo: sửa một nơi, nơi kia đổi theo. Nhắc việc quá hạn gửi người nhận việc và người giao việc. Báo thiếu số giữ như cũ.',
        'Lưu cài đặt không gửi tin nào. Bản demo không gửi Zalo thật, chỉ ghi vào hộp thư demo.',
      ]} />
    </section>
  );
}
