// Ảnh báo cáo theo ca 12h / 17h / 22h (anh Vũ 03/11/2026: "đã là báo cáo phải có ảnh"). Cùng kiểu với ảnh 8h
// (app/zalo-morning-image.tsx). Vẽ bằng next/og (satori): mọi khối nhiều con phải display:flex.
import { millions } from '@/lib/kpi/kpi-pace';
import type { BossSlotReport, SlotReport } from '@/lib/zalo/slot-report';

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
const NO_ORDER_SHOWN = 12;
export const slotImageHeight = (r: SlotReport) =>
  350 + Math.max(1, r.people.length) * 44 + (r.noOrders.length ? 110 : 0);
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

function Bar({
  name,
  value,
  max,
  label,
}: {
  name: string;
  value: number;
  max: number;
  label: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: 44 }}>
      <div
        style={{
          display: 'flex',
          width: 200,
          fontSize: 19,
          overflow: 'hidden',
        }}
      >
        {name.slice(0, 22)}
      </div>
      <div
        style={{ display: 'flex', flex: 1, height: 22, position: 'relative' }}
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
            width: `${Math.max(2, (value / Math.max(1, max)) * 100)}%`,
          }}
        />
      </div>
      <div
        style={{
          display: 'flex',
          width: 150,
          justifyContent: 'flex-end',
          fontSize: 19,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
    </div>
  );
}

export function SlotImage({ r }: { r: SlotReport }) {
  const max = Math.max(1, ...r.people.map((p) => p.total));
  const shown = r.noOrders.slice(0, NO_ORDER_SHOWN),
    more = r.noOrders.length - shown.length;
  return (
    <Frame
      title={r.team}
      sub={`Báo cáo ${Number(r.hour)}h · ${r.slot} · ${dm(r.day)}`}
    >
      <div style={{ display: 'flex', gap: 16 }}>
        {(
          [
            ['Doanh số khung', millions(r.total)],
            ['Luỹ kế hôm nay', millions(r.cumulative)],
            ['Đơn chốt', String(r.orders)],
          ] as const
        ).map(([label, value], i) => (
          <div
            key={label}
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              background: i === 0 ? C.green : C.soft,
              borderRadius: 14,
              padding: '14px 18px',
              height: 110,
            }}
          >
            <div style={{ fontSize: 17, color: i === 0 ? '#d6efe3' : C.muted }}>
              {label}
            </div>
            <div
              style={{
                fontSize: i === 0 ? 38 : 32,
                fontWeight: 700,
                color: i === 0 ? '#fff' : C.ink,
                marginTop: 6,
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: 20,
          fontWeight: 600,
          marginTop: 24,
          marginBottom: 6,
        }}
      >
        Doanh số từng người trong khung
      </div>
      {r.people.length ? (
        r.people.map((p) => (
          <Bar
            key={p.name}
            name={p.name}
            value={p.total}
            max={max}
            label={`${millions(p.total)} · ${p.orders} đơn`}
          />
        ))
      ) : (
        <div
          style={{
            display: 'flex',
            height: 44,
            alignItems: 'center',
            fontSize: 19,
            color: C.muted,
          }}
        >
          Chưa ai có đơn trong khung này.
        </div>
      )}
      {r.noOrders.length ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: 18,
            background: C.warnSoft,
            borderRadius: 14,
            padding: '12px 18px',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 18,
              fontWeight: 600,
              color: C.warn,
            }}
          >{`Chưa có đơn trong khung: ${r.noOrders.length} người`}</div>
          <div
            style={{
              display: 'flex',
              fontSize: 17,
              color: C.ink,
              marginTop: 4,
            }}
          >
            {shown.join(', ') + (more > 0 ? ` và ${more} người khác` : '')}
          </div>
        </div>
      ) : null}
    </Frame>
  );
}

export function BossSlotImage({ r }: { r: BossSlotReport }) {
  const max = Math.max(1, ...r.teams.map((t) => t.total));
  return (
    <Frame
      title="Doanh số các team"
      sub={`Báo cáo ${Number(r.hour)}h · ${r.slot} · ${dm(r.day)}`}
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
            <span
              style={{ color: C.muted, marginLeft: 6 }}
            >{`/ ${millions(t.cumulative)}`}</span>
          </div>
        </div>
      ))}
    </Frame>
  );
}
