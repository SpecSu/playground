# School walking correction
User explicitly rejected observer mode. The school must be an ordinary playable visit: real existing LX avatar, same .65 scale and 1 m/s world cruise, click ground to walk, camera follows player, click a runner for a compact menu. Eight actual runners retain their reviewed run and formation. No fake player or free/follow-team camera.

Chosen approach: keep dedicated 32×24m school World but reuse createClubAvatar, advancePlayerMotion, FarmAvatarPose/farmLocomotion and tap gate. Widening canonical farm tiles/old World would touch unrelated formal state and is rejected. Only school modules/new navigation are owned here; main owns branding/defense and shared World/App.

Navigation uses actual individual solid mesh footprints intersecting player body height, excluding overhead roofs and floor paint; no group/big scenery bbox. Bounded grid A* and exact swept segments avoid static rectangles and eight small dynamic runner circles. Group yields temporarily if its next step would touch player; player can route around individual circles, clear the lane and group resumes without catch-up. Invalid/occupied targets report immediately rather than pretending success. No pushed/teleported player.

The visit remains local: no canonical save, UID, outbox, ownership or reward API. Preserve BGM slot, home callbacks, hidden/modal/blur cancellation and late-load disposal. No new rig or asset. Near-runner greetings use the existing real player's wave; no selling/carrying away a runner.
