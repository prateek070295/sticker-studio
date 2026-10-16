import { useState, useEffect, useCallback } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function usePWA() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [isOfflineReady, setIsOfflineReady] = useState<boolean>(false);
  const [needRefresh, setNeedRefresh] = useState<boolean>(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState<boolean>(false);

  useEffect(() => {
    // 1. Check if already installed / standalone
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes('android-app://');
      setIsStandalone(Boolean(isStandaloneMode));
    };

    checkStandalone();
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    mediaQuery.addEventListener?.('change', checkStandalone);

    // 2. Listen for BeforeInstallPromptEvent
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // 3. Listen for appinstalled
    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    // 4. Verify offline readiness via Service Worker and Cache Storage
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(async (registration) => {
        if (registration.active) {
          try {
            const cacheNames = await caches.keys();
            const hasWorkboxCache = cacheNames.some(name => name.includes('workbox') || name.includes('precache'));
            if (hasWorkboxCache) {
              setIsOfflineReady(true);
            }
          } catch (e) {
            // Non-critical cache inspection
          }
        }
      });

      // Periodic check for cache readiness within first few seconds
      const interval = setInterval(async () => {
        try {
          const keys = await caches.keys();
          if (keys.some(k => k.includes('workbox') || k.includes('precache'))) {
            setIsOfflineReady(true);
            clearInterval(interval);
          }
        } catch (e) {
          clearInterval(interval);
        }
      }, 1500);

      // Check for waiting service worker (updates)
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg?.waiting) {
          setNeedRefresh(true);
        }
      });

      return () => {
        clearInterval(interval);
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.removeEventListener('appinstalled', handleAppInstalled);
        mediaQuery.removeEventListener?.('change', checkStandalone);
      };
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      mediaQuery.removeEventListener?.('change', checkStandalone);
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    if (installPrompt) {
      try {
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setInstallPrompt(null);
        }
      } catch (err) {
        setIsInstallModalOpen(true);
      }
    } else {
      // Automatic beforeinstallprompt unavailable, open educational installation modal
      setIsInstallModalOpen(true);
    }
  }, [installPrompt]);

  const reloadApp = useCallback(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg?.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        window.location.reload();
      });
    } else {
      window.location.reload();
    }
  }, []);

  return {
    canInstall: !isStandalone && (Boolean(installPrompt) || !isStandalone),
    hasNativePrompt: Boolean(installPrompt),
    isStandalone,
    isOfflineReady,
    needRefresh,
    isInstallModalOpen,
    setIsInstallModalOpen,
    triggerInstall,
    reloadApp
  };
}
