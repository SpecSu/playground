import * as THREE from 'three';

export class NetProjectile {
  constructor(scene, startPos, direction, strength) {
    this.root = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 8, 8),
      new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.8 })
    );
    this.root.position.copy(startPos);
    scene.add(this.root);
    
    this.direction = direction.normalize();
    this.speed = 10 + strength * 20;
    this.life = 2.0;
    this.isDead = false;
  }

  update(dt) {
    this.root.position.addScaledVector(this.direction, this.speed * dt);
    this.life -= dt;
    if (this.life <= 0) {
      this.isDead = true;
    }
  }

  dispose(scene) {
    scene.remove(this.root);
  }
}
