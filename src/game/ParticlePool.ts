import * as THREE from 'three';

interface ParticleSlot {
  active: boolean;
  life: number;
  maxLife: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  scale: number;
  grow: number;
  gravity: number;
}

const _dummy = new THREE.Object3D();

/**
 * Object-pooled InstancedMesh particle system for drift smoke, nitro flames,
 * collision sparks, and level weather (snow, dust, rain) with zero runtime allocations.
 */
export class ParticlePool {
  public readonly group = new THREE.Group();

  private smokeMesh: THREE.InstancedMesh;
  private smokeSlots: ParticleSlot[] = [];
  private smokeCursor = 0;

  private flameMesh: THREE.InstancedMesh;
  private flameSlots: ParticleSlot[] = [];
  private flameCursor = 0;

  private sparkMesh: THREE.InstancedMesh;
  private sparkSlots: ParticleSlot[] = [];
  private sparkCursor = 0;

  private weatherMesh: THREE.InstancedMesh | null = null;
  private weatherSlots: { pos: THREE.Vector3; vel: THREE.Vector3; scale: THREE.Vector3 }[] = [];
  private weatherMode: 'none' | 'dust' | 'snow' | 'rain' = 'none';

  private disposables: { dispose: () => void }[] = [];

  constructor() {
    // 1. Drift Smoke Pool (140)
    const smokeGeo = new THREE.IcosahedronGeometry(0.42, 1);
    const smokeMat = new THREE.MeshBasicMaterial({
      color: 0xd4d4d8,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.smokeMesh = new THREE.InstancedMesh(smokeGeo, smokeMat, 140);
    this.smokeMesh.frustumCulled = false;
    this.smokeSlots = this.makeSlots(140);
    this.group.add(this.smokeMesh);
    this.disposables.push(smokeGeo, smokeMat);

    // 2. Nitro Flame Pool (64)
    const flameGeo = new THREE.IcosahedronGeometry(0.24, 0);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    this.flameMesh = new THREE.InstancedMesh(flameGeo, flameMat, 64);
    this.flameMesh.frustumCulled = false;
    this.flameSlots = this.makeSlots(64);
    this.group.add(this.flameMesh);
    this.disposables.push(flameGeo, flameMat);

    // 3. Collision Spark Pool (90)
    const sparkGeo = new THREE.BoxGeometry(0.1, 0.1, 0.35);
    const sparkMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.95,
    });
    this.sparkMesh = new THREE.InstancedMesh(sparkGeo, sparkMat, 90);
    this.sparkMesh.frustumCulled = false;
    this.sparkSlots = this.makeSlots(90);
    this.group.add(this.sparkMesh);
    this.disposables.push(sparkGeo, sparkMat);

    this.hideAllInstances(this.smokeMesh, 140);
    this.hideAllInstances(this.flameMesh, 64);
    this.hideAllInstances(this.sparkMesh, 90);
  }

  private makeSlots(count: number): ParticleSlot[] {
    const arr: ParticleSlot[] = [];
    for (let i = 0; i < count; i++) {
      arr.push({
        active: false,
        life: 0,
        maxLife: 1,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        scale: 1,
        grow: 1,
        gravity: 0,
      });
    }
    return arr;
  }

