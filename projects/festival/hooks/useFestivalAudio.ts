'use client';
import {useCallback, useEffect, useRef, useState} from 'react';
import {FestivalAudio, type FestivalAudioStatus} from '@/lib/festival-audio';
import {festivalSceneState} from '@/lib/festival-ambient';
import {projectParticipant, type FestivalSnapshot} from '@/lib/festival-types';

export function useFestivalAudio(enabled: boolean, getSnapshot: () => FestivalSnapshot | null, serverTime: () => number) {
  const player = useRef<FestivalAudio | null>(null);
  const active = useRef(enabled), pageHidden = useRef(false);
  const [status, setStatus] = useState<FestivalAudioStatus>({muted: false, playing: false, needsGesture: false, unavailable: false});
  useEffect(() => {
    let mounted = true;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const audio = new FestivalAudio({
      onStatus: next => {if (mounted) setStatus(next);},
      getFrame: () => {
        const snapshot = getSnapshot(); if (!snapshot) return null;
        const now = serverTime(), scene = festivalSceneState(snapshot, now);
        const self = scene.participants.find(person => person.id === snapshot.self.id);
        return {now, round: snapshot.round, selfId: snapshot.self.id, listener: self ? projectParticipant(self, now) : {x: 0, z: 0},
          // Reduced-motion renders a static tool pose, so it has no impact cues.
          builders: reduced.matches ? [] : scene.participants.flatMap(person => person.buildTask ? [{id: person.id, arrivalAt: person.buildTask.arrivalAt, finishAt: person.buildTask.finishAt, x: person.targetX, z: person.targetZ}] : [])};
      },
    });
    player.current = audio;
    // Warm the same-origin music/effects cache without creating audio output.
    void audio.preload();
    const sync = () => audio.setActive(active.current && !document.hidden && !pageHidden.current, document.hidden || pageHidden.current);
    const hide = () => {pageHidden.current = true; sync();};
    const show = () => {pageHidden.current = false; sync();};
    sync(); queueMicrotask(() => {if (mounted) setStatus(audio.status);});
    document.addEventListener('visibilitychange', sync); window.addEventListener('pagehide', hide); window.addEventListener('pageshow', show);
    return () => {mounted = false; document.removeEventListener('visibilitychange', sync); window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', show); audio.dispose(); if (player.current === audio) player.current = null;};
  }, [getSnapshot, serverTime]);
  useEffect(() => {active.current = enabled; player.current?.setActive(enabled && !document.hidden && !pageHidden.current, document.hidden || pageHidden.current);}, [enabled]);
  const requestFromGesture = useCallback(() => {if (enabled && !document.hidden) player.current?.requestFromGesture();}, [enabled]);
  const toggleFromGesture = useCallback(() => {if (enabled && !document.hidden) player.current?.toggleFromGesture();}, [enabled]);
  return {...status, requestFromGesture, toggleFromGesture};
}
