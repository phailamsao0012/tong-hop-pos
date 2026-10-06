// Chú husky canh cửa trên trang đăng nhập (06/10/2026, làm theo video anh Vũ gửi): mắt nhìn theo chữ đang gõ / con trỏ,
// gõ mật khẩu thì lấy hai chân che mắt, bấm hiện mật khẩu thì hạ chân xuống mũi để hé nhìn, đăng nhập xong thì nhắm mắt cười.
// Vẽ bằng SVG thuần; mọi chuyển động là CSS (globals.css, khối .husky) theo data-mood.
export type HuskyMood = 'idle' | 'watch' | 'cover' | 'peek' | 'happy' | 'sad';

export function Husky({ mood, gaze }: { mood: HuskyMood; gaze: { x: number; y: number } }) {
  const gx = Math.max(-1, Math.min(1, gaze.x)), gy = Math.max(-1, Math.min(1, gaze.y));
  const look = { transform: `translate(${(gx * 3.2).toFixed(2)}px, ${(gy * 2.6).toFixed(2)}px)` };
  const tilt = { transform: `rotate(${(gx * 3).toFixed(2)}deg)` };
  const paw = (side: 'l' | 'r') => (
    <g className={`husky-paw husky-paw-${side}`}>
      <circle r="19" fill="url(#hk-fur)" />
      <ellipse cx="0" cy="5" rx="8.2" ry="6.6" fill="#a3acbf" />
      <circle cx="-9.4" cy="-5.6" r="3.7" fill="#a3acbf" />
      <circle cx="0" cy="-9.6" r="3.7" fill="#a3acbf" />
      <circle cx="9.4" cy="-5.6" r="3.7" fill="#a3acbf" />
    </g>
  );
  const eye = (cx: number) => (
    <g>
      <circle cx={cx} cy="100" r="12.2" fill="#e6eefc" stroke="#1e2533" strokeWidth="2.4" />
      <g clipPath={`url(#hk-eye-${cx})`}>
        <g className="husky-look" style={look}>
          <circle cx={cx} cy="100" r="9.4" fill="url(#hk-iris)" />
          <circle cx={cx} cy="100" r="4.6" fill="#0b1324" />
          <circle cx={cx - 3.2} cy="96.8" r="2.6" fill="#fff" />
          <circle cx={cx + 3} cy="103" r="1.2" fill="#fff" opacity=".85" />
        </g>
      </g>
    </g>
  );
  return (
    <svg className="husky" data-mood={mood} viewBox="0 0 220 232" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="hk-fur" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5d6678" /><stop offset="1" stopColor="#2f3542" /></linearGradient>
        <radialGradient id="hk-face" cx=".5" cy=".42" r=".62"><stop offset=".6" stopColor="#f8fafc" /><stop offset="1" stopColor="#dfe5ee" /></radialGradient>
        <radialGradient id="hk-iris" cx=".42" cy=".38" r=".7"><stop offset="0" stopColor="#8fc2ff" /><stop offset=".55" stopColor="#3b82f6" /><stop offset="1" stopColor="#1d4ed8" /></radialGradient>
        <clipPath id="hk-head"><ellipse cx="110" cy="102" rx="80" ry="72" /></clipPath>
        <clipPath id="hk-eye-86"><circle cx="86" cy="100" r="11" /></clipPath>
        <clipPath id="hk-eye-134"><circle cx="134" cy="100" r="11" /></clipPath>
        <filter id="hk-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="9" floodColor="#020617" floodOpacity=".55" /></filter>
      </defs>
      <g filter="url(#hk-shadow)">
        {/* Thân sau đầu: lông xám, ngực trắng. */}
        <path d="M60 158 C55 204 72 230 110 230 C148 230 165 204 160 158 Z" fill="url(#hk-fur)" />
        <path d="M91 150 C88 192 97 224 110 226 C123 224 132 192 129 150 Z" fill="#f1f5f9" />
        <g className="husky-head" style={tilt}>
          {/* Tai. */}
          <path d="M44 70 L56 6 L100 42 Z" fill="url(#hk-fur)" stroke="#3a4150" strokeWidth="8" strokeLinejoin="round" />
          <path d="M176 70 L164 6 L120 42 Z" fill="url(#hk-fur)" stroke="#3a4150" strokeWidth="8" strokeLinejoin="round" />
          <path d="M58 54 L62 22 L84 42 Z" fill="#cdd3e1" stroke="#cdd3e1" strokeWidth="4" strokeLinejoin="round" />
          <path d="M162 54 L158 22 L136 42 Z" fill="#cdd3e1" stroke="#cdd3e1" strokeWidth="4" strokeLinejoin="round" />
          {/* Đầu: mặt trắng, chỏm lông xám có mũi nhọn giữa trán. */}
          <ellipse cx="110" cy="102" rx="80" ry="72" fill="url(#hk-face)" />
          <path clipPath="url(#hk-head)" fill="url(#hk-fur)"
            d="M20 112 C30 100 44 84 62 80 C72 78 80 80 88 82 C96 72 104 60 110 50 C116 60 124 72 132 82 C140 80 148 78 158 80 C176 84 190 100 200 112 L200 0 L20 0 Z" />
          <ellipse cx="80" cy="73" rx="5.5" ry="3.4" fill="#e2e8f0" opacity=".9" />
          <ellipse cx="140" cy="73" rx="5.5" ry="3.4" fill="#e2e8f0" opacity=".9" />
          {/* Mắt (mở) và mắt nhắm khi vui. */}
          <g className="husky-eyes">{eye(86)}{eye(134)}</g>
          <g className="husky-closed" fill="none" stroke="#1e2533" strokeWidth="3" strokeLinecap="round">
            <path d="M75 100 Q86 106 97 100" /><path d="M123 100 Q134 106 145 100" />
            <path d="M75 100 l-3 -3 M97 100 l3 -3 M123 100 l-3 -3 M145 100 l3 -3" strokeWidth="1.8" />
          </g>
          <ellipse cx="64" cy="124" rx="13" ry="8" fill="#f7a98f" opacity=".75" />
          <ellipse cx="156" cy="124" rx="13" ry="8" fill="#f7a98f" opacity=".75" />
          {/* Mũi, miệng, đốm râu. */}
          <path d="M99 114 Q110 108 121 114 Q122 122 110 128 Q98 122 99 114 Z" fill="#0f172a" />
          <ellipse cx="106" cy="114.5" rx="3.6" ry="1.6" fill="#fff" opacity=".45" />
          <path className="husky-tongue" d="M104 134 Q110 149 116 134 Z" fill="#f472b6" />
          <g className="husky-smile" fill="none" stroke="#1e2533" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M110 128 L110 133" /><path d="M97 132 Q103.5 140 110 133 Q116.5 140 123 132" />
          </g>
          <path className="husky-frown" d="M99 139 Q110 130 121 139" fill="none" stroke="#1e2533" strokeWidth="2.4" strokeLinecap="round" />
          <g fill="#9aa4b6"><circle cx="93" cy="127" r="1.3" /><circle cx="90" cy="132" r="1.3" /><circle cx="127" cy="127" r="1.3" /><circle cx="130" cy="132" r="1.3" /></g>
        </g>
        {paw('l')}{paw('r')}
      </g>
    </svg>
  );
}
