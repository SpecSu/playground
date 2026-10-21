'use client';

import { observeAvatarDraw } from '@/lib/club-avatar-render-receipt';
import type { AvatarRenderRequest, AvatarRenderReceipt } from '@/lib/club-avatar-submission';


import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { LightMode, Participant, RoomTrack, GroupAction, RoomLightCycle } from '@/lib/room-types';
import { lightModeAt } from '@/lib/room-lighting';
import { pixelRatio } from '@/lib/club-scene-math';
import { CLUB_AVATAR_SCALE } from '@/lib/club-avatar-scale';
import { ClubCameraController, DEFAULT_CAMERA_ORBIT, createCameraObstacle, dragCameraOrbit, projectCameraLabel, projectFollowNameplate, avatarLabelAnchor, type ClubCameraMode, type CameraObstacle, danceStageCameraPose, CAMERA_FOV } from '@/lib/club-camera';
import { makeClubWorld, type AvatarRig } from '@/lib/club-scene-world';
import { createClubAvatar } from '@/lib/club-avatar-rig';
import { createClubTidalWave } from '@/lib/club-tidal-wave';
import { projectOwnAction, type OwnActionPreview } from '@/lib/club-action-preview';
import { emotionBubbleAt, emotionBubbleAnchor, projectEmotionBubble } from '@/lib/club-emotion-bubble';
import { chatAt } from '@/lib/room-chat';
import { chatBubbleLayout, type ChatBubbleCandidate } from '@/lib/club-chat-bubble';
import { createClubSelfMarker } from '@/lib/club-self-marker';
import { FloorPointerGesture, pickClubFloor } from '@/lib/club-floor-input';
import { cancelClickMovement, movementVectorFromCamera, shouldEmitMovementSample, shouldStopMovementSample, type ClubManualControl, type ClubMovementSample } from '@/lib/club-manual-motion';
import type { ParticipantMovement } from '@/lib/room-movement';
import { graphicsFailureMessage, type GraphicsFailureReason, type GraphicsState } from '@/lib/club-scene-diagnostics';

import { dancePresentationActive } from '@/lib/dance-curtain-call';
import type { DanceRound } from '@/lib/dance-machine';
import { ClubDanceStaging, danceStageActive, danceStageTiming, danceStagePosition, type DanceStageFeedback } from '@/lib/club-dance-staging';

export interface ClubSceneProps {
  participants: readonly Participant[];
  ownId: string | null;
  /** A stale disconnected snapshot must not advertise an active local identity. */
  selfMarkerEnabled?: boolean;
  presentationVisible?: boolean;
  avatarRenderRequest?: AvatarRenderRequest | null;
  onAvatarRendered?: (receipt: AvatarRenderReceipt) => void;
  track: RoomTrack;
  serverOffsetMs: number;
  ownActionPreview?: OwnActionPreview | null;
  groupAction?: GroupAction | null;
  danceRound?: DanceRound | null;
  danceFeedback?: DanceStageFeedback | null;
  /** A genuine rendered scene image, captured before the shared round finishes. */
  onDanceSnapshot?: (roundId: string, dataUrl: string) => void;
  movements?: readonly ParticipantMovement[];
  movementControl?: { current: ClubManualControl };
  onMovementSample?: (sample: ClubMovementSample) => void;
  lightMode: LightMode;
  lightCycle?: RoomLightCycle;
  enabled?: boolean;
  reducedMotion?: boolean;
  cameraMode?: ClubCameraMode;
  cameraResetKey?: number;
  /** Reserved for API compatibility; name tags are passive. Profile editing lives in the app UI. */
  onAvatarClick?: (id: string) => void;
  className?: string;
}

