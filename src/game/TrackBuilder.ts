import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  createBarkTexture,
  createBuildingFacadeTexture,
  createCheckeredTexture,
  createChevronSignTexture,
  createFoliageTexture,
  createRoadTexture,
  createSkyDomeTexture,
  createTerrainTexture,
} from './Textures';
import { LevelConfig } from './types';

export interface TrackSample {
  t: number;
  s: number;
  pos: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
}

export class TrackData {
  public readonly config: LevelConfig;
  public readonly curve: THREE.CatmullRomCurve3;
  public readonly samples: TrackSample[] = [];
  public readonly totalLength: number;
  public readonly minimapPoints: { x: number; z: number }[] = [];

  constructor(config: LevelConfig) {
    this.config = config;
    const pts = config.controlPoints.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    this.curve = new THREE.CatmullRomCurve3(pts, config.closed, 'catmullrom', 0.45);
    this.totalLength = this.curve.getLength();

    const sampleCount = Math.max(360, Math.round(this.totalLength / 6));
    const up = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < sampleCount; i++) {
      const t = i / (config.closed ? sampleCount : sampleCount - 1);
      const pos = this.curve.getPointAt(t);
      const tangent = this.curve.getTangentAt(t).normalize();
      const right = new THREE.Vector3().crossVectors(tangent, up).normalize();
      this.samples.push({
        t,
        s: t * this.totalLength,
        pos,
        tangent,
        right,
      });
      if (i % 4 === 0 || i === sampleCount - 1) {
        this.minimapPoints.push({ x: pos.x, z: pos.z });
      }
    }
  }

  public projectPosition(
    worldPos: THREE.Vector3,
    hintIndex?: number,
  ): {
    index: number;
    t: number;
    s: number;
    lateralOffset: number;
    roadY: number;
    tangent: THREE.Vector3;
    right: THREE.Vector3;
    centerPos: THREE.Vector3;
  } {
    const n = this.samples.length;
    let bestIdx = 0;
    let bestDistSq = Infinity;

    if (hintIndex !== undefined && hintIndex >= 0 && hintIndex < n) {
      const window = 32;
      for (let d = -window; d <= window; d++) {
        let idx = hintIndex + d;
        if (this.config.closed) {
          idx = ((idx % n) + n) % n;
        } else if (idx < 0 || idx >= n) {
          continue;
        }
        const s = this.samples[idx].pos;
        const dx = worldPos.x - s.x;
        const dz = worldPos.z - s.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = idx;
        }
      }
    }

    if (bestDistSq > 1600) {
      bestDistSq = Infinity;
      for (let i = 0; i < n; i++) {
        const s = this.samples[i].pos;
        const dx = worldPos.x - s.x;
        const dz = worldPos.z - s.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = i;
        }
      }
    }

    const sample = this.samples[bestIdx];
    const dx = worldPos.x - sample.pos.x;
    const dz = worldPos.z - sample.pos.z;
    const lateralOffset = dx * sample.right.x + dz * sample.right.z;

    return {
      index: bestIdx,
      t: sample.t,
      s: sample.s,
      lateralOffset,
      roadY: sample.pos.y,
      tangent: sample.tangent,
      right: sample.right,
      centerPos: sample.pos,
    };
  }

  public getSampleAtProgress(t: number): TrackSample {
    const clamped = this.config.closed
      ? ((t % 1) + 1) % 1
      : Math.max(0, Math.min(0.9999, t));
    const idx = Math.min(
      this.samples.length - 1,
      Math.floor(clamped * this.samples.length),
    );
    return this.samples[idx];
  }
}

export interface BuiltTrackScene {
  group: THREE.Group;
  disposables: { dispose: () => void }[];
  lampLights: THREE.PointLight[];
}

/**
 * Helper to safely merge geometries with uniform non-indexed attributes.
 */
function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = parts.map((g) => {
    const nonIdx = g.index ? g.toNonIndexed() : g.clone();
    if (!nonIdx.attributes.uv) {
      const count = nonIdx.attributes.position.count;
      nonIdx.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    if (!nonIdx.attributes.normal) {
      nonIdx.computeVertexNormals();
    }
    g.dispose();
    return nonIdx;
  });
  const merged = mergeGeometries(prepared, false);
  for (const p of prepared) p.dispose();
  return merged;
}

/**
 * Builds a curved, tapered palm trunk + separate multi-frond drooping palm crown.
 */
