// Linh vật MEGATECH trên trang đăng nhập (09/10/2026, anh Vũ: "thay con này bằng logo công ty cách điệu... như 1 con vật sống"):
// chính logo công ty (bò, lợn, gà, cây thông trên cánh đồng) nhưng từng con cử động. Bò thở, gật đầu, chớp mắt; gà mổ thóc;
// lợn ngoáy đuôi; cây đung đưa; ruộng có gợn sáng chạy qua như gió lướt trên đồng.
// Cùng cách dùng với husky cũ: gõ email thì cả ba con nhìn theo chữ, gõ mật khẩu thì nhắm mắt (gà rúc đầu, bò cúi đầu),
// bấm hiện mật khẩu thì bò hé một mắt, đăng nhập xong cả nhà vui (gà nhảy, lợn nảy, má hồng), sai thì cúi đầu lắc.
// Vẽ bằng SVG thuần; chuyển động là CSS (app/logo-intro.css, khối .mgm) theo data-mood.
import { EMBLEM_H, EMBLEM_W, LOGO } from './logo-megatech-hinh';
import type { HuskyMood } from './husky';

export type MascotMood = HuskyMood;

/** Màu logo: xanh lá nhạt bên trái → đậm bên phải (lấy mẫu từ logo gốc). */
export function LogoGradient({ id }: { id: string }) {
  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={EMBLEM_W} y2="0">
      <stop offset="0" stopColor="#93c24c" /><stop offset=".55" stopColor="#5f9642" /><stop offset="1" stopColor="#2e6a37" />
    </linearGradient>
  );
}

export function MegatechMascot({ mood, gaze }: { mood: MascotMood; gaze: { x: number; y: number } }) {
  const gx = Math.max(-1, Math.min(1, gaze.x)), gy = Math.max(-1, Math.min(1, gaze.y));
  const look = { transform: `translate(${(gx * 4.5).toFixed(2)}px, ${(gy * 3.5).toFixed(2)}px)` };
  const turn = (deg: number) => ({ '--turn': `${(gx * deg).toFixed(2)}deg` }) as React.CSSProperties;
  // Mắt: lòng trắng + con ngươi nhìn theo; nhắm thì thành vệt cong (CSS đổi theo tâm trạng).
  const eye = (cls: string, cx: number, cy: number, r: number, white = true) => (
    <g className={`mgm-eye ${cls}`} style={{ transformOrigin: `${cx}px ${cy}px` }}>
      <g className="mgm-open" style={{ transformOrigin: `${cx}px ${cy}px` }}>
        {white && <circle cx={cx} cy={cy} r={r} fill="#f4f9ef" />}
        <g className="mgm-look" style={look}>
          <circle cx={cx} cy={cy} r={r * (white ? 0.58 : 0.8)} fill="#10261a" />
          <circle cx={cx - r * 0.22} cy={cy - r * 0.26} r={r * 0.2} fill="#fff" />
        </g>
      </g>
      <path className="mgm-shut" d={`M${cx - r} ${cy}Q${cx} ${cy + r * 0.9} ${cx + r} ${cy}`} />
      <path className="mgm-joy" d={`M${cx - r} ${cy + r * 0.3}Q${cx} ${cy - r} ${cx + r} ${cy + r * 0.3}`} />
    </g>
  );
  return (
    <svg className="mgm" data-mood={mood} viewBox={`-20 -30 ${EMBLEM_W + 40} ${EMBLEM_H + 50}`} aria-hidden="true" focusable="false">
      <defs>
        <LogoGradient id="mgm-g" />
        <linearGradient id="mgm-wind" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#efffc4" stopOpacity="0" /><stop offset=".5" stopColor="#efffc4" stopOpacity=".42" /><stop offset="1" stopColor="#efffc4" stopOpacity="0" />
        </linearGradient>
        <clipPath id="mgm-field-clip"><path d={LOGO.field} /></clipPath>
      </defs>
      {/* Đồng ruộng + gió lướt. */}
      <path d={LOGO.field} fill="url(#mgm-g)" fillRule="evenodd" />
      <g clipPath="url(#mgm-field-clip)"><rect className="mgm-wind" x="-260" y="280" width="200" height="380" fill="url(#mgm-wind)" /></g>
      {/* Cây thông đung đưa quanh gốc. */}
      <path className="mgm-tree mgm-tree-1" d={LOGO.tree1} fill="url(#mgm-g)" style={{ transformOrigin: '568px 326px' }} />
      <path className="mgm-tree mgm-tree-2" d={LOGO.tree2} fill="url(#mgm-g)" style={{ transformOrigin: '617px 326px' }} />
      {/* Bò: thân thở, đầu gật / quay theo. */}
      <g className="mgm-cow">
        <path className="mgm-cow-body" d={LOGO.cowBody} fill="url(#mgm-g)" fillRule="evenodd" />
        <g className="mgm-cow-head" style={turn(5)}>
          <path d={LOGO.cowHead} fill="url(#mgm-g)" fillRule="evenodd" />
          {eye('mgm-eye-cow', 602, 92, 9)}
        </g>
      </g>
      {/* Lợn: phần trắng của logo; đuôi ngoáy, má hồng khi vui. */}
      <g className="mgm-pig">
        <path d={LOGO.pig} fill="#f4f9ef" fillRule="evenodd" stroke="#f4f9ef" strokeWidth="5" strokeLinejoin="round" />
        <path className="mgm-pig-tail" d={LOGO.pigTail} fill="#f4f9ef" style={{ transformOrigin: '152px 202px' }} />
        {eye('mgm-eye-pig', 474, 236, 6, false)}
        <ellipse className="mgm-blush" cx="470" cy="262" rx="12" ry="7" fill="#f6a5a0" />
      </g>
      {/* Gà: mổ thóc, quay đầu theo, rúc đầu khi nhắm. */}
      <g className="mgm-chick">
        <path d={LOGO.chickBody} fill="url(#mgm-g)" fillRule="evenodd" />
        <g className="mgm-chick-head" style={turn(7)}>
          <path d={LOGO.chickHead} fill="url(#mgm-g)" fillRule="evenodd" />
          {eye('mgm-eye-chick', 352, 222, 5.2)}
        </g>
      </g>
      {/* Lấp lánh khi vào được. */}
      <g className="mgm-spark">
        {[[120, 40], [330, 150], [560, 10], [640, 230]].map(([x, y], i) => (
          <path key={i} d={`M${x} ${y - 16}L${x + 4} ${y - 4}L${x + 16} ${y}L${x + 4} ${y + 4}L${x} ${y + 16}L${x - 4} ${y + 4}L${x - 16} ${y}L${x - 4} ${y - 4}Z`} style={{ animationDelay: `${i * 0.12}s` }} />
        ))}
      </g>
    </svg>
  );
}
