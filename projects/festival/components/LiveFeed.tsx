'use client';

/* Approved SVG and media assets are served verbatim to preserve reference geometry. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AudioLines, Lightbulb, LoaderCircle, LogOut, Maximize, PersonStanding, Radio, ScanEye, SkipBack, SkipForward, Sparkles, UserRoundPlus, Users, Volume2, VolumeX, X } from 'lucide-react';
import ClubScene from './ClubScene';
import ClubJoystick from './ClubJoystick';
import ProfilePage, { getProfileMedia } from './ProfilePage';
import FeedHeart from './FeedHeart';
import FeedActionIcon from './FeedActionIcon';
import { LIVE_WORK_LIKE_KEY, readLiveWorkLiked, saveLiveWorkLiked } from '@/lib/feed-local-likes';
import './FeedInterface.css';
import { MovementClient } from '@/lib/room-movement-client';
import { cancelClickMovement, type ClubManualControl, type ClubMovementSample } from '@/lib/club-manual-motion';
import type { ParticipantMovement } from '@/lib/room-movement';
import PhoneViewport from './PhoneViewport';
import { ClubAudio } from '@/lib/club-audio';
import { CLUB_AVATAR_CATALOG, CLUB_AVATAR_PICKER_OPTIONS, DEFAULT_AVATAR_PRESET } from '@/lib/club-avatar-catalog';
import { CLUB_LIGHT_CATALOG } from '@/lib/club-light-catalog';
import { MUSIC_CATALOG, getTrackTiming } from '@/lib/music-catalog';
import { canNavigateTracks, canUseSharedControls, controlRetryUntil } from '@/lib/music-navigation';
import { musicControlFeedback } from '@/lib/music-control-feedback';
import { createOwnActionPreview, groupActionFeedback, projectOwnAction, settleOwnActionPreview, type OwnActionPreview } from '@/lib/club-action-preview';
import { activePersonalAction } from '@/lib/room-action-state';
import type { ClubCameraMode } from '@/lib/club-camera';
import { INITIAL_ROOM_STATE, RoomClient, RoomRequestError, type RoomClientState, type RoomCommandInput } from '@/lib/room-client';
import { GROUP_ACTION_COOLDOWN_MS, resolveAvatarPreset, type AvatarPreset, type GroupActionKind, type RoomAction, type RoomTrack } from '@/lib/room-types';

const MOVES = [
  { id: 'dance' as const, label: '跳舞' },
  { id: 'bounce' as const, label: '蹦跳' },
  { id: 'spin' as const, label: '转圈' },
  { id: 'wave' as const, label: '后空翻' },
];
const EMOTION_MOVES = [
  { id: 'love' as const, label: '喜欢', emoji: '❤️' },
  { id: 'laugh' as const, label: '大笑', emoji: '🤣' },
  { id: 'punch' as const, label: '挥拳', emoji: '🥊' },
  { id: 'ghost' as const, label: '搞怪', emoji: '👻' },
];
const GROUP_MOVES = [
  { id: 'train' as const, label: '开小火车', description: '绕着 DJ 排队走一圈' },
  { id: 'wave' as const, label: '大浪冲入', description: '巨浪冲进舞池，把大家冲散漂起来' },
  { id: 'unison' as const, label: '集合齐跳', description: '错位方阵，一起蹲跳拍手' },
  { id: 'battle' as const, label: '左右对跳', description: '两队交替后空翻' },
  { id: 'grid' as const, label: '跳格接力', description: '格点接力，错拍后全场齐跳' },
];
const MOODS = CLUB_LIGHT_CATALOG;
const LIVE_WORK_DEMO_LIKE_BASE = 556;
const PREVIEW_TRACK: RoomTrack = { id: MUSIC_CATALOG[0].id, startedAt: 0, durationMs: MUSIC_CATALOG[0].durationMs };
type SheetName = 'actions' | 'join' | 'music' | 'lights' | 'about' | 'credits' | 'invite' | 'notifications' | 'settings' | 'edit-profile' | 'drafts' | 'media' | 'search' | 'create' | 'following' | null;
type AppPage = 'feed' | 'profile';
const formatTime = (milliseconds: number) => `${Math.floor(milliseconds / 60_000)}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, '0')}`;

function Sheet({ title, eyebrow, children, onClose }: { title: string; eyebrow: string; children: ReactNode; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? []);
    (focusables()[0] ?? panel.current)?.focus({ preventScroll: true });
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); if (previous?.isConnected && !previous.closest('[inert], [hidden]')) previous.focus({ preventScroll: true }); };
  }, [onClose]);
  return <div className="sheet-layer">
    <button className="sheet-backdrop" onClick={onClose} aria-label="关闭面板" tabIndex={-1} />
    <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" ref={panel} tabIndex={-1}>
      <div className="sheet-handle" />
      <div className="sheet-heading"><div><h2 id="sheet-title">{title}</h2>{eyebrow && <p className="eyebrow">{eyebrow}</p>}</div><button className="icon-button" onClick={onClose} aria-label="关闭面板"><X size={20} /></button></div>
      {children}
    </div>
  </div>;
}

function SharedProgress({ track, serverOffsetMs, active }: { track: RoomTrack | undefined; serverOffsetMs: number; active: boolean }) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [active]);
  const timing = track && now ? getTrackTiming(track.id, track.startedAt, now + serverOffsetMs) : null;
  return <div className="shared-timeline">
    <div className="timeline-track" role="progressbar" aria-label="所有人共享的歌曲进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((timing?.progress ?? 0) * 100)} aria-valuetext={timing ? `${formatTime(timing.positionMs)}，共 ${formatTime(timing.durationMs)}` : '等待房间连接'}>
      <div className="timeline-fill" style={{ width: `${(timing?.progress ?? 0) * 100}%` }} />
    </div>
    <div className="timeline-caption"><span>{timing ? formatTime(timing.positionMs) : '0:00'}</span><span><Radio size={9} /> 共享节拍</span><span>{track ? formatTime(track.durationMs) : '–:––'}</span></div>
  </div>;
}

export default function LiveFeed() {
  const [room, setRoom] = useState<RoomClientState>(INITIAL_ROOM_STATE);
  const [movements, setMovements] = useState<readonly ParticipantMovement[]>([]);
  const [joystickResetKey, setJoystickResetKey] = useState(0);
  const movementClient = useRef<MovementClient | null>(null);
  const movementControl = useRef<ClubManualControl>({ x: 0, y: 0, active: false, enabled: false, autoRequest: 0, reconcileRequest: 0 });
  const lastMovementSample = useRef<ClubMovementSample | null>(null);
  const pendingAutoRequest = useRef(false);
  const [sheet, setSheet] = useState<SheetName>(null);
  const sheetSession = useRef(0);
  const [page, setPage] = useState<AppPage>('feed');
  const [feedTab, setFeedTab] = useState<'recommended' | 'following'>('recommended');
  const [liked, setLiked] = useState(false);
  const likedRef = useRef(false);
  const displayedLikeCount = LIVE_WORK_DEMO_LIKE_BASE + Number(liked);
  const [panelTitle, setPanelTitle] = useState('');
  const [search, setSearch] = useState('');
  const [statusTime, setStatusTime] = useState('10:30');
  const [name, setName] = useState('');
  const [preset, setPreset] = useState<AvatarPreset>(DEFAULT_AVATAR_PRESET);
  const [toast, setToast] = useState('');
  const [pending, setPending] = useState<RoomCommandInput | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [soundPlaying, setSoundPlaying] = useState(false);
  const [soundLoading, setSoundLoading] = useState(false);
  const [soundError, setSoundError] = useState<string | null>(null);
  const [soundNeedsGesture, setSoundNeedsGesture] = useState(false);
  const [muted, setMuted] = useState(false);
  const [visible, setVisible] = useState(true);
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  const [motionOverride, setMotionOverride] = useState(false);
  const reducedMotion = systemReducedMotion && !motionOverride;
  const [cameraMode, setCameraMode] = useState<ClubCameraMode>('overview');
  const [cameraResetKey, setCameraResetKey] = useState(0);
  const [controlCooldown, setControlCooldown] = useState(0);
  const [actionCooldown, setActionCooldown] = useState(0);
  const [groupCooldown, setGroupCooldown] = useState(0);
  const [actionClientNow, setActionClientNow] = useState(0);
  const [ownActionPreview, setOwnActionPreview] = useState<OwnActionPreview | null>(null);
  const actionToken = useRef(0);
  const actionBlockedUntil = useRef(0);
  const groupBlockedUntil = useRef(0);
  const client = useRef<RoomClient | null>(null);
  const audio = useRef<ClubAudio | null>(null);
  const pendingAction = useRef(false);
  const sharedControlBlockedUntil = useRef(0);
  const previousEvent = useRef<string | null>(null);
  const closeSheet = useCallback(() => { sheetSession.current++; setSheet(null); }, []);
  const snapshot = room.snapshot;
  const self = snapshot?.participants.find(person => person.id === snapshot.self.id);
  const displayedSelf = snapshot ? projectOwnAction(snapshot.participants, snapshot.self.id, ownActionPreview).find(person => person.id === snapshot.self.id) : undefined;
  const actionServerNow = Math.max(actionClientNow, room.lastSyncedAt ?? 0) + room.serverOffsetMs;
  const selectedOwnAction = activePersonalAction(displayedSelf, actionServerNow);
  const joined = snapshot?.self.role === 'participant';
  const ready = room.status === 'live' && !!snapshot;
  const track = MUSIC_CATALOG.find(item => item.id === snapshot?.track.id) ?? MUSIC_CATALOG[0];
  const playlist = snapshot?.playlistOrder?.flatMap(id => {
    const item = MUSIC_CATALOG.find(track => track.id === id);
    return item ? [item] : [];
  }) ?? MUSIC_CATALOG;
  const count = snapshot?.participants.length ?? 0;
  const capacity = snapshot?.capacity ?? 10;
  const full = count >= capacity;
  const ownAvatar = CLUB_AVATAR_CATALOG.find(avatar => avatar.id === resolveAvatarPreset(self?.preset ?? DEFAULT_AVATAR_PRESET)) ?? CLUB_AVATAR_CATALOG[0];
  const groupFeedback = groupActionFeedback(snapshot?.groupAction, actionServerNow);
  const personalActionsReady = ready && joined && !pending && room.pendingCount === 0 && !actionCooldown && !groupFeedback.personalBlocked;
  const groupActionsReady = ready && !pending && room.pendingCount === 0 && !groupCooldown && !groupFeedback.groupBlocked;
  const sharedControlsReady = canUseSharedControls({ ready, pending: Boolean(pending) || room.pendingCount > 0, now: 0, blockedUntil: controlCooldown });
  const trackControlsReady = canNavigateTracks({ ready, pending: Boolean(pending) || room.pendingCount > 0, now: 0, blockedUntil: controlCooldown, trackCount: MUSIC_CATALOG.length });
  const musicFeedback = musicControlFeedback({ changing: pending?.type === 'track' || pending?.type === 'track-step', loading: soundLoading, error: soundError, needsGesture: soundNeedsGesture, pendingRoom: room.pendingCount > 0, coolingDown: controlCooldown > 0 });

  const movementEnabled = Boolean(joined && ready && visible && page === 'feed' && !sheet && !groupFeedback.personalBlocked);
  const onJoystickInput = useCallback((vector: { x: number; y: number }, active: boolean) => {
    if (active && !movementControl.current.active) { cancelClickMovement(movementControl.current); audio.current?.requestPlayback(); }
    movementControl.current.x = vector.x; movementControl.current.y = vector.y; movementControl.current.active = active;
  }, []);
  const onMovementSample = useCallback((sample: ClubMovementSample) => {
    lastMovementSample.current = sample;
    movementClient.current?.offer(sample);
  }, []);
  const stopMovement = useCallback(() => {
    cancelClickMovement(movementControl.current);
    movementControl.current.x = 0; movementControl.current.y = 0; movementControl.current.active = false;
    const sample = lastMovementSample.current;
    if (sample?.mode === 'manual' && (sample.vx !== 0 || sample.vz !== 0 || sample.reason === 'start')) {
      const stopped: ClubMovementSample = { ...sample, vx: 0, vz: 0, reason: 'stop' };
      lastMovementSample.current = stopped;
      movementClient.current?.offer(stopped);
    }
  }, []);
  const openSheet = useCallback((next: SheetName, title = '') => {
    stopMovement();
    sheetSession.current++;
    setPanelTitle(title);
    setSheet(next);
  }, [stopMovement]);
  const selectPage = useCallback((next: AppPage) => {
    stopMovement();
    closeSheet();
    setPage(next);
  }, [closeSheet, stopMovement]);

  useEffect(() => {
    let active = true;
    const loadPreference = () => {
      if (!active) return;
      try { likedRef.current = readLiveWorkLiked(window.localStorage); setLiked(likedRef.current); }
      catch { /* This device may disable local storage entirely. */ }
    };
    queueMicrotask(loadPreference);
    const storageChanged = (event: StorageEvent) => { if (event.key === LIVE_WORK_LIKE_KEY || event.key === null) loadPreference(); };
    window.addEventListener('storage', storageChanged);
    const clock = () => setStatusTime(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }));
    queueMicrotask(() => { if (active) clock(); });
    const timer = setInterval(clock, 60_000);
    return () => { active = false; window.removeEventListener('storage', storageChanged); clearInterval(timer); };
  }, []);

  const toggleLike = () => {
    const next = !likedRef.current;
    likedRef.current = next;
    setLiked(next);
    let persisted = false;
    try { persisted = saveLiveWorkLiked(window.localStorage, next); } catch { /* Optional device preference. */ }
    setToast(!persisted ? '当前设备无法保存点赞；本次浏览仍会保留。' : next ? '已加入「我的 · 点赞」，仅保存在此设备。' : '已取消本机点赞。');
  };

  useEffect(() => {
    movementControl.current.enabled = movementEnabled;
    if (!movementEnabled) stopMovement();
    else if (pendingAutoRequest.current) {
      pendingAutoRequest.current = false;
      movementControl.current.autoRequest++;
    }
  }, [movementEnabled, stopMovement]);

  useEffect(() => {
    const roomId = new URLSearchParams(window.location.search).get('room') || 'main';
    let lastMovementError: string | null = null;
    const movement = new MovementClient({
      serverNow: () => Date.now() + connection.getState().serverOffsetMs,
      onChange: state => {
        setMovements(state.movements);
        if (state.error && state.error !== lastMovementError) setToast(state.error);
        lastMovementError = state.error;
      },
      onReset: reason => {
        cancelClickMovement(movementControl.current);
        movementControl.current.x = 0; movementControl.current.y = 0; movementControl.current.active = false;
        if (reason !== 'epoch') {
          movementControl.current.reconcileStop = reason !== 'superseded';
          movementControl.current.reconcileRequest = (movementControl.current.reconcileRequest ?? 0) + 1;
        }
        lastMovementSample.current = null; pendingAutoRequest.current = false;
        setJoystickResetKey(key => key + 1);
      },
      onRefresh: () => { void connection.refresh().catch(() => undefined); },
    });
    const connection = new RoomClient(roomId === 'soundcheck' ? 'soundcheck' : 'main', { onSnapshot: snapshot => movement.observeSnapshot(snapshot) });
    const player = new ClubAudio({ onStateChange: status => {
      setSoundEnabled(status.unlocked);
      setSoundPlaying(status.playing);
      setSoundLoading(status.loading);
      setSoundError(status.error);
      setSoundNeedsGesture(status.needsGesture);
      setMuted(status.muted);
      if (status.error) setToast('声音加载失败，点声音按钮重试。');
    } });
    player.setVolume(0.65);
    client.current = connection; audio.current = player; movementClient.current = movement;
    player.requestPlayback();
    const unsubscribe = connection.subscribe(() => {
      const next = connection.getState();
      if (next.snapshot) movement.setSnapshot(next.snapshot);
      setRoom(next);
      if (next.snapshot?.self.role !== 'participant' || !next.snapshot.participants.some(person => person.id === next.snapshot?.self.id)) setOwnActionPreview(null);
      const latest = next.snapshot?.events.at(-1);
      if (latest && previousEvent.current && previousEvent.current !== latest.id && latest.actorId !== next.snapshot?.self.id) {
        const messages: Record<string, string> = { join: `${latest.name} 来到了舞池`, leave: `${latest.name} 离开了舞池`, track: `${latest.name} 换了一首歌`, lights: `${latest.name} 改变了灯光` };
        if (messages[latest.type]) setToast(messages[latest.type]);
      }
      if (latest) previousEvent.current = latest.id;
    });
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => { setSystemReducedMotion(motion.matches); setMotionOverride(false); };
    updateMotion(); motion.addEventListener('change', updateMotion);
    const visibility = () => {
      const active = document.visibilityState === 'visible';
      if (!active) stopMovement();
      if (active) setActionClientNow(Date.now());
      setVisible(active); connection.setVisible(active);
    };
    document.addEventListener('visibilitychange', visibility);
    const online = () => { void connection.refresh().catch(() => undefined); };
    window.addEventListener('online', online);
    connection.start();
    return () => {
      stopMovement();
      unsubscribe(); movement.close(); connection.stop(); void player.dispose();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('online', online); motion.removeEventListener('change', updateMotion);
      client.current = null; audio.current = null; movementClient.current = null;
    };
  }, [stopMovement]);

  useEffect(() => {
    if (!snapshot) return;
    audio.current?.setPlaylistOrder(snapshot.playlistOrder);
    audio.current?.setTrack(snapshot.track.id, snapshot.track.startedAt, room.serverOffsetMs);
    audio.current?.setServerOffset(room.serverOffsetMs);
  }, [snapshot, room.serverOffsetMs]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3600);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!controlCooldown) return;
    const timer = setTimeout(() => setControlCooldown(0), Math.max(0, controlCooldown - Date.now()));
    return () => clearTimeout(timer);
  }, [controlCooldown]);

  useEffect(() => {
    if (!actionCooldown) return;
    const timer = setTimeout(() => setActionCooldown(0), Math.max(0, actionCooldown - Date.now()));
    return () => clearTimeout(timer);
  }, [actionCooldown]);

  useEffect(() => {
    if (!groupCooldown) return;
    const timer = setTimeout(() => setGroupCooldown(0), Math.max(0, groupCooldown - Date.now()));
    return () => clearTimeout(timer);
  }, [groupCooldown]);

  useEffect(() => {
    const expiresAt = Math.max(displayedSelf?.actionUntil ?? 0, snapshot?.groupAction ? snapshot.groupAction.endsAt + GROUP_ACTION_COOLDOWN_MS : 0);
    if (!expiresAt) return;
    const update = () => {
      const now = Date.now();
      setActionClientNow(now);
      return now + room.serverOffsetMs;
    };
    if (update() >= expiresAt) return;
    const timer = setInterval(() => { if (update() >= expiresAt) clearInterval(timer); }, 100);
    return () => clearInterval(timer);
  }, [displayedSelf?.actionAt, displayedSelf?.actionUntil, snapshot?.groupAction, room.serverOffsetMs]);

  const coolDownSharedControls = useCallback((retryAfterMs?: number) => {
    const until = controlRetryUntil(Date.now(), retryAfterMs);
    sharedControlBlockedUntil.current = Math.max(sharedControlBlockedUntil.current, until);
    setControlCooldown(sharedControlBlockedUntil.current);
  }, []);

  const requestSoundFromGesture = useCallback((event: { isTrusted: boolean; target: EventTarget | null }) => {
    // Let explicit sound controls own the whole tap. An early pointer unlock can
    // otherwise flush state before click and turn that first enable into a mute.
    if (event.target instanceof Element && event.target.closest('[data-sound-toggle]')) return;
    if (event.isTrusted) audio.current?.requestPlayback();
  }, []);

  const enableSound = () => {
    // This is an explicit sound-control action; ambient gestures never unmute.
    audio.current?.setMuted(false);
    audio.current?.requestPlayback();
  };

  const toggleSound = () => {
    if (muted || !soundEnabled || soundError || soundNeedsGesture) enableSound();
    else audio.current?.setMuted(true);
  };

  const perform = useCallback(async (input: RoomCommandInput, message: string) => {
    const sharedControl = input.type === 'track' || input.type === 'track-step' || input.type === 'lights';
    if (!client.current || pendingAction.current) return null;
    const current = client.current.getState();
    if (sharedControl && !canUseSharedControls({ ready: current.status === 'live' && !!current.snapshot, pending: current.pendingCount > 0, now: Date.now(), blockedUntil: sharedControlBlockedUntil.current })) return null;
    pendingAction.current = true;
    setPending(input);
    try {
      const result = await client.current.command(input);
      if (sharedControl) coolDownSharedControls(1000);
      if (input.type === 'action') {
        actionBlockedUntil.current = Date.now() + 350;
        setActionCooldown(actionBlockedUntil.current);
      }
      if (message) setToast(message);
      return result;
    } catch (error) {
      if (sharedControl && error instanceof RoomRequestError && error.code === 'RATE_LIMITED') coolDownSharedControls(error.retryAfterMs);
      if (error instanceof RoomRequestError && error.code === 'RATE_LIMITED') {
        const until = Date.now() + Math.max(350, error.retryAfterMs ?? 350);
        if (input.type === 'action') { actionBlockedUntil.current = until; setActionCooldown(until); }
        if (input.type === 'group-action') { groupBlockedUntil.current = until; setGroupCooldown(until); }
      }
      setToast(error instanceof RoomRequestError ? ({ RATE_LIMITED: '操作有点快，请稍等片刻再试。', NOT_PARTICIPANT: '请先加入舞池，再使用人物动作或修改形象。', INVALID_COMMAND: '请检查昵称和选项后重试。', UNAVAILABLE: '房间暂时无法连接，请稍后重试。', FORBIDDEN: '请刷新当前页面后重试。' } as Record<string, string>)[error.code] ?? '房间未能完成操作，请稍后重试。' : '操作没能送达房间，请重试。');
      return null;
    } finally { pendingAction.current = false; setPending(null); }
  }, [coolDownSharedControls]);

  const skipTrack = useCallback((direction: -1 | 1) => {
    const current = client.current?.getState();
    if (!current || !canNavigateTracks({ ready: current.status === 'live' && !!current.snapshot, pending: pendingAction.current || current.pendingCount > 0, now: Date.now(), blockedUntil: sharedControlBlockedUntil.current, trackCount: MUSIC_CATALOG.length })) return;
    void perform({ type: 'track-step', direction }, '整个房间一起切换歌曲。');
  }, [perform]);

  const join = async (event: FormEvent) => {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;
    audio.current?.requestPlayback();
    const requestSheetSession = sheetSession.current;
    const result = await perform({ type: joined ? 'profile' : 'join', name: cleanName, preset }, '');
    if (!result) return;
    try { localStorage.setItem('afterhours-profile', JSON.stringify({ name: cleanName, preset })); } catch { /* Optional preference. */ }
    if (sheetSession.current === requestSheetSession) setSheet(currentSheet => currentSheet === 'join' ? null : currentSheet);
    setToast(result.self.role === 'participant' ? (joined ? '形象已更新。' : '加入成功，随音乐动起来。') : '舞池暂时满员，可以先看看，空位出现后再加入。');
  };

  const invite = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', client.current?.roomId ?? 'main');
    try { await navigator.clipboard.writeText(url.toString()); setToast('房间链接已复制，邀请朋友来玩。'); }
    catch {
      if (navigator.share) {
        try { await navigator.share({ title: '来 AFTERHOURS 一起玩', url: url.toString() }); } catch { /* Share was cancelled. */ }
      } else setToast('复制当前网页地址，就能邀请朋友。');
    }
  };

  const showProfile = () => {
    if (self) { setName(self.name); setPreset(resolveAvatarPreset(self.preset)); }
    else {
      try {
        const saved = JSON.parse(localStorage.getItem('afterhours-profile') ?? 'null');
        if (saved?.name && typeof saved.name === 'string') setName(saved.name.slice(0, 24));
        const savedPreset = resolveAvatarPreset(saved?.preset);
        if (CLUB_AVATAR_CATALOG.some(avatar => avatar.id === savedPreset)) setPreset(savedPreset);
      } catch { /* Private browsing may disable storage. Joining still works. */ }
    }
    openSheet('join');
  };
  const chooseMove = useCallback((action: RoomAction) => {
    const current = client.current?.getState();
    const now = Date.now();
    if (!current || current.status !== 'live' || pendingAction.current || current.pendingCount > 0 || now < actionBlockedUntil.current || groupActionFeedback(current.snapshot?.groupAction, now + current.serverOffsetMs).personalBlocked) return;
    const preview = createOwnActionPreview(current.snapshot, action, now + current.serverOffsetMs, ++actionToken.current);
    if (!preview) return;
    setActionClientNow(now);
    setOwnActionPreview(preview);
    closeSheet();
    const messages: Record<RoomAction, string> = { dance: '跟着节拍跳起来。', bounce: '一起蹦起来。', spin: '转个圈，闪亮登场。', wave: '来个后空翻！', love: '送你一颗心。', laugh: '笑得停不下来！', punch: '左右开弓，挥拳出击！', ghost: '出来搞个怪！' };
    void perform({ type: 'action', action }, messages[action]).finally(() => {
      setOwnActionPreview(currentPreview => settleOwnActionPreview(currentPreview, preview.token));
    });
  }, [closeSheet, perform]);
  const chooseGroupMove = useCallback((kind: GroupActionKind) => {
    const current = client.current?.getState();
    const now = Date.now();
    if (!current || current.status !== 'live' || pendingAction.current || current.pendingCount > 0 || now < groupBlockedUntil.current || groupActionFeedback(current.snapshot?.groupAction, now + current.serverOffsetMs).groupBlocked) return;
    const requestSheetSession = sheetSession.current;
    void perform({ type: 'group-action', kind }, '').then(result => {
      if (result && sheetSession.current === requestSheetSession) setSheet(currentSheet => currentSheet === 'actions' ? null : currentSheet);
    });
  }, [perform]);

  const mediaPreview = sheet === 'media' ? getProfileMedia('works', liked).find(item => item.alt === panelTitle) : sheet === 'drafts' ? getProfileMedia('works', liked).find(item => item.kind === 'drafts') : undefined;
  const profilePending = pending?.type === 'join' || pending?.type === 'profile';

  return <main className="app-shell app-shell-v020" onPointerDownCapture={requestSoundFromGesture} onPointerUpCapture={requestSoundFromGesture} onClickCapture={requestSoundFromGesture} onKeyDownCapture={requestSoundFromGesture}>
    <aside className="demo-caption" aria-hidden="true"><span>v0.3.1</span><h1>让互动<br />更近一点。</h1><p>同一段音乐，同一个舞池。<br />随时加入，一起玩。</p></aside>
    <PhoneViewport>
      <section className={`feed-window feed-v020 mood-${snapshot?.lightMode ?? 'neon'} ${joined ? 'joined' : ''}`} aria-label="AFTERHOURS 多人实时舞池">
        <section className={`app-page feed-page ${page !== 'feed' ? 'is-background' : ''}`} aria-label="首页" aria-hidden={page !== 'feed'} inert={page !== 'feed' || !!sheet}>
          <div className="club-stage">
            <ClubScene movements={movements} movementControl={movementControl} onMovementSample={onMovementSample} participants={snapshot?.participants ?? []} ownId={snapshot?.self.id ?? null} track={snapshot?.track ?? PREVIEW_TRACK} serverOffsetMs={room.serverOffsetMs} ownActionPreview={ownActionPreview} groupAction={snapshot?.groupAction} lightMode={snapshot?.lightMode ?? 'neon'} lightCycle={snapshot?.lightCycle} enabled={visible} reducedMotion={reducedMotion} cameraMode={cameraMode} cameraResetKey={cameraResetKey} />
          </div>
          <div className="stage-top-shade" />
          <div className="stage-bottom-shade" />
          <header className="feed-header">
            <div className="feed-tabs" role="tablist" aria-label="动态分类">
              <button role="tab" aria-selected={feedTab === 'following'} onClick={() => { setFeedTab('following'); openSheet('following'); }}>关注</button>
              <button role="tab" aria-selected={feedTab === 'recommended'} onClick={() => { setFeedTab('recommended'); closeSheet(); }}>推荐</button>
            </div>
            <button className="header-icon bell" onClick={() => openSheet('notifications')} aria-label="通知"><img src="/feed-ui/icons/bell.svg" alt="" /></button>
            <button className="header-icon search" onClick={() => openSheet('search')} aria-label="搜索"><img src="/feed-ui/icons/search.svg" alt="" /></button>
          </header>
          {systemReducedMotion && <button className="motion-preference" aria-pressed={motionOverride} onClick={() => setMotionOverride(value => !value)} title="你的系统偏好减少动态；只改变当前页面的舞者与灯光"><span>{motionOverride ? '动效已开启' : '已减少动态'}</span><b>{motionOverride ? '恢复减少动态' : '开启动效'}</b></button>}
          {groupFeedback.personalBlocked && <div className="group-action-status" role="status" aria-live="polite">{groupFeedback.message}</div>}
          <div className="creator-caption">
            <div className="creator-copy">
              <div className="creator-line"><button className="creator-name" onClick={() => selectPage('profile')}>@苏贝壳</button><span className={`live-tag feed-live-tag ${room.status !== 'live' ? 'is-connecting' : ''}`} role="status" aria-label={`${room.status === 'live' ? '实时' : room.status === 'connecting' ? '连接中' : '重新连接'}，在线 ${count} 人，最多 ${capacity} 人`}><i /><span>{room.status === 'live' ? '实时' : room.status === 'connecting' ? '连接中' : '重连中'}</span><span className="status-separator" aria-hidden="true">·</span><span title="热度 828 为固定演示值">热度 828</span><span className="status-separator" aria-hidden="true">·</span><span>在线 {count}</span></span></div>
              <p title={full ? '舞池满员，也欢迎你先看看。' : count === 0 ? '🪩 闪亮舞池，等你登场' : undefined}>来加入我们，一起蹦迪吧！</p>
            </div>
            <button className="feed-like" type="button" aria-pressed={liked} aria-label={`${liked ? '取消点赞' : '点赞'}，展示${displayedLikeCount}次赞，含${LIVE_WORK_DEMO_LIKE_BASE}示例基础值`} title={`${LIVE_WORK_DEMO_LIKE_BASE}为示例基础值；你的点赞只保存在此设备，可从「我的 · 点赞」返回舞池`} onClick={toggleLike}><FeedHeart /><span className="feed-like-count">{displayedLikeCount}</span></button>
          </div>
          {room.error && <div className="connection-warning" role="alert"><span>{room.error.includes('Too many new devices') ? '暂时有较多设备加入，请稍等一分钟。' : '连接暂时中断，正在重试。'}{snapshot ? ' 当前显示上次的房间状态。' : ''}</span><button onClick={() => void client.current?.refresh().catch(() => undefined)}>重试</button></div>}
          <section className="lower-controls" aria-label="音乐与舞池互动控制">
            <div className="music-row" aria-busy={musicFeedback.busy}>
              <button className="track-title" onClick={() => openSheet('music')} aria-label={`打开歌曲列表，${musicFeedback.message ?? (snapshot ? track.title : '正在进入房间')}`}><span className="music-glyph" aria-hidden="true">{musicFeedback.busy ? <LoaderCircle size={14} className="spin" /> : '♫'}</span><span className="track-name">{snapshot ? track.title : '正在进入房间…'}</span><span className="tiny-chevron" aria-hidden="true" /></button>
              <div className="music-buttons" role="group" aria-label="共享歌曲控制">
                <button className="music-btn" disabled={!trackControlsReady} onClick={() => skipTrack(-1)} aria-label="上一首共享歌曲" title="上一首 · 整个房间一起切换">{pending?.type === 'track-step' && pending.direction === -1 ? <LoaderCircle className="spin" /> : <SkipBack fill="currentColor" />}</button>
                <button className="music-btn" disabled={!trackControlsReady} onClick={() => skipTrack(1)} aria-label="下一首共享歌曲" title="下一首 · 整个房间一起切换">{pending?.type === 'track-step' && pending.direction === 1 ? <LoaderCircle className="spin" /> : <SkipForward fill="currentColor" />}</button>
                <button data-sound-toggle className="music-btn sound-control" onClick={toggleSound} aria-pressed={soundPlaying} aria-label={muted ? '开启声音，当前已静音' : soundError ? '重试声音，音乐加载失败' : !soundEnabled || soundNeedsGesture ? '开启声音' : soundLoading ? '静音，正在准备音乐' : soundPlaying ? '静音，声音已开启' : '静音，等待播放'}>{soundPlaying ? <Volume2 /> : <VolumeX />}</button>
              </div>
              <SharedProgress track={snapshot?.track} serverOffsetMs={room.serverOffsetMs} active={visible} />
              <span className="sr-only" role="status" aria-live="polite">{musicFeedback.message}</span>
            </div>
            <div className="interaction-dock">
              {joined && self && <ClubJoystick onInput={onJoystickInput} enabled={movementEnabled} resetKey={joystickResetKey} onStop={stopMovement} />}
              <button className="join-control" onClick={showProfile} disabled={!ready || !!pending} aria-label={joined && self ? `修改你的形象，${self.name}` : full ? '舞池已满，选择形象等待加入' : '加入舞池'}>{joined ? <span className="joined-avatar" aria-hidden="true" style={ownAvatar.previewImage ? { backgroundImage: `url("${ownAvatar.previewImage}")` } : undefined}>{ownAvatar.previewImage ? null : ownAvatar.previewIcon}</span> : <UserRoundPlus className="join-icon" />}<span className="join-label">{joined ? '我的分身' : '加入舞池'}</span></button>
              <button className="dock-control action-menu-button" aria-label="打开动作菜单" aria-haspopup="dialog" aria-expanded={sheet === 'actions'} aria-busy={pending?.type === 'action' || pending?.type === 'group-action'} onClick={() => openSheet('actions')} disabled={!ready}>{pending?.type === 'action' || pending?.type === 'group-action' ? <LoaderCircle className="spin" /> : <PersonStanding />}<span>{pending?.type === 'action' ? '同步中' : '动作'}</span></button>
              <button className="dock-control" onClick={() => openSheet('lights')} aria-label="选择房间灯光"><Lightbulb /><span>灯光</span></button>
              <button className="dock-control camera-control" type="button" onClick={() => { setCameraMode(mode => mode === 'overview' ? 'third-person' : 'overview'); setCameraResetKey(value => value + 1); }} aria-label={cameraMode === 'overview' ? '切换到沉浸视角' : '切换到全景视角'} title={cameraMode === 'overview' ? joined ? '切换到沉浸视角：从身后跟随你的角色' : '切换到沉浸视角：从身后跟随 DJ 凤头鹦鹉' : '切换到全景视角：舞池尽收眼底'}>{cameraMode === 'overview' ? <ScanEye aria-hidden="true" /> : <Maximize aria-hidden="true" />}<span>{cameraMode === 'overview' ? '沉浸' : '全景'}</span></button>
            </div>
          </section>
        </section>
        <div className="profile-mount" hidden={page !== 'profile'} inert={!!sheet}><ProfilePage liked={liked} onOpenFeed={() => selectPage('feed')} onOpenPanel={openSheet} onManageAvatar={showProfile} /></div>
        <div className="status-bar" aria-hidden="true"><span className="status-time">{statusTime}</span><div className="status-symbols"><img className="signal" src="/feed-ui/icons/signal.svg" alt="" /><img className="wifi" src="/feed-ui/icons/wifi.svg" alt="" /><img className="battery" src="/feed-ui/icons/battery.svg" alt="" /></div></div>
        <nav className="bottom-nav" aria-label="主导航"><button className={page === 'feed' ? 'selected' : ''} aria-current={page === 'feed' ? 'page' : undefined} onClick={() => selectPage('feed')}>首页</button><button className="create-button" onClick={() => openSheet('create')} aria-label="创建"><img src="/feed-ui/icons/plus.svg" alt="" /></button><button className={page === 'profile' ? 'selected' : ''} aria-current={page === 'profile' ? 'page' : undefined} onClick={() => selectPage('profile')}>我的</button></nav>

        {sheet === 'actions' && <Sheet eyebrow="" title="动作" onClose={closeSheet}>
          <div className="personal-actions-grid option-grid" role="group" aria-label="个人动作与表情">
            <div className="move-controls" role="group" aria-label="选择你的舞蹈动作">{MOVES.map(({ id, label }) => <button key={id} className={`move-button option-card ${selectedOwnAction === id ? 'selected' : ''}`} disabled={!personalActionsReady} aria-pressed={selectedOwnAction === id} onClick={() => chooseMove(id)}><span className="option-icon"><FeedActionIcon kind={id} /></span><span>{label}</span></button>)}</div>
            <div className="emotion-controls" role="group" aria-label="选择你的表情动作">{EMOTION_MOVES.map(({ id, label, emoji }) => <button key={id} type="button" className={`emotion-button option-card ${selectedOwnAction === id ? 'selected' : ''}`} disabled={!personalActionsReady} aria-label={label} title={label} aria-pressed={selectedOwnAction === id} onClick={() => chooseMove(id)}><span className="option-icon" aria-hidden={true}>{emoji}</span><span>{label}</span></button>)}</div>
          </div>
          {!joined && <button className="actions-join" onClick={showProfile} disabled={!ready || !!pending}>加入舞池后使用</button>}
          <h3 id="group-actions-title">一起玩</h3>
          <div className="option-grid group-grid" role="group" aria-labelledby="group-actions-title" title="围观也能发起">{GROUP_MOVES.map(({ id, label, description }) => <button key={id} className="option-card group-move-button" disabled={!groupActionsReady} title={description} aria-label={`${label}，${description}`} onClick={() => chooseGroupMove(id)}><span className="option-icon">{pending?.type === 'group-action' && pending.kind === id ? <LoaderCircle className="spin" /> : <FeedActionIcon kind={id} group />}</span><span>{label}</span></button>)}</div>
          {(pending?.type === 'action' || pending?.type === 'group-action' || groupFeedback.message || groupCooldown > 0 || actionCooldown > 0) && <p className="sheet-note action-feedback" role="status" aria-live="polite">{pending?.type === 'group-action' ? '正在邀请整个舞池…' : pending?.type === 'action' ? '正在同步动作…' : groupFeedback.message ?? (groupCooldown ? '大家歇一拍，稍后再发起。' : '稍等一拍，就能再换动作。')}</p>}
        </Sheet>}
        {sheet === 'join' && <Sheet eyebrow="今天，你想成为谁？" title={joined ? '我的分身' : '选个分身，加入舞池'} onClose={closeSheet}>
          <form onSubmit={join} className="join-form">
            <div className="avatar-options option-grid avatar-grid" role="group" aria-label="选择形象">{CLUB_AVATAR_PICKER_OPTIONS.map(avatar => <button key={avatar.id} type="button" className={`avatar-option option-card ${avatar.category === 'human' ? 'avatar-option-human' : ''} ${preset === avatar.id ? 'selected' : ''}`} aria-label={avatar.label} aria-pressed={preset === avatar.id} onClick={() => setPreset(avatar.id)}><span className="avatar-preview" aria-hidden="true" style={avatar.previewImage ? { backgroundImage: `url("${avatar.previewImage}")` } : undefined}>{avatar.previewImage ? null : avatar.previewIcon}</span><small>{avatar.label}</small></button>)}</div>
            <label className="field-label" htmlFor="nickname">怎么称呼你？</label><input className="nickname-input" id="nickname" name="nickname" placeholder="你的昵称" value={name} onChange={event => setName(event.target.value)} maxLength={24} required autoComplete="nickname" pattern="[^<>]+" />
            <button className="join-button primary-button" type="submit" disabled={!name.trim() || !!pending || !ready} aria-busy={profilePending}><span className="profile-submit-content"><span className="profile-submit-label">{joined ? '保存形象' : full ? '试试加入舞池' : '加入舞池'}</span><span className="profile-submit-status" aria-hidden="true">{profilePending && <LoaderCircle size={17} className="spin" />}</span></span></button>
            <p className="privacy-note">{joined ? '房间里的所有人都能看到你的昵称和形象。' : full ? `当前 ${count}/${capacity} 人。满员时继续围观，有空位后可再加入。` : '无需注册。昵称和分身公开显示，音乐可随时静音。'}</p>
            {joined && <><button className="auto-roam-button" type="button" disabled={!ready || !!pending || groupFeedback.personalBlocked} onClick={() => { pendingAutoRequest.current = true; selectPage('feed'); }}><PersonStanding size={16} />恢复自动漫游</button><button className="list-row" type="button" onClick={() => openSheet('invite')}>邀请好友<span className="row-end">›</span></button><button type="button" className="leave-button list-row danger" disabled={!!pending} onClick={() => { const requestSheetSession = sheetSession.current; stopMovement(); void perform({ type: 'leave' }, '你已退出舞池，还能继续听歌、切歌和换灯光。').then(result => { if (result && sheetSession.current === requestSheetSession) setSheet(currentSheet => currentSheet === 'join' ? null : currentSheet); }); }}><LogOut size={15} />退出舞池<span className="row-end">›</span></button></>}
          </form>
        </Sheet>}
        {sheet === 'music' && <Sheet eyebrow="共享同一段节拍" title="正在播放" onClose={closeSheet}><p className="sheet-description" role="status" aria-live="polite">{musicFeedback.message ?? `${MUSIC_CATALOG.length} 首歌曲，随机顺序、共享进度。围观时也能换歌。`}</p><div className="track-list music-list">{playlist.map((item, index) => <button key={item.id} className={`track-option list-row ${snapshot?.track.id === item.id ? 'selected' : ''}`} disabled={!trackControlsReady || snapshot?.track.id === item.id} aria-pressed={snapshot?.track.id === item.id} onClick={() => { const requestSheetSession = sheetSession.current; void perform({ type: 'track', trackId: item.id }, `房间已切换至 ${item.title}。`).then(result => { if (result && sheetSession.current === requestSheetSession) setSheet(currentSheet => currentSheet === 'music' ? null : currentSheet); }); }}><span className="music-number">{snapshot?.track.id === item.id ? '♫' : String(index + 1).padStart(2, '0')}</span><span className="music-item-title"><b>{item.title}</b><small>{item.artist} · {item.bpm} BPM</small></span>{pending?.type === 'track' && pending.trackId === item.id ? <LoaderCircle size={17} className="spin" /> : snapshot?.track.id === item.id ? <AudioLines size={17} /> : null}</button>)}</div><SharedProgress track={snapshot?.track} serverOffsetMs={room.serverOffsetMs} active={visible} /><p className="privacy-note">音乐 · 共享节拍 · <a href="/audio/CREDITS.txt" target="_blank" rel="noreferrer">来源与授权信息</a></p></Sheet>}
        {sheet === 'lights' && <Sheet eyebrow="给此刻换一种氛围" title="舞池灯光" onClose={closeSheet}><div className="mood-list option-grid light-grid">{MOODS.map(mood => <button key={mood.id} className={`mood-option option-card light-option ${snapshot?.lightMode === mood.id ? 'selected' : ''}`} disabled={!sharedControlsReady} aria-pressed={snapshot?.lightMode === mood.id} title={mood.description} onClick={() => { const requestSheetSession = sheetSession.current; void perform({ type: 'lights', lightMode: mood.id }, `舞池已切换为${mood.label}灯光。`).then(result => { if (result && sheetSession.current === requestSheetSession) setSheet(currentSheet => currentSheet === 'lights' ? null : currentSheet); }); }}><span className={`light-swatch swatch-${mood.id}`} /><span>{mood.label}</span></button>)}</div><p className="sheet-note">围观时也能选灯光。60 秒没人调整，会自动切换下一种。</p></Sheet>}
        {sheet === 'invite' && <Sheet eyebrow="把快乐的这一刻分享出去" title="邀请好友" onClose={closeSheet}><div className="invite-card"><img src="/feed-ui/archive-placeholder.svg" alt="" /><strong>来和我们一起蹦迪</strong><p>音乐已就位，就差你了。</p></div><button className="primary-button" onClick={() => void invite()}>复制舞池邀请链接</button><p className="sheet-note">朋友打开同一链接，即可进入此实时房间。</p></Sheet>}
        {sheet === 'notifications' && <Sheet eyebrow="当前房间的最近动态" title="通知" onClose={closeSheet}>{snapshot?.events.length ? <div className="notification-list">{[...snapshot.events].reverse().slice(0, 8).map(event => <div className="list-row" key={event.id}><span>{event.name} · {({ join: '加入舞池', leave: '离开舞池', track: '切换了歌曲', lights: '调整了灯光', action: '换了一个动作', 'group-action': '发起一起玩', profile: '更新了分身' } as Record<string, string>)[event.type] ?? '舞池互动'}</span></div>)}</div> : <p className="preview-placeholder">暂时没有舞池动态。新朋友加入后，会显示在这里。</p>}<p className="sheet-note">仅显示本房间动态，没有接入账号通知。</p></Sheet>}
        {sheet === 'search' && <Sheet eyebrow="搜索当前舞池、在线分身与歌单" title="搜索" onClose={closeSheet}><input className="search-input" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索分身或歌曲" aria-label="搜索内容" /><button className="list-row" onClick={() => selectPage('feed')}><span>苏贝壳的实时舞池</span><span className="row-end">在线 {count} ›</span></button>{(snapshot?.participants ?? []).filter(person => search.trim() && person.name.toLowerCase().includes(search.trim().toLowerCase())).map(person => <button className="list-row" key={person.id} onClick={() => { selectPage('feed'); setToast(`${person.name} 正在舞池里。`); }}>{person.name}<span className="row-end">在线分身 ›</span></button>)}{MUSIC_CATALOG.filter(item => search.trim() && item.title.toLowerCase().includes(search.trim().toLowerCase())).map(item => <button className="list-row" key={item.id} onClick={() => openSheet('music')}>{item.title}<span className="row-end">歌单 ›</span></button>)}<p className="sheet-note">当前 Demo 只搜索这个房间中的内容。</p></Sheet>}
        {sheet === 'create' && <Sheet eyebrow="让你的分身先登场" title="开始创作" onClose={closeSheet}><button className="list-row" onClick={() => { selectPage('feed'); showProfile(); }}>选择我的分身<span className="row-end">＋</span></button><button className="list-row" onClick={() => selectPage('feed')}>进入实时舞池<span className="row-end">›</span></button><p className="sheet-note">当前版本提供实时舞池，视频创作尚未接入。</p></Sheet>}
        {sheet === 'following' && <Sheet eyebrow="" title="关注" onClose={closeSheet}><p className="preview-placeholder">当前 Demo 只有这个实时舞池，暂未接入账号关注关系。</p><button className="primary-button" onClick={() => { setFeedTab('recommended'); closeSheet(); }}>回到推荐舞池</button></Sheet>}
        {sheet === 'settings' && <Sheet eyebrow="" title="设置" onClose={closeSheet}><button className="list-row" onClick={() => openSheet('edit-profile')}>资料与分身<span className="row-end">›</span></button><button className="list-row" onClick={() => openSheet('about')}>关于实时舞池<span className="row-end">›</span></button><div className="list-row">版本<span className="row-end">v0.3.1</span></div><p className="sheet-note">点赞仅保存在此设备；个人主页的统计和媒体为界面示例。</p></Sheet>}
        {sheet === 'edit-profile' && <Sheet eyebrow="" title="资料与分身" onClose={closeSheet}><div className="invite-card"><img src="/feed-ui/archive-placeholder.svg" alt="示例主页头像" /><strong>Demo 用户</strong><p>来和我一起蹦迪吧</p></div><button className="primary-button" onClick={showProfile}>编辑舞池昵称与分身</button><p className="sheet-note">上方为示例主页。舞池昵称与分身会真实同步到当前房间，无需账号。</p></Sheet>}
        {sheet === 'credits' && <Sheet eyebrow="参考界面的示例数据" title="我的积分" onClose={closeSheet}><div className="invite-card"><strong>527</strong><p>示例积分</p></div><p className="sheet-note">没有接入积分账户、充值或消费功能。</p></Sheet>}
        {(sheet === 'drafts' || sheet === 'media') && <Sheet eyebrow="参考界面的示例内容" title={panelTitle || (sheet === 'drafts' ? '草稿箱' : '作品预览')} onClose={closeSheet}><>{mediaPreview && <img className="media-preview-image" src={mediaPreview.src} alt={mediaPreview.alt} />}</><p className="preview-placeholder">{sheet === 'drafts' ? '主页保留了参考设计的 2 份草稿展示。' : '此项目为主页布局中的示例内容。'}</p><p className="sheet-note">当前没有接入作品账号或媒体播放服务。实时舞池可以直接体验。</p><button className="primary-button" onClick={() => selectPage('feed')}>进入实时舞池</button></Sheet>}
        {sheet === 'about' && <Sheet eyebrow="欢迎来到 AFTERHOURS" title="一起待一会儿。" onClose={closeSheet}><p className="sheet-description about-copy">一个小小的在线舞池。随时进来，跟着节拍，遇见此刻在线的人。</p><div className="about-facts"><p><Users size={18} /><span>最多 10 人同时跳舞。围观也能切歌和换灯光，出现空位后再加入。</span></p><p><Radio size={18} /><span>音乐进度、人物动作和灯光，在各个设备之间同步。</span></p><p><Sparkles size={18} /><span>昵称在房间内公开。无需账号，也不需要麦克风。</span></p></div><button className="primary-button" onClick={() => void invite()}>邀请朋友</button><p className="privacy-note">v0.3.1 · 多人实时舞池</p></Sheet>}
        {toast && <div className="feed-toast" role="status" aria-live="polite">{toast}</div>}
      </section>
    </PhoneViewport>
  </main>;
}
