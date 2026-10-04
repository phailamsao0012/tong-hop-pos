'use client';

// Cấu hình "Phân công xử lý đơn" đang có trên Pancake của từng POS (chỉ đọc). Xem lib/pancake-probe.ts.
import { useState } from 'react';
import { Eye, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AssignConfig } from '@/lib/pancake-probe';
import { ChartCard, ErrorBox, StatusChip, posName } from './ui-kit';

const RULE_TYPE: Record<string, string> = { order_source: 'Kênh bán', source: 'Kênh bán', marketer: 'Marketer', tag: 'Thẻ', order_tag: 'Thẻ' };

export function PancakeAssignCard() {
  const [data, setData] = useState<{ configured: boolean; shops: AssignConfig[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/dispatch/pancake-config', { cache: 'no-store' });
      const body = await r.json() as { configured: boolean; shops: AssignConfig[]; error?: string };
      if (!r.ok) throw new Error(body.error ?? 'Không đọc được.');
      setData(body);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không đọc được.'); }
    finally { setLoading(false); }
  };
  return (
    <ChartCard icon={Settings2} title="Phân công trên Pancake" subtitle="Đọc cấu hình Phân công xử lý đơn của từng POS (chỉ đọc, không sửa gì)"
      action={<Button variant="outline" onClick={() => void load()} disabled={loading}><Eye className={`size-4 ${loading ? 'animate-pulse' : ''}`} />{loading ? 'Đang đọc…' : data ? 'Đọc lại' : 'Đọc từ Pancake'}</Button>}>
      {error && <ErrorBox error={error} />}
      {data && !data.configured && <ErrorBox error="Web chưa có API key Pancake POS." />}
      {data && data.shops.length > 0 && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {data.shops.map((s) => (
            <div key={s.posId} className="rounded-xl border border-line p-3.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="truncate font-semibold">{posName(s.posId)}</div>
                <StatusChip tone={s.shopStatus === 200 ? 'green' : 'red'}>{s.shopStatus === 200 ? 'Đọc được' : `Lỗi ${s.shopStatus || 'mạng'}`}</StatusChip>
              </div>
              {s.error && <div className="mt-1 text-xs text-red-600">{s.error}</div>}
              {s.shopStatus === 200 && (
                <div className="mt-2 space-y-1.5 text-xs text-ink-2">
                  <div>Danh sách chính: {s.byDepartment === null ? 'Pancake không trả trường này' : s.byDepartment ? `theo bộ phận ${s.departments.join(', ') || '(trống)'}` : `theo nhân viên: ${s.assignedUsers.join(', ') || '(trống)'}`}</div>
                  {s.onlineOnly !== null && <div>Chỉ chia cho người đang online: {s.onlineOnly ? 'Bật' : 'Tắt'}</div>}
                  {s.breakTimeUsers.length > 0 && <div>Ngoài giờ làm việc: {s.breakTimeUsers.join(', ')}</div>}
                  <div className="font-medium text-ink">Phân công theo thẻ / nguồn: {s.rules.length} dòng</div>
                  {s.rules.map((r, i) => (
                    <div key={r.key || i} className="rounded-md bg-surface-3 px-2 py-1">
                      {RULE_TYPE[r.type] ?? r.type}{r.sources ? ` · ${r.sources} nguồn` : ''}: <span className="text-ink">{r.users.join(', ') || '(không có người)'}</span>{r.departments ? ` · ${r.departments} bộ phận` : ''}
                    </div>
                  ))}
                  <details className="text-ink-3">
                    <summary className="cursor-pointer">Trường Pancake trả về</summary>
                    <div className="mt-1 break-words">Cửa hàng: {s.assignKeys.join(', ') || '(không có trường phân công)'}</div>
                    <div className="break-words">Nhân viên (HTTP {s.usersStatus}): {s.userFields.join(', ')}</div>
                    {s.rules[0] && <div className="break-words">Một dòng phân công: {s.rules[0].extra.join(', ')}</div>}
                  </details>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </ChartCard>
  );
}
