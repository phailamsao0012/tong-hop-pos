// Ảnh báo cáo 8h gửi leader qua Zalo (mẫu anh Vũ chốt 02/11/2026). Vẽ bằng next/og (satori): mọi khối nhiều con phải display:flex.
// Nội dung giống morningSvg trong lib/zalo/morning-report.ts; số và chữ lấy từ cùng một MorningReport.
import { millions } from '@/lib/kpi/kpi-pace';
import {
  morningDeltaLabel,
  type MorningReport,
} from '@/lib/zalo/morning-report';
import type { ReportSection } from '@/lib/zalo/report-schedule';

const C = {
  ink: '#14231c',
  muted: '#5f6f67',
  line: '#e3ebe6',
  soft: '#f3f8f5',
  green: '#17684b',
  up: '#17804f',
  down: '#c2410c',
  warn: '#b45309',
  dash: '#9aaaa2',
};
const tone = (v: number | null) =>
  v === null || Math.round(v) === 0 ? C.muted : v > 0 ? C.up : C.down;
export const MORNING_IMAGE_WIDTH = 720;
/** Chiều cao ảnh; mục bị bỏ ở Cài đặt báo cáo (r.hidden) thì trừ phần của mục đó (không bỏ mục nào = đúng như trước). */
export const morningImageHeight = (r: MorningReport) => {
  const hide = (s: ReportSection) => !!r.hidden?.includes(s);
  return 720 + Math.max(1, r.best.length) * 36 + (r.kpi ? 0 : -64)
    - (hide('tiles') ? 104 : 0) - (hide('kpi') ? (r.kpi ? 100 : 40) : 0)
    - (hide('best') ? Math.max(1, r.best.length) * 36 : 0) - (hide('coach') ? 36 : 0) - (hide('tasks') ? 36 : 0);
};

function Spark({ r }: { r: MorningReport }) {
  const w = 300,
    h = 120,
    max = Math.max(1, ...r.week.map((d) => d.net), ...r.weekBefore);
  const pts = (vals: number[]) =>
    vals
      .map(
        (v, i) =>
          `${((i * w) / 6).toFixed(1)},${(6 + h - (v / max) * h).toFixed(1)}`,
      )
      .join(' ');
  const lx = w,
    ly = 6 + h - (r.week[6].net / max) * h;
  return (
    <svg width={w + 8} height={h + 12} viewBox={`-4 0 ${w + 8} ${h + 12}`}>
      <line
        x1="0"
        y1={h + 6}
        x2={w}
        y2={h + 6}
        stroke={C.line}
        strokeWidth="2"
      />
      <polyline
        points={pts(r.weekBefore)}
        fill="none"
        stroke={C.dash}
        strokeWidth="2"
        strokeDasharray="6 6"
      />
      <polyline
        points={pts(r.week.map((d) => d.net))}
        fill="none"
        stroke={C.green}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle
        cx={lx}
        cy={ly}
        r="6"
        fill={C.green}
        stroke="#fff"
        strokeWidth="2"
      />
    </svg>
  );
}

// Phông không có ký tự ▲▼ nên vẽ tam giác bằng SVG.
function Delta({
  label,
  v,
  size,
}: {
  label: string;
  v: number | null;
  size: number;
}) {
  const up = label.startsWith('▲'),
    down = label.startsWith('▼');
  const color = tone(v),
    t = Math.round(size * 0.6);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        fontSize: size,
        fontWeight: 600,
        color,
      }}
    >
      {up || down ? (
        <svg
          width={t}
          height={t}
          viewBox="0 0 10 10"
          style={{ marginRight: 6 }}
        >
          <polygon
            points={up ? '5,1 9.5,9 0.5,9' : '0.5,1 9.5,1 5,9'}
            fill={color}
          />
        </svg>
      ) : null}
      <span>{up || down ? label.slice(2) : label}</span>
    </div>
  );
}

const Row = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', minHeight: 36 }}>
    <div
      style={{
        display: 'flex',
        width: 140,
        fontSize: 18,
        color: C.muted,
        paddingTop: 2,
      }}
    >
      {label}
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      {children}
    </div>
  </div>
);

