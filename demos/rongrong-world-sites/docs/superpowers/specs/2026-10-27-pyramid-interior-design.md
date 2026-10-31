# Pyramid interior bonus

Latest user instruction supersedes the initial prototype: THIRD PERSON ONLY, visible real LX player and a safe following camera.

User intent: click the desert friend's supplied pyramid and walk inside the supplied 3D interior; leaving restores the same exterior position/camera. This is an isolated optional bonus, not a dependency of the frozen release.

The inspected input is SPZ v3, 723,426 SH0 Gaussian splats, 12,015,743 bytes (SHA-256 e5976754bd1278f83b8d55f99524da47db9e07af6cad8b06647811b15cea611a). CPU Gaussian rasterization of actual decoded covariance/color confirms a coherent illuminated stone corridor; native Y points down. This is a supplied generated-space exploration, not a runtime world model, mesh or navmesh.

Approach: retain the exterior world, pause it under a modal third-person LX walker, and lazy-load the existing Three 0.186.1 official SPZLoader and GaussianSplat renderer. New dependencies and synthetic replacement geometry are unnecessary. Mesh reconstruction would invent unsupported collision; orbit-only viewing fails the user's walking requirement.

Builder calls: a conservative player-center rectangle x [-3.2,3.2], z [-0.2,0.2], with a separate camera-safe rectangle x [-4,4], z [-0.65,0.65]. Reuse actual human-lx at existing 0.65 scale and farmLocomotion/FarmAvatarPose. Follow 2.2 units behind, shorten the line segment at boundaries (minimum horizontal separation 0.45), and raise from 1.65 to 2.05 above the hand-marked floor when close. Use 80° vertical FOV to retain the full character at portrait widths; do not promise side-room traversal. Desktop WASD / arrow controls, drag to look, mobile hold-to-move buttons. Speed 1.4 scene units/sec; dt cap avoids background teleport. Show bounded-route explanation. No accounts, saves, economy, AI API or network writes.

Entry includes load progress, retry, cancel/return throughout. Guard stale module/renderer/byte completion and dispose geometry/GPU/input resources. Preserve same exterior instance and its camera, block exterior controls while inside, resume only after close. Actual pyramid mesh picks plus an accessible entry button.

Verification: TDD for safe walk bounds, normalization, cancellation and exact byte identity; DOM fixture integration for retained world/camera and retries; native CPU pixel evidence, typecheck and isolated build. No CUA, Playwright or browser QA. Browser GPU rendering cannot be represented as verified without actual supported evidence.
