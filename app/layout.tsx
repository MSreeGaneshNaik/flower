import type { Metadata, Viewport } from 'next';
import '@fontsource/archivo/400.css';
import '@fontsource/archivo/500.css';
import '@fontsource/archivo/600.css';
import '@fontsource/courier-prime/400.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Flower',
  description: 'A 3D flower made of text. Pick one, write a name across its petals, send it or record it.',
  openGraph: { title: 'Flower', description: 'A flower made of text, blooming for you.' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#000000' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
