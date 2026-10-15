// Chọn con vật chờ tải (anh Vũ 11/10/2026: "kiểu random, mỗi lần mở 1 con"). Plan: web-tong/2026-10-11-con-vat-cho-tai/plan.md mục 4, 11.
// - Túi xáo: đủ 4 con mới lặp (anh bỏ linh vật logo 11/10), con đầu túi mới không trùng con vừa xem (A4). Túi để trong sessionStorage; trình duyệt chặn thì bốc thường.
// - Một lần vào trang (hoặc đổi kỳ) một con, mọi ô dùng chung; "Thử lại" và làm mới nền không bốc lại (A3).
// - "Luôn một con / Tắt" lưu localStorage từng máy, không ghi D1 (A5).

export const SCENES = ['ck', 'cw', 'eg', 'pg'] as const;
export type SceneId = (typeof SCENES)[number];
export type CritterSetting = 'random' | 'off' | SceneId;

export const SCENE_LABELS: Record<SceneId, string> = { ck: 'Gà mổ thóc', cw: 'Bò cày ruộng', eg: 'Trứng nở', pg: 'Lợn con nhảy' };

export const isScene = (v: unknown): v is SceneId => typeof v === 'string' && (SCENES as readonly string[]).includes(v);
export const isSetting = (v: unknown): v is CritterSetting => v === 'random' || v === 'off' || isScene(v);

export type Bag = { bag: SceneId[]; last: SceneId | null };

/** Bốc con tiếp theo. Hết túi thì xáo túi mới (Fisher–Yates); con đầu trùng con vừa xem thì đổi chỗ với một con khác. */
export function drawFromBag(state: Bag, rand: () => number = Math.random): { scene: SceneId; state: Bag } {
  let bag = state.bag.filter(isScene);
  if (!bag.length) {
    bag = [...SCENES];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    if (bag[0] === state.last) {
      const j = 1 + Math.floor(rand() * (bag.length - 1));
      [bag[0], bag[j]] = [bag[j], bag[0]];
    }
  }
  const [scene, ...rest] = bag;
  return { scene, state: { bag: rest, last: scene } };
}

const BAG_KEY = 'thp.critter.bag';
const SETTING_KEY = 'thp.critter';

function readBag(): Bag | null {
  try {
    const v = JSON.parse(window.sessionStorage.getItem(BAG_KEY) ?? 'null') as Partial<Bag> | null;
    return { bag: Array.isArray(v?.bag) ? v.bag.filter(isScene) : [], last: isScene(v?.last) ? v.last : null };
  } catch { return null; }
}
function writeBag(b: Bag) { try { window.sessionStorage.setItem(BAG_KEY, JSON.stringify(b)); } catch { /* bỏ qua */ } }

export function readSetting(): CritterSetting {
  try { const v = window.localStorage.getItem(SETTING_KEY); return isSetting(v) ? v : 'random'; } catch { return 'random'; }
}
const settingListeners = new Set<() => void>();
export function writeSetting(s: CritterSetting) {
  try { if (s === 'random') window.localStorage.removeItem(SETTING_KEY); else window.localStorage.setItem(SETTING_KEY, s); } catch { /* bỏ qua */ }
  current = null;
  for (const l of settingListeners) l();
}
export const subscribeSetting = (l: () => void) => { settingListeners.add(l); return () => { settingListeners.delete(l); }; };

// Lần tải hiện tại: trang đang mở (dashboard báo mỗi lần chuyển trang) + kỳ đang chọn.
let page = '';
let visit = 0;
let current: { key: string; scene: SceneId } | null = null;

// Trang xem thử (chỉ bản demo) ép một con để quay video; không lưu đâu cả.
let override: SceneId | null = null;
export function setCritterOverride(s: SceneId | null) { override = s; }

/** Dashboard gọi mỗi lần chuyển trang: quay lại trang cũ cũng là một lần mở mới. */
export function noteCritterPage(view: string) { if (view !== page) { page = view; visit++; } }

/** Con cho lần tải hiện tại (null = tắt). Cùng khoá (trang, lượt mở, kỳ) thì giữ con cũ. */
export function sceneFor(period: string): SceneId | null {
  if (override) return override;
  const s = readSetting();
  if (s === 'off') return null;
  if (s !== 'random') return s;
  const key = `${page}#${visit}|${period}`;
  if (current?.key === key) return current.scene;
  const stored = readBag();
  const { scene, state } = drawFromBag(stored ?? { bag: [], last: current?.scene ?? null });
  if (stored) writeBag(state);
  current = { key, scene };
  return scene;
}

/** Pha kết khi số về: con vật mới hiện chưa tới 150 ms (số về trong 300–450 ms) thì chỉ mờ nhanh (A1). */
export const exitPhase = (shownForMs: number): 'done' | 'quick' => shownForMs < 150 ? 'quick' : 'done';
/** Chờ 300 ms mới hiện; số về sớm hơn thì không hiện gì. */
export const SHOW_DELAY_MS = 300;
/** Mỗi trang tối đa 8 con chuyển động; điện thoại chỉ hàng đầu (2 ô) chạy, còn lại tư thế đứng yên. */
export const isStill = (index: number, phone: boolean) => index >= 8 || (phone && index >= 2);
/** Cỡ con vật (px) theo chỗ đặt. */
export const critterSize = (kind: 'kpi' | 'card', width: number) => kind === 'card' ? 96 : width < 200 ? 44 : 56;
