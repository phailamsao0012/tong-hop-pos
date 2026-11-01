 'use client';
import { useState } from 'react';
import { useApi } from './use-api';
import type { DevicePair } from '@/lib/auth/device-pair';
export function DevicePairPanel() {
  const { data, reload, error } = useApi<{ now: number; pairs: Omit<DevicePair, 'tokenHash' | 'created'>[] }>('/api/ai/pair');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function change(id: string, action: 'approve' | 'revoke') {
    setBusy(true);
    try {
      const response = await fetch('/api/ai/pair', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }) });
      setMessage(response.ok ? 'Đã cập nhật máy.' : 'Không cập nhật được; yêu cầu có thể đã hết hạn.');
      reload();
    } catch { setMessage('Chưa kết nối được, thử lại.'); } finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-line bg-white p-4 space-y-3">
    <h2 className="font-semibold">Máy phân tích</h2>
    <p className="text-sm">Đối chiếu mã trên PC trước khi duyệt. Thu hồi sẽ vô hiệu hóa khóa của máy.</p>
    {(message || error) && <output>{message || 'Chưa tải được danh sách máy.'}</output>}
    {data?.pairs.map((p) => <div key={p.id} className="flex flex-wrap gap-3 items-center">
      <span>Máy {p.device} · mã {p.code} · {p.status === 'approved' ? 'Đã duyệt' : p.status === 'revoked' ? 'Đã thu hồi' : p.expires <= (data?.now ?? 0) ? 'Hết hạn' : 'Xin kết nối'}</span>
      {p.status === 'pending' && p.expires > (data?.now ?? 0) && <button disabled={busy} onClick={() => change(p.id, 'approve')}>Duyệt</button>}
      {p.status !== 'revoked' && <button disabled={busy} onClick={() => change(p.id, 'revoke')}>Thu hồi</button>}
    </div>)}
  </section>;
}
