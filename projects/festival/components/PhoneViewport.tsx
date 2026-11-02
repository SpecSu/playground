'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { layoutPhoneViewport, updateZoomedPhoneViewport, advancePhoneKeyboard, observePhoneEditableFocus, isPhoneEditable, revealPhoneSheetInput, PHONE_SCREEN, type PhoneLayout, type PhoneKeyboardState } from '@/lib/phone-viewport';

/** All editable controls (including portals) share one keyboard lifecycle. Legacy
 * chat flags remain accepted, but scale preservation never depends on callers. */
export default function PhoneViewport({ children }: { children: ReactNode; keyboardOpen?: boolean; keyboardActive?: boolean }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<PhoneLayout>({ scale: 1, width: PHONE_SCREEN.width, height: PHONE_SCREEN.height, offsetX: 0, offsetY: 0, visibleHeight: PHONE_SCREEN.height });
  const [keyboardHeld, setKeyboardHeld] = useState(false);

  useLayoutEffect(() => {
    const host = frameRef.current?.parentElement;
    if (!host) return;
    const visualViewport = window.visualViewport;
    let raf = 0, settleTimer = 0, focused = false;
    let keyboard: PhoneKeyboardState | undefined;
    const resize = (settled = false) => {
      // Removing a focused portal/input need not dispatch blur in every browser.
      focused = isPhoneEditable(document.activeElement as HTMLElement | null);
      const style = getComputedStyle(host);
      const number = (value: string) => parseFloat(value) || 0;
      const insets = { left: number(style.paddingLeft), top: number(style.paddingTop),
        right: number(style.paddingRight), bottom: number(style.paddingBottom) };
      const width = host.clientWidth, height = host.clientHeight;
      if (!width || !height || (visualViewport && (!visualViewport.width || !visualViewport.height))) return;
      const visible = visualViewport ? { left: visualViewport.offsetLeft, top: visualViewport.offsetTop,
        width: visualViewport.width, height: visualViewport.height } : undefined;
      keyboard = advancePhoneKeyboard(keyboard, {
        width: width - insets.left - insets.right, height: height - insets.top - insets.bottom,
        visibleHeight: visualViewport ? visualViewport.height : height - insets.top - insets.bottom,
        zoom: visualViewport?.scale ?? 1, focused, settled,
      });
      const holding = keyboard.holding;
      setKeyboardHeld(holding);
      // Preserve native pinch scale/pan while still tracking the keyboard edge.
      if (visualViewport && visualViewport.scale > 1.01) {
        setFit(previous => updateZoomedPhoneViewport(previous, visible!, holding));
        return;
      }
      const next = layoutPhoneViewport(width, height, insets, visible, holding, keyboard.scale);
      // Store the actual safe-area fit before focus, not a raw viewport estimate.
      if (!holding) keyboard.scale = next.scale;
      setFit(previous => previous.scale === next.scale && previous.offsetX === next.offsetX && previous.offsetY === next.offsetY && previous.visibleHeight === next.visibleHeight ? previous : next);
    };
    const schedule = () => {
      cancelAnimationFrame(raf); raf = requestAnimationFrame(() => resize());
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => resize(true), 180);
    };
    // Measure resting geometry before the focus observer's initial notification.
    resize();
    const stopFocus = observePhoneEditableFocus(document, next => {
      focused = next;
      // Capture the existing resting geometry synchronously on focusin, before
      // Safari's first keyboard resize; do not wait for React prop propagation.
      resize(); revealPhoneSheetInput(document, keyboard?.scale ?? 1); schedule();
    });
    const observer = new ResizeObserver(schedule);
    observer.observe(host);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule);
    visualViewport?.addEventListener('resize', schedule);
    visualViewport?.addEventListener('scroll', schedule);
    return () => {
      cancelAnimationFrame(raf); window.clearTimeout(settleTimer);
      stopFocus(); observer.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule);
      visualViewport?.removeEventListener('resize', schedule);
      visualViewport?.removeEventListener('scroll', schedule);
    };
  }, []);

  useLayoutEffect(() => {
    if (keyboardHeld) revealPhoneSheetInput(document, fit.scale);
  }, [keyboardHeld, fit]);

  return <div ref={frameRef} className="phone-viewport" data-phone-ratio="195:422" data-keyboard-held={keyboardHeld || undefined} style={{
    '--phone-scale': fit.scale,
    '--phone-visible-height': `${fit.visibleHeight}px`,
    position: 'fixed', left: 0, top: 0,
    width: fit.width,
    height: keyboardHeld ? fit.visibleHeight * fit.scale : fit.height,
    overflow: keyboardHeld ? 'hidden' : undefined,
    transform: `translate(${fit.offsetX}px, ${fit.offsetY}px)`,
  } as CSSProperties}>{children}</div>;
}
