import * as THREE from 'three';

const POOL_SIZE = 72;

export interface TireSmokePool {
  mesh: THREE.InstancedMesh;
  emit: (x: number, y: number, z: number, vx: number, vz: number, intensity: number) => void;
  update: (dt: number) => void;
  dispose: () => void;
}

export function createTireSmokePool(): TireSmokePool {
  const geo = new THREE.IcosahedronGeometry(0.28, 1);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xd8dee9,
    roughness: 0.95,
    metalness: 0.0,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, POOL_SIZE);
  mesh.frustumCulled = false;

  const px = new Float32Array(POOL_SIZE);
  const py = new Float32Array(POOL_SIZE);
  const pz = new Float32Array(POOL_SIZE);
  const vx = new Float32Array(POOL_SIZE);
  const vy = new Float32Array(POOL_SIZE);
  const vz = new Float32Array(POOL_SIZE);
  const life = new Float32Array(POOL_SIZE);
  const maxLife = new Float32Array(POOL_SIZE);

  const dummy = new THREE.Object3D();
  for (let i = 0; i < POOL_SIZE; i++) {
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;

  let cursor = 0;

  return {
    mesh,
    emit: (x, y, z, carVx, carVz, intensity) => {
      const i = cursor;
      cursor = (cursor + 1) % POOL_SIZE;
      px[i] = x + (Math.random() - 0.5) * 0.25;
      py[i] = y + 0.14;
      pz[i] = z + (Math.random() - 0.5) * 0.25;
      vx[i] = carVx * 0.22 + (Math.random() - 0.5) * 1.4;
      vy[i] = 0.7 + Math.random() * 0.8 + intensity * 0.5;
      vz[i] = carVz * 0.22 + (Math.random() - 0.5) * 1.4;
      maxLife[i] = 0.55 + Math.random() * 0.35;
      life[i] = maxLife[i];
    },
    update: (dt) => {
      for (let i = 0; i < POOL_SIZE; i++) {
        if (life[i] <= 0) {
          dummy.scale.setScalar(0);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
          continue;
        }
        life[i] -= dt;
        const t = 1 - Math.max(0, life[i] / maxLife[i]);
        px[i] += vx[i] * dt;
        py[i] += vy[i] * dt;
        pz[i] += vz[i] * dt;
        vx[i] *= Math.exp(-2.5 * dt);
        vz[i] *= Math.exp(-2.5 * dt);

        const scale = (0.45 + t * 2.1) * (1 - t * 0.65);
        dummy.position.set(px[i], py[i], pz[i]);
        dummy.rotation.set(t * 1.4, i * 0.7, t * 0.9);
        dummy.scale.setScalar(Math.max(0, scale));
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose: () => {
      geo.dispose();
      mat.dispose();
    },
  };
}
