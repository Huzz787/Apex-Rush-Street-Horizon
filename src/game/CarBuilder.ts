import * as THREE from 'three';
import { CarId } from './types';

export interface CarModelRig {
  group: THREE.Group;
  bodyMesh: THREE.Mesh;
  paintMaterial: THREE.MeshPhysicalMaterial;
  frontWheels: THREE.Group[];
  rearWheels: THREE.Group[];
  taillightMaterial: THREE.MeshStandardMaterial;
  headlightSpots?: THREE.SpotLight[];
  exhaustPositions: THREE.Vector3[];
  policeLights?: {
    redMat: THREE.MeshStandardMaterial;
    blueMat: THREE.MeshStandardMaterial;
    pointLight: THREE.PointLight;
  };
}

let sharedShadowTex: THREE.CanvasTexture | null = null;

function getShadowTex(): THREE.CanvasTexture {
  if (!sharedShadowTex) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(64, 64, 14, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,0.72)');
    grad.addColorStop(0.65, 'rgba(0,0,0,0.32)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    sharedShadowTex = new THREE.CanvasTexture(canvas);
    sharedShadowTex.colorSpace = THREE.SRGBColorSpace;
  }
  return sharedShadowTex;
}

/**
 * Builds the lower sculpted chassis with semicircular wheel-arch cutouts
 * so tires sit inside real wheel wells. Car faces -Z (front at profile +X).
 */
