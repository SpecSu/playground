import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/GLTFLoader.js';

export class Diver {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.position.set(0, 5, 0); // Start near the floor to see corals
    scene.add(this.root);

    this.model = null;
    this.mixer = null;
    this.aimAngle = 0;
    this.velocity = new THREE.Vector3();
    
    this.loadModel();
  }

  loadModel() {
    const loader = new GLTFLoader();
    // Use ProtA as default diver
    loader.load('./assets/chars/ProtA.glb', (gltf) => {
      this.model = gltf.scene;
      this.model.scale.setScalar(1);
      this.model.rotation.y = Math.PI / 2;
      this.root.add(this.model);

      // Add Snorkeling Goggles
      const goggleGeo = new THREE.BoxGeometry(0.35, 0.18, 0.22);
      const goggleMat = new THREE.MeshPhysicalMaterial({
          color: '#1a1a1a',
          metalness: 0.8,
          roughness: 0.2,
          transparent: true,
          opacity: 0.7,
          transmission: 0.5
      });
      const goggles = new THREE.Mesh(goggleGeo, goggleMat);
      // Position for ProtA head
      goggles.position.set(0, 1.45, 0.18); 
      this.model.add(goggles);

      if (gltf.animations.length) {
        this.mixer = new THREE.AnimationMixer(this.model);
        const action = this.mixer.clipAction(gltf.animations[0]);
        action.play();
      }
    });
  }

  update(dt, input) {
    const speed = 8;
    const move = new THREE.Vector2(0, 0);
    if (input.up) move.y += 1;
    if (input.down) move.y -= 1;
    if (input.left) move.x -= 1;
    if (input.right) move.x += 1;

    if (move.length() > 0) {
      move.normalize();
      this.velocity.lerp(new THREE.Vector3(move.x * speed, move.y * speed, 0), 0.1);
      this.aimAngle = Math.atan2(move.y, move.x);
    } else {
      this.velocity.lerp(new THREE.Vector3(0, 0, 0), 0.05);
    }

    this.root.position.addScaledVector(this.velocity, dt);
    
    // Clamp to sea bounds
    this.root.position.y = Math.min(35, Math.max(1, this.root.position.y));
    this.root.position.x = Math.min(100, Math.max(-100, this.root.position.x));

    if (this.model) {
      // Rotate model towards movement direction
      const targetRot = move.x < 0 ? -Math.PI / 2 : Math.PI / 2;
      this.model.rotation.y = THREE.MathUtils.lerp(this.model.rotation.y, targetRot, 0.1);
      
      // Tilt model based on vertical movement
      this.model.rotation.x = THREE.MathUtils.lerp(this.model.rotation.x, -move.y * 0.5, 0.1);
    }

    if (this.mixer) this.mixer.update(dt);
  }

  getAimDirection() {
    // Returns a normalized Vector3 based on current movement or aimAngle
    return new THREE.Vector3(Math.cos(this.aimAngle), Math.sin(this.aimAngle), 0).normalize();
  }
}
