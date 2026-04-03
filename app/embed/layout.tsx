import type { Metadata } from 'next';
import '../globals.css';

export const metadata: Metadata = {
  title: 'OT Delivery Tracker',
  robots: 'noindex',
};

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossOrigin="" />
      </head>
      <body style={{ margin: 0, padding: '16px', background: 'transparent' }}>
        {children}
      </body>
    </html>
  );
}
