/** Canonical 390 × 844 canvas from the approved v0.2.0 interface. */
export const PHONE_SCREEN = Object.freeze({ width: 390, height: 844 });

export interface PhoneViewportFit { scale: number; width: number; height: number }

/** Uniformly fit the entire reference screen inside available, safe viewport bounds. */
export function fitPhoneViewport(availableWidth: number, availableHeight: number): PhoneViewportFit {
  if (!Number.isFinite(availableWidth) || !Number.isFinite(availableHeight) || availableWidth <= 0 || availableHeight <= 0) {
    return { scale: 0, width: 0, height: 0 };
  }
  const scale = Math.min(availableWidth / PHONE_SCREEN.width, availableHeight / PHONE_SCREEN.height);
  return { scale, width: PHONE_SCREEN.width * scale, height: PHONE_SCREEN.height * scale };
}

export interface ViewportBounds { left: number; top: number; width: number; height: number }
export interface PositionedPhoneFit extends PhoneViewportFit { offsetX: number; offsetY: number }

/** Fit and center within the visible safe area, even when the keyboard pans the viewport. */
export function fitVisiblePhoneViewport(host: ViewportBounds, visible?: ViewportBounds): PositionedPhoneFit {
  const left = Math.max(host.left, visible?.left ?? host.left);
  const top = Math.max(host.top, visible?.top ?? host.top);
  const right = Math.min(host.left + host.width, visible ? visible.left + visible.width : Infinity);
  const bottom = Math.min(host.top + host.height, visible ? visible.top + visible.height : Infinity);
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  return {
    ...fitPhoneViewport(width, height),
    offsetX: left + width / 2 - (host.left + host.width / 2),
    offsetY: top + height / 2 - (host.top + host.height / 2),
  };
}


/** Inline typing preserves the pre-keyboard scale instead of shrinking the phone. */
export function fitChatPhoneViewport(host: ViewportBounds, visible: ViewportBounds | undefined, previousScale: number | PositionedPhoneFit): PositionedPhoneFit & { visibleHeight: number } {
  const left = Math.max(host.left, visible?.left ?? host.left);
  const top = Math.max(host.top, visible?.top ?? host.top);
  const right = Math.min(host.left + host.width, visible ? visible.left + visible.width : Infinity);
  const bottom = Math.min(host.top + host.height, visible ? visible.top + visible.height : Infinity);
  const availableWidth = Math.max(0, right - left), availableHeight = Math.max(0, bottom - top);
  const priorScale = typeof previousScale === 'number' ? previousScale : previousScale.scale;
  const heldScale = Number.isFinite(priorScale) && priorScale > 0 ? priorScale : 1;
  const scale = Math.min(heldScale, availableWidth / PHONE_SCREEN.width);
  const width = PHONE_SCREEN.width * scale, height = PHONE_SCREEN.height * scale;
  return {
    scale, width, height,
    visibleHeight: scale > 0 ? Math.min(PHONE_SCREEN.height, availableHeight / scale) : 0,
    offsetX: left + availableWidth / 2 - (host.left + host.width / 2),
    offsetY: top + Math.max(0, (availableHeight - height) / 2) - (host.top + (host.height - height) / 2),
  };
}

export interface SafeInsets { left: number; top: number; right: number; bottom: number }
export interface PhoneLayout extends PositionedPhoneFit { visibleHeight: number }
/** Layout-viewport coordinates only. Client rects move when iOS scrolls a focused
 * input into view; intersecting those with visualViewport offsets double-counts
 * that pan. This function deliberately has no client-rect / document-scroll input.
 */
export function layoutPhoneViewport(width: number, height: number, insets: SafeInsets,
  visible: ViewportBounds | undefined, typing: boolean, restingScale: number): PhoneLayout {
  const host = { left: insets.left, top: insets.top,
    width: Math.max(1, width - insets.left - insets.right),
    height: Math.max(1, height - insets.top - insets.bottom) };
  // During keyboard/chrome animation Safari can report visual bounds outside the
  // current dvh box. The visual viewport is authoritative in that transient state.
  const outside = visible && (visible.top >= host.top + host.height || visible.left >= host.left + host.width ||
    visible.top + visible.height <= host.top || visible.left + visible.width <= host.left);
  // Keyboard bounds must not be vertically intersected with dvh: WebKit may
  // shrink dvh before clearing its visual pan, even when a tiny overlap remains.
  const typingBounds = typing && visible ? {
    left: Math.max(visible.left, insets.left),
    top: Math.max(visible.top, insets.top),
    width: Math.max(1, visible.width - Math.max(0, insets.left - visible.left) -
      (visible.left + visible.width >= width ? insets.right : 0)),
    height: Math.max(1, visible.height - Math.max(0, insets.top - visible.top) -
      (visible.top === 0 && visible.height >= height ? insets.bottom : 0)),
  } : undefined;
  const bounds = typingBounds ?? (outside ? visible : host);
  const fit = typing ? fitChatPhoneViewport(bounds, visible, restingScale) : fitVisiblePhoneViewport(bounds, visible);
  return { ...fit,
    offsetX: bounds.left + (bounds.width - fit.width) / 2 + fit.offsetX,
    offsetY: bounds.top + (bounds.height - fit.height) / 2 + fit.offsetY,
    visibleHeight: 'visibleHeight' in fit && typeof fit.visibleHeight === 'number' ? fit.visibleHeight : PHONE_SCREEN.height };
}

