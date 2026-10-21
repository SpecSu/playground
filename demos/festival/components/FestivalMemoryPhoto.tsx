'use client';
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, LoaderCircle, Share2 } from 'lucide-react';
import { celebrationPhotoBuilderLines, celebrationPhotoDate, PHOTO_CAPTION, PHOTO_TITLE, type CelebrationPhoto } from '@/lib/celebration-photo';
import { canChooseCelebrationPhotoLocation, canShareCelebrationPhoto, prepareCelebrationPhoto, saveCelebrationPhoto, shareCelebrationPhoto } from '@/lib/celebration-photo-export';

type Props = { photo: CelebrationPhoto; onClose: () => void };

export default function FestivalMemoryPhoto({ photo, onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const saving = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const [shareAvailable, setShareAvailable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [downloadOnly, setDownloadOnly] = useState(false);
  const [status, setStatus] = useState('正在装裱这一刻…');
  const close = useCallback(() => { controller.current?.abort(); onClose(); }, [onClose]);

  useEffect(() => {
    const abort = new AbortController(); controller.current = abort;
    queueMicrotask(async () => {
      if (abort.signal.aborted) return;
      setPreparing(true); setFailed(false); setFile(null); setStatus('正在装裱这一刻…');
      saving.current = false; setBusy(null); setShareAvailable(false); setDownloadOnly(false);
      try {
        const prepared = await prepareCelebrationPhoto(photo, abort.signal);
        if (abort.signal.aborted) return;
        setFile(prepared); setShareAvailable(canShareCelebrationPhoto(prepared));
        setStatus(canChooseCelebrationPhotoLocation() ? '关闭前请保存，可选择保存位置。' : '关闭前请保存；位置由浏览器下载设置决定。');
      } catch {
        if (abort.signal.aborted) return;
        setFailed(true); setStatus('照片暂时无法导出，点击「保存照片」重试。');
      } finally {
        if (!abort.signal.aborted) setPreparing(false);
      }
    });
    return () => { abort.abort(); controller.current = null; };
  }, [photo, attempt]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    let alive = true;
    const controls = () => Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    queueMicrotask(() => {
      if (alive && document.visibilityState === 'visible' && document.hasFocus()) panel.current?.focus({ preventScroll: true });
    });
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (event.key !== 'Tab') return;
      const buttons = controls(), first = buttons[0], last = buttons.at(-1);
      if (!first) { event.preventDefault(); panel.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.current?.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      alive = false; document.removeEventListener('keydown', keydown);
      if (document.visibilityState === 'visible' && document.hasFocus() && previous?.isConnected && !previous.closest('[inert],[hidden]')) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [close]);

  const exportPhoto = (action: 'save' | 'share') => {
    if (saving.current || preparing) return;
    if (!file) { if (failed && action === 'save') setAttempt(value => value + 1); return; }
    if (action === 'share' && !shareAvailable) return;
    const signal = controller.current?.signal;
    if (!signal || signal.aborted) return;
    saving.current = true; setBusy(action); setStatus(action === 'save' ? '正在保存照片…' : '正在打开系统分享…');
    // The prepared PNG keeps both APIs inside their own exact click gesture.
    const operation = action === 'save' ? saveCelebrationPhoto(file, { downloadOnly, signal }) : shareCelebrationPhoto(file, { signal });
    void operation.then(result => {
      if (signal.aborted) return;
      if (result === 'cancelled') setStatus(action === 'save' ? '已取消保存，照片仍在这里。' : '已取消分享，照片仍在这里。');
      else if (result === 'save-blocked') {
        setDownloadOnly(true); setStatus('未能保存文件。再次点击「保存照片」可按浏览器设置下载 PNG。');
      } else if (result === 'share-blocked') {
        setStatus('系统分享暂不可用，可点击「保存照片」下载 PNG。');
      } else if (result === 'shared') setStatus('分享操作已完成。');
      else if (result === 'saved') setStatus('已保存 PNG 照片。');
      else setStatus('已请求下载 PNG；位置由浏览器下载设置决定，请查看下载记录。');
    }).catch(() => {
      if (!signal.aborted) setStatus(action === 'save' ? '暂时无法保存照片，请重试。' : '暂时无法分享照片，请重试。');
    }).finally(() => {
      if (!signal.aborted) { saving.current = false; setBusy(null); }
    });
  };

  return <div className="festival-memory-layer">
    <button className="festival-memory-backdrop" onClick={close} aria-label="关闭照片" tabIndex={-1}/>
    <div className="festival-memory-dialog" role="dialog" aria-modal="true" aria-labelledby="festival-memory-title" aria-describedby="festival-memory-caption" ref={panel} tabIndex={-1}>
      <p className="festival-memory-eyebrow" aria-hidden="true">DESERT RITUAL / A MOMENT TO KEEP</p>
      <figure className="festival-memory-paper">
        <img className="festival-memory-image" src={photo.dataUrl} alt="这一轮荒原燃烧高潮的真实留影"/>
        <figcaption>
          <h2 id="festival-memory-title">{PHOTO_TITLE}</h2>
          <p id="festival-memory-caption">{PHOTO_CAPTION}</p>
          <div className="festival-memory-date"><time dateTime={new Date(photo.capturedAt).toISOString()}>{celebrationPhotoDate(photo.capturedAt)}</time><span>火人节 · 即梦</span></div>
          {celebrationPhotoBuilderLines(photo).length > 0 && <div className="festival-memory-builders">{celebrationPhotoBuilderLines(photo).map((line, index) => <div key={index}>{line}</div>)}</div>}
        </figcaption>
      </figure>
      <div className="festival-memory-actions">
        <button className="festival-memory-save" onClick={() => exportPhoto('save')} disabled={preparing || busy !== null} aria-busy={preparing || busy === 'save'}>{preparing || busy === 'save' ? <LoaderCircle size={14} className="spin" aria-hidden="true"/> : <Download size={14} aria-hidden="true"/>}<span>保存照片</span></button>
        {shareAvailable && <button className="festival-memory-share" onClick={() => exportPhoto('share')} disabled={preparing || busy !== null} aria-busy={busy === 'share'} title="打开系统分享，可用选项由设备决定">{busy === 'share' ? <LoaderCircle size={14} className="spin" aria-hidden="true"/> : <Share2 size={14} aria-hidden="true"/>}<span>分享</span></button>}
        <button className="festival-memory-close" onClick={close}>关闭</button>
      </div>
      <p className="festival-memory-status" role="status" aria-live="polite">{status}</p>
    </div>
  </div>;
}
