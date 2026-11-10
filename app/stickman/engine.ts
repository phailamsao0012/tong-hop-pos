// Người que chờ tải (anh Vũ 21/10/2026: "người que đi tinh nghịch, ngó ngó, mở cửa, ném đá… tương tác với số liệu", "khoảng 100 hành động,
// animation mượt"). Bộ khung có khớp gối, khuỷu tay; mỗi khung hình tính lại vị trí khớp và tự đặt chân (hoặc phần thấp nhất) chạm đất,
// nên ngồi, nằm, trồng cây chuối đều đứng đúng mặt đất mà không phải chỉnh tay. Chỉ đổi thuộc tính SVG của một <path>, không đụng bố cục trang.
export type Pose = {
  /** Thân nghiêng về phía trước (độ). */ lean: number; /** Đầu nghiêng. */ head: number;
  /** Tay A/B: vai (0 buông, 90 giơ ngang trước, 180 giơ thẳng lên), khuỷu (gập lên phía trước). */ sA: number; eA: number; sB: number; eB: number;
  /** Chân A/B: hông (0 thẳng, dương đá ra trước), gối (dương gập ra sau). */ hA: number; kA: number; hB: number; kB: number;
  /** Xoay cả người (lộn nhào). */ rot: number; /** Bẹp/giãn khi tiếp đất (1 = thường). */ sq: number; /** Bay khỏi mặt đất (px). */ air: number;
  /** Mắt: 0 mở, 1 nhắm, 2 tròn xoe. */ eye: number;
  /** 0: điểm thấp nhất chạm đất; 1: mông (hông) chạm đất, để ngồi bệt hoặc ngồi mép ô thả chân. */ seat: number;
};
export const STAND: Pose = { lean: 0, head: 0, sA: 8, eA: 10, sB: -8, eB: 10, hA: 3, kA: 2, hB: -3, kB: 2, rot: 0, sq: 1, air: 0, eye: 0, seat: 0 };
const KEYS = Object.keys(STAND) as (keyof Pose)[];
export const P = (p: Partial<Pose>): Pose => ({ ...STAND, ...p });

