import * as THREE from 'three';

export function createSea(scene) {
    const sea = new THREE.Group();

    // Sand floor with better caustics simulation
    const floorGeo = new THREE.PlaneGeometry(200, 200, 50, 50);
    const floorMat = new THREE.MeshStandardMaterial({ 
        color: '#f7e1a0', // Brighter sand
        roughness: 0.6,
        metalness: 0.1
    });
    
    // Simple caustics pattern using vertex colors or a generated texture could be better, 
    // but for now we rely on light and fog.
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    sea.add(floor);

    // Fog for depth
    scene.fog = new THREE.FogExp2('#003b5c', 0.035);
    scene.background = new THREE.Color('#002b3d');

    // Corals - more variety and high aesthetic colors
    const coralColors = ['#ff6b6b', '#ff9f43', '#feca57', '#48dbfb', '#ff9ff3', '#1dd1a1'];
    for (let i = 0; i < 60; i++) {
        const isCoral = Math.random() > 0.4;
        const color = coralColors[Math.floor(Math.random() * coralColors.length)];
        
        let geo;
        if (isCoral) {
            const type = Math.random();
            if (type > 0.6) {
                geo = new THREE.TorusKnotGeometry(Math.random() * 0.4 + 0.2, 0.15, 64, 8);
            } else {
                geo = new THREE.IcosahedronGeometry(Math.random() * 0.5 + 0.3, 2);
            }
        } else {
            geo = new THREE.DodecahedronGeometry(Math.random() * 1 + 0.5, 0);
        }
        
        const mat = new THREE.MeshStandardMaterial({ 
            color: isCoral ? color : '#576574',
            roughness: 0.7,
            flatShading: !isCoral
        });
        const mesh = new THREE.Mesh(geo, mat);
        // Ensure some corals are near the center
        const range = i < 10 ? 10 : 80;
        mesh.position.set(
            (Math.random() - 0.5) * range,
            isCoral ? Math.random() * 2 : 0, 
            (Math.random() - 0.5) * range * 0.8
        );
        mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        sea.add(mesh);
    }

    // Dynamic Seagrass
    const grassMat = new THREE.MeshStandardMaterial({ color: '#2ecc71', side: THREE.DoubleSide });
    const grassGeo = new THREE.PlaneGeometry(0.2, 2, 1, 4);
    // Add some noise to vertices for swaying
    const posAttr = grassGeo.attributes.position;
    for(let i=0; i<posAttr.count; i++) {
        if(posAttr.getY(i) > 0) posAttr.setZ(i, Math.random() * 0.2);
    }
    
    for (let i = 0; i < 150; i++) {
        const g = new THREE.Mesh(grassGeo, grassMat);
        g.position.set((Math.random() - 0.5) * 100, 0, (Math.random() - 0.5) * 80);
        g.rotation.y = Math.random() * Math.PI;
        sea.add(g);
    }

    // Bubbles / Particles
    const partGeo = new THREE.BufferGeometry();
    const partCount = 500;
    const posArr = new Float32Array(partCount * 3);
    for(let i=0; i<partCount * 3; i++) {
        posArr[i] = (Math.random() - 0.5) * 100;
    }
    partGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    const partMat = new THREE.PointsMaterial({
        color: '#ffffff',
        size: 0.05,
        transparent: true,
        opacity: 0.4
    });
    const particles = new THREE.Points(partGeo, partMat);
    sea.add(particles);

    scene.add(sea);
    return {
        update: (t) => {
            sea.children.forEach(c => {
                if (c.geometry.type === 'PlaneGeometry' && c !== floor) {
                    c.rotation.z = Math.sin(t + c.position.x) * 0.1;
                }
            });
            // Float particles up
            const pos = particles.geometry.attributes.position.array;
            for(let i=1; i<pos.length; i+=3) {
                pos[i] += 0.02;
                if(pos[i] > 40) pos[i] = -5;
            }
            particles.geometry.attributes.position.needsUpdate = true;
        }
    };
}

export function createGodRays(scene) {
    const group = new THREE.Group();
    // Use softer, semi-transparent cylinders for god rays to avoid "sharp edges"
    const rayGeo = new THREE.CylinderGeometry(0.5, 4, 60, 32); // Larger and smoother
    const rayMat = new THREE.MeshBasicMaterial({
        color: '#6cc4ff', // Light blue tint
        transparent: true,
        opacity: 0.03, // Much softer
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
    });

    for (let i = 0; i < 12; i++) {
        const ray = new THREE.Mesh(rayGeo, rayMat);
        ray.position.set((Math.random() - 0.5) * 60, 25, (Math.random() - 0.5) * 30);
        ray.rotation.x = Math.PI / 8;
        ray.rotation.z = (Math.random() - 0.5) * 1;
        group.add(ray);
    }
    scene.add(group);
    return group;
}
