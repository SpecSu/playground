import { celebrationPhotoBuilderLines, celebrationPhotoFilename, paintCelebrationPhoto, polaroidLayout, PHOTO_CAPTION, PHOTO_TITLE, type CelebrationPhoto } from './celebration-photo';

const abortError = () => new DOMException('Photo closed', 'AbortError');

function loadCapturedImage(dataUrl: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const image = new Image();
    const cleanup = () => { image.onload = null; image.onerror = null; signal?.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); image.src = ''; reject(abortError()); };
    image.onload = () => { cleanup(); resolve(image); };
    image.onerror = () => { cleanup(); image.src = ''; reject(new Error('The captured frame could not be decoded')); };
    signal?.addEventListener('abort', abort, { once: true });
    image.src = dataUrl;
  });
}

/** Prepare before either gesture so the picker and native share retain user activation. */
export async function prepareCelebrationPhoto(photo: CelebrationPhoto, signal?: AbortSignal): Promise<File> {
  const image = await loadCapturedImage(photo.dataUrl, signal);
  const canvas = document.createElement('canvas');
  try {
    if (signal?.aborted) throw abortError();
    const layout = polaroidLayout(image.naturalWidth, image.naturalHeight, celebrationPhotoBuilderLines(photo).length);
    canvas.width = layout.width; canvas.height = layout.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Photo canvas is unavailable');
    paintCelebrationPhoto(context, image, layout, photo);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error('Photo PNG encoding failed')), 'image/png');
    });
    if (signal?.aborted) throw abortError();
    return new File([blob], celebrationPhotoFilename(photo), { type: 'image/png', lastModified: photo.capturedAt });
  } finally {
    canvas.width = 0; canvas.height = 0;
    image.src = '';
  }
}

export type PhotoSaveResult = 'saved' | 'download-requested' | 'cancelled' | 'save-blocked';
export type PhotoShareResult = 'shared' | 'cancelled' | 'share-blocked';

type SavePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
    excludeAcceptAllOption: boolean;
  }) => Promise<FileSystemFileHandle>;
};

export function canChooseCelebrationPhotoLocation(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && typeof (window as SavePickerWindow).showSaveFilePicker === 'function';
}

export function canShareCelebrationPhoto(file: File): boolean {
  try { return typeof navigator !== 'undefined' && typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [file] }); }
  catch { return false; }
}

function downloadPhoto(file: File, signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
  const url = URL.createObjectURL(file), anchor = document.createElement('a');
  let released = false;
  const release = () => {
    if (released) return;
    released = true; clearTimeout(timer);
    signal?.removeEventListener('abort', release);
    URL.revokeObjectURL(url);
  };
  // A delayed revoke lets Safari consume the download while bounding Blob lifetime.
  const timer = setTimeout(release, 30_000);
  signal?.addEventListener('abort', release, { once: true });
  try {
    anchor.href = url; anchor.download = file.name; anchor.style.display = 'none';
    document.body.appendChild(anchor);
    if (signal?.aborted) throw abortError();
    anchor.click();
    // Closing the photo must not cancel a successful Safari download dispatch.
    // Its bounded timer now owns cleanup independently of the modal lifecycle.
    signal?.removeEventListener('abort', release);
  } catch (error) {
    release(); throw error;
  } finally {
    anchor.remove();
  }
}

export async function saveCelebrationPhoto(file: File, options: { downloadOnly?: boolean; signal?: AbortSignal } = {}): Promise<PhotoSaveResult> {
  if (options.signal?.aborted) return 'cancelled';
  if (!options.downloadOnly && canChooseCelebrationPhotoLocation()) {
    let writable: FileSystemWritableFileStream | undefined;
    try {
      // No await before opening the picker: this must run in Save's exact click.
      const handle = await (window as SavePickerWindow).showSaveFilePicker!({
        suggestedName: file.name,
        types: [{ description: 'PNG 照片', accept: { 'image/png': ['.png'] } }],
        excludeAcceptAllOption: true,
      });
      if (options.signal?.aborted) return 'cancelled';
      writable = await handle.createWritable();
      if (options.signal?.aborted) { await writable.abort(); return 'cancelled'; }
      // Once dispatched, finish the chosen save even if the photo is closed.
      // Only a successful close commits the file; write() alone is not success.
      await writable.write(file);
      await writable.close();
      return 'saved';
    } catch (error) {
      try { await writable?.abort(); } catch { /* Preserve the original failure. */ }
      if (options.signal?.aborted || (error as { name?: string })?.name === 'AbortError') return 'cancelled';
      const name = (error as { name?: string })?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'NotSupportedError') return 'save-blocked';
      throw error;
    }
  }
  // Unsupported browsers choose the destination through their download settings.
  downloadPhoto(file, options.signal);
  return 'download-requested';
}

export async function shareCelebrationPhoto(file: File, options: { signal?: AbortSignal } = {}): Promise<PhotoShareResult> {
  if (options.signal?.aborted) return 'cancelled';
  if (!canShareCelebrationPhoto(file)) return 'share-blocked';
  try {
    // Sharing is optional and is only invoked from the separate Share gesture.
    await navigator.share({ files: [file], title: PHOTO_TITLE, text: PHOTO_CAPTION });
    return options.signal?.aborted ? 'cancelled' : 'shared';
  } catch (error) {
    if (options.signal?.aborted || (error as { name?: string })?.name === 'AbortError') return 'cancelled';
    return 'share-blocked';
  }
}
