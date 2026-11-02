import type { FestivalSnapshot } from './festival-types';
/** A real frame copied from the rendered ceremony. No remote or generated fallback. */
export type CelebrationPhoto = { roundIndex: number; dataUrl: string; capturedAt: number; builderNames?: readonly string[] };
export type ReadyCelebrationPhoto = CelebrationPhoto & { ashesAt: number };
export type PhotoSession = {
  /** A scalar watermark prevents duplicate callbacks without retaining past images. */
  latestRound: number;
  pending: ReadyCelebrationPhoto | null;
  displayed: ReadyCelebrationPhoto | null;
};
type PhotoRound = { index: number; burnAt: number; ashesAt: number };
export type PhotoPresentation = { now: number; active: boolean; visible: boolean; blocked: boolean };
export const PHOTO_TITLE = '余烬之后';
export const PHOTO_CAPTION = '把形状还给风，把此刻留给我们。';
const MAX_FRAME_DATA_LENGTH = 16_000_000;

/** Keep only identities actually observed in this round, including builders who leave. */
export type PhotoBuilderRoster = { roundIndex: number; names: Map<string, string> };
export function rememberPhotoBuilders(previous: PhotoBuilderRoster | null, snapshot: FestivalSnapshot): PhotoBuilderRoster {
  const names = previous?.roundIndex === snapshot.round.index ? new Map(previous.names) : new Map<string, string>();
  for (const person of [...snapshot.participants, ...snapshot.ambientParticipants]) {
    const name = person.name.trim();
    if (name) names.set(person.id, name);
  }
  return { roundIndex: snapshot.round.index, names };
}
export function capturedPhotoBuilderNames(snapshot: FestivalSnapshot, roster: PhotoBuilderRoster | null, capturedAt: number): string[] {
  const names = rememberPhotoBuilders(roster, snapshot).names;
  const actors = new Set([...snapshot.installations, ...snapshot.ambientInstallations]
    .filter(art => art.roundIndex === snapshot.round.index && art.createdAt <= capturedAt)
    .map(art => art.actorId));
  return [...actors].flatMap(id => names.has(id) ? [names.get(id)!] : []);
}

/** Shared line breaks keep the on-screen credit and exported paper in sync. */
export function celebrationPhotoBuilderLines(photo: Pick<CelebrationPhoto, 'builderNames'>): string[] {
  const names = (photo.builderNames ?? []).map(name => name.trim()).filter(Boolean);
  if (!names.length) return [];
  const text = `共建者 · ${names.join(' · ')}`;
  const lines: string[] = []; let line = '', units = 0;
  for (const character of text) {
    const width = /[\u0000-\u007f]/.test(character) ? 1 : 2;
    if (units + width > 82) { lines.push(line.trim()); line = ''; units = 0; }
    line += character; units += width;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

export function createPhotoSession(): PhotoSession {
  return { latestRound: -1, pending: null, displayed: null };
}

export function receiveCelebrationPhoto(state: PhotoSession, photo: CelebrationPhoto, round: PhotoRound | null): PhotoSession {
  if (!round || !Number.isSafeInteger(photo.roundIndex) || photo.roundIndex !== round.index || photo.roundIndex <= state.latestRound ||
      !Number.isFinite(photo.capturedAt) || photo.capturedAt < round.burnAt || photo.capturedAt >= round.ashesAt ||
      !Number.isFinite(round.ashesAt) || photo.dataUrl.length > MAX_FRAME_DATA_LENGTH ||
      !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(photo.dataUrl)) return state;
  // At most two frames survive: the open photo and the newest pending one.
  return { ...state, latestRound: photo.roundIndex, pending: { ...photo, builderNames: photo.builderNames ? [...photo.builderNames] : undefined, ashesAt: round.ashesAt } };
}

export function presentCelebrationPhoto(state: PhotoSession, context: PhotoPresentation): PhotoSession {
  if (state.displayed || !state.pending || !context.active || !context.visible || context.blocked ||
      !Number.isFinite(context.now) || context.now < state.pending.ashesAt) return state;
  return { ...state, displayed: state.pending, pending: null };
}

export function dismissCelebrationPhoto(state: PhotoSession): PhotoSession {
  return state.displayed ? { ...state, displayed: null } : state;
}

export type PolaroidLayout = {
  width: number; height: number; scale: number;
  image: { x: number; y: number; width: number; height: number };
  titleY: number; captionY: number; dateY: number; buildersY: number; builderLineHeight: number;
};

/** Preserve the whole camera frame; bound both the PNG canvas and its paper border. */
export function polaroidLayout(sourceWidth: number, sourceHeight: number, builderLineCount = 0): PolaroidLayout {
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error('Invalid photo dimensions');
  }
  const imageWidth = 960, imageHeight = imageWidth * sourceHeight / sourceWidth;
  const border = 72, lowerBorder = Math.max(260, imageHeight * .22) + Math.max(0, builderLineCount) * 30;
  const width = imageWidth + border * 2, height = imageHeight + border + lowerBorder;
  const scale = Math.min(1, 1800 / height);
  const bottom = (border + imageHeight) * scale;
  return {
    width: Math.round(width * scale), height: Math.round(height * scale), scale,
    image: { x: border * scale, y: border * scale, width: imageWidth * scale, height: imageHeight * scale },
    titleY: bottom + 66 * scale, captionY: bottom + 127 * scale, dateY: bottom + 185 * scale,
    buildersY: bottom + 228 * scale, builderLineHeight: 30 * scale,
  };
}

export function celebrationPhotoDate(capturedAt: number): string {
  const date = new Date(capturedAt);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

export function celebrationPhotoFilename(photo: CelebrationPhoto): string {
  const date = new Date(photo.capturedAt);
  const time = [date.getHours(), date.getMinutes(), date.getSeconds()].map(value => String(value).padStart(2, '0')).join('');
  return `desert-ritual-${celebrationPhotoDate(photo.capturedAt).replaceAll('.', '-')}-${time}.png`;
}

export function paintCelebrationPhoto(context: CanvasRenderingContext2D, image: CanvasImageSource, layout: PolaroidLayout, photo: CelebrationPhoto): void {
  context.fillStyle = '#fffdf7';
  context.fillRect(0, 0, layout.width, layout.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, layout.image.x, layout.image.y, layout.image.width, layout.image.height);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#40392f';
  context.font = `500 ${46 * layout.scale}px "Songti SC", "Noto Serif CJK SC", serif`;
  context.fillText(PHOTO_TITLE, layout.width / 2, layout.titleY, layout.image.width);
  context.fillStyle = '#736c62';
  context.font = `400 ${27 * layout.scale}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  context.fillText(PHOTO_CAPTION, layout.width / 2, layout.captionY, layout.image.width);
  context.fillStyle = '#969084';
  context.font = `400 ${21 * layout.scale}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  context.fillText(`${celebrationPhotoDate(photo.capturedAt)}  ·  火人节 · 即梦`, layout.width / 2, layout.dateY, layout.image.width);
  context.fillStyle = '#969084';
  context.font = `400 ${20 * layout.scale}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  celebrationPhotoBuilderLines(photo).forEach((line, index) => {
    context.fillText(line, layout.width / 2, layout.buildersY + index * layout.builderLineHeight, layout.image.width);
  });
}