/** One canvas, shared-clock choreography, local camera choices and passive projected name tags. */
export default function ClubScene(props: ClubSceneProps) {
  const { enabled = true, className } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  const [graphics, setGraphics] = useState<GraphicsState>({ status: 'initializing', reason: null });
  const failureCopy = graphics.status === 'failed' ? graphicsFailureMessage(graphics.reason) : null;
  const [retry, setRetry] = useState(0);
  const [avatarStatus, setAvatarStatus] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => { latest.current = props; }, [props]);

  useEffect(() => {
    const host = hostRef.current;
    const labelsHost = labelsRef.current;
    if (!host || !labelsHost || !enabled) return;

    let alive = true;
    let frame = 0;
    let renderer: THREE.WebGLRenderer | undefined;
    let world: ReturnType<typeof makeClubWorld> | undefined;
    let selfMarker: ReturnType<typeof createClubSelfMarker> | undefined;
    let tidalWave: ReturnType<typeof createClubTidalWave> | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let lost = false;
    let hasRendered = false;
    let initializationPhase: GraphicsFailureReason = 'context-unavailable';
    queueMicrotask(() => {
      if (alive && !lost) {
        setGraphics({ status: 'initializing', reason: null });
        setAvatarStatus('loading');
      }
    });
    let width = 1;
    let height = 1;
    let lastAvatarRequestToken: number | undefined;
    let reportedAvatarToken: number | undefined;
    let previousParticipants: readonly Participant[] | undefined;
    let previousOwnId: string | null | undefined;
    let previousActionPreview: OwnActionPreview | null | undefined;
    let lastDraw = -Infinity;
    let previousVisualRevision = -1;
    let previousMovements: readonly ParticipantMovement[] | undefined;
    let manualGesture = false;
    let manualHeadingLock: number | undefined;
    const gestureForward = new THREE.Vector3(0, 0, -1);
    let lastMovementSample: ClubMovementSample | undefined;
    let lastMovementGeneration = '';
    const movementGeneration = () => {
      const current = latest.current;
      const membership = current.participants.find(person => person.id === current.ownId)?.joinedAt ?? '';
      return `${current.ownId}:${membership}:${current.groupAction?.id ?? ''}:${current.movementControl?.current.reconcileRequest ?? 0}`;
    };
    const emitMovement = (sample: ClubMovementSample) => {
      const generation = movementGeneration();
      if (!shouldEmitMovementSample(lastMovementSample, sample, generation !== lastMovementGeneration)) return;
      lastMovementGeneration = generation;
      lastMovementSample = sample;
      latest.current.onMovementSample?.(sample);
    };
    const stopMovement = () => {
      const control = latest.current.movementControl?.current;
      if (control) { cancelClickMovement(control); control.active = false; control.x = 0; control.y = 0; }
      cancelCameraPointer(); touchPointers.clear();
      manualGesture = false; manualHeadingLock = undefined;
      const generation = movementGeneration();
      if (generation !== lastMovementGeneration) {
        lastMovementSample = undefined;
        lastMovementGeneration = generation;
      } else if (shouldStopMovementSample(lastMovementSample, true)) {
        emitMovement({ ...lastMovementSample!, vx: 0, vz: 0, reason: 'stop' });
      }
    };
    const onMovementVisibility = () => { if (document.hidden) stopMovement(); };
    window.addEventListener('blur', stopMovement);
    document.addEventListener('visibilitychange', onMovementVisibility);
    const cameras = new ClubCameraController();
    const danceStage = new ClubDanceStaging();
    const danceCamera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.08, 80);
    let wasDanceActive = false;
    let capturedRoundId: string | null = null;
    let captureFailedRoundId: string | null = null;
    let lastDanceFrame: { id: string; dataUrl: string } | null = null;
    let lastDanceCaptureAt = -Infinity;
    const isDanceActive = () => dancePresentationActive(latest.current.danceRound, Date.now() + latest.current.serverOffsetMs);
    let camera: THREE.OrthographicCamera | THREE.PerspectiveCamera = cameras.overview;
    let orbit = { ...DEFAULT_CAMERA_ORBIT };
    let lastCameraReset = latest.current.cameraResetKey;
    let lastCameraMode = latest.current.cameraMode;
    const cameraObstacles: CameraObstacle[] = [];
    const tags = new Map<string, HTMLSpanElement>();
    const emotionBubbles = new Map<string, HTMLSpanElement>();
    const chatBubbles = new Map<string, HTMLSpanElement>();
    const projected = new THREE.Vector3();
    const bubbleProjected = new THREE.Vector3();
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', '人物、动物和小怪兽跟随共享节奏跳舞的 3D 舞池');
    canvas.setAttribute('aria-description', '加入后轻点地板走过去；按住拖动或使用方向键转动本地视角。Home 键重置视角，Escape 键停止行走。');
    canvas.setAttribute('role', 'img');
    canvas.tabIndex = 0;
    Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block', touchAction: 'pinch-zoom', cursor: 'grab' });
    const gesture = new FloorPointerGesture();
    const touchPointers = new Set<number>();
    let pointerGeneration = '';
    let pointerCanWalk = false;
    const inputGeneration = () => `${movementGeneration()}:${latest.current.cameraMode}:${latest.current.cameraResetKey}:${latest.current.movementControl?.current.cancelRequest ?? 0}:${latest.current.movementControl?.current.enabled}`;
    const cancelCameraPointer = () => {
      const id = gesture.pointerId;
      gesture.cancel(); pointerCanWalk = false;
      if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      canvas.style.cursor = 'grab';
    };
    // Observe additional fingers even when their other target is a DOM control.
    // These capture listeners never prevent browser gestures or steal UI events.
    const onDocumentPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') touchPointers.add(event.pointerId);
      if (gesture.pointerId !== null && event.pointerId !== gesture.pointerId) cancelCameraPointer();
    };
    const onDocumentPointerEnd = (event: PointerEvent) => { touchPointers.delete(event.pointerId); };
    const onPointerDown = (event: PointerEvent) => {
      if (isDanceActive() || event.pointerType === 'touch' && touchPointers.size > 1 || !gesture.begin(event)) return;
      const control = latest.current.movementControl?.current;
      pointerCanWalk = Boolean(control?.enabled && !control.active);
      pointerGeneration = inputGeneration();
      canvas.setPointerCapture(event.pointerId);
      canvas.focus({ preventScroll: true });
    };
    const onPointerMove = (event: PointerEvent) => {
      if (isDanceActive() || pointerGeneration !== inputGeneration()) { cancelCameraPointer(); return; }
      const delta = gesture.move(event);
      if (!delta) return;
      const bounds = canvas.getBoundingClientRect();
      const logicalScale = width / Math.max(1, bounds.width);
      orbit = dragCameraOrbit(orbit, delta.x * logicalScale, delta.y * logicalScale);
      canvas.style.cursor = 'grabbing';
    };
    const onPointerEnd = (event: PointerEvent) => {
      if (gesture.pointerId !== event.pointerId) return;
      const bounds = canvas.getBoundingClientRect();
      const point = gesture.end(event, bounds);
      // Clear the gesture before release: its normal lostcapture is not a cancel.
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      canvas.style.cursor = 'grab';
      const snapshot = latest.current, control = snapshot.movementControl?.current;
      if (isDanceActive() || !point || !pointerCanWalk || pointerGeneration !== inputGeneration() || !alive || lost || !hasRendered || !world || !control?.enabled || control.active || !snapshot.ownId || !world.players.get(snapshot.ownId)?.root.visible || snapshot.groupAction && Date.now() + snapshot.serverOffsetMs < snapshot.groupAction.endsAt) return;
      const target = pickClubFloor(point, bounds, camera, world.floor, world.getFloorPickBlockers());
      if (!target) return;
      control.targetSequence = (control.targetSequence ?? 0) + 1;
      control.targetRequest = { ...target, sequence: control.targetSequence, cancelGeneration: control.cancelRequest ?? 0 };
    };
    const onPointerCancel = (event: PointerEvent) => { if (gesture.pointerId === event.pointerId) cancelCameraPointer(); };
    const onLostCapture = (event: PointerEvent) => { if (gesture.pointerId === event.pointerId) cancelCameraPointer(); };
    const onCameraKey = (event: KeyboardEvent) => {
      if (isDanceActive()) return;
      const movement: Record<string, [number, number]> = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, 20], ArrowDown: [0, -20] };
      if (event.key === 'Escape') { stopMovement(); event.preventDefault(); }
      else if (event.key === 'Home') { cancelCameraPointer(); orbit = { ...DEFAULT_CAMERA_ORBIT }; cameras.reset(); event.preventDefault(); }
      else if (movement[event.key]) { cancelCameraPointer(); orbit = dragCameraOrbit(orbit, ...movement[event.key]); event.preventDefault(); }
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerEnd);
    canvas.addEventListener('pointercancel', onPointerCancel);
    canvas.addEventListener('lostpointercapture', onLostCapture);
    document.addEventListener('pointerdown', onDocumentPointerDown, true);
    document.addEventListener('pointerup', onDocumentPointerEnd, true);
    document.addEventListener('pointercancel', onDocumentPointerEnd, true);
    canvas.addEventListener('keydown', onCameraKey);

    const markFailed = (reason: GraphicsFailureReason, error: unknown) => {
      if (!alive || lost) return;
      lost = true;
      // Transport cleanup must not hide the original graphics failure or leave
      // the canvas silently frozen before its recovery UI can be displayed.
      try { stopMovement(); }
      catch (stopError) { console.warn('[club-graphics] movement cleanup failed', stopError); }
      cancelAnimationFrame(frame);
      console.warn('[club-graphics]', reason, error);
      setGraphics({ status: 'failed', reason });
      const request = latest.current.avatarRenderRequest;
      if (request) latest.current.onAvatarRendered?.({ ...request, status: 'failed' });
      if (reason === 'avatar-assets') setAvatarStatus('failed');
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      markFailed('context-lost', new Error('WebGL context lost'));
    };
    const onContextRestored = () => {
      if (alive) setRetry((value) => value + 1);
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    try {
      const context = canvas.getContext('webgl2', { alpha: false, antialias: true, powerPreference: 'high-performance' });
      if (!context) throw new Error('WebGL2 is unavailable');
      initializationPhase = 'renderer-initialization';
      renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, powerPreference: 'high-performance' });
      renderer.localClippingEnabled = true;
      renderer.setPixelRatio(pixelRatio(window.devicePixelRatio));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.95;
      initializationPhase = 'scene-initialization';
      world = makeClubWorld({ createAvatar: createClubAvatar, manualControl: latest.current.movementControl?.current, onAvatarError: (error, rig) => {
        if (rig.ambient) { markFailed('avatar-assets', error); return; }
        const request = latest.current.avatarRenderRequest;
        if (request?.id === rig.id && request.preset === rig.preset) latest.current.onAvatarRendered?.({ ...request, status: 'failed' });
      } });
      world.installStudioEnvironment(renderer);
      tidalWave = createClubTidalWave(world.scene);
      selfMarker = createClubSelfMarker(world.scene);
      void world.ready.then(() => { if (alive && !lost) setAvatarStatus('ready'); }).catch((error: unknown) => markFailed('avatar-assets', error));
      world.scene.updateMatrixWorld(true);
      world.scene.traverse((node) => {
        if (node.userData.cameraObstacle === true) cameraObstacles.push(createCameraObstacle(node));
      });
      host.appendChild(canvas);
      initializationPhase = 'viewport-initialization';

      const resize = () => {
        if (!renderer) return;
        width = Math.max(1, host.clientWidth);
        height = Math.max(1, host.clientHeight);
        renderer.setSize(width, height, false);
        renderer.setPixelRatio(pixelRatio(window.devicePixelRatio));
        lastDraw = -Infinity;
      };
      resizeObserver = new ResizeObserver(() => {
        try {
          resize();
        } catch (error) {
          markFailed('viewport-initialization', error);
        }
      });
      resizeObserver.observe(host);
      resize();

      const syncTags = () => {
        if (!world) return;
        const rigs = [...world.players.values(), ...world.ambient].filter((rig) => rig.root.visible);
        const ids = new Set(rigs.map((rig) => rig.id));
        for (const [id, tag] of tags) {
          if (!ids.has(id)) {
            tag.remove();
            tags.delete(id);
          }
        }
        for (const [id, bubble] of emotionBubbles) {
          if (!ids.has(id)) { bubble.remove(); emotionBubbles.delete(id); }
        }
        for (const [id, bubble] of chatBubbles) {
          if (!ids.has(id)) { bubble.remove(); chatBubbles.delete(id); }
        }
        for (const rig of rigs) {
          let tag = tags.get(rig.id);
          if (!tag) {
            tag = document.createElement('span');
            Object.assign(tag.style, {
              position: 'absolute', left: '0', top: '0', whiteSpace: 'nowrap',
              padding: '0', fontFamily: 'inherit', fontSize: '11px', fontWeight: '650', lineHeight: '1.2',
              letterSpacing: '0.01em', border: '0', background: 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            });
            const bubble = document.createElement('span');
            Object.assign(bubble.style, {
              display: 'block', padding: '0', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis',
              color: 'rgba(255, 255, 255, .7)', background: 'transparent', border: '0',
            });
            tag.appendChild(bubble);
            labelsHost.appendChild(tag);
            tags.set(rig.id, tag);
          }
          const bubble = tag.firstElementChild as HTMLSpanElement;
          bubble.textContent = rig.name;
          tag.title = rig.name;
          tag.setAttribute('aria-label', rig.name);
          if (!rig.ambient && !chatBubbles.has(rig.id)) {
            const speech = document.createElement('span');
            speech.className = 'club-chat-bubble';
            speech.dataset.chatActor = rig.id;
            speech.setAttribute('aria-hidden', 'true');
            Object.assign(speech.style, { position: 'absolute', left: '0', top: '0', visibility: 'hidden', pointerEvents: 'none' });
            labelsHost.appendChild(speech);
            chatBubbles.set(rig.id, speech);
          }
          if (!rig.ambient && !emotionBubbles.has(rig.id)) {
            const speech = document.createElement('span');
            speech.dataset.emotionActor = rig.id;
            speech.setAttribute('role', 'img');
            speech.setAttribute('aria-hidden', 'true');
            Object.assign(speech.style, {
              position: 'absolute', left: '0', top: '0', width: '48px', height: '46px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
              background: 'rgba(255, 252, 255, .98)', color: '#332342', border: '1px solid rgba(255, 255, 255, .95)',
              borderRadius: '17px', boxShadow: '0 3px 12px rgba(20, 12, 35, .24)',
              fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
              fontSize: '30px', lineHeight: '1', pointerEvents: 'none', userSelect: 'none',
              visibility: 'hidden', transformOrigin: '50% 100%',
            });
            const emoji = document.createElement('span');
            emoji.setAttribute('aria-hidden', 'true');
            Object.assign(emoji.style, { position: 'relative', zIndex: '1' });
            const tail = document.createElement('span');
            tail.setAttribute('aria-hidden', 'true');
            Object.assign(tail.style, {
              position: 'absolute', width: '9px', height: '9px', bottom: '-4px', left: '50%',
              background: '#fffcff', borderRadius: '0 0 2px 0', transform: 'translateX(-50%) rotate(45deg)',
            });
            speech.appendChild(emoji);
            speech.appendChild(tail);
            labelsHost.appendChild(speech);
            emotionBubbles.set(rig.id, speech);
          }
        }
      };

      const positionTag = (rig: AvatarRig) => {
        const tag = tags.get(rig.id);
        if (!tag || !rig.root.visible) return;
        if (rig.root.scale.y < 0.15) { tag.style.visibility = 'hidden'; return; }
        avatarLabelAnchor(rig.root, rig.model.height, projected, rig.preset, rig.model.groundLift, rig.model.root);
        tidalWave?.addVisualOffset(rig, projected);
        rig.root.getWorldPosition(bubbleProjected);
        bubbleProjected.y += (rig.model.height * .55 + (rig.model.groundLift ?? 0)) * CLUB_AVATAR_SCALE;
        tidalWave?.addVisualOffset(rig, bubbleProjected);
        const projection = rig.isOwn && camera instanceof THREE.PerspectiveCamera
          ? projectFollowNameplate(projected, bubbleProjected, camera, width, height)
          : projectCameraLabel(projected, camera, width, height);
        tag.style.visibility = projection ? 'visible' : 'hidden';
        if (!projection) return;
        const { x, y, depth } = projection;
        tag.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -100%)`;
        tag.style.zIndex = String(Math.round(100 - depth * 30));
        return projection;
      };

      const positionEmotionBubble = (rig: AvatarRig, nowServer: number, reducedMotion: boolean, nameplateY?: number) => {
        const bubble = emotionBubbles.get(rig.id);
        if (!bubble) return;
        const reaction = emotionBubbleAt(rig.participant, nowServer, reducedMotion);
        const visible = Boolean(reaction && rig.root.visible && rig.root.scale.y >= 0.15);
        bubble.setAttribute('aria-hidden', visible ? 'false' : 'true');
        bubble.style.visibility = 'hidden';
        if (!visible || !reaction) return;
        // An anchor above the viewport can still belong to a visible close-up.
        // Check the body first, then keep the compact speech panel on screen.
        rig.root.getWorldPosition(projected);
        projected.y += (rig.model.height * .55 + (rig.model.groundLift ?? 0)) * CLUB_AVATAR_SCALE;
        tidalWave?.addVisualOffset(rig, projected);
        if (!projectCameraLabel(projected, camera, width, height)) { bubble.setAttribute('aria-hidden', 'true'); return; }
        emotionBubbleAnchor(rig.root, rig.model.height, projected, rig.preset, rig.model.groundLift, rig.model.root);
        tidalWave?.addVisualOffset(rig, projected);
        const projection = projectEmotionBubble(projected, camera, width, height, bubbleProjected, nameplateY);
        if (!projection) { bubble.setAttribute('aria-hidden', 'true'); return; }
        if (bubble.dataset.emotion !== reaction.action) {
          bubble.dataset.emotion = reaction.action;
          bubble.firstElementChild!.textContent = reaction.emoji;
        }
        bubble.setAttribute('aria-label', `${rig.name}：${reaction.label}`);
        bubble.style.visibility = 'visible';
        bubble.style.opacity = String(reaction.opacity);
        bubble.style.transform = `translate3d(${Math.round(projection.x)}px, ${Math.round(projection.y)}px, 0) translate(-50%, -100%) scale(${reaction.scale})`;
        bubble.style.zIndex = String(Math.round(101 - projection.depth * 30));
      };

      const prepareChatBubble = (rig: AvatarRig, nowServer: number, nameplateY?: number): ChatBubbleCandidate | null => {
        const bubble = chatBubbles.get(rig.id);
        if (!bubble) return null;
        bubble.style.visibility = 'hidden';
        bubble.setAttribute('aria-hidden', 'true');
        const chat = chatAt(rig.participant, nowServer);
        // The existing emotion animation temporarily takes this one head slot.
        if (!chat || emotionBubbleAt(rig.participant, nowServer) || !rig.root.visible || rig.root.scale.y < 0.15 || nameplateY === undefined) return null;
        rig.root.getWorldPosition(projected);
        projected.y += (rig.model.height * .55 + (rig.model.groundLift ?? 0)) * CLUB_AVATAR_SCALE;
        tidalWave?.addVisualOffset(rig, projected);
        if (!projectCameraLabel(projected, camera, width, height)) return null;
        emotionBubbleAnchor(rig.root, rig.model.height, projected, rig.preset, rig.model.groundLift, rig.model.root);
        tidalWave?.addVisualOffset(rig, projected);
        const projection = projectEmotionBubble(projected, camera, width, height, bubbleProjected, nameplateY);
        if (!projection) return null;
        // Plain DOM text only. A message is never parsed as HTML or used as a URL.
        if (bubble.textContent !== chat.text) bubble.textContent = chat.text;
        bubble.dataset.own = String(rig.id === latest.current.ownId);
        bubble.setAttribute('aria-label', `${rig.name}：${chat.text}`);
        return { id: rig.id, x: projection.x, y: projection.y, width: bubble.offsetWidth, height: bubble.offsetHeight + 6, depth: projection.depth };
      };

      const draw = (timestamp: number) => {
        if (!alive || lost || !world || !renderer) return;
        frame = requestAnimationFrame(draw);
        if (document.hidden) return;
        const snapshot = latest.current;
        const interval = snapshot.reducedMotion ? 1000 / 12 : 1000 / 40;
        if (timestamp - lastDraw < interval) return;
        const deltaSeconds = Number.isFinite(lastDraw) ? (timestamp - lastDraw) / 1000 : 1 / 40;
        lastDraw = timestamp;
        try {
          if (previousParticipants !== snapshot.participants || previousOwnId !== snapshot.ownId || previousActionPreview !== snapshot.ownActionPreview) {
            world.syncParticipants(projectOwnAction(snapshot.participants, snapshot.ownId, snapshot.ownActionPreview), snapshot.ownId);
            previousParticipants = snapshot.participants;
            previousOwnId = snapshot.ownId;
            previousActionPreview = snapshot.ownActionPreview;
          }
          if (snapshot.avatarRenderRequest && lastAvatarRequestToken !== snapshot.avatarRenderRequest.token) {
            lastAvatarRequestToken = snapshot.avatarRenderRequest.token;
            world.retryFailedAvatar(snapshot.avatarRenderRequest.id, snapshot.avatarRenderRequest.preset);
          }
          if (previousMovements !== snapshot.movements) {
            world.syncMovements(snapshot.movements ?? []);
            previousMovements = snapshot.movements;
          }
          if (previousVisualRevision !== world.visualRevision) {
            syncTags();
            previousVisualRevision = world.visualRevision;
          }
          const nowServer = Date.now() + snapshot.serverOffsetMs;
          const lightMode = lightModeAt(snapshot.lightCycle, nowServer, snapshot.lightMode);
          const { beat, section } = danceStageTiming(snapshot.track, snapshot.danceRound, nowServer);
          const control = snapshot.movementControl?.current;
          const danceActive = dancePresentationActive(snapshot.danceRound, nowServer);
          if (danceActive !== wasDanceActive) {
            stopMovement();
            if (!danceActive) cameras.reset();
            wasDanceActive = danceActive;
          }
          const groupBlocked = danceActive || Boolean(snapshot.groupAction && nowServer < snapshot.groupAction.endsAt);
          const active = Boolean(control?.active && control.enabled && !groupBlocked);
          if (active && !manualGesture) {
            camera.getWorldDirection(gestureForward); gestureForward.y = 0;
            if (gestureForward.lengthSq() < 1e-8) gestureForward.set(0, 0, -1);
            gestureForward.normalize();
            // Front immersion looks opposite navigation +Z. Recover that basis
            // before locking steering, or the first gesture swings 180 degrees.
            manualHeadingLock = Math.atan2(gestureForward.x, gestureForward.z) - orbit.yaw - (camera === cameras.thirdPerson ? Math.PI : 0);
          }
          if (!active) manualHeadingLock = undefined;
          manualGesture = active;
          const velocity = active ? movementVectorFromCamera(control!.x, control!.y, gestureForward) : { x: 0, z: 0 };
          // Remove last frame’s presentation offset before world-space foot IK.
          danceStage.restore();
          tidalWave?.prepareFrame();
          world.update(beat, lightMode, Boolean(snapshot.reducedMotion), section.energy, nowServer, section, {
            groupAction: danceActive ? null : snapshot.groupAction, deltaSeconds,
            manualIntent: { vx: velocity.x, vz: velocity.z, active: Boolean(control?.active), enabled: Boolean(control?.enabled) && !groupBlocked, autoRequest: control?.autoRequest, reconcileRequest: control?.reconcileRequest, reconcileStop: control?.reconcileStop, targetRequest: control?.targetRequest, cancelRequest: control?.cancelRequest },
            onOwnMovement: danceActive ? undefined : emitMovement,
          });
          tidalWave?.update(nowServer, danceActive ? null : snapshot.groupAction, Boolean(snapshot.reducedMotion), [...world.players.values(), ...world.ambient]);
          if (snapshot.cameraResetKey !== lastCameraReset || snapshot.cameraMode !== lastCameraMode) {
            cancelCameraPointer();
            if (control?.active) stopMovement();
            manualGesture = false; manualHeadingLock = undefined;
            orbit = { ...DEFAULT_CAMERA_ORBIT };
            cameras.reset();
            lastCameraReset = snapshot.cameraResetKey;
            lastCameraMode = snapshot.cameraMode;
          }
          camera = cameras.update({
            width, height, mode: snapshot.cameraMode ?? 'overview', orbit, deltaSeconds,
            reducedMotion: Boolean(snapshot.reducedMotion), obstacles: cameraObstacles, headingLock: manualHeadingLock,
            subject: tidalWave?.cameraSubject(world.getCameraSubject(snapshot.ownId)) ?? world.getCameraSubject(snapshot.ownId),
          });
          if (danceActive) {
            const stageOwnId = !snapshot.danceRound?.rosterFrozen || snapshot.danceRound.roster.some(actor => actor.id === snapshot.ownId) ? snapshot.ownId : null;
            danceStage.apply([...world.players.values(), ...world.ambient], stageOwnId, beat, Boolean(snapshot.reducedMotion), section.energy, nowServer, snapshot.danceFeedback, snapshot.danceRound, world.dj);
            const own = stageOwnId ? world.players.get(stageOwnId) : null;
            const subject = own?.root.visible ? { id: own.id, position: { ...danceStagePosition(0, true), y: 0 }, heading: own.root.rotation.y, height: own.model.height * CLUB_AVATAR_SCALE, radius: own.model.footprintRadius * CLUB_AVATAR_SCALE, displayScale: CLUB_AVATAR_SCALE } : null;
            const pose = danceStageCameraPose(subject, width / height);
            danceCamera.aspect = width / height;
            danceCamera.position.copy(pose.position); danceCamera.lookAt(pose.target);
            danceCamera.updateProjectionMatrix(); danceCamera.updateMatrixWorld();
            camera = danceCamera;
          }
          // Disable the older white root-attached halo; the ground-owned yellow ring is unique.
          for (const rig of world.players.values()) rig.halo.visible = false;
          selfMarker?.update({ ownId: danceActive || snapshot.selfMarkerEnabled === false ? null : snapshot.ownId, participants: snapshot.participants, players: world.players, camera, viewportHeight: height, floorY: world.floor.position.y, nowServer });
          const request = snapshot.avatarRenderRequest;
          const actor = request ? world.players.get(request.id) : undefined;
          const awaitAvatar = snapshot.presentationVisible !== false && request && reportedAvatarToken !== request.token && actor?.preset === request.preset && actor.model.loaded && actor.root.visible && actor.model.root.visible;
          const receipt = observeAvatarDraw(awaitAvatar ? actor.model.root : undefined);
          try { renderer.render(world.scene, camera); }
          finally { receipt.restore(); }
          // An actual avatar mesh draw, not fetch completion or a hidden/frustum-culled root.
          if (request && receipt.drawn) {
            reportedAvatarToken = request.token;
            snapshot.onAvatarRendered?.({ ...request, status: 'ready' });
          }
          // Capture synchronously after render: no preserveDrawingBuffer/GPU-memory cost.
          // A low-frequency backup also covers tab suspension across the end boundary.
          if (danceStageActive(snapshot.danceRound, nowServer) && snapshot.danceRound && snapshot.onDanceSnapshot && captureFailedRoundId !== snapshot.danceRound.id && capturedRoundId !== snapshot.danceRound.id && (nowServer - lastDanceCaptureAt > 15_000 || nowServer >= snapshot.danceRound.endsAt - 350)) {
            try {
              lastDanceFrame = { id: snapshot.danceRound.id, dataUrl: canvas.toDataURL('image/jpeg', 0.85) };
              lastDanceCaptureAt = nowServer;
              if (nowServer >= snapshot.danceRound.endsAt - 350) {
                capturedRoundId = lastDanceFrame.id;
                snapshot.onDanceSnapshot(lastDanceFrame.id, lastDanceFrame.dataUrl);
              }
            } catch (error) {
              captureFailedRoundId = snapshot.danceRound.id;
              console.warn('[club-dance] scene photo unavailable; keeping scorecard fallback', error);
            }
          }
          if (!danceActive && lastDanceFrame && capturedRoundId !== lastDanceFrame.id) {
            capturedRoundId = lastDanceFrame.id;
            snapshot.onDanceSnapshot?.(lastDanceFrame.id, lastDanceFrame.dataUrl);
          }
          labelsHost.style.display = danceActive ? 'none' : '';
          const chatCandidates: ChatBubbleCandidate[] = [];
          for (const rig of world.players.values()) {
            const tag = positionTag(rig);
            positionEmotionBubble(rig, nowServer, Boolean(snapshot.reducedMotion), tag?.y);
            const chat = prepareChatBubble(rig, nowServer, tag?.y);
            if (chat) chatCandidates.push(chat);
          }
          for (const panel of chatBubbleLayout(chatCandidates, width, height)) {
            const bubble = chatBubbles.get(panel.id)!;
            bubble.style.visibility = 'visible';
            bubble.setAttribute('aria-hidden', 'false');
            bubble.style.transform = `translate3d(${Math.round(panel.x)}px, ${Math.round(panel.y)}px, 0) translate(-50%, -100%)`;
            bubble.style.zIndex = String(Math.round(102 - panel.depth * 30));
          }
          for (const rig of world.ambient) positionTag(rig);
          if (!hasRendered) {
            hasRendered = true;
            setGraphics({ status: 'ready', reason: null });
          }
        } catch (error) {
          markFailed('frame-error', error);
        }
      };
      frame = requestAnimationFrame(draw);
    } catch (error) {
      queueMicrotask(() => markFailed(initializationPhase, error));
    }

    return () => {
      stopMovement();
      alive = false;
      window.removeEventListener('blur', stopMovement);
      document.removeEventListener('visibilitychange', onMovementVisibility);
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerEnd);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('lostpointercapture', onLostCapture);
      document.removeEventListener('pointerdown', onDocumentPointerDown, true);
      document.removeEventListener('pointerup', onDocumentPointerEnd, true);
      document.removeEventListener('pointercancel', onDocumentPointerEnd, true);
      touchPointers.clear();
      canvas.removeEventListener('keydown', onCameraKey);
      danceStage.restore();
      selfMarker?.dispose();
      tidalWave?.dispose();
      world?.dispose();
      renderer?.dispose();
      renderer?.forceContextLoss();
      canvas.remove();
      tags.forEach((tag) => tag.remove());
      tags.clear();
      emotionBubbles.forEach((bubble) => bubble.remove());
      emotionBubbles.clear();
      chatBubbles.forEach(bubble => bubble.remove());
      chatBubbles.clear();
    };
  }, [enabled, retry]);

  return (
    <div className={className} style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#111215', isolation: 'isolate', zIndex: 0 }} data-graphics-status={enabled ? graphics.status : 'paused'} data-graphics-reason={graphics.reason ?? 'none'} data-avatar-status={avatarStatus}>
      <div ref={hostRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />
      <div ref={labelsRef} aria-label="Dancers on the floor" style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', overflow: 'hidden' }} />
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(22,20,39,.08) 0%, transparent 15%, transparent 87%, rgba(29,25,47,.06) 100%)' }} />
      {failureCopy && (
        <div role="status" style={{ position: 'absolute', inset: 0, zIndex: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, padding: 28, textAlign: 'center', color: '#e8e2fa', background: 'radial-gradient(ellipse at 50% 70%, #2b1b44, #0b0b1b 70%)' }}>
          <span style={{ fontSize: 30 }} aria-hidden="true">✦</span>
          <strong style={{ fontSize: 15 }}>{failureCopy.title}</strong>
          <span style={{ fontSize: 12, color: '#aaa3bc', maxWidth: 270 }}>{failureCopy.description}</span>
          <button type="button" onClick={() => setRetry((value) => value + 1)} style={{ marginTop: 4, border: '1px solid #706c84', borderRadius: 30, padding: '9px 18px', color: '#fff', background: '#29243d', cursor: 'pointer' }}>重试 3D 画面</button>
        </div>
      )}
    </div>
  );
}