function buildLowerChassisWithArches(params: {
  frontOverhang: number;
  rearOverhang: number;
  frontAxleX: number;
  rearAxleX: number;
  archRadius: number;
  clearance: number;
  noseHeight: number;
  hoodHeight: number;
  beltHeight: number;
  trunkHeight: number;
  width: number;
}): THREE.BufferGeometry {
  const {
    frontOverhang,
    rearOverhang,
    frontAxleX,
    rearAxleX,
    archRadius,
    clearance,
    noseHeight,
    hoodHeight,
    beltHeight,
    trunkHeight,
    width,
  } = params;

  const shape = new THREE.Shape();
  // Start behind rear bumper bottom
  shape.moveTo(-rearOverhang, clearance + 0.08);
  // Under rear bumper toward rear wheel arch
  shape.lineTo(rearAxleX - archRadius, clearance);
  // Rear wheel arch semicircle (counter-clockwise from PI to 0)
  shape.absarc(rearAxleX, clearance + 0.04, archRadius, Math.PI, 0, true);
  // Rocker sill between wheels
  shape.lineTo(frontAxleX - archRadius, clearance);
  // Front wheel arch semicircle
  shape.absarc(frontAxleX, clearance + 0.04, archRadius, Math.PI, 0, true);
  // Front splitter chin
  shape.lineTo(frontOverhang - 0.06, clearance);
  shape.lineTo(frontOverhang + 0.06, noseHeight * 0.55);
  shape.lineTo(frontOverhang, noseHeight);
  // Sculpted hood slope
  shape.lineTo(frontAxleX - 0.35, hoodHeight);
  // Beltline along doors to rear deck
  shape.lineTo(rearAxleX + 0.25, beltHeight);
  shape.lineTo(-rearOverhang + 0.06, trunkHeight);
  shape.lineTo(-rearOverhang, trunkHeight * 0.65);
  shape.closePath();

  const innerWidth = width - 0.16;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: innerWidth,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.055,
    bevelSegments: 2,
    curveSegments: 10,
    steps: 1,
  });

  // Rotate so profile +X becomes -Z (forward) and depth becomes X (width)
  geo.translate(0, 0, -innerWidth / 2);
  geo.rotateY(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a tapered automotive greenhouse cabin (narrower roof than beltline = tumblehome)
 * plus flush dark glass windshield, rear glass, and side windows.
 */
function buildTaperedCabin(params: {
  baseFrontZ: number;
  baseRearZ: number;
  roofFrontZ: number;
  roofRearZ: number;
  baseY: number;
  roofY: number;
  baseHalfW: number;
  roofHalfW: number;
}): { roofGeo: THREE.BufferGeometry; glassGeo: THREE.BufferGeometry } {
  const {
    baseFrontZ,
    baseRearZ,
    roofFrontZ,
    roofRearZ,
    baseY,
    roofY,
    baseHalfW,
    roofHalfW,
  } = params;

  // Build truncated prism / lofted cabin shell
  const makePrism = (
    bfZ: number,
    brZ: number,
    rfZ: number,
    rrZ: number,
    bY: number,
    rY: number,
    bW: number,
    rW: number,
  ) => {
    const geo = new THREE.BufferGeometry();
    // 8 corners: 0..3 bottom (FL, FR, RR, RL), 4..7 top (FL, FR, RR, RL)
    const verts = new Float32Array([
      -bW, bY, bfZ, // 0
       bW, bY, bfZ, // 1
       bW, bY, brZ, // 2
      -bW, bY, brZ, // 3
      -rW, rY, rfZ, // 4
       rW, rY, rfZ, // 5
       rW, rY, rrZ, // 6
      -rW, rY, rrZ, // 7
    ]);
    const indices = [
      // Top roof
      4, 5, 6, 4, 6, 7,
      // Front windshield
      0, 1, 5, 0, 5, 4,
      // Rear window
      2, 3, 7, 2, 7, 6,
      // Left side
      3, 0, 4, 3, 4, 7,
      // Right side
      1, 2, 6, 1, 6, 5,
    ];
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setIndex(indices);
    const nonIndexed = geo.toNonIndexed();
    nonIndexed.computeVertexNormals();
    geo.dispose();
    return nonIndexed;
  };

  // Glass greenhouse (full sloped surface)
  const glassGeo = makePrism(
    baseFrontZ,
    baseRearZ,
    roofFrontZ,
    roofRearZ,
    baseY,
    roofY,
    baseHalfW,
    roofHalfW,
  );

  // Painted roof cap slightly raised & inset in Z so windshield/rear glass remain visible
  const roofGeo = makePrism(
    roofFrontZ - 0.04,
    roofRearZ + 0.04,
    roofFrontZ + 0.04,
    roofRearZ - 0.04,
    roofY - 0.03,
    roofY + 0.035,
    roofHalfW + 0.02,
    roofHalfW * 0.96,
  );

  return { roofGeo, glassGeo };
}

/**
 * Multi-part realistic wheel with LatheGeometry curved tire sidewall,
 * 5-spoke metallic alloy rim, disc brake rotor, and colored brake caliper.
 */
function createRealisticWheel(
  radius: number,
  width: number,
  rimColor = 0xe2e8f0,
  caliperColor = 0xef4444,
  isLeft = true,
): THREE.Group {
  const wheelGroup = new THREE.Group();

  // 1. Profiled Rubber Tire using LatheGeometry
  const hw = width * 0.5;
  const innerR = radius * 0.64;
  const shoulderR = radius * 0.94;
  const lathePts = [
    new THREE.Vector2(innerR, -hw * 0.85),
    new THREE.Vector2(shoulderR, -hw),
    new THREE.Vector2(radius, -hw * 0.72),
    new THREE.Vector2(radius, hw * 0.72),
    new THREE.Vector2(shoulderR, hw),
    new THREE.Vector2(innerR, hw * 0.85),
    new THREE.Vector2(innerR, -hw * 0.85),
  ];
  const tireGeo = new THREE.LatheGeometry(lathePts, 24);
  tireGeo.rotateZ(Math.PI / 2);

  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x17171a,
    roughness: 0.86,
    metalness: 0.06,
  });
  const tire = new THREE.Mesh(tireGeo, tireMat);
  tire.castShadow = true;
  wheelGroup.add(tire);

  // 2. Alloy Rim Outer Barrel
  const barrelGeo = new THREE.CylinderGeometry(
    innerR,
    innerR,
    width * 0.88,
    20,
    1,
    true,
  );
  barrelGeo.rotateZ(Math.PI / 2);
  const rimMat = new THREE.MeshStandardMaterial({
    color: rimColor,
    roughness: 0.22,
    metalness: 0.9,
    side: THREE.DoubleSide,
  });
  wheelGroup.add(new THREE.Mesh(barrelGeo, rimMat));

  // 3. Brake Disc Rotor (inside wheel)
  const rotorGeo = new THREE.CylinderGeometry(
    innerR * 0.78,
    innerR * 0.78,
    0.04,
    18,
  );
  rotorGeo.rotateZ(Math.PI / 2);
  const rotorMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.35,
    metalness: 0.85,
  });
  const rotor = new THREE.Mesh(rotorGeo, rotorMat);
  rotor.position.x = isLeft ? 0.03 : -0.03;
  wheelGroup.add(rotor);

  // 4. Colored Brake Caliper
  const caliperGeo = new THREE.BoxGeometry(0.08, innerR * 0.42, innerR * 0.28);
  const caliperMat = new THREE.MeshStandardMaterial({
    color: caliperColor,
    roughness: 0.35,
    metalness: 0.4,
  });
  const caliper = new THREE.Mesh(caliperGeo, caliperMat);
  caliper.position.set(isLeft ? 0.03 : -0.03, innerR * 0.35, innerR * 0.32);
  wheelGroup.add(caliper);

  // 5. 5-Spoke Alloy Rim Face + Center Hub
  const spokeOffsetX = isLeft ? -hw * 0.76 : hw * 0.76;
  const hubGeo = new THREE.CylinderGeometry(
    innerR * 0.28,
    innerR * 0.28,
    0.06,
    12,
  );
  hubGeo.rotateZ(Math.PI / 2);
  const hub = new THREE.Mesh(hubGeo, rimMat);
  hub.position.x = spokeOffsetX;
  wheelGroup.add(hub);

  const spokeGeo = new THREE.BoxGeometry(0.035, innerR * 0.92, 0.055);
  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.Mesh(spokeGeo, rimMat);
    const angle = (i / 5) * Math.PI * 2;
    spoke.position.set(
      spokeOffsetX,
      Math.cos(angle) * innerR * 0.48,
      Math.sin(angle) * innerR * 0.48,
    );
    spoke.rotation.x = angle;
    wheelGroup.add(spoke);
  }

  return wheelGroup;
}

