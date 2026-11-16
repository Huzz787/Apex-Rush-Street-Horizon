import * as THREE from 'three';

/**
 * Procedural CanvasTexture generators with proper SRGBColorSpace and anisotropy.
 */
export function createRoadTexture(params: {
  roadColor: string;
  shoulderColor: string;
  isWet: boolean;
  isSnow: boolean;
  maxAnisotropy: number;
}): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Base asphalt
  ctx.fillStyle = params.roadColor;
  ctx.fillRect(0, 0, 512, 512);

  // Fine asphalt aggregate grain
  for (let i = 0; i < 9500; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const shade =
      Math.random() > 0.5 ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.11)';
    ctx.fillStyle = shade;
    ctx.fillRect(x, y, 2, 2);
  }

  // Subtle longitudinal tire wear grooves
  ctx.fillStyle = params.isWet ? 'rgba(2, 6, 23, 0.34)' : 'rgba(0, 0, 0, 0.16)';
  ctx.fillRect(88, 0, 82, 512);
  ctx.fillRect(342, 0, 82, 512);

  // Subtle tar crack / expansion seam
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(20, 256);
  ctx.lineTo(492, 260);
  ctx.stroke();

  // Wet / icy specular patches
  if (params.isWet || params.isSnow) {
    for (let i = 0; i < 24; i++) {
      const gx = 36 + Math.random() * 440;
      const gy = Math.random() * 512;
      const r = 24 + Math.random() * 34;
      const grad = ctx.createRadialGradient(gx, gy, 3, gx, gy, r);
      grad.addColorStop(
        0,
        params.isSnow ? 'rgba(241,245,249,0.28)' : 'rgba(56,189,248,0.18)',
      );
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
    }
  }

  // Outer shoulder curb stripes
  ctx.fillStyle = params.shoulderColor;
  ctx.fillRect(0, 0, 20, 512);
  ctx.fillRect(492, 0, 20, 512);

  ctx.fillStyle = '#f8fafc';
  for (let y = 0; y < 512; y += 64) {
    ctx.fillRect(0, y, 20, 32);
    ctx.fillRect(492, y, 20, 32);
  }

  // Crisp outer solid boundary lines
  ctx.fillStyle = 'rgba(248, 250, 252, 0.9)';
  ctx.fillRect(28, 0, 6, 512);
  ctx.fillRect(478, 0, 6, 512);

  // Dashed center double-amber/yellow divider
  ctx.fillStyle = '#facc15';
  for (let y = 16; y < 512; y += 96) {
    ctx.fillRect(248, y, 6, 54);
    ctx.fillRect(258, y, 6, 54);
  }

  // Subtle side lane markers
  ctx.fillStyle = 'rgba(255,255,255,0.34)';
  for (let y = 32; y < 512; y += 128) {
    ctx.fillRect(140, y, 4, 42);
    ctx.fillRect(368, y, 4, 42);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = params.maxAnisotropy;
  return tex;
}

export function createTerrainTexture(
  baseHex: string,
  sceneryType: string,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 512, 512);

  if (sceneryType === 'city' || sceneryType === 'chase') {
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.09)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 512; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }
  } else {
    // Natural organic grass / sand / rock mottling
    for (let i = 0; i < 45; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const r = 18 + Math.random() * 48;
      const grad = ctx.createRadialGradient(x, y, 2, x, y, r);
      grad.addColorStop(
        0,
        Math.random() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.09)',
      );
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 4000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      ctx.fillStyle =
        Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
      ctx.fillRect(x, y, 2, 2);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(85, 85);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createBarkTexture(isPalm = false): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = isPalm ? '#7c5836' : '#4a2c16';
  ctx.fillRect(0, 0, 128, 256);

  if (isPalm) {
    // Horizontal palm trunk ring scars
    for (let y = 0; y < 256; y += 14) {
      ctx.fillStyle = 'rgba(30, 18, 8, 0.42)';
      ctx.fillRect(0, y, 128, 4);
      ctx.fillStyle = 'rgba(210, 175, 130, 0.16)';
      ctx.fillRect(0, y + 4, 128, 3);
    }
  } else {
    // Vertical rough pine bark fissures
    for (let i = 0; i < 160; i++) {
      const x = Math.random() * 128;
      const y = Math.random() * 256;
      const h = 16 + Math.random() * 34;
      ctx.fillStyle =
        Math.random() > 0.45 ? 'rgba(20, 10, 4, 0.45)' : 'rgba(120, 82, 48, 0.28)';
      ctx.fillRect(x, y, 3, h);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createFoliageTexture(isSnow = false): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = isSnow ? '#cbd5e1' : '#ffffff';
  ctx.fillRect(0, 0, 256, 256);

  // Leaf/needle cluster dapple so foliage reads richly under directional light
  for (let i = 0; i < 650; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const len = 6 + Math.random() * 12;
    ctx.strokeStyle = isSnow
      ? Math.random() > 0.35
        ? 'rgba(255,255,255,0.65)'
        : 'rgba(30,60,45,0.45)'
      : Math.random() > 0.5
        ? 'rgba(0,0,0,0.22)'
        : 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * len, y + len * 0.7);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createSkyDomeTexture(
  topHex: string,
  horizonHex: string,
  isNight: boolean,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, topHex);
  grad.addColorStop(0.5, horizonHex);
  grad.addColorStop(1, horizonHex);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  if (isNight) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    for (let i = 0; i < 240; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 240;
      const r = Math.random() * 1.4 + 0.4;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Soft horizon sun disc & atmospheric cloud wisps
    const sunGrad = ctx.createRadialGradient(256, 258, 8, 256, 258, 175);
    sunGrad.addColorStop(0, 'rgba(255, 248, 220, 0.6)');
    sunGrad.addColorStop(0.4, 'rgba(255, 230, 175, 0.22)');
    sunGrad.addColorStop(1, 'rgba(255, 245, 210, 0)');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 80, 512, 320);

    for (let i = 0; i < 24; i++) {
      const cx = Math.random() * 512;
      const cy = 110 + Math.random() * 130;
      const rx = 35 + Math.random() * 65;
      const ry = 8 + Math.random() * 12;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCheckeredTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const size = 16;
  for (let y = 0; y < 64; y += size) {
    for (let x = 0; x < 256; x += size) {
      const even = (x / size + y / size) % 2 === 0;
      ctx.fillStyle = even ? '#f8fafc' : '#09090b';
      ctx.fillRect(x, y, size, size);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createBuildingFacadeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0b1120';
  ctx.fillRect(0, 0, 128, 256);

  const neonColors = ['#22d3ee', '#e879f9', '#f59e0b', '#e2e8f0'];
  for (let y = 10; y < 246; y += 14) {
    const rowColor = neonColors[Math.floor(Math.random() * neonColors.length)];
    for (let x = 8; x < 120; x += 16) {
      if (Math.random() > 0.3) {
        ctx.fillStyle =
          Math.random() > 0.68 ? rowColor : 'rgba(148, 163, 184, 0.32)';
        ctx.fillRect(x, y, 10, 7);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createChevronSignTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#facc15';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#09090b';
  ctx.lineWidth = 22;
  ctx.lineCap = 'square';
  ctx.beginPath();
  ctx.moveTo(42, 22);
  ctx.lineTo(86, 64);
  ctx.lineTo(42, 106);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
