import * as THREE from 'three';
import {createSkeletalAnimalController} from './animal-animation.ts';
/** Kept as a compatible public adapter for existing cow geometry checks. */
export function createSkeletalCowController(root:THREE.Group,clips:THREE.AnimationClip[],contactRoot:THREE.Object3D=root){return createSkeletalAnimalController(root,clips,'cow',contactRoot);}
