'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { capturedPhotoBuilderNames, rememberPhotoBuilders, type PhotoBuilderRoster, createPhotoSession, dismissCelebrationPhoto, presentCelebrationPhoto, receiveCelebrationPhoto, type CelebrationPhoto } from '@/lib/celebration-photo';
import type { FestivalSnapshot } from '@/lib/festival-types';

type Options = {
  getSnapshot: () => FestivalSnapshot | null;
  now: number;
  active: boolean;
  blocked: boolean;
  onPresent: () => void;
};

export function useFestivalMemoryPhoto({ getSnapshot, now, active, blocked, onPresent }: Options) {
  const [session, setSession] = useState(createPhotoSession);
  const [visible, setVisible] = useState(false);
  const mounted = useRef(false);
  const builderRoster = useRef<PhotoBuilderRoster | null>(null);
  useEffect(() => {
    const snapshot = getSnapshot();
    if (snapshot) builderRoster.current = rememberPhotoBuilders(builderRoster.current, snapshot);
  }, [getSnapshot, now]);
  useEffect(() => {
    mounted.current = true;
    const update = () => {
      if (mounted.current) setVisible(document.visibilityState === 'visible' && document.hasFocus());
    };
    queueMicrotask(update);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    return () => {
      mounted.current = false;
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
    };
  }, []);
  const onCapture = useCallback((photo: CelebrationPhoto) => {
    if (!mounted.current) return;
    const snapshot = getSnapshot();
    if (!snapshot || snapshot.round.index !== photo.roundIndex) return;
    builderRoster.current = rememberPhotoBuilders(builderRoster.current, snapshot);
    const captured = { ...photo, builderNames: capturedPhotoBuilderNames(snapshot, builderRoster.current, photo.capturedAt) };
    setSession(current => receiveCelebrationPhoto(current, captured, snapshot.round));
  }, [getSnapshot]);
  const dismiss = useCallback(() => {
    if (mounted.current) setSession(dismissCelebrationPhoto);
  }, []);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || !mounted.current) return;
      const foreground = visible && document.visibilityState === 'visible' && document.hasFocus();
      setSession(current => presentCelebrationPhoto(current, { now, active, blocked, visible: foreground }));
    });
    return () => { cancelled = true; };
  }, [session.pending, session.displayed, now, active, blocked, visible]);
  // Existing photos stay mounted when a native share sheet takes focus.
  // New photos are still deferred above until the page is visible and focused.
  const isOpen = !!session.displayed && active && !blocked;
  useEffect(() => {
    if (isOpen) onPresent();
  }, [isOpen, onPresent]);
  return { photo: session.displayed, isOpen, onCapture, dismiss };
}