  private hideAllInstances(mesh: THREE.InstancedMesh, count: number): void {
    _dummy.position.set(0, -500, 0);
    _dummy.scale.setScalar(0.0001);
    _dummy.updateMatrix();
    for (let i = 0; i < count; i++) {
      mesh.setMatrixAt(i, _dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  public configureWeather(mode: 'none' | 'dust' | 'snow' | 'rain'): void {
    if (this.weatherMesh) {
      this.group.remove(this.weatherMesh);
      this.weatherMesh.geometry.dispose();
      (this.weatherMesh.material as THREE.Material).dispose();
      this.weatherMesh = null;
      this.weatherSlots = [];
    }
    this.weatherMode = mode;
    if (mode === 'none') return;

    const count = 320;
    let geo: THREE.BufferGeometry;
    let mat: THREE.Material;

    if (mode === 'snow') {
      geo = new THREE.IcosahedronGeometry(0.14, 0);
      mat = new THREE.MeshBasicMaterial({
        color: 0xf8fafc,
        transparent: true,
        opacity: 0.85,
      });
    } else if (mode === 'rain') {
      geo = new THREE.BoxGeometry(0.03, 1.3, 0.03);
      mat = new THREE.MeshBasicMaterial({
        color: 0x7dd3fc,
        transparent: true,
        opacity: 0.45,
      });
    } else {
      // dust
      geo = new THREE.IcosahedronGeometry(0.18, 0);
      mat = new THREE.MeshBasicMaterial({
        color: 0xfde68a,
        transparent: true,
        opacity: 0.4,
      });
    }

    this.weatherMesh = new THREE.InstancedMesh(geo, mat, count);
    this.weatherMesh.frustumCulled = false;

    for (let i = 0; i < count; i++) {
      this.weatherSlots.push({
        pos: new THREE.Vector3(
          (Math.random() - 0.5) * 90,
          Math.random() * 26,
          (Math.random() - 0.5) * 90,
        ),
        vel: new THREE.Vector3(
          mode === 'dust' ? 6 + Math.random() * 5 : (Math.random() - 0.5) * 2,
          mode === 'snow' ? -(4 + Math.random() * 3) : mode === 'rain' ? -(28 + Math.random() * 8) : -0.6,
          mode === 'dust' ? (Math.random() - 0.5) * 4 : (Math.random() - 0.5) * 2,
        ),
        scale: new THREE.Vector3(1, 1, 1).multiplyScalar(0.7 + Math.random() * 0.7),
      });
    }
    this.group.add(this.weatherMesh);
  }

  public spawnSmoke(x: number, y: number, z: number, vx: number, vz: number): void {
    const slot = this.smokeSlots[this.smokeCursor];
    this.smokeCursor = (this.smokeCursor + 1) % this.smokeSlots.length;
    slot.active = true;
    slot.life = 0;
    slot.maxLife = 0.45 + Math.random() * 0.25;
    slot.pos.set(x, y, z);
    slot.vel.set(vx + (Math.random() - 0.5) * 2, 1.2 + Math.random() * 1.4, vz + (Math.random() - 0.5) * 2);
    slot.scale = 0.55;
    slot.grow = 2.4;
    slot.gravity = 0;
  }

  public spawnFlame(x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    const slot = this.flameSlots[this.flameCursor];
    this.flameCursor = (this.flameCursor + 1) % this.flameSlots.length;
    slot.active = true;
    slot.life = 0;
    slot.maxLife = 0.14 + Math.random() * 0.08;
    slot.pos.set(x, y, z);
    slot.vel.set(vx, vy, vz);
    slot.scale = 1.0 + Math.random() * 0.4;
    slot.grow = -0.85;
    slot.gravity = 0;
  }

  public spawnSparks(x: number, y: number, z: number, count = 14): void {
    for (let i = 0; i < count; i++) {
      const slot = this.sparkSlots[this.sparkCursor];
      this.sparkCursor = (this.sparkCursor + 1) % this.sparkSlots.length;
      slot.active = true;
      slot.life = 0;
      slot.maxLife = 0.25 + Math.random() * 0.25;
      slot.pos.set(x, y, z);
      slot.vel.set(
        (Math.random() - 0.5) * 18,
        3 + Math.random() * 9,
        (Math.random() - 0.5) * 18,
      );
      slot.scale = 1.0;
      slot.grow = -0.9;
      slot.gravity = -22;
    }
  }

  public update(dt: number, anchorPos: THREE.Vector3): void {
    this.updatePool(this.smokeMesh, this.smokeSlots, dt, false);
    this.updatePool(this.flameMesh, this.flameSlots, dt, false);
    this.updatePool(this.sparkMesh, this.sparkSlots, dt, true);

    if (this.weatherMesh && this.weatherMode !== 'none') {
      const len = this.weatherSlots.length;
      for (let i = 0; i < len; i++) {
        const w = this.weatherSlots[i];
        w.pos.addScaledVector(w.vel, dt);

        // Keep particles inside a 90x28x90 box centered around the player car
        if (w.pos.y < anchorPos.y - 1) w.pos.y = anchorPos.y + 24;
        if (w.pos.y > anchorPos.y + 26) w.pos.y = anchorPos.y + 1;
        if (w.pos.x - anchorPos.x > 45) w.pos.x -= 90;
        if (w.pos.x - anchorPos.x < -45) w.pos.x += 90;
        if (w.pos.z - anchorPos.z > 45) w.pos.z -= 90;
        if (w.pos.z - anchorPos.z < -45) w.pos.z += 90;

        _dummy.position.copy(w.pos);
        _dummy.rotation.set(0, 0, this.weatherMode === 'rain' ? 0.08 : 0);
        _dummy.scale.copy(w.scale);
        _dummy.updateMatrix();
        this.weatherMesh.setMatrixAt(i, _dummy.matrix);
      }
      this.weatherMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private updatePool(
    mesh: THREE.InstancedMesh,
    slots: ParticleSlot[],
    dt: number,
    orientToVel: boolean,
  ): void {
    let anyChanged = false;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!s.active) continue;
      anyChanged = true;
      s.life += dt;
      if (s.life >= s.maxLife) {
        s.active = false;
        _dummy.position.set(0, -500, 0);
        _dummy.scale.setScalar(0.0001);
        _dummy.updateMatrix();
        mesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      const ratio = s.life / s.maxLife;
      s.vel.y += s.gravity * dt;
      s.pos.addScaledVector(s.vel, dt);

      const curScale = Math.max(0.05, s.scale * (1 + s.grow * ratio));
      _dummy.position.copy(s.pos);
      if (orientToVel) {
        _dummy.rotation.set(0, Math.atan2(s.vel.x, s.vel.z), 0);
      } else {
        _dummy.rotation.set(ratio * 2, ratio * 3, 0);
      }
      _dummy.scale.setScalar(curScale);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
    }
    if (anyChanged) {
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  public reset(): void {
    for (const s of this.smokeSlots) s.active = false;
    for (const s of this.flameSlots) s.active = false;
    for (const s of this.sparkSlots) s.active = false;
    this.hideAllInstances(this.smokeMesh, this.smokeSlots.length);
    this.hideAllInstances(this.flameMesh, this.flameSlots.length);
    this.hideAllInstances(this.sparkMesh, this.sparkSlots.length);
  }

  public dispose(): void {
    for (const d of this.disposables) d.dispose();
    if (this.weatherMesh) {
      this.weatherMesh.geometry.dispose();
      (this.weatherMesh.material as THREE.Material).dispose();
    }
  }
}
