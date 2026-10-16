import { useState, useEffect, useCallback, useRef } from 'react';
import { registerSW } from 'virtual:pwa-register';

export interface BeforeInstallPromptEvent extends Event {
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly, so long-open windows still see new releases

export function usePWA() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [isOfflineReady, setIsOfflineReady] = useState<boolean>(false);
  const [needRefresh, setNeedRefresh] = useState<boolean>(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState<boolean>(false);
  const updateSWRef = useRef<((reload?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const checkStandalone = () =>
      setIsStandalone(mediaQuery.matches || (window.navigator as any).standalone === true);
    checkStandalone();
    mediaQuery.addEventListener?.('change', checkStandalone);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // keep the browser's mini-infobar quiet; we offer a single subtle button instead
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallPrompt(null);
      setIsStandalone(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    // onOfflineReady fires only after the service worker has installed, i.e. every precached
    // asset was downloaded successfully. onNeedRefresh fires when a new version is fully
    // downloaded and waiting; it is never activated until the user chooses to reload.
    let timer: number | undefined;
    updateSWRef.current = registerSW({
      onOfflineReady: () => setIsOfflineReady(true),
      onNeedRefresh: () => setNeedRefresh(true),
      onRegisteredSW: (_url, registration) => {
        if (registration?.active) setIsOfflineReady(true); // returning visit: already installed
        if (registration) timer = window.setInterval(() => registration.update(), UPDATE_CHECK_INTERVAL_MS);
      }
    });

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      mediaQuery.removeEventListener?.('change', checkStandalone);
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    if (!installPrompt) {
      setIsInstallModalOpen(true); // browser offers no install event: show manual instructions
      return;
    }
    try {
      await installPrompt.prompt();
      if ((await installPrompt.userChoice).outcome === 'accepted') setInstallPrompt(null);
    } catch {
      setIsInstallModalOpen(true);
    }
  }, [installPrompt]);

  // Activates the waiting worker, then reloads once it controls the page, so the reload
  // can never mix old HTML with new assets.
  const reloadApp = useCallback(() => {
    if (updateSWRef.current) updateSWRef.current(true);
    else window.location.reload();
  }, []);

  return {
    canInstall: !isStandalone,
    isStandalone,
    isOfflineReady,
    needRefresh,
    isInstallModalOpen,
    setIsInstallModalOpen,
    triggerInstall,
    reloadApp
  };
}
