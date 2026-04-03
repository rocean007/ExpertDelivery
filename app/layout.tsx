import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';

export const viewport: Viewport = {
  themeColor: '#182210',
};

export const metadata: Metadata = {
  title: 'OT Delivery Router',
  description: 'Optimized delivery route planning for Ocean Tarkari',
  keywords: ['delivery', 'route optimization', 'logistics'],
  robots: 'noindex, nofollow',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'OT Delivery' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body className="antialiased">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