export function MorningImage({ r }: { r: MorningReport }) {
  const hide = (s: ReportSection) => !!r.hidden?.includes(s);
  const dm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
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
          {r.team.slice(0, 44)}
        </div>
        <div style={{ fontSize: 20, color: '#d6efe3', marginTop: 6 }}>
          {r.title}
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
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 20, color: C.muted }}>{r.headline}</div>
            <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.15 }}>
              {millions(r.yesterday)}
            </div>
            <div style={{ display: 'flex', marginTop: 6 }}>
              <Delta
                size={20}
                v={r.vsPrev}
                label={`${morningDeltaLabel(r.vsPrev)} so ${r.prevLabel}`}
              />
            </div>
            <div style={{ display: 'flex', marginTop: 4 }}>
              <Delta
                size={20}
                v={r.vsLastWeek}
                label={`${morningDeltaLabel(r.vsLastWeek)} so ${r.lastWeekLabel}`}
              />
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
            }}
          >
            {hide('chart') ? null : r.chart ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                }}
              >
                <div style={{ fontSize: 15, color: C.muted, marginBottom: 4 }}>
                  {r.chartLabel}
                </div>
                <Spark r={r} />
                <div
                  style={{
                    display: 'flex',
                    width: 300,
                    justifyContent: 'space-between',
                    fontSize: 16,
                    color: C.muted,
                  }}
                >
                  <span>{dm(r.week[0].day)}</span>
                  <span>{dm(r.week[6].day)}</span>
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  width: 300,
                  height: 150,
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  fontSize: 16,
                  color: C.muted,
                  background: C.soft,
                  borderRadius: 14,
                  padding: 16,
                }}
              >
                Biểu đồ cùng giờ các ngày sẽ hiện sau vài ngày có số.
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 22 }}>
          {(hide('tiles') ? [] : r.tiles).map((t) => (
            <div
              key={t.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                background: C.soft,
                borderRadius: 14,
                padding: '14px 18px',
                height: 104,
              }}
            >
              <div style={{ fontSize: 18, color: C.muted }}>{t.label}</div>
              <div style={{ fontSize: 30, fontWeight: 700 }}>{t.value}</div>
              <Delta size={16} v={t.delta} label={t.deltaLabel} />
            </div>
          ))}
        </div>
        {hide('kpi') ? null : r.kpi ? (
          <div
            style={{ display: 'flex', flexDirection: 'column', marginTop: 24 }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 20,
                fontWeight: 600,
              }}
            >
              <span>{`KPI tháng ${r.kpi.month}`}</span>
              <span>{`${millions(r.kpi.done)} / ${millions(r.kpi.goal)} · ${Math.round(r.kpi.percent)}%`}</span>
            </div>
            <div
              style={{
                display: 'flex',
                position: 'relative',
                height: 34,
                marginTop: 4,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 8,
                  height: 18,
                  borderRadius: 9,
                  background: C.line,
                }}
              />
              <div
                style={{
                  display: 'flex',
                  position: 'absolute',
                  left: 0,
                  top: 8,
                  height: 18,
                  borderRadius: 9,
                  background: C.green,
                  width: `${Math.max(2, Math.min(100, r.kpi.percent))}%`,
                }}
              />
              <div
                style={{
                  display: 'flex',
                  position: 'absolute',
                  top: 0,
                  width: 4,
                  height: 34,
                  borderRadius: 2,
                  background: C.ink,
                  left: `${(r.kpi.paceMark * 100).toFixed(1)}%`,
                }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 18,
                marginTop: 10,
              }}
            >
              <span
                style={{ color: r.kpi.paceDiff >= 0 ? C.up : C.down }}
              >{`${r.kpi.paceDiff >= 0 ? 'Vượt' : 'Chậm'} ${millions(Math.abs(r.kpi.paceDiff))} so tiến độ tới hôm qua (vạch đen)`}</span>
              <span style={{ fontWeight: 600 }}>
                {r.kpi.needPerDay === null
                  ? ''
                  : `Cần ${millions(r.kpi.needPerDay)}/ngày`}
              </span>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              fontSize: 20,
              color: C.muted,
              marginTop: 24,
            }}
          >
            KPI tháng: chưa đặt cho team
          </div>
        )}
        <div
          style={{
            display: 'flex',
            height: 2,
            background: C.line,
            marginTop: 22,
            marginBottom: 18,
          }}
        />
        {!hide('best') && (
        <Row label="Tốt nhất">
          {r.best.length ? (
            r.best.map((p, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 20,
                  fontWeight: 600,
                  height: 36,
                }}
              >
                <span>{`${i + 1}. ${p.name.slice(0, 28)}`}</span>
                <span
                  style={{ color: C.green }}
                >{`${millions(p.net)} · ${p.orders} đơn`}</span>
              </div>
            ))
          ) : (
            <div
              style={{
                display: 'flex',
                fontSize: 20,
                fontWeight: 600,
                height: 36,
              }}
            >
              Chưa ai có đơn
            </div>
          )}
        </Row>
        )}
        {!hide('coach') && (
        <Row label="Cần kèm">
          <div
            style={{
              display: 'flex',
              fontSize: 20,
              fontWeight: 600,
              color: r.coach.length ? C.down : C.up,
            }}
          >
            {r.coach.length
              ? `${r.coach.length} người 0 đơn: ${r.coach.join(', ')}`.slice(
                  0,
                  52,
                )
              : 'Ai cũng có đơn'}
          </div>
        </Row>
        )}
        {!hide('tasks') && (
        <Row label="Việc">
          <div
            style={{
              display: 'flex',
              fontSize: 20,
              fontWeight: 600,
              color: r.overdue.length ? C.warn : C.ink,
            }}
          >
            {r.overdue.length || r.dueToday.length
              ? `${r.overdue.length} quá hạn · ${r.dueToday.length} tới hạn hôm nay`
              : 'Không có việc quá hạn'}
          </div>
        </Row>
        )}
        <div
          style={{
            display: 'flex',
            fontSize: 15,
            color: C.muted,
            marginTop: 'auto',
          }}
        >
          {r.footer}
        </div>
      </div>
    </div>
  );
}
