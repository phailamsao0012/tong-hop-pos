import type { Metadata, Viewport } from 'next';
import './globals.css';

// Chữ: Be Vietnam Pro (thân, số) + Bricolage Grotesque (tiêu đề ≥ 20px) từ Google Fonts, có subset tiếng Việt, display=swap.
const FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=Bricolage+Grotesque:opsz,wght@12..96,500..800&display=swap';
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONTS_HREF} />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
