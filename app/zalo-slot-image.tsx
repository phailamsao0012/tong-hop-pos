// Ảnh gộp các team gửi sếp ở ca 12h / 17h / 22h (anh Vũ 03/11/2026: "đã là báo cáo phải có ảnh"). Cùng kiểu với ảnh 8h
// (app/zalo-morning-image.tsx). Vẽ bằng next/og (satori): mọi khối nhiều con phải display:flex.
import { millions } from '@/lib/kpi/kpi-pace';
import type { BossSlotReport } from '@/lib/zalo/slot-report';

const C = {
  ink: '#14231c',
  muted: '#5f6f67',
  line: '#e3ebe6',
  soft: '#f3f8f5',
  green: '#17684b',
  warn: '#b45309',
  warnSoft: '#fdf1e2',
};
export const SLOT_IMAGE_WIDTH = 720;
const dm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
export const bossSlotImageHeight = (r: BossSlotReport) =>
  200 + Math.max(1, r.teams.length) * 58;

function Frame({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: '#fff',
        color: C.ink,
        fontFamily: 'Be Vietnam Pro',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: C.green,
          padding: '24px 32px 22px',
        }}
      >
        <div style={{ fontSize: 30, fontWeight: 700, color: '#fff' }}>
          {title.slice(0, 44)}
        </div>
        <div style={{ fontSize: 20, color: '#d6efe3', marginTop: 6 }}>
          {sub}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '22px 32px 20px',
          flex: 1,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function BossSlotImage({ r }: { r: BossSlotReport }) {
  const max = Math.max(1, ...r.teams.map((t) => t.total));
  return (
    <Frame
      title="Doanh số các team"
      sub={`Báo cáo ${Number(r.hour.slice(0, 2))}h${r.hour.length > 2 ? r.hour.slice(3, 5) : ''} · ${r.slot} · ${dm(r.day)}`}
    >
      <div
        style={{
          display: 'flex',
          fontSize: 16,
          color: C.muted,
          marginBottom: 6,
        }}
      >
        Thanh: doanh số khung · số bên phải: khung / luỹ kế hôm nay
      </div>
      {r.teams.map((t) => (
        <div
          key={t.team}
          style={{
            display: 'flex',
            alignItems: 'center',
            height: 58,
            borderBottom: `1px solid ${C.line}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              width: 210,
              fontSize: 19,
              fontWeight: 600,
            }}
          >
            {t.team.slice(0, 22)}
          </div>
          <div
            style={{
              display: 'flex',
              flex: 1,
              height: 22,
              position: 'relative',
            }}
          >
            <div
              style={{
                display: 'flex',
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                borderRadius: 6,
                background: C.soft,
              }}
            />
            <div
              style={{
                display: 'flex',
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                borderRadius: 6,
                background: C.green,
                width: `${Math.max(2, (t.total / max) * 100)}%`,
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              width: 170,
              justifyContent: 'flex-end',
              fontSize: 19,
            }}
          >
            <b>{millions(t.total)}</b>
            {r.hideCumulative ? null : (
              <span
                style={{ color: C.muted, marginLeft: 6 }}
              >{`/ ${millions(t.cumulative)}`}</span>
            )}
          </div>
        </div>
      ))}
    </Frame>
  );
}