/** Native pinch retains canvas scale and position. Only the keyboard-safe bottom
 * boundary changes, so dismissing the keyboard while zoomed never leaves a crop.
 */
export function updateZoomedPhoneViewport(previous: PhoneLayout, visible: ViewportBounds, typing: boolean): PhoneLayout {
  return { ...previous, visibleHeight: typing
    ? Math.min(PHONE_SCREEN.height, Math.max(0, (visible.top + visible.height - previous.offsetY) / previous.scale))
    : PHONE_SCREEN.height };
}

/** A focus session outlives blur until the keyboard's closing animation recovers.
 * Heights are unzoomed CSS pixels, so native pinch never looks like a keyboard.
 */
export interface PhoneKeyboardState {
  width: number; height: number; visibleHeight: number; scale: number; holding: boolean;
}
export interface PhoneKeyboardSample {
  width: number; height: number; visibleHeight: number; zoom: number;
  focused: boolean; settled?: boolean;
}
export function advancePhoneKeyboard(previous: PhoneKeyboardState | undefined, sample: PhoneKeyboardSample): PhoneKeyboardState {
  const visibleHeight = sample.visibleHeight * sample.zoom;
  let baseline = previous ?? { width: sample.width, height: sample.height, visibleHeight,
    scale: fitPhoneViewport(sample.width, Math.min(sample.height, visibleHeight)).scale, holding: false };
  // A real width change (rotation / desktop window resize) starts a new geometry.
  // When rotating with the keyboard up, the former width is the best available
  // unoccluded landscape height; don't learn the keyboard-reduced height.
  if (sample.zoom <= 1.01 && Math.abs(sample.width - baseline.width) > 2) {
    const height = baseline.holding ? baseline.width : sample.height;
    baseline = { width: sample.width, height, visibleHeight: height,
      scale: fitPhoneViewport(sample.width, height).scale, holding: baseline.holding };
  }
  const deficit = Math.max(baseline.height - sample.height, baseline.visibleHeight - visibleHeight);
  // A small, settled difference can be browser chrome. A large keyboard deficit
  // must never be released by a blur timer alone.
  const recovered = deficit <= 2 || (sample.settled && deficit <= 100);
  const holding = sample.focused || (baseline.holding && !recovered);
  if (holding || sample.zoom > 1.01) return { ...baseline, holding };
  return { width: sample.width, height: sample.height, visibleHeight,
    scale: fitPhoneViewport(sample.width, Math.min(sample.height, visibleHeight)).scale, holding: false };
}

type EditableCandidate = { tagName?: string; type?: string; disabled?: boolean; readOnly?: boolean; isContentEditable?: boolean };
export function isPhoneEditable(target: EditableCandidate | null): boolean {
  if (!target || target.disabled || target.readOnly) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === 'TEXTAREA') return true;
  return target.tagName === 'INPUT' && !['button','checkbox','color','file','hidden','image','radio','range','reset','submit'].includes(target.type ?? 'text');
}

/** Listen on the document: React portals live outside the phone DOM subtree.
 * Deferring focusout avoids releasing the session between two editable fields.
 */
export function observePhoneEditableFocus(owner: Document, onChange: (focused: boolean) => void): () => void {
  let disposed = false;
  const read = () => { if (!disposed) onChange(isPhoneEditable(owner.activeElement as HTMLElement | null)); };
  const blur = () => queueMicrotask(read);
  owner.addEventListener('focusin', read, true);
  owner.addEventListener('focusout', blur, true);
  read();
  return () => { disposed = true; owner.removeEventListener('focusin', read, true); owner.removeEventListener('focusout', blur, true); };
}

/** Scroll only the sheet, never the page (which would double Safari's own pan). */
export function revealPhoneSheetInput(owner: Document, scale: number): void {
  const active = owner.activeElement as HTMLElement | null;
  if (!active || !isPhoneEditable(active) || scale <= 0) return;
  const panel = active.closest<HTMLElement>('.sheet');
  if (!panel) return;
  const field = active.getBoundingClientRect(), bounds = panel.getBoundingClientRect();
  const heading = panel.querySelector<HTMLElement>('.sheet-heading')?.getBoundingClientRect();
  const top = Math.max(bounds.top + 12 * scale, heading ? heading.bottom + 8 * scale : bounds.top);
  const bottom = bounds.bottom - 16 * scale;
  if (field.top < top) panel.scrollTop -= (top - field.top) / scale;
  else if (field.bottom > bottom) panel.scrollTop += (field.bottom - bottom) / scale;
}
