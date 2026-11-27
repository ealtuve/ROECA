import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// In development preview, clear any leftover Service Worker caches so UI edits appear immediately.
// In production (PWA), listen for new Service Worker activation to reload cleanly once when updated.
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  if (import.meta.env.DEV) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => {
        if (regs.length === 0) return;
        return Promise.all(regs.map((r) => r.unregister())).then(async () => {
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
          if (!sessionStorage.getItem('roeca_sw_dev_cleaned')) {
            sessionStorage.setItem('roeca_sw_dev_cleaned', '1');
            window.location.reload();
          }
        });
      })
      .catch(() => {
        // Ignore SW cleanup errors in restricted iframes
      });
  } else {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }
}

createRoot(document.getElementById('root')!).render(<App />);
