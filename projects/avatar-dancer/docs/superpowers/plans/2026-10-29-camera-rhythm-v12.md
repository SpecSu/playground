# v12 beat camera narrow correction

Approved scope: camera rhythm only, metadata beat-grid offset plumbing in main. No model, audio, scoring, lobby or aftershow changes.

Diagnosis: v11 multiplied1.5%two-beat breathing and slow8-beat10%phrase by flow weight; a final6/s lowpass erased attacks. Camera also lacked each track's measured beat-grid origin.

Plan: tests first for normal-play impact, strong/weak pattern, attack/return, correct metadata phase and reduced motion. Use measured transport time minus offset (including negative pre-offset beats), downbeat strong and alternating weaker accents. Separate smooth composition from direct smooth-envelope pulse so no extra lowpass erases the beat. About75ms attack/225ms return,18–22%strong push, no roll/shake. Actual8look face projection checks and3song8–10second textured offline new/old motion proof with original audio; record camera curves. Full suite/build and unchanged GLB hashes before handoff. Root owns publishing.
