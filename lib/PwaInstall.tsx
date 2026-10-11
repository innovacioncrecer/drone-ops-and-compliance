'use client';

import React from 'react';
import { Download, X } from 'lucide-react';
import styles from '../styles/PwaInstall.module.css';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function PwaInstall() {
  const [prompt, setPrompt] = React.useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [help, setHelp] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [workerError, setWorkerError] = React.useState(false);
  const dialog = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const displayMode = window.matchMedia('(display-mode: standalone)');
    const updateInstalled = () => setInstalled(displayMode.matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
      setInstalled(false);
    };
    const onInstalled = () => { setInstalled(true); setPrompt(null); setHelp(false); };
    updateInstalled();
    displayMode.addEventListener('change', updateInstalled);
    window.addEventListener('beforeinstallprompt', capturePrompt);
    window.addEventListener('appinstalled', onInstalled);
    if (window.isSecureContext && 'serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch((error) => { console.error('PWA registration failed', error); setWorkerError(true); });
    }
    return () => {
      displayMode.removeEventListener('change', updateInstalled);
      window.removeEventListener('beforeinstallprompt', capturePrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  React.useEffect(() => {
    if (help) dialog.current?.showModal();
    else dialog.current?.close();
  }, [help]);

  const install = async () => {
    if (!prompt) {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      setMessage(!window.isSecureContext
        ? 'La instalación requiere abrir DroneOps mediante HTTPS.'
        : workerError
          ? 'No se pudo preparar la instalación. Recarga la página con conexión a Internet.'
          : isIOS
            ? 'En Safari, abre Compartir y selecciona Añadir a pantalla de inicio.'
            : 'Abre el menú del navegador y busca Instalar app. Si no aparece, usa una versión actual de Chrome o Edge; también puede estar instalada o pendiente de cumplir los criterios del navegador.');
      setHelp(true);
      return;
    }
    setBusy(true);
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      setMessage('No se pudo abrir la instalación. Inténtalo desde el menú del navegador.');
      setHelp(true);
    } finally {
      setPrompt(null);
      setBusy(false);
    }
  };

  if (installed) return null;
  return (
    <>
      <aside className={styles.bar} aria-label="Instalación de DroneOps">
        <span>DroneOps</span>
        <button type="button" onClick={install} disabled={busy}>
          <Download size={16} aria-hidden="true" />{busy ? 'Instalando...' : 'Instalar app'}
        </button>
      </aside>
      <dialog ref={dialog} className={styles.dialog} aria-labelledby="install-title"
        onCancel={() => setHelp(false)}>
        <header><h2 id="install-title">Instalar DroneOps</h2>
          <button type="button" onClick={() => setHelp(false)} aria-label="Cerrar" title="Cerrar"><X size={20} /></button>
        </header>
        <p>{message}</p>
      </dialog>
    </>
  );
}