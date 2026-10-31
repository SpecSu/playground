/** Planning artifact only. Promote into src/animation-lab/types.ts after approval. */
export type LabSpecies = 'cow' | 'sheep' | 'pig' | 'bunny' | 'duck' | 'chicken' | 'cat' | 'dog' | 'alpaca' | 'capybara' | 'deer' | 'fox' | 'raccoon' | 'hedgehog' | 'penguin' | 'wolf' | 'tiger' | 'lion' | 'bear' | 'crocodile' | 'owl' | 'parrot' | 'woodpecker' | 'tit' | 'toucan';
export type LabProfile = 'hoof' | 'pawed' | 'hopper' | 'sprawlingreptile' | 'groundbird' | 'flyingbird' | 'penguin';
export type LabClipName = 'idle' | 'walk' | 'drink_enter' | 'drink_loop' | 'drink_exit' | 'eat' | 'rest' | 'carried' | 'react' | 'pet' | 'alert' | 'celebrate' | 'takeoff' | 'fly' | 'land' | 'perch' | 'pounce' | 'recoil';
export interface LabClip { name: LabClipName; durationSeconds: number; loop: boolean; rootMotion: false; contactMode: 'grounded' | 'mixed' | 'airborne' | 'carried'; tags: string[]; }
export interface LabAsset {
 id: LabSpecies; label: string; family: 'fourfoot' | 'bird'; profile: LabProfile;
 status: 'prototype'; url: string; source: string; referencePack: string;
 strideMeters: number; gaitDescription: string; silhouette: string;
 anchors: { root: string; body: string; head: string; neck: [string, string]; mouth: string; support: string; ground: string; headTarget: string; feet: string[]; };
 clips: LabClip[];
}
export interface LabManifest { schemaVersion: 1; coordinateSystem: {up: '+Y'; forward: '+Z'; groundY: 0; units: 'meters'}; assets: LabAsset[]; }
