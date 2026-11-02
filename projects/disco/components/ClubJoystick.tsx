'use client';

import { useCallback, useEffect, useRef } from 'react';
import { Move } from 'lucide-react';
import { JoystickInput, stickFromPoint, type StickVector } from '@/lib/club-joystick';

export interface ClubJoystickProps {
  onInput: (vector: StickVector, active: boolean) => void;
  enabled: boolean;
  resetKey: number;
  onStop: () => void;
}

/** Only this disc captures gestures; the rest of the stage remains a camera surface. */
export default function ClubJoystick({ onInput, enabled, resetKey, onStop }: ClubJoystickProps) {
  const pad = useRef<HTMLButtonElement>(null);
  const input = useRef(new JoystickInput());
  const active = useRef(false);
  const thumb = useRef<HTMLSpanElement>(null);
  const write = useCallback((vector: StickVector, isActive: boolean) => {
    active.current = isActive; onInput(vector, isActive);
    if (thumb.current) thumb.current.style.transform = `translate(${vector.x * 12}px, ${-vector.y * 12}px)`;
  }, [onInput]);
  const stop = useCallback(() => {
    const pointer = input.current.pointerId;
    const wasActive = active.current;
    input.current.reset();
    if (pointer !== null && pad.current?.hasPointerCapture(pointer)) pad.current.releasePointerCapture(pointer);
    write({ x: 0, y: 0 }, false);
    if (wasActive) onStop();
  }, [onStop, write]);
  useEffect(() => {
    // Reset capture on membership/group/reconciliation transitions, even if a
    // finger remains down. A fresh pointerdown is required afterward.
    stop();
  }, [enabled, resetKey, stop]);
  useEffect(() => {
    const surface = pad.current;
    if (!surface || !enabled) return;
    // Cancel Safari's native scroll gesture on this disc only. React's delegated
    // touch listeners can be passive; pointer capture alone does not stop scroll.
    const preventScroll = (event: TouchEvent) => { if (event.cancelable) event.preventDefault(); };
    surface.addEventListener('touchstart', preventScroll, { passive: false });
    surface.addEventListener('touchmove', preventScroll, { passive: false });
    return () => {
      surface.removeEventListener('touchstart', preventScroll);
      surface.removeEventListener('touchmove', preventScroll);
    };
  }, [enabled]);
  useEffect(() => {
    const hide = () => { if (document.visibilityState !== 'visible') stop(); };
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', hide);
    return () => { window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', hide); stop(); };
  }, [stop]);
  return <div className={`club-joystick ${enabled ? '' : 'is-disabled'}`}>
    <button ref={pad} className="joystick-pad" type="button" disabled={!enabled}
      aria-label="移动摇杆" aria-roledescription="方向摇杆" aria-describedby="joystick-help"
      onPointerDown={event => {
        if (!input.current.beginPointer(event.pointerId, event.button, event.isPrimary, enabled)) return;
        event.preventDefault(); event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        write(stickFromPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect()), true);
      }}
      onPointerMove={event => {
        if (!input.current.acceptsPointer(event.pointerId)) return;
        event.preventDefault(); event.stopPropagation();
        write(stickFromPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect()), true);
      }}
      onPointerUp={event => { if (input.current.acceptsPointer(event.pointerId)) { event.preventDefault(); event.stopPropagation(); stop(); } }}
      onPointerCancel={event => { if (input.current.acceptsPointer(event.pointerId)) stop(); }}
      onLostPointerCapture={event => { if (input.current.acceptsPointer(event.pointerId)) stop(); }}
      onBlur={stop} onContextMenu={event => event.preventDefault()}
      onKeyDown={event => {
        if (event.key === 'Escape' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); stop(); return; }
        const vector = input.current.keyDown(event.code, event.repeat, enabled);
        if (!vector) return;
        event.preventDefault(); event.stopPropagation(); write(vector, true);
      }}
      onKeyUp={event => {
        const vector = input.current.keyUp(event.code);
        if (!vector) return;
        event.preventDefault(); event.stopPropagation();
        if (!input.current.hasKeys()) stop(); else write(vector, true);
      }}>
      <span className="joystick-axis joystick-axis-x" aria-hidden="true" /><span className="joystick-axis joystick-axis-y" aria-hidden="true" />
      <span className="joystick-thumb" ref={thumb} aria-hidden="true"><Move size={17} /></span>
    </button>
    <span id="joystick-help" className="joystick-help">拖动或按方向键、WASD 移动；松开停在原地。</span>
  </div>;
}