export function buildCarModel(
  carId: CarId | 'police' | 'traffic',
  paintHex: string,
  options?: { withHeadlightSpots?: boolean; trafficVariant?: number },
): CarModelRig {
  const group = new THREE.Group();

  const paintMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(paintHex),
    metalness: 0.68,
    roughness: 0.18,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
  });

  const carbonTrimMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.55,
    metalness: 0.28,
  });

  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.16,
    metalness: 0.94,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x090f1d,
    roughness: 0.06,
    metalness: 0.22,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
  });

  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfef9c3,
    emissiveIntensity: 2.5,
    roughness: 0.1,
  });

  const drlMat = new THREE.MeshStandardMaterial({
    color: 0xe0f2fe,
    emissive: 0x7dd3fc,
    emissiveIntensity: 2.0,
    roughness: 0.1,
  });

  const taillightMaterial = new THREE.MeshStandardMaterial({
    color: 0x991b1b,
    emissive: 0xef4444,
    emissiveIntensity: 1.25,
    roughness: 0.18,
  });

  // Per-model chassis & cabin dimensions (facing -Z; +X in profile = front)
  let width = 1.92;
  let wheelRadius = 0.36;
  let wheelWidth = 0.28;
  let frontAxleX = 1.32;
  let rearAxleX = -1.32;
  let frontOverhang = 2.08;
  let rearOverhang = 2.04;
  let clearance = 0.18;
  let noseHeight = 0.52;
  let hoodHeight = 0.76;
  let beltHeight = 0.82;
  let trunkHeight = 0.8;
  let roofY = 1.28;
  let cabinFrontBaseZ = -0.82;
  let cabinRearBaseZ = 1.38;
  let cabinRoofFrontZ = -0.22;
  let cabinRoofRearZ = 0.88;
  let rimColor = 0xe2e8f0;
  let caliperColor = 0xef4444;

  if (carId === 'compact') {
    width = 1.84;
    wheelRadius = 0.33;
    frontAxleX = 1.24;
    rearAxleX = -1.2;
    frontOverhang = 1.88;
    rearOverhang = 1.84;
    clearance = 0.18;
    noseHeight = 0.52;
    hoodHeight = 0.78;
    beltHeight = 0.84;
    trunkHeight = 0.82;
    roofY = 1.36;
    cabinFrontBaseZ = -0.78;
    cabinRearBaseZ = 1.56;
    cabinRoofFrontZ = -0.24;
    cabinRoofRearZ = 1.22;
  } else if (carId === 'muscle') {
    width = 2.04;
    wheelRadius = 0.37;
    wheelWidth = 0.32;
    frontAxleX = 1.44;
    rearAxleX = -1.38;
    frontOverhang = 2.28;
    rearOverhang = 2.24;
    clearance = 0.18;
    noseHeight = 0.6;
    hoodHeight = 0.86;
    beltHeight = 0.9;
    trunkHeight = 0.88;
    roofY = 1.34;
    cabinFrontBaseZ = -0.64;
    cabinRearBaseZ = 1.46;
    cabinRoofFrontZ = -0.05;
    cabinRoofRearZ = 0.96;
    rimColor = 0xd1d5db;
    caliperColor = 0xf59e0b;
  } else if (carId === 'coupe') {
    width = 1.96;
    wheelRadius = 0.36;
    wheelWidth = 0.3;
    frontAxleX = 1.38;
    rearAxleX = -1.34;
    frontOverhang = 2.16;
    rearOverhang = 2.12;
    clearance = 0.16;
    noseHeight = 0.48;
    hoodHeight = 0.74;
    beltHeight = 0.8;
    trunkHeight = 0.78;
    roofY = 1.25;
    cabinFrontBaseZ = -0.74;
    cabinRearBaseZ = 1.44;
    cabinRoofFrontZ = -0.1;
    cabinRoofRearZ = 0.86;
    rimColor = 0xf59e0b;
    caliperColor = 0xef4444;
  } else if (carId === 'rally') {
    width = 1.96;
    wheelRadius = 0.39;
    wheelWidth = 0.32;
    frontAxleX = 1.32;
    rearAxleX = -1.3;
    frontOverhang = 2.04;
    rearOverhang = 2.02;
    clearance = 0.27;
    noseHeight = 0.62;
    hoodHeight = 0.88;
    beltHeight = 0.94;
    trunkHeight = 0.9;
    roofY = 1.44;
    cabinFrontBaseZ = -0.74;
    cabinRearBaseZ = 1.4;
    cabinRoofFrontZ = -0.18;
    cabinRoofRearZ = 0.96;
    rimColor = 0xfef08a;
    caliperColor = 0x38bdf8;
  } else if (carId === 'supercar') {
    width = 2.08;
    wheelRadius = 0.36;
    wheelWidth = 0.34;
    frontAxleX = 1.42;
    rearAxleX = -1.38;
    frontOverhang = 2.26;
    rearOverhang = 2.2;
    clearance = 0.13;
    noseHeight = 0.38;
    hoodHeight = 0.64;
    beltHeight = 0.74;
    trunkHeight = 0.72;
    roofY = 1.12;
    cabinFrontBaseZ = -0.96;
    cabinRearBaseZ = 1.1;
    cabinRoofFrontZ = -0.22;
    cabinRoofRearZ = 0.62;
    rimColor = 0x38bdf8;
    caliperColor = 0xfacc15;
  } else if (carId === 'hyper') {
    width = 2.12;
    wheelRadius = 0.37;
    wheelWidth = 0.36;
    frontAxleX = 1.46;
    rearAxleX = -1.42;
    frontOverhang = 2.38;
    rearOverhang = 2.28;
    clearance = 0.12;
    noseHeight = 0.34;
    hoodHeight = 0.58;
    beltHeight = 0.7;
    trunkHeight = 0.68;
    roofY = 1.07;
    cabinFrontBaseZ = -1.04;
    cabinRearBaseZ = 0.98;
    cabinRoofFrontZ = -0.28;
    cabinRoofRearZ = 0.54;
    rimColor = 0xa3e635;
    caliperColor = 0x84cc16;
  } else if (carId === 'police') {
    width = 2.0;
    wheelRadius = 0.36;
    frontAxleX = 1.38;
    rearAxleX = -1.36;
    frontOverhang = 2.18;
    rearOverhang = 2.16;
    clearance = 0.18;
    noseHeight = 0.54;
    hoodHeight = 0.8;
    beltHeight = 0.85;
    trunkHeight = 0.83;
    roofY = 1.34;
    cabinFrontBaseZ = -0.76;
    cabinRearBaseZ = 1.38;
    cabinRoofFrontZ = -0.18;
    cabinRoofRearZ = 0.92;
    paintMaterial.color.set('#0f172a');
    rimColor = 0x94a3b8;
  } else {
    // Ambient traffic sedan / SUV
    const v = options?.trafficVariant ?? 0;
    width = v === 1 ? 2.02 : 1.86;
    wheelRadius = v === 1 ? 0.38 : 0.34;
    frontAxleX = 1.28;
    rearAxleX = -1.28;
    frontOverhang = 2.02;
    rearOverhang = 2.02;
    clearance = v === 1 ? 0.25 : 0.18;
    noseHeight = v === 1 ? 0.64 : 0.54;
    hoodHeight = v === 1 ? 0.9 : 0.78;
    beltHeight = v === 1 ? 0.96 : 0.84;
    trunkHeight = v === 1 ? 0.94 : 0.82;
    roofY = v === 1 ? 1.58 : 1.34;
    cabinFrontBaseZ = -0.72;
    cabinRearBaseZ = v === 1 ? 1.65 : 1.36;
    cabinRoofFrontZ = -0.18;
    cabinRoofRearZ = v === 1 ? 1.4 : 0.94;
  }

  // 1. Sculpted Lower Chassis with Wheel Arch Cutouts
  const bodyGeo = buildLowerChassisWithArches({
    frontOverhang,
    rearOverhang,
    frontAxleX,
    rearAxleX,
    archRadius: wheelRadius + 0.085,
    clearance,
    noseHeight,
    hoodHeight,
    beltHeight,
    trunkHeight,
    width,
  });
  const bodyMesh = new THREE.Mesh(bodyGeo, paintMaterial);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  group.add(bodyMesh);

  // 2. Dark Inner Wheel Well Liners & Undercarriage Pan
  const underPan = new THREE.Mesh(
    new THREE.BoxGeometry(width - 0.36, 0.12, frontOverhang + rearOverhang - 0.35),
    carbonTrimMat,
  );
  underPan.position.set(0, clearance + 0.08, (rearOverhang - frontOverhang) * 0.5);
  group.add(underPan);

  // 3. Tapered Automotive Greenhouse Cabin (Glass + Body-Colored Roof)
  const { roofGeo, glassGeo } = buildTaperedCabin({
    baseFrontZ: cabinFrontBaseZ,
    baseRearZ: cabinRearBaseZ,
    roofFrontZ: cabinRoofFrontZ,
    roofRearZ: cabinRoofRearZ,
    baseY: beltHeight - 0.03,
    roofY,
    baseHalfW: width * 0.44,
    roofHalfW: width * 0.35,
  });
  const cabinGlass = new THREE.Mesh(glassGeo, glassMat);
  cabinGlass.castShadow = true;
  group.add(cabinGlass);

  const cabinRoof = new THREE.Mesh(roofGeo, paintMaterial);
  cabinRoof.castShadow = true;
  group.add(cabinRoof);

  // 4. Front Carbon Splitter & Recessed Grille
  const frontZ = -frontOverhang;
  const rearZ = rearOverhang;

  const splitter = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.04, 0.06, 0.28),
    carbonTrimMat,
  );
  splitter.position.set(0, clearance + 0.02, frontZ - 0.02);
  group.add(splitter);

  const grille = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.58, 0.2, 0.12),
    carbonTrimMat,
  );
  grille.position.set(0, clearance + 0.18, frontZ - 0.01);
  group.add(grille);

  // Side rocker skirts
  const skirtLen = frontAxleX - rearAxleX - (wheelRadius + 0.1) * 2;
  if (skirtLen > 0.4) {
    const skirtGeo = new THREE.BoxGeometry(0.1, 0.08, skirtLen);
    const skirtL = new THREE.Mesh(skirtGeo, carbonTrimMat);
    skirtL.position.set(-width * 0.5 + 0.01, clearance + 0.04, 0);
    const skirtR = new THREE.Mesh(skirtGeo, carbonTrimMat);
    skirtR.position.set(width * 0.5 - 0.01, clearance + 0.04, 0);
    group.add(skirtL, skirtR);
  }

  // 5. Rear Diffuser + Strakes
  const diffuser = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.72, 0.16, 0.22),
    carbonTrimMat,
  );
  diffuser.position.set(0, clearance + 0.08, rearZ + 0.02);
  group.add(diffuser);
  for (let fx = -0.45; fx <= 0.45; fx += 0.3) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.24), carbonTrimMat);
    fin.position.set(fx, clearance + 0.06, rearZ + 0.05);
    group.add(fin);
  }

  // 6. Multi-Element LED Headlights + DRL Light Strip
  const hlY = noseHeight * 0.78 + 0.06;
  const hlGeo = new THREE.BoxGeometry(0.36, 0.11, 0.12);
  const drlGeo = new THREE.BoxGeometry(0.4, 0.035, 0.13);
  for (const side of [-1, 1]) {
    const hl = new THREE.Mesh(hlGeo, headlightMat);
    hl.position.set(side * width * 0.33, hlY, frontZ + 0.02);
    const drl = new THREE.Mesh(drlGeo, drlMat);
    drl.position.set(side * width * 0.33, hlY - 0.075, frontZ + 0.01);
    group.add(hl, drl);
  }

  // 7. Sculpted LED Taillights
  const tlY = trunkHeight - 0.14;
  const tlGeo = new THREE.BoxGeometry(0.44, 0.11, 0.1);
  for (const side of [-1, 1]) {
    const tl = new THREE.Mesh(tlGeo, taillightMaterial);
    tl.position.set(side * width * 0.32, tlY, rearZ + 0.03);
    group.add(tl);
  }

  // 8. Sculpted Side Mirrors on Stalks
  for (const side of [-1, 1]) {
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.08), carbonTrimMat);
    stalk.position.set(side * (width * 0.47), beltHeight + 0.04, cabinFrontBaseZ + 0.22);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.09, 0.16), paintMaterial);
    cap.position.set(side * (width * 0.53), beltHeight + 0.06, cabinFrontBaseZ + 0.25);
    group.add(stalk, cap);
  }

  // 9. Twin / Quad Exhaust Pipes
  const pipeGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.22, 10);
  pipeGeo.rotateX(Math.PI / 2);
  const exhaustOffset = width * 0.26;
  const exhaustZ = rearZ + 0.06;
  const exhaustY = clearance + 0.08;
  for (const side of [-1, 1]) {
    const p1 = new THREE.Mesh(pipeGeo, chromeMat);
    p1.position.set(side * exhaustOffset, exhaustY, exhaustZ);
    group.add(p1);
    if (carId === 'muscle' || carId === 'supercar' || carId === 'hyper') {
      const p2 = new THREE.Mesh(pipeGeo, chromeMat);
      p2.position.set(side * (exhaustOffset + 0.14), exhaustY, exhaustZ);
      group.add(p2);
    }
  }

  // 10. Car-Specific Hero Aero & Exterior Details
  if (carId === 'muscle') {
    // Hood supercharger scoop + twin racing stripes
    const blower = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.18, 0.72), chromeMat);
    blower.position.set(0, hoodHeight + 0.08, -1.15);
    group.add(blower);

    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });
    for (const sx of [-0.16, 0.16]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 1.3), stripeMat);
      s.position.set(sx, hoodHeight + 0.02, -1.35);
      group.add(s);
    }
    const ducktail = new THREE.Mesh(new THREE.BoxGeometry(width * 0.88, 0.11, 0.18), paintMaterial);
    ducktail.position.set(0, trunkHeight + 0.05, rearZ - 0.08);
    ducktail.rotation.x = -0.3;
    group.add(ducktail);
  } else if (carId === 'coupe' || carId === 'supercar' || carId === 'hyper') {
    const wingY = carId === 'hyper' ? trunkHeight + 0.38 : trunkHeight + 0.28;
    const wingBlade = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.08, 0.055, 0.34),
      carbonTrimMat,
    );
    wingBlade.position.set(0, wingY, rearZ - 0.16);
    wingBlade.rotation.x = 0.12;
    group.add(wingBlade);

    for (const px of [-0.46, 0.46]) {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.22), carbonTrimMat);
      pylon.position.set(px, wingY - 0.15, rearZ - 0.14);
      group.add(pylon);
    }

    if (carId === 'supercar' || carId === 'hyper') {
      // Side air intake blades behind doors
      for (const side of [-1, 1]) {
        const intake = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.32, 0.72),
          carbonTrimMat,
        );
        intake.position.set(side * (width * 0.48), beltHeight - 0.18, 0.55);
        group.add(intake);
      }
      // Visible metallic V10/V12 engine bay cover + glass louver
      const engBlock = new THREE.Mesh(
        new THREE.BoxGeometry(0.75, 0.22, 0.85),
        chromeMat,
      );
      engBlock.position.set(0, trunkHeight - 0.05, 1.38);
      group.add(engBlock);
    }

    if (carId === 'hyper') {
      // Front aero canards + dorsal shark fin + full-width rear LED blade
      for (const side of [-1, 1]) {
        const canard = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.28), carbonTrimMat);
        canard.position.set(side * (width * 0.49), noseHeight + 0.04, frontZ + 0.35);
        canard.rotation.z = side * 0.25;
        group.add(canard);
      }
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.26, 0.92), paintMaterial);
      fin.position.set(0, roofY + 0.04, 1.02);
      group.add(fin);

      const ledBar = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.82, 0.05, 0.09),
        taillightMaterial,
      );
      ledBar.position.set(0, tlY, rearZ + 0.04);
      group.add(ledBar);
    }
  } else if (carId === 'rally') {
    const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.54), carbonTrimMat);
    scoop.position.set(0, roofY + 0.06, 0.15);
    group.add(scoop);

    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.14, 0.18), carbonTrimMat);
    pod.position.set(0, hoodHeight + 0.06, frontZ + 0.35);
    group.add(pod);
    for (let i = -1.5; i <= 1.5; i += 1) {
      const lamp = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.075, 0.08, 12),
        headlightMat,
      );
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set(i * 0.23, hoodHeight + 0.06, frontZ + 0.27);
      group.add(lamp);
    }
    const rallyWing = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.92, 0.07, 0.32),
      paintMaterial,
    );
    rallyWing.position.set(0, roofY - 0.02, rearZ - 0.24);
    group.add(rallyWing);
  } else if (carId === 'compact') {
    const roofSpoiler = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.78, 0.06, 0.22),
      carbonTrimMat,
    );
    roofSpoiler.position.set(0, roofY + 0.02, cabinRoofRearZ + 0.08);
    group.add(roofSpoiler);
  }

  // Police interceptor door panels, push bar & lightbar
  let policeLights: CarModelRig['policeLights'];
  if (carId === 'police') {
    const doorPanel = new THREE.Mesh(
      new THREE.BoxGeometry(width - 0.02, 0.42, 1.4),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.28 }),
    );
    doorPanel.position.set(0, beltHeight - 0.24, 0.05);
    group.add(doorPanel);

    const bullbar = new THREE.Mesh(new THREE.BoxGeometry(width * 0.72, 0.26, 0.18), carbonTrimMat);
    bullbar.position.set(0, clearance + 0.26, frontZ - 0.08);
    group.add(bullbar);

    const redMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xef4444,
      emissiveIntensity: 3.2,
    });
    const blueMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      emissive: 0x3b82f6,
      emissiveIntensity: 3.2,
    });
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.07, 0.22), carbonTrimMat);
    barBase.position.set(0, roofY + 0.06, 0.25);
    const redPod = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.11, 0.2), redMat);
    redPod.position.set(-0.31, roofY + 0.12, 0.25);
    const bluePod = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.11, 0.2), blueMat);
    bluePod.position.set(0.31, roofY + 0.12, 0.25);

    const pointLight = new THREE.PointLight(0xef4444, 7, 24);
    pointLight.position.set(0, roofY + 0.55, 0.25);
    group.add(barBase, redPod, bluePod, pointLight);

    policeLights = { redMat, blueMat, pointLight };
  }

  // 11. Four Realistic Multi-Part Wheels (tucked neatly inside wheel wells)
  const wheelOffsetX = width * 0.47;
  const frontZPos = -frontAxleX;
  const rearZPos = -rearAxleX;
  const frontWheels: THREE.Group[] = [];
  const rearWheels: THREE.Group[] = [];

  const flPivot = new THREE.Group();
  flPivot.position.set(-wheelOffsetX, wheelRadius, frontZPos);
  flPivot.add(createRealisticWheel(wheelRadius, wheelWidth, rimColor, caliperColor, true));
  group.add(flPivot);
  frontWheels.push(flPivot);

  const frPivot = new THREE.Group();
  frPivot.position.set(wheelOffsetX, wheelRadius, frontZPos);
  frPivot.add(createRealisticWheel(wheelRadius, wheelWidth, rimColor, caliperColor, false));
  group.add(frPivot);
  frontWheels.push(frPivot);

  const rlWheel = createRealisticWheel(wheelRadius, wheelWidth, rimColor, caliperColor, true);
  rlWheel.position.set(-wheelOffsetX, wheelRadius, rearZPos);
  group.add(rlWheel);
  rearWheels.push(rlWheel);

  const rrWheel = createRealisticWheel(wheelRadius, wheelWidth, rimColor, caliperColor, false);
  rrWheel.position.set(wheelOffsetX, wheelRadius, rearZPos);
  group.add(rrWheel);
  rearWheels.push(rrWheel);

  // 12. Grounded Contact Shadow
  const shadowGeo = new THREE.PlaneGeometry(
    width + 1.1,
    frontOverhang + rearOverhang + 1.1,
  );
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: getShadowTex(),
    transparent: true,
    depthWrite: false,
    opacity: 0.76,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.set(0, 0.02, (rearOverhang - frontOverhang) * 0.5);
  group.add(contactShadow);

  // Optional player headlight spots for night stages
  let headlightSpots: THREE.SpotLight[] | undefined;
  if (options?.withHeadlightSpots) {
    headlightSpots = [];
    for (const side of [-1, 1]) {
      const spot = new THREE.SpotLight(0xfef9c3, 15, 80, Math.PI / 5, 0.5, 1.3);
      spot.position.set(side * width * 0.32, hlY, frontZ);
      spot.target.position.set(side * width * 0.2, 0, frontZ - 26);
      group.add(spot, spot.target);
      headlightSpots.push(spot);
    }
  }

  return {
    group,
    bodyMesh,
    paintMaterial,
    frontWheels,
    rearWheels,
    taillightMaterial,
    headlightSpots,
    exhaustPositions: [
      new THREE.Vector3(-exhaustOffset, exhaustY, exhaustZ + 0.14),
      new THREE.Vector3(exhaustOffset, exhaustY, exhaustZ + 0.14),
    ],
    policeLights,
  };
}
