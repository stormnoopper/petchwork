import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Thai } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

const plexThai = IBM_Plex_Sans_Thai({
  variable: '--font-sans',
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: { default: 'BoengNa เบิ่งนา — ประเมินน้ำ ข้าว และดินเค็ม', template: '%s · BoengNa' },
  description:
    'แตะ 4 มุมแปลงนาบนแผนที่ รู้ล่วงหน้าว่านาของคุณจะได้น้ำ ได้ข้าว ปล่อยก๊าซ และเค็มแค่ไหน ฟรี ไม่ต้องสมัคร',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#1f7a45',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" className={plexThai.variable}>
      <body className="min-h-dvh antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
