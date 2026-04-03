'use client';

import { useEffect } from 'react';
import { withBasePath } from '@/lib/base-path';

/**
 * Registers the app shell / tile / API caches for offline driver use.
 * Enabled in production, or in dev when NEXT_PUBLIC_OFFLINE_SW=1.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const enable =
      process.env.NODE_ENV === 'production' ||
      process.env.NEXT_PUBLIC_OFFLINE_SW === '1';

    if (!enable) return;

    navigator.serviceWorker.register(withBasePath('/sw.js')).catch((err) => {
      console.warn('[SW] Registration failed:', err);
    });
  }, []);

  return null;
}
