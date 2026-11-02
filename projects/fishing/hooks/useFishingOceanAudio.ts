'use client';
import {useCallback, useEffect, useRef, useState} from 'react';
import {FishingOceanAudio, type OceanAudioStatus} from '@/lib/fishing-ocean-audio';

export function useFishingOceanAudio(enabled: boolean) {
  const player = useRef<FishingOceanAudio | null>(null);
  const active = useRef(enabled);
  const pageHidden = useRef(false);
  const [status, setStatus] = useState<OceanAudioStatus>({muted: false, playing: false, needsGesture: false, unavailable: false});
  useEffect(() => {
    let mounted = true;
    const audio = new FishingOceanAudio({onStatus: next => {if (mounted) setStatus(next);}});
    player.current = audio;
    const sync = () => audio.setActive(active.current && !document.hidden && !pageHidden.current, document.hidden || pageHidden.current);
    const hide = () => {pageHidden.current = true; sync();};
    const show = () => {pageHidden.current = false; sync();};
    sync();
    audio.startDefault();
    queueMicrotask(() => {if (mounted) setStatus(audio.status);});
    const unlock = (event: Event) => {if ((event.target as Element | null)?.closest?.('.fishing-ocean-sound')) return; if (active.current && !document.hidden && !pageHidden.current) audio.requestFromGesture();};
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    return () => {
      mounted = false;
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
      audio.dispose();
      if (player.current === audio) player.current = null;
    };
  }, []);
  useEffect(() => {
    active.current = enabled;
    player.current?.setActive(enabled && !document.hidden && !pageHidden.current, document.hidden || pageHidden.current);
  }, [enabled]);
  const requestFromGesture = useCallback(() => {
    if (enabled && !document.hidden) player.current?.requestFromGesture();
  }, [enabled]);
  const toggleFromGesture = useCallback(() => player.current?.toggleFromGesture(), []);
  const celebrateCatch = useCallback((catchId: string) => player.current?.celebrateCatch(catchId), []);
  const confirmCast = useCallback((castId: string) => player.current?.confirmCast(castId), []);
  const playCast = useCallback((castId: string) => player.current?.playCast(castId), []);
  const observeBite = useCallback((state: Parameters<FishingOceanAudio['observeBite']>[0], now: number) => player.current?.observeBite(state, now), []);
  return {...status, observeBite, confirmCast, playCast, requestFromGesture, toggleFromGesture, celebrateCatch};
}