function createRealisticPalmGeometries(): {
  trunkGeo: THREE.BufferGeometry;
  crownGeo: THREE.BufferGeometry;
} {
  // Curved trunk segments
  const trunkParts: THREE.BufferGeometry[] = [];
  const segs = 6;
  const segH = 1.15;
  let curX = 0;
  let curY = 0;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const rBot = THREE.MathUtils.lerp(0.32, 0.14, t0);
    const rTop = THREE.MathUtils.lerp(0.32, 0.14, t1);
    const seg = new THREE.CylinderGeometry(rTop, rBot, segH + 0.08, 8);
    const lean = Math.pow(t0, 1.4) * 0.22;
    seg.translate(0, segH * 0.5, 0);
    seg.rotateZ(-lean);
    seg.translate(curX, curY, 0);
    curX += Math.sin(lean) * segH;
    curY += Math.cos(lean) * segH;
    trunkParts.push(seg);
  }
  const trunkGeo = mergeParts(trunkParts);

  // Crown: 9 curved drooping palm fronds in 2 layers + coconut cluster
  const crownParts: THREE.BufferGeometry[] = [];
  const frondCount = 9;
  for (let i = 0; i < frondCount; i++) {
    const angle = (i / frondCount) * Math.PI * 2 + (i % 2) * 0.2;
    const tierLift = i % 2 === 0 ? 0.28 : 0.08;
    // Build each frond from 3 angled leaf segments arching outward and drooping
    for (let s = 0; s < 3; s++) {
      const len = 1.35 - s * 0.18;
      const w = 0.65 - s * 0.18;
      const segGeo = new THREE.BoxGeometry(w, 0.05, len);
      // Center pivot at base of segment
      segGeo.translate(0, 0, len * 0.5);
      // Arch curve: first segment rises, outer segments droop down
      const pitch = tierLift - s * 0.34;
      segGeo.rotateX(-pitch);
      // Offset along frond radial path
      const reach = s === 0 ? 0.1 : s === 1 ? 1.3 : 2.35;
      const yDrop = s === 0 ? 0 : s === 1 ? 0.22 - tierLift * 0.4 : -0.15 - tierLift * 0.5;
      segGeo.translate(0, yDrop, reach);
      segGeo.rotateY(angle);
      crownParts.push(segGeo);
    }
  }
  // Central palm crown heart
  const heart = new THREE.DodecahedronGeometry(0.45, 0);
  heart.translate(0, -0.15, 0);
  crownParts.push(heart);

  const crownGeo = mergeParts(crownParts);
  crownGeo.translate(curX, curY, 0);

  return { trunkGeo, crownGeo };
}

/**
 * Builds a multi-tiered, organic pine/evergreen tree (trunk + 5 staggered branch skirts).
 */
function createRealisticPineGeometries(): {
  trunkGeo: THREE.BufferGeometry;
  foliageGeo: THREE.BufferGeometry;
} {
  const trunk = new THREE.CylinderGeometry(0.14, 0.34, 4.2, 8);
  trunk.translate(0, 2.1, 0);

  const tiers: THREE.BufferGeometry[] = [];
  const tierDefs = [
    { y: 2.3, r: 2.35, h: 2.1, rot: 0.1 },
    { y: 3.4, r: 2.0, h: 1.95, rot: 0.55 },
    { y: 4.45, r: 1.62, h: 1.8, rot: 1.1 },
    { y: 5.4, r: 1.22, h: 1.6, rot: 0.35 },
    { y: 6.25, r: 0.78, h: 1.45, rot: 0.85 },
  ];
  for (const td of tierDefs) {
    const cone = new THREE.ConeGeometry(td.r, td.h, 8);
    cone.translate(0, td.y + td.h * 0.5, 0);
    cone.rotateY(td.rot);
    tiers.push(cone);
  }
  const foliageGeo = mergeParts(tiers);
  return { trunkGeo: trunk, foliageGeo };
}

/**
 * Builds a realistic multi-arm Saguaro cactus geometry.
 */
function createSaguaroCactusGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Main trunk + rounded cap
  const main = new THREE.CylinderGeometry(0.26, 0.32, 4.4, 8);
  main.translate(0, 2.2, 0);
  parts.push(main);

  const topCap = new THREE.SphereGeometry(0.26, 8, 6);
  topCap.translate(0, 4.4, 0);
  parts.push(topCap);

  // Left arm (elbow + vertical rise)
  const lElbow = new THREE.CylinderGeometry(0.18, 0.2, 0.85, 7);
  lElbow.rotateZ(Math.PI / 2);
  lElbow.translate(-0.55, 2.3, 0);
  parts.push(lElbow);

  const lArm = new THREE.CylinderGeometry(0.17, 0.19, 1.5, 7);
  lArm.translate(-0.92, 3.05, 0);
  parts.push(lArm);

  const lCap = new THREE.SphereGeometry(0.17, 7, 5);
  lCap.translate(-0.92, 3.8, 0);
  parts.push(lCap);

  // Right arm (higher)
  const rElbow = new THREE.CylinderGeometry(0.16, 0.18, 0.75, 7);
  rElbow.rotateZ(Math.PI / 2);
  rElbow.translate(0.5, 2.85, 0);
  parts.push(rElbow);

  const rArm = new THREE.CylinderGeometry(0.15, 0.17, 1.25, 7);
  rArm.translate(0.84, 3.45, 0);
  parts.push(rArm);

  const rCap = new THREE.SphereGeometry(0.15, 7, 5);
  rCap.translate(0.84, 4.08, 0);
  parts.push(rCap);

  return mergeParts(parts);
}

/**
 * Builds a flat-topped stepped red-rock Desert Mesa / Butte geometry.
 */
function createDesertMesaGeometry(): THREE.BufferGeometry {
  const base = new THREE.CylinderGeometry(0.75, 1.25, 0.45, 7);
  base.translate(0, 0.225, 0);
  const mid = new THREE.CylinderGeometry(0.55, 0.78, 0.4, 7);
  mid.rotateY(0.35);
  mid.translate(0, 0.6, 0);
  const cap = new THREE.CylinderGeometry(0.46, 0.56, 0.22, 7);
  cap.translate(0, 0.88, 0);
  return mergeParts([base, mid, cap]);
}

