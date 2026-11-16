import type { CalendarMode } from './models';

export type DeliverResult = 'shared' | 'downloaded' | 'opened' | 'cancelled';

/**
 * Consegna un file all'utente.
 * - 'share': foglio di condivisione di iOS (Calendario, Salva su File...). Va chiamata subito dentro il tap,
 *   senza altre attese prima, altrimenti iOS può rifiutare la condivisione.
 * - 'open': apre direttamente il file in una nuova scheda (iOS propone "Aggiungi a Calendario").
 * Se il metodo scelto non è disponibile si ricade sul download.
 */
export async function deliver(
  name: string,
  mime: string,
  content: string,
  mode: CalendarMode,
): Promise<DeliverResult> {
  const file = new File([content], name, { type: mime });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };

  if (mode === 'share' && typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file] });
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
      // altro errore: si prova il download
    }
  }

  const url = URL.createObjectURL(file);
  setTimeout(() => URL.revokeObjectURL(url), 120_000);

  if (mode === 'open') {
    const w = window.open(url, '_blank');
    if (w) return 'opened';
  }

  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return 'downloaded';
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Immagine non leggibile'));
    };
    img.src = url;
  });
}

/** Ridimensiona la foto (lato lungo max 900px) e la restituisce come data URL JPEG, per tenere piccolo il database e il backup. */
export async function resizeImage(file: File, max = 900, quality = 0.78): Promise<string> {
  const img = await loadImage(file);
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponibile');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

export function slug(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'veicolo'
  );
}