/** Dáng hay dùng. */
export const POSES = {
  stand: STAND,
  crouch: P({ lean: 25, hA: 55, kA: 95, hB: 50, kB: 90, sA: 30, eA: 40, sB: 20, eB: 40 }),
  /** Ngồi bệt, gối co. */ sit: P({ lean: -6, hA: 128, kA: 128, hB: 118, kB: 122, sA: 40, eA: 50, sB: 30, eB: 50, seat: 1 }),
  /** Ngồi bệt duỗi chân. */ sitLegs: P({ lean: -14, hA: 88, kA: 4, hB: 84, kB: 2, sA: -35, eA: 5, sB: -40, eB: 5, seat: 1 }),
  /** Ngồi mép (chân thả xuống dưới mặt đất). */ perch: P({ lean: -4, hA: 88, kA: 88, hB: 80, kB: 80, sA: 20, eA: 30, sB: 10, eB: 30, seat: 1 }),
  lotus: P({ lean: 0, hA: 100, kA: 165, hB: 95, kB: 165, sA: 35, eA: 60, sB: 30, eB: 60, eye: 1, seat: 1 }),
  /** Nằm ngửa, tay gối đầu. */ lie: P({ lean: -90, head: -10, hA: 90, kA: 0, hB: 92, kB: 0, sA: 168, eA: 40, sB: 175, eB: 30, eye: 1 }),
  /** Nằm sấp. */ lieFront: P({ lean: 90, head: -30, hA: -90, kA: 0, hB: -88, kB: 10, sA: 180, eA: 0, sB: 175, eB: 0 }),
  armsUp: P({ sA: 165, eA: 0, sB: 160, eB: 0 }),
  cheer: P({ sA: 150, eA: -20, sB: 155, eB: -20, hA: 20, kA: 30, hB: -15, kB: 20 }),
  handsHips: P({ sA: 35, eA: 120, sB: 30, eB: 120, hA: 8, hB: -8 }),
  armsCross: P({ sA: 50, eA: 130, sB: 45, eB: 135 }),
  bow: P({ lean: 60, head: 10, sA: 10, eA: 5, sB: 5, eB: 5 }),
  tuck: P({ lean: 40, hA: 100, kA: 140, hB: 95, kB: 140, sA: 70, eA: 90, sB: 60, eB: 90 }),
  handstand: P({ rot: 180, lean: 0, sA: 175, eA: 0, sB: 170, eB: 0, hA: 10, kA: 0, hB: -10, kB: 0 }),
  /** Chống đẩy: thân và chân một đường thẳng, tay thẳng xuống đất. */ plank: P({ lean: 74, head: -20, hA: -74, kA: 0, hB: -72, kB: 0, sA: 74, eA: 0, sB: 76, eB: 0 }),
  plankDown: P({ lean: 84, head: -20, hA: -84, kA: 0, hB: -82, kB: 0, sA: 40, eA: 50, sB: 42, eB: 50 }),
  /** Quỳ bò (tay và gối chạm đất). */ crawl: P({ lean: 78, head: -30, hA: 0, kA: 92, hB: 6, kB: 96, sA: 78, eA: 0, sB: 80, eB: 0 }),
  /** Quỳ một gối. */ kneel: P({ lean: 10, hA: 85, kA: 85, hB: -10, kB: 95, sA: 40, eA: 50, sB: 30, eB: 40 }),
  lunge: P({ lean: 5, hA: 55, kA: 60, hB: -35, kB: 30, sA: 90, eA: 0, sB: -60, eB: 0 }),
  kick: P({ lean: -15, hA: 100, kA: 0, hB: -5, kB: 5, sA: -40, eA: 20, sB: 60, eB: 40 }),
  punch: P({ lean: 10, sA: 90, eA: 0, sB: 40, eB: 120, hA: 25, kA: 20, hB: -20, kB: 10 }),
  flamingo: P({ hA: 0, kA: 0, hB: 30, kB: 120, sA: 90, eA: 0, sB: 95, eB: 0 }),
  think: P({ sA: 20, eA: 150, sB: 30, eB: 120, head: 12 }),
  /** Tay che mày nhìn xa. */ look: P({ lean: 8, head: -8, sA: 130, eA: 115, sB: -5, eB: 10 }),
  shrug: P({ sA: 40, eA: 100, sB: 40, eB: 100, head: 8 }),
  /** Hai tay đưa lên mặt (che mắt, ống nhòm, máy ảnh). */ face: P({ sA: 60, eA: 125, sB: 50, eB: 135, head: 4 }),
  /** Tay A lên tai (gọi điện). */ ear: P({ sA: 30, eA: 155, head: 10 }),
} satisfies Record<string, Pose>;

export const ease = {
  linear: (k: number) => k,
  inOut: (k: number) => k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2,
  out: (k: number) => 1 - (1 - k) ** 3,
  in: (k: number) => k * k * k,
  back: (k: number) => 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2,
};
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const mix = (a: Pose, b: Partial<Pose>, k: number): Pose => { const o = { ...a }; for (const key of KEYS) { const v = b[key]; if (v !== undefined) o[key] = lerp(a[key], v, k); } return o; };

const T = 15, NECK = 4, HEAD = 5, UP = 8, FORE = 8, THIGH = 9, SHIN = 9;
type Pt = { x: number; y: number };
/** Vị trí các khớp khi người đứng tại (x, mặt đất gy), quay mặt dir. */
export function joints(p: Pose, x: number, gy: number, dir: 1 | -1) {
  const v = (deg: number, len: number): Pt => { const r = deg * Math.PI / 180; return { x: Math.sin(r) * len * dir, y: Math.cos(r) * len }; };
  const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
  const H = { x: 0, y: 0 };
  const up = 180 - p.lean;
  const N = add(H, v(up, T)), S = add(H, v(up, T - 2)), C = add(N, v(up - p.head, NECK));
  const torsoDown = -p.lean;
  const eA = add(S, v(torsoDown + p.sA, UP)), wA = add(eA, v(torsoDown + p.sA + p.eA, FORE));
  const eB = add(S, v(torsoDown + p.sB, UP)), wB = add(eB, v(torsoDown + p.sB + p.eB, FORE));
  const kA = add(H, v(p.hA, THIGH)), fA = add(kA, v(p.hA - p.kA, SHIN));
  const kB = add(H, v(p.hB, THIGH)), fB = add(kB, v(p.hB - p.kB, SHIN));
  const pts = { H, N, S, C, eA, wA, eB, wB, kA, fA, kB, fB };
  // Xoay cả người quanh giữa thân.
  if (p.rot) {
    const r = p.rot * Math.PI / 180 * dir, cx = (H.x + N.x) / 2, cy = (H.y + N.y) / 2, cos = Math.cos(r), sin = Math.sin(r);
    for (const k of Object.keys(pts) as (keyof typeof pts)[]) { const q = pts[k]; const dx = q.x - cx, dy = q.y - cy; pts[k] = { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }; }
  }
  // Điểm thấp nhất chạm đất (đầu tính thêm bán kính).
  const lowest = Math.max(pts.fA.y, pts.fB.y, pts.wA.y, pts.wB.y, pts.kA.y, pts.kB.y, pts.C.y + HEAD, pts.N.y);
  const low = p.seat ? lerp(lowest, pts.H.y + 1.5, p.seat) : lowest;
  const oy = gy - low - p.air;
  const out = {} as Record<keyof typeof pts, Pt>;
  for (const k of Object.keys(pts) as (keyof typeof pts)[]) {
    const q = pts[k];
    const y = q.y + oy, yy = gy - (gy - y) * p.sq;
    out[k] = { x: x + q.x / Math.sqrt(p.sq), y: yy };
  }
  return out;
}
export type Joints = ReturnType<typeof joints>;

/** Vẽ một khung hình vào <path> thân và <circle> đầu. */
export function paint(j: Joints, p: Pose, dir: 1 | -1, body: SVGPathElement, head: SVGCircleElement, eye: SVGPathElement) {
  const f = (q: Pt) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`;
  body.setAttribute('d', `M${f(j.N)}L${f(j.H)}M${f(j.S)}L${f(j.eA)}L${f(j.wA)}M${f(j.S)}L${f(j.eB)}L${f(j.wB)}M${f(j.H)}L${f(j.kA)}L${f(j.fA)}M${f(j.H)}L${f(j.kB)}L${f(j.fB)}`);
  head.setAttribute('cx', j.C.x.toFixed(1)); head.setAttribute('cy', j.C.y.toFixed(1));
  // Mắt nhìn theo hướng mặt (lệch theo trục đầu).
  const ax = j.C.x - j.N.x, ay = j.C.y - j.N.y, len = Math.hypot(ax, ay) || 1, nx = -ay / len * dir, ny = ax / len * dir;
  const ex = j.C.x + nx * 2.2 + ax / len * 0.6, ey = j.C.y + ny * 2.2 + ay / len * 0.6;
  eye.setAttribute('d', p.eye > 0.5 && p.eye < 1.5 ? `M${(ex - 1.2).toFixed(1)},${ey.toFixed(1)}h2.4` : `M${ex.toFixed(1)},${ey.toFixed(1)}m-${p.eye >= 1.5 ? 1.4 : 0.9},0a${p.eye >= 1.5 ? 1.4 : 0.9},${p.eye >= 1.5 ? 1.4 : 0.9} 0 1 0 0.01,0`);
}