export function buildTrackScene(
  track: TrackData,
  maxAnisotropy: number,
): BuiltTrackScene {
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];
  const lampLights: THREE.PointLight[] = [];
  const cfg = track.config;
  const env = cfg.environment;

  // 1. Sky Dome
  const skyTex = createSkyDomeTexture(env.skyTop, env.skyHorizon, env.isNight);
  disposables.push(skyTex);
  const skyGeo = new THREE.SphereGeometry(2400, 24, 16);
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTex,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  group.add(new THREE.Mesh(skyGeo, skyMat));
  disposables.push(skyGeo, skyMat);

  // 2. Undulating 3D Terrain Mesh (stays depressed under road corridor, rises into hills/ridges outside)
  const terrainTex = createTerrainTexture(
    env.terrainColor,
    env.sceneryType,
    maxAnisotropy,
  );
  disposables.push(terrainTex);

  const terrainSize = 4200;
  const segs = env.sceneryType === 'city' || env.sceneryType === 'chase' ? 32 : 96;
  const groundGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, segs, segs);
  groundGeo.rotateX(-Math.PI / 2);

  // Center terrain around track bounding box center
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of track.samples) {
    if (s.pos.x < minX) minX = s.pos.x;
    if (s.pos.x > maxX) maxX = s.pos.x;
    if (s.pos.z < minZ) minZ = s.pos.z;
    if (s.pos.z > maxZ) maxZ = s.pos.z;
  }
  const centerX = (minX + maxX) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;
  groundGeo.translate(centerX, 0, centerZ);

  if (env.sceneryType !== 'city' && env.sceneryType !== 'chase') {
    const posAttr = groundGeo.attributes.position;
    const roadClearSq = Math.pow(cfg.roadWidth * 0.5 + 14, 2);
    const hillAmp =
      env.sceneryType === 'mountain'
        ? 44
        : env.sceneryType === 'snow'
          ? 24
          : env.sceneryType === 'desert'
            ? 22
            : 14;

    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);

      // Find nearest track sample quickly (every 3rd sample is plenty for terrain clearance)
      let minDistSq = Infinity;
      let nearestY = 0;
      for (let k = 0; k < track.samples.length; k += 3) {
        const sp = track.samples[k].pos;
        const dx = vx - sp.x;
        const dz = vz - sp.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < minDistSq) {
          minDistSq = dSq;
          nearestY = sp.y;
        }
      }

      if (minDistSq < roadClearSq) {
        posAttr.setY(i, nearestY - 0.55);
      } else {
        const distOut = Math.sqrt(minDistSq) - (cfg.roadWidth * 0.5 + 14);
        const blend = Math.min(1, distOut / 65);
        // Coast drops slightly toward ocean on +X side
        const oceanMask =
          env.sceneryType === 'coast' && vx > maxX - 40 ? 0.15 : 1.0;
        const ridge =
          (Math.sin(vx * 0.011) * Math.cos(vz * 0.011) * 0.5 +
            Math.sin(vx * 0.025 + vz * 0.019) * 0.35 +
            0.6) *
          hillAmp *
          blend *
          oceanMask;
        posAttr.setY(i, nearestY - 0.55 + Math.max(0, ridge));
      }
    }
    groundGeo.computeVertexNormals();
  } else {
    groundGeo.translate(0, -0.45, 0);
  }

  const groundMat = new THREE.MeshStandardMaterial({
    map: terrainTex,
    roughness: 0.92,
    metalness: 0.02,
  });
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.receiveShadow = true;
  group.add(groundMesh);
  disposables.push(groundGeo, groundMat);

  // Shimmering Ocean + Sandy Beach for Sunset Coast
  if (env.sceneryType === 'coast') {
    const oceanGeo = new THREE.PlaneGeometry(4200, 2600);
    oceanGeo.rotateX(-Math.PI / 2);
    const oceanMat = new THREE.MeshPhysicalMaterial({
      color: 0x0369a1,
      roughness: 0.12,
      metalness: 0.45,
      clearcoat: 1.0,
    });
    const ocean = new THREE.Mesh(oceanGeo, oceanMat);
    ocean.position.set(maxX + 950, -0.32, centerZ);
    group.add(ocean);
    disposables.push(oceanGeo, oceanMat);
  }

  // 360-degree Distant Horizon Mountain / Skyline Silhouette Ring
  const horizonCount = 48;
  const horizonRadius = 1480;
  const horizonGeo =
    env.sceneryType === 'city' || env.sceneryType === 'chase'
      ? new THREE.BoxGeometry(1, 1, 1)
      : new THREE.ConeGeometry(1, 1, 5);
  horizonGeo.translate(0, 0.5, 0);
  const horizonMat = new THREE.MeshStandardMaterial({
    color: env.isNight ? 0x0f172a : env.sceneryType === 'desert' ? 0x9a3412 : 0x334155,
    roughness: 0.9,
  });
  const horizonMesh = new THREE.InstancedMesh(horizonGeo, horizonMat, horizonCount);
  const hDummy = new THREE.Object3D();
  for (let i = 0; i < horizonCount; i++) {
    const a = (i / horizonCount) * Math.PI * 2;
    hDummy.position.set(
      centerX + Math.cos(a) * horizonRadius,
      -5,
      centerZ + Math.sin(a) * horizonRadius,
    );
    hDummy.rotation.set(0, a, 0);
    hDummy.scale.set(
      110 + (i % 3) * 45,
      140 + ((i * 37) % 180),
      110 + (i % 4) * 35,
    );
    hDummy.updateMatrix();
    horizonMesh.setMatrixAt(i, hDummy.matrix);
  }
  horizonMesh.instanceMatrix.needsUpdate = true;
  horizonMesh.computeBoundingSphere();
  group.add(horizonMesh);
  disposables.push(horizonGeo, horizonMat);

  // 3. Road Ribbon Geometry + Guardrail Barriers
  const samples = track.samples;
  const count = samples.length;
  const ringCount = cfg.closed ? count + 1 : count;
  const halfW = cfg.roadWidth * 0.5;

  const roadPositions = new Float32Array(ringCount * 2 * 3);
  const roadNormals = new Float32Array(ringCount * 2 * 3);
  const roadUvs = new Float32Array(ringCount * 2 * 2);
  const roadIndices: number[] = [];

  const skirtPositions = new Float32Array(ringCount * 4 * 3);
  const skirtIndices: number[] = [];

  const railHeight = 0.72;
  const railOffset = halfW + 0.35;
  const leftRailPos = new Float32Array(ringCount * 2 * 3);
  const rightRailPos = new Float32Array(ringCount * 2 * 3);
  const railIndices: number[] = [];

  let accumDist = 0;

  for (let i = 0; i < ringCount; i++) {
    const sample = samples[i % count];
    if (i > 0) {
      const prev = samples[(i - 1) % count];
      accumDist += sample.pos.distanceTo(prev.pos);
    }

    const lx = sample.pos.x - sample.right.x * halfW;
    const lz = sample.pos.z - sample.right.z * halfW;
    const rx = sample.pos.x + sample.right.x * halfW;
    const rz = sample.pos.z + sample.right.z * halfW;
    const y = sample.pos.y + 0.02;

    const vIdx = i * 2;
    roadPositions[vIdx * 3] = lx;
    roadPositions[vIdx * 3 + 1] = y;
    roadPositions[vIdx * 3 + 2] = lz;
    roadPositions[(vIdx + 1) * 3] = rx;
    roadPositions[(vIdx + 1) * 3 + 1] = y;
    roadPositions[(vIdx + 1) * 3 + 2] = rz;

    roadNormals[vIdx * 3] = 0;
    roadNormals[vIdx * 3 + 1] = 1;
    roadNormals[vIdx * 3 + 2] = 0;
    roadNormals[(vIdx + 1) * 3] = 0;
    roadNormals[(vIdx + 1) * 3 + 1] = 1;
    roadNormals[(vIdx + 1) * 3 + 2] = 0;

    const vCoord = accumDist / 14;
    roadUvs[vIdx * 2] = 0;
    roadUvs[vIdx * 2 + 1] = vCoord;
    roadUvs[(vIdx + 1) * 2] = 1;
    roadUvs[(vIdx + 1) * 2 + 1] = vCoord;

    const sIdx = i * 4;
    const lOutX = sample.pos.x - sample.right.x * (halfW + 4.2);
    const lOutZ = sample.pos.z - sample.right.z * (halfW + 4.2);
    const rOutX = sample.pos.x + sample.right.x * (halfW + 4.2);
    const rOutZ = sample.pos.z + sample.right.z * (halfW + 4.2);

    skirtPositions[sIdx * 3] = lOutX;
    skirtPositions[sIdx * 3 + 1] = Math.min(-0.6, y - 3.5);
    skirtPositions[sIdx * 3 + 2] = lOutZ;

    skirtPositions[(sIdx + 1) * 3] = lx;
    skirtPositions[(sIdx + 1) * 3 + 1] = y - 0.04;
    skirtPositions[(sIdx + 1) * 3 + 2] = lz;

    skirtPositions[(sIdx + 2) * 3] = rx;
    skirtPositions[(sIdx + 2) * 3 + 1] = y - 0.04;
    skirtPositions[(sIdx + 2) * 3 + 2] = rz;

    skirtPositions[(sIdx + 3) * 3] = rOutX;
    skirtPositions[(sIdx + 3) * 3 + 1] = Math.min(-0.6, y - 3.5);
    skirtPositions[(sIdx + 3) * 3 + 2] = rOutZ;

    const lRailX = sample.pos.x - sample.right.x * railOffset;
    const lRailZ = sample.pos.z - sample.right.z * railOffset;
    const rRailX = sample.pos.x + sample.right.x * railOffset;
    const rRailZ = sample.pos.z + sample.right.z * railOffset;

    leftRailPos[vIdx * 3] = lRailX;
    leftRailPos[vIdx * 3 + 1] = y - 0.05;
    leftRailPos[vIdx * 3 + 2] = lRailZ;
    leftRailPos[(vIdx + 1) * 3] = lRailX;
    leftRailPos[(vIdx + 1) * 3 + 1] = y + railHeight;
    leftRailPos[(vIdx + 1) * 3 + 2] = lRailZ;

    rightRailPos[vIdx * 3] = rRailX;
    rightRailPos[vIdx * 3 + 1] = y - 0.05;
    rightRailPos[vIdx * 3 + 2] = rRailZ;
    rightRailPos[(vIdx + 1) * 3] = rRailX;
    rightRailPos[(vIdx + 1) * 3 + 1] = y + railHeight;
    rightRailPos[(vIdx + 1) * 3 + 2] = rRailZ;

    if (i < ringCount - 1) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      roadIndices.push(a, c, b, b, c, d);
      railIndices.push(a, b, c, b, d, c);

      const sa = i * 4;
      skirtIndices.push(sa, sa + 4, sa + 1, sa + 1, sa + 4, sa + 5);
      skirtIndices.push(sa + 2, sa + 6, sa + 3, sa + 3, sa + 6, sa + 7);
    }
  }

  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.BufferAttribute(roadPositions, 3));
  roadGeo.setAttribute('normal', new THREE.BufferAttribute(roadNormals, 3));
  roadGeo.setAttribute('uv', new THREE.BufferAttribute(roadUvs, 2));
  roadGeo.setIndex(roadIndices);

  const roadTex = createRoadTexture({
    roadColor: env.roadColor,
    shoulderColor: env.shoulderColor,
    isWet: env.isWet,
    isSnow: env.sceneryType === 'snow',
    maxAnisotropy,
  });
  disposables.push(roadTex);

  const roadMat = new THREE.MeshStandardMaterial({
    map: roadTex,
    roughness: env.roadRoughness,
    metalness: env.roadMetalness,
  });
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);
  disposables.push(roadGeo, roadMat);

  const skirtGeo = new THREE.BufferGeometry();
  skirtGeo.setAttribute('position', new THREE.BufferAttribute(skirtPositions, 3));
  skirtGeo.setIndex(skirtIndices);
  skirtGeo.computeVertexNormals();
  const skirtMat = new THREE.MeshStandardMaterial({
    color: env.terrainColor,
    roughness: 0.9,
  });
  const skirtMesh = new THREE.Mesh(skirtGeo, skirtMat);
  skirtMesh.receiveShadow = true;
  group.add(skirtMesh);
  disposables.push(skirtGeo, skirtMat);

  const railMat = new THREE.MeshStandardMaterial({
    color: env.isNight ? 0x334155 : 0x94a3b8,
    emissive: env.isNight ? 0x0ea5e9 : 0x000000,
    emissiveIntensity: env.isNight ? 0.42 : 0,
    metalness: 0.72,
    roughness: 0.34,
    side: THREE.DoubleSide,
  });

  const leftRailGeo = new THREE.BufferGeometry();
  leftRailGeo.setAttribute('position', new THREE.BufferAttribute(leftRailPos, 3));
  leftRailGeo.setIndex(railIndices);
  leftRailGeo.computeVertexNormals();

  const rightRailGeo = new THREE.BufferGeometry();
  rightRailGeo.setAttribute('position', new THREE.BufferAttribute(rightRailPos, 3));
  rightRailGeo.setIndex(railIndices);
  rightRailGeo.computeVertexNormals();

  group.add(new THREE.Mesh(leftRailGeo, railMat));
  group.add(new THREE.Mesh(rightRailGeo, railMat));
  disposables.push(leftRailGeo, rightRailGeo, railMat);

  // 4. Start / Finish Gantry Arch
  const bannerTex = createCheckeredTexture();
  disposables.push(bannerTex);

  const buildGantry = (sampleIdx: number, bannerColor: number) => {
    const s = samples[sampleIdx];
    const gantry = new THREE.Group();
    gantry.position.copy(s.pos);
    const angle = Math.atan2(-s.tangent.x, -s.tangent.z);
    gantry.rotation.y = angle;

    const pillarGeo = new THREE.BoxGeometry(0.65, 6.2, 0.65);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.7,
      roughness: 0.3,
    });
    const leftP = new THREE.Mesh(pillarGeo, pillarMat);
    leftP.position.set(-halfW - 0.3, 3.1, 0);
    const rightP = new THREE.Mesh(pillarGeo, pillarMat);
    rightP.position.set(halfW + 0.3, 3.1, 0);

    const beamGeo = new THREE.BoxGeometry(cfg.roadWidth + 1.4, 1.4, 0.8);
    const beamMat = new THREE.MeshStandardMaterial({
      map: bannerTex,
      emissive: bannerColor,
      emissiveIntensity: 0.25,
      roughness: 0.4,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(0, 5.8, 0);

    const lineGeo = new THREE.PlaneGeometry(cfg.roadWidth - 0.8, 2.4);
    lineGeo.rotateX(-Math.PI / 2);
    const lineMat = new THREE.MeshBasicMaterial({
      map: bannerTex,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.position.set(0, 0.04, 0);

    gantry.add(leftP, rightP, beam, line);
    group.add(gantry);
    disposables.push(pillarGeo, pillarMat, beamGeo, beamMat, lineGeo, lineMat);
  };

  buildGantry(0, 0xf59e0b);
  if (!cfg.closed) {
    buildGantry(samples.length - 6, 0x22c55e);
  }

  // 5. Realistic Roadside Trees & Environmental Props via InstancedMesh
  const dummy = new THREE.Object3D();
  const colorTmp = new THREE.Color();

  type TransformItem = {
    pos: THREE.Vector3;
    rotY: number;
    scale: THREE.Vector3;
    tint?: number;
  };

  const addInstanced = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    transforms: TransformItem[],
  ) => {
    if (transforms.length === 0) {
      geo.dispose();
      mat.dispose();
      return;
    }
    const inst = new THREE.InstancedMesh(geo, mat, transforms.length);
    for (let i = 0; i < transforms.length; i++) {
      const t = transforms[i];
      dummy.position.copy(t.pos);
      dummy.rotation.set(0, t.rotY, 0);
      dummy.scale.copy(t.scale);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      if (t.tint !== undefined) {
        colorTmp.setHex(t.tint);
        inst.setColorAt(i, colorTmp);
      }
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();
    group.add(inst);
    disposables.push(geo, mat);
  };

  const populateRoadside = (
    step: number,
    minOffset: number,
    maxOffset: number,
    bothSides: boolean,
    callback: (
      pos: THREE.Vector3,
      side: number,
      idx: number,
      sample: TrackSample,
    ) => void,
  ) => {
    let idx = 0;
    for (let i = 3; i < samples.length - 3; i += step) {
      const s = samples[i];
      const sides = bothSides ? [-1, 1] : [-1];
      for (const side of sides) {
        const dist = halfW + minOffset + Math.random() * (maxOffset - minOffset);
        const pos = new THREE.Vector3(
          s.pos.x + s.right.x * dist * side,
          s.pos.y - 0.15,
          s.pos.z + s.right.z * dist * side,
        );
        callback(pos, side, idx++, s);
      }
    }
  };

  if (env.sceneryType === 'coast') {
    const palmBarkTex = createBarkTexture(true);
    const leafTex = createFoliageTexture(false);
    disposables.push(palmBarkTex, leafTex);

    const { trunkGeo, crownGeo } = createRealisticPalmGeometries();
    const { trunkGeo: pineTrunkGeo, foliageGeo: bushGeo } = createRealisticPineGeometries();

    const palmTransforms: TransformItem[] = [];
    const crownTransforms: TransformItem[] = [];
    const shrubTransforms: TransformItem[] = [];
    const villaTransforms: TransformItem[] = [];
    const rockTransforms: TransformItem[] = [];

    populateRoadside(4, 3.2, 22, true, (pos, _side, i, s) => {
      const sc = 0.85 + Math.random() * 0.5;
      const rot = Math.random() * Math.PI * 2;
      palmTransforms.push({ pos, rotY: rot, scale: new THREE.Vector3(sc, sc, sc) });
      crownTransforms.push({
        pos,
        rotY: rot,
        scale: new THREE.Vector3(sc, sc, sc),
        tint: i % 3 === 0 ? 0x22c55e : i % 3 === 1 ? 0x16a34a : 0x4ade80,
      });

      // Coastal shrubs & boulders
      if (i % 2 === 0) {
        shrubTransforms.push({
          pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 9, -0.8, (Math.random() - 0.5) * 9)),
          rotY: Math.random() * Math.PI,
          scale: new THREE.Vector3(0.45, 0.35, 0.45),
          tint: 0x15803d,
        });
      }
      if (i % 3 === 0) {
        rockTransforms.push({
          pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 14, -0.2, (Math.random() - 0.5) * 14)),
          rotY: Math.random() * Math.PI,
          scale: new THREE.Vector3(1.5 + Math.random() * 2, 0.9 + Math.random() * 1.1, 1.5 + Math.random() * 2),
          tint: 0x78716c,
        });
      }
      // Coastal villas on left/inland side
      if (i % 8 === 0) {
        const villaPos = pos.clone().addScaledVector(s.right, -12);
        villaTransforms.push({
          pos: villaPos,
          rotY: Math.atan2(s.tangent.x, s.tangent.z),
          scale: new THREE.Vector3(8, 4.5 + Math.random() * 3, 6),
          tint: i % 16 === 0 ? 0xfef3c7 : 0xfed7aa,
        });
      }
    });

    addInstanced(
      trunkGeo,
      new THREE.MeshStandardMaterial({ map: palmBarkTex, roughness: 0.9 }),
      palmTransforms,
    );
    addInstanced(
      crownGeo,
      new THREE.MeshStandardMaterial({
        map: leafTex,
        color: 0xffffff,
        roughness: 0.72,
      }),
      crownTransforms,
    );
    pineTrunkGeo.dispose();
    addInstanced(
      bushGeo,
      new THREE.MeshStandardMaterial({ map: leafTex, color: 0xffffff, roughness: 0.8 }),
      shrubTransforms,
    );
    const villaGeo = new THREE.BoxGeometry(1, 1, 1);
    villaGeo.translate(0, 0.5, 0);
    addInstanced(
      villaGeo,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }),
      villaTransforms,
    );
    const rockGeo = new THREE.DodecahedronGeometry(1.1, 0);
    rockGeo.translate(0, 0.45, 0);
    addInstanced(
      rockGeo,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }),
      rockTransforms,
    );
  } else if (env.sceneryType === 'city' || env.sceneryType === 'chase') {
    const facadeTex = createBuildingFacadeTexture();
    disposables.push(facadeTex);

    const buildings: TransformItem[] = [];
    const spires: TransformItem[] = [];
    const neonStrips: TransformItem[] = [];
    const poles: TransformItem[] = [];
    const arms: TransformItem[] = [];
    const lamps: TransformItem[] = [];

    populateRoadside(5, 7, 30, true, (pos, side, i, s) => {
      const h = 20 + Math.random() * 48;
      const w = 9 + Math.random() * 11;
      const d = 9 + Math.random() * 11;
      const rotY = Math.atan2(s.tangent.x, s.tangent.z);

      buildings.push({
        pos,
        rotY,
        scale: new THREE.Vector3(w, h, d),
        tint: i % 3 === 0 ? 0x93c5fd : i % 3 === 1 ? 0xd8b4fe : 0xe2e8f0,
      });

      if (i % 3 === 0) {
        spires.push({
          pos: new THREE.Vector3(pos.x, pos.y + h, pos.z),
          rotY,
          scale: new THREE.Vector3(w * 0.55, 6 + Math.random() * 10, d * 0.55),
        });
      }

      if (env.sceneryType === 'city') {
        neonStrips.push({
          pos: new THREE.Vector3(pos.x, pos.y + h * 0.78, pos.z),
          rotY,
          scale: new THREE.Vector3(w + 0.35, 0.7, d + 0.35),
          tint: i % 2 === 0 ? 0x06b6d4 : 0xe879f9,
        });
      }

      // Street lamps right along the road shoulder
      if (i % 2 === 0) {
        const lampBase = new THREE.Vector3(
          s.pos.x + s.right.x * (halfW + 1.4) * side,
          s.pos.y - 0.1,
          s.pos.z + s.right.z * (halfW + 1.4) * side,
        );
        const poleRot = Math.atan2(s.right.x * -side, s.right.z * -side);
        poles.push({ pos: lampBase, rotY: poleRot, scale: new THREE.Vector3(1, 1, 1) });
        arms.push({
          pos: lampBase.clone().add(new THREE.Vector3(0, 6.2, 0)),
          rotY: poleRot,
          scale: new THREE.Vector3(1, 1, 1),
        });
        lamps.push({
          pos: lampBase.clone().add(
            new THREE.Vector3(-s.right.x * side * 1.35, 6.08, -s.right.z * side * 1.35),
          ),
          rotY: poleRot,
          scale: new THREE.Vector3(1, 1, 1),
        });
      }
    });

    const bGeo = new THREE.BoxGeometry(1, 1, 1);
    bGeo.translate(0, 0.5, 0);
    addInstanced(
      bGeo,
      new THREE.MeshStandardMaterial({
        map: facadeTex,
        emissiveMap: facadeTex,
        emissive: 0xffffff,
        emissiveIntensity: 0.5,
        roughness: 0.4,
        metalness: 0.35,
      }),
      buildings,
    );

    const spireGeo = new THREE.BoxGeometry(1, 1, 1);
    spireGeo.translate(0, 0.5, 0);
    addInstanced(
      spireGeo,
      new THREE.MeshStandardMaterial({
        map: facadeTex,
        emissiveMap: facadeTex,
        emissive: 0xffffff,
        emissiveIntensity: 0.35,
        roughness: 0.45,
      }),
      spires,
    );

    if (neonStrips.length > 0) {
      addInstanced(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
        neonStrips,
      );
    }

    const poleGeo = new THREE.CylinderGeometry(0.1, 0.16, 6.3, 8);
    poleGeo.translate(0, 3.15, 0);
    addInstanced(
      poleGeo,
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85, roughness: 0.25 }),
      poles,
    );

    const armGeo = new THREE.BoxGeometry(0.14, 0.12, 1.6);
    armGeo.translate(0, 0, 0.7);
    addInstanced(
      armGeo,
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85, roughness: 0.25 }),
      arms,
    );

    addInstanced(
      new THREE.BoxGeometry(0.45, 0.14, 0.8),
      new THREE.MeshBasicMaterial({
        color: env.sceneryType === 'city' ? 0x67e8f9 : 0xfef08a,
      }),
      lamps,
    );
  } else if (env.sceneryType === 'desert') {
    const cactusGeo = createSaguaroCactusGeometry();
    const mesaGeo = createDesertMesaGeometry();
    const bushGeo = new THREE.DodecahedronGeometry(0.65, 1);
    bushGeo.translate(0, 0.35, 0);

    const cacti: TransformItem[] = [];
    const mesas: TransformItem[] = [];
    const bushes: TransformItem[] = [];
    const poles: TransformItem[] = [];

    populateRoadside(4, 3.5, 28, true, (pos, side, i, s) => {
      const sc = 0.78 + Math.random() * 0.85;
      cacti.push({
        pos,
        rotY: Math.random() * Math.PI * 2,
        scale: new THREE.Vector3(sc, sc, sc),
        tint: i % 2 === 0 ? 0x15803d : 0x166534,
      });

      if (i % 2 === 0) {
        bushes.push({
          pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 10, -0.1, (Math.random() - 0.5) * 10)),
          rotY: Math.random() * Math.PI,
          scale: new THREE.Vector3(1.1, 0.75, 1.1),
          tint: i % 4 === 0 ? 0x65a30d : 0x4d7c0f,
        });
      }

      if (i % 4 === 0) {
        const mPos = pos.clone().add(
          new THREE.Vector3((Math.random() - 0.5) * 38, -0.5, (Math.random() - 0.5) * 38),
        );
        mesas.push({
          pos: mPos,
          rotY: Math.random() * Math.PI,
          scale: new THREE.Vector3(
            12 + Math.random() * 18,
            10 + Math.random() * 24,
            12 + Math.random() * 18,
          ),
          tint: i % 8 === 0 ? 0xb45309 : 0x9a3412,
        });
      }

      if (side === 1 && i % 5 === 0) {
        poles.push({
          pos: new THREE.Vector3(
            s.pos.x + s.right.x * (halfW + 3.2),
            s.pos.y - 0.1,
            s.pos.z + s.right.z * (halfW + 3.2),
          ),
          rotY: Math.atan2(s.tangent.x, s.tangent.z),
          scale: new THREE.Vector3(1, 1, 1),
        });
      }
    });

    addInstanced(
      cactusGeo,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }),
      cacti,
    );
    addInstanced(
      mesaGeo,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, flatShading: true }),
      mesas,
    );
    addInstanced(
      bushGeo,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
      bushes,
    );

    const utPole = mergeParts([
      new THREE.CylinderGeometry(0.11, 0.14, 6.2, 6).translate(0, 3.1, 0),
      new THREE.BoxGeometry(1.8, 0.12, 0.12).translate(0, 5.7, 0),
    ]);
    addInstanced(
      utPole,
      new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.92 }),
      poles,
    );
  } else {
    // Mountain Pass & Snowy Forest: multi-tier textured evergreens, boulders, chalets/chevrons
    const isSnow = env.sceneryType === 'snow';
    const barkTex = createBarkTexture(false);
    const foliageTex = createFoliageTexture(isSnow);
    disposables.push(barkTex, foliageTex);

    const { trunkGeo, foliageGeo } = createRealisticPineGeometries();
    const trunks: TransformItem[] = [];
    const foliages: TransformItem[] = [];
    const rocks: TransformItem[] = [];
    const cabins: TransformItem[] = [];
    const chevrons: TransformItem[] = [];

    populateRoadside(3, 3.2, 24, true, (pos, _side, i, s) => {
      const sc = 0.85 + Math.random() * 0.95;
      const rot = Math.random() * Math.PI * 2;
      trunks.push({ pos, rotY: rot, scale: new THREE.Vector3(sc, sc, sc) });
      foliages.push({
        pos,
        rotY: rot,
        scale: new THREE.Vector3(sc, sc, sc),
        tint: isSnow
          ? i % 3 === 0
            ? 0xe2e8f0
            : 0x94a3b8
          : i % 3 === 0
            ? 0x166534
            : i % 3 === 1
              ? 0x14532d
              : 0x15803d,
      });

      if (i % 3 === 0) {
        rocks.push({
          pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 14, -0.2, (Math.random() - 0.5) * 14)),
          rotY: Math.random() * Math.PI,
          scale: new THREE.Vector3(2.2 + Math.random() * 3.5, 2 + Math.random() * 4.5, 2.2 + Math.random() * 3.5),
          tint: isSnow ? 0x94a3b8 : 0x57534e,
        });
      }

      if (isSnow && i % 14 === 0) {
        cabins.push({
          pos: pos.clone().addScaledVector(s.right, _side * 8),
          rotY: Math.atan2(s.tangent.x, s.tangent.z),
          scale: new THREE.Vector3(1.1, 1.1, 1.1),
        });
      }
    });

    // Add reflective yellow chevron warning boards on sharp mountain curves
    if (env.sceneryType === 'mountain') {
      for (let i = 6; i < samples.length - 6; i += 5) {
        const sPrev = samples[i - 3];
        const sNext = samples[i + 3];
        const crossY =
          sPrev.tangent.z * sNext.tangent.x - sPrev.tangent.x * sNext.tangent.z;
        if (Math.abs(crossY) > 0.14) {
          const outerSide = crossY > 0 ? 1 : -1;
          const s = samples[i];
          chevrons.push({
            pos: new THREE.Vector3(
              s.pos.x + s.right.x * (halfW + 1.2) * outerSide,
              s.pos.y,
              s.pos.z + s.right.z * (halfW + 1.2) * outerSide,
            ),
            rotY: Math.atan2(-s.tangent.x, -s.tangent.z),
            scale: new THREE.Vector3(1, 1, 1),
          });
        }
      }
    }

    addInstanced(
      trunkGeo,
      new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.95 }),
      trunks,
    );
    addInstanced(
      foliageGeo,
      new THREE.MeshStandardMaterial({
        map: foliageTex,
        color: 0xffffff,
        roughness: 0.82,
        flatShading: true,
      }),
      foliages,
    );

    const rGeo = new THREE.DodecahedronGeometry(1.1, 0);
    rGeo.translate(0, 0.55, 0);
    addInstanced(
      rGeo,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }),
      rocks,
    );

    if (cabins.length > 0) {
      const cabinWalls = new THREE.BoxGeometry(5.5, 3.2, 4.4).translate(0, 1.6, 0);
      const cabinRoof = new THREE.ConeGeometry(4.4, 2.2, 4).rotateY(Math.PI / 4).translate(0, 4.3, 0);
      addInstanced(
        mergeParts([cabinWalls, cabinRoof]),
        new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.88 }),
        cabins,
      );
    }

    if (chevrons.length > 0) {
      const chevTex = createChevronSignTexture();
      disposables.push(chevTex);
      const boardGeo = new THREE.BoxGeometry(1.3, 1.3, 0.12).translate(0, 1.7, 0);
      addInstanced(
        boardGeo,
        new THREE.MeshBasicMaterial({ map: chevTex }),
        chevrons,
      );
    }
  }

  return { group, disposables, lampLights };
}
