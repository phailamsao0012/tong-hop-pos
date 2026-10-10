import type { Metadata, Viewport } from 'next';
import './globals.css';

// Chữ: Be Vietnam Pro (thân, số) + Bricolage Grotesque (tiêu đề ≥ 20px), có subset tiếng Việt, display=swap.
// Tự lưu ở public/fonts (11/10/2026) thay Google Fonts: trình duyệt không còn gửi IP người dùng sang Google mỗi lần mở web (bớt nơi dữ liệu ra nước ngoài).
const FONTS_HREF = '/fonts/fonts.css';
// Đặt lớp .dark trước khi vẽ để không nháy sáng/tối: đọc thp_theme (light | dark | system) trong localStorage.
const THEME_SCRIPT = "(function(){try{var t=localStorage.getItem('thp_theme');var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();";

export const metadata: Metadata = {
  title: 'MEGATECH · Tổng hợp POS',
  description: 'Điều hành chốt nóng, doanh số và khách hàng của 6 POS.',
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg', apple: '/favicon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f0f4ee' },
    { media: '(prefers-color-scheme: dark)', color: '#101c16' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <link rel="preload" href="/fonts/be-vietnam-pro-400-vietnamese.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONTS_HREF} />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
