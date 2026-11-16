import * as THREE from 'three';
import { CarModelRig } from './CarBuilder';
import { TrackData } from './TrackBuilder';
import { CarStats, CarUpgrades, InputState } from './types';

export interface RacerActor {
  id: string;
  role: 'player' | 'ai' | 'police' | 'traffic';
  rig: CarModelRig;
  pos: THREE.Vector3;
  vel: THREE.Vector3; // XZ velocity in m/s
  yaw: number;        // radians, 0 faces -Z
  pitch: number;      // road slope pitch
  roll: number;       // visual cornering body roll
  steerAngle: number; // visual front wheel angle
  wheelSpin: number;
  speed: number;      // signed forward speed (m/s)
  trackSampleIdx: number;
  trackT: number;
  lap: number;
  maxTReached: number;
  totalProgress: number; // lap + t
  finished: boolean;
  finishTimeSec: number;
  targetLaneOffset: number;
  baseSpeedFactor: number;
  nearMissCooldown: number;
}

export interface PlayerRuntimeState {
  nitro: number; // 0..100
  isNitroActive: boolean;
  isDrifting: boolean;
  driftScoreCurrent: number;
  totalDriftScore: number;
  nearMissCount: number;
  collisionCount: number;
  bustedProgress: number; // 0..100
  wrongWay: boolean;
  gear: string;
  rpmRatio: number;
  eventBanner: string | null;
  eventBannerTimer: number;
  hitFlashTimer: number;
}

export interface PhysicsCallbacks {
  onCollision: (x: number, y: number, z: number, intensity: number) => void;
  onNearMiss: () => void;
  onDriftSmoke: (x: number, y: number, z: number, vx: number, vz: number) => void;
  onNitroFlame: (x: number, y: number, z: number, vx: number, vy: number, vz: number) => void;
}

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _targetPos = new THREE.Vector3();
const _exhaustWorld = new THREE.Vector3();

export function createRacerActor(
  id: string,
  role: RacerActor['role'],
  rig: CarModelRig,
  startPos: THREE.Vector3,
  startYaw: number,
  sampleIdx: number,
  t: number,
  targetLaneOffset = 0,
  baseSpeedFactor = 1,
): RacerActor {
  return {
    id,
    role,
    rig,
    pos: startPos.clone(),
    vel: new THREE.Vector3(),
    yaw: startYaw,
    pitch: 0,
    roll: 0,
    steerAngle: 0,
    wheelSpin: 0,
    speed: 0,
    trackSampleIdx: sampleIdx,
    trackT: t,
    lap: 1,
    maxTReached: t,
    totalProgress: t,
    finished: false,
    finishTimeSec: 0,
    targetLaneOffset,
    baseSpeedFactor,
    nearMissCooldown: 0,
  };
}

export function stepPlayerPhysics(
  player: RacerActor,
  state: PlayerRuntimeState,
  stats: CarStats,
  upgrades: CarUpgrades,
  input: InputState,
  track: TrackData,
  dt: number,
  raceTimeSec: number,
  canDrive: boolean,
  callbacks: PhysicsCallbacks,
): void {
  const envGrip = track.config.surfaceGrip;
  const effectiveGrip = Math.min(1.08, envGrip + stats.offroadBonus * (1 - envGrip));

  // Convert km/h topSpeed to arcade m/s (1 m/s = 3.6 km/h; arcade feel tuned slightly punchier)
  const maxSpeedMs = stats.topSpeed / 3.6;
  const accelMs2 = 16 + (stats.acceleration / 100) * 22;
  const brakeMs2 = 34 + upgrades.brakes * 6;
  const maxNitro = 100;

  // Direction vectors from yaw
  const fwdX = -Math.sin(player.yaw);
  const fwdZ = -Math.cos(player.yaw);
  const rightX = Math.cos(player.yaw);
  const rightZ = -Math.sin(player.yaw);

  // Decompose current velocity into forward & lateral components
  let fwdVel = player.vel.x * fwdX + player.vel.z * fwdZ;
  let latVel = player.vel.x * rightX + player.vel.z * rightZ;

  // Nitro activation
  const wantNitro = canDrive && input.nitro && state.nitro > 1.5 && (input.forward || fwdVel > 8);
  state.isNitroActive = wantNitro;
  if (state.isNitroActive) {
    const drainRate = 24 - upgrades.nitro * 2.5 - (stats.nitroCapacity / 100) * 4;
    state.nitro = Math.max(0, state.nitro - Math.max(10, drainRate) * dt);
  } else {
    // Passive trickle recharge
    state.nitro = Math.min(maxNitro, state.nitro + (1.6 + upgrades.nitro * 0.6) * dt);
  }

  const nitroBoostMult = state.isNitroActive ? 1.24 : 1.0;
  const activeTopSpeed = maxSpeedMs * nitroBoostMult;

  // Throttle & Brake
  let throttleInput = 0;
  if (canDrive) {
    if (input.forward) throttleInput += 1;
    if (input.backward) throttleInput -= 1;
  }

  if (throttleInput > 0) {
    const boostAccel = state.isNitroActive ? 1.65 : 1.0;
    const speedRatio = Math.max(0, fwdVel / activeTopSpeed);
    const torqueCurve = Math.max(0.18, 1 - speedRatio * 0.72);
    fwdVel += accelMs2 * boostAccel * torqueCurve * dt;
  } else if (throttleInput < 0) {
    if (fwdVel > 1.5) {
      fwdVel -= brakeMs2 * dt;
    } else {
      // Reverse gear
      fwdVel = Math.max(-maxSpeedMs * 0.36, fwdVel - accelMs2 * 0.55 * dt);
    }
  } else {
    // Rolling resistance / engine braking
    fwdVel *= Math.exp(-0.95 * dt);
  }

  // Clamp forward speed smoothly
  if (fwdVel > activeTopSpeed) {
    fwdVel = THREE.MathUtils.lerp(fwdVel, activeTopSpeed, Math.min(1, dt * 4));
  }

  // Steering input (digital + analog tilt)
  let steerInput = input.steerAnalog;
  if (input.left) steerInput += 1;
  if (input.right) steerInput -= 1;
  steerInput = Math.max(-1, Math.min(1, steerInput));

  // Speed-dependent turn rate: agile at mid-speed, stable at high speed
  const absSpeed = Math.abs(fwdVel);
  const speedNorm = Math.min(1, absSpeed / 45);
  const handlingFactor = 0.72 + (stats.handling / 100) * 0.55;
  const highSpeedDamp = 1 - Math.min(0.42, (absSpeed / 105) * 0.42);
  const reverseFlip = fwdVel < -0.5 ? -1 : 1;

  const isHandbrake = canDrive && input.handbrake && absSpeed > 10;
  const driftTurnBonus = isHandbrake ? 1.38 : 1.0;

  if (absSpeed > 0.6) {
    const turnRate =
      steerInput *
      2.35 *
      handlingFactor *
      highSpeedDamp *
      driftTurnBonus *
      (0.35 + 0.65 * speedNorm) *
      reverseFlip;
    player.yaw += turnRate * dt;
  }

  // Recompute basis after yaw update
  const nFwdX = -Math.sin(player.yaw);
  const nFwdZ = -Math.cos(player.yaw);
  const nRightX = Math.cos(player.yaw);
  const nRightZ = -Math.sin(player.yaw);

  // Lateral grip vs Drift slip
  const lateralGrip = isHandbrake
    ? 2.1 * effectiveGrip
    : (6.2 + (stats.handling / 100) * 4.5) * effectiveGrip;
  latVel *= Math.exp(-lateralGrip * dt);

  // Handbrake scrubs a little forward speed while kicking the tail out
  if (isHandbrake) {
    fwdVel *= Math.exp(-0.55 * dt);
  }

  // Reassemble world XZ velocity
  player.vel.x = nFwdX * fwdVel + nRightX * latVel;
  player.vel.z = nFwdZ * fwdVel + nRightZ * latVel;
  player.speed = fwdVel;

  // Integrate XZ position
  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;

  // Project onto track spline for elevation, walls, and lap progress
  const proj = track.projectPosition(player.pos, player.trackSampleIdx);
  const prevT = player.trackT;
  player.trackSampleIdx = proj.index;
  player.trackT = proj.t;

  // Track boundary guardrail collision
  const maxHalfRoad = track.config.roadWidth * 0.5 - 1.15;
  if (Math.abs(proj.lateralOffset) > maxHalfRoad) {
    const sign = Math.sign(proj.lateralOffset);
    const excess = Math.abs(proj.lateralOffset) - maxHalfRoad;
    // Push back inside road
    player.pos.x -= proj.right.x * sign * excess;
    player.pos.z -= proj.right.z * sign * excess;

    // Bounce velocity off wall normal
    const wallDot = player.vel.x * proj.right.x + player.vel.z * proj.right.z;
    if (wallDot * sign > 0) {
      player.vel.x -= proj.right.x * wallDot * 1.45;
      player.vel.z -= proj.right.z * wallDot * 1.45;
      player.vel.multiplyScalar(0.76);
      if (Math.abs(wallDot) > 4.5) {
        state.collisionCount++;
        state.hitFlashTimer = 0.25;
        callbacks.onCollision(
          player.pos.x + proj.right.x * sign * 0.9,
          player.pos.y + 0.55,
          player.pos.z + proj.right.z * sign * 0.9,
          Math.min(1, Math.abs(wallDot) / 22),
        );
      }
    }
    // Gently realign yaw toward track tangent on heavy scrape
    const tangentYaw = Math.atan2(-proj.tangent.x, -proj.tangent.z);
    const diff = normalizeAngle(tangentYaw - player.yaw);
    player.yaw += diff * Math.min(1, dt * 6);
  }

  // Smooth ground height & pitch alignment
  player.pos.y = THREE.MathUtils.damp(player.pos.y, proj.roadY, 18, dt);
  const targetPitch = Math.asin(THREE.MathUtils.clamp(proj.tangent.y, -0.45, 0.45));
  player.pitch = THREE.MathUtils.damp(player.pitch, targetPitch, 10, dt);

  // Visual body roll during cornering
  const targetRoll = THREE.MathUtils.clamp(-latVel * 0.012 - steerInput * speedNorm * 0.045, -0.1, 0.1);
  player.roll = THREE.MathUtils.damp(player.roll, targetRoll, 10, dt);
  player.steerAngle = THREE.MathUtils.damp(player.steerAngle, steerInput * 0.42, 14, dt);

  // Wrong-way check
  const forwardDotTrack = nFwdX * proj.tangent.x + nFwdZ * proj.tangent.z;
  state.wrongWay = fwdVel > 4 && forwardDotTrack < -0.35;

  // Lap & progress tracking
  if (track.config.closed) {
    if (prevT > 0.85 && player.trackT < 0.15 && player.maxTReached > 0.65) {
      player.lap += 1;
      player.maxTReached = player.trackT;
      if (player.lap > track.config.laps && !player.finished) {
        player.finished = true;
        player.finishTimeSec = raceTimeSec;
      }
    } else if (prevT < 0.15 && player.trackT > 0.85) {
      // Crossed backwards
      player.lap = Math.max(1, player.lap - 1);
    }
    player.maxTReached = Math.max(player.maxTReached, player.trackT);
    player.totalProgress = (player.lap - 1) + player.trackT;
  } else {
    player.totalProgress = player.trackT;
    if (player.trackT >= 0.985 && !player.finished) {
      player.finished = true;
      player.finishTimeSec = raceTimeSec;
    }
  }

  // Drift detection, scoring & Nitro gain
  const driftSlip = Math.abs(latVel);
  const driftingNow = canDrive && absSpeed > 14 && (driftSlip > 4.2 || (isHandbrake && absSpeed > 12));
  if (driftingNow) {
    state.isDrifting = true;
    const ptsPerSec = Math.round(driftSlip * 26 + absSpeed * 2.5);
    state.driftScoreCurrent += ptsPerSec * dt;
    state.totalDriftScore += ptsPerSec * dt;
    // Refill nitro from drifting!
    state.nitro = Math.min(maxNitro, state.nitro + (8 + upgrades.nitro * 2) * dt);

    // Emit tire smoke behind rear wheels
    if (Math.random() < 0.75) {
      callbacks.onDriftSmoke(
        player.pos.x - nFwdX * 1.3 - nRightX * 0.85,
        player.pos.y + 0.2,
        player.pos.z - nFwdZ * 1.3 - nRightZ * 0.85,
        -player.vel.x * 0.12,
        -player.vel.z * 0.12,
      );
      callbacks.onDriftSmoke(
        player.pos.x - nFwdX * 1.3 + nRightX * 0.85,
        player.pos.y + 0.2,
        player.pos.z - nFwdZ * 1.3 + nRightZ * 0.85,
        -player.vel.x * 0.12,
        -player.vel.z * 0.12,
      );
    }
  } else {
    if (state.isDrifting && state.driftScoreCurrent > 120) {
      state.eventBanner = `DRIFT +${Math.round(state.driftScoreCurrent)} PTS`;
      state.eventBannerTimer = 1.6;
    }
    state.isDrifting = false;
    state.driftScoreCurrent = 0;
  }

  // Nitro flames out of twin exhausts
  if (state.isNitroActive) {
    for (const ex of player.rig.exhaustPositions) {
      _exhaustWorld.copy(ex).applyAxisAngle(_fwd.set(0, 1, 0), player.yaw).add(player.pos);
      callbacks.onNitroFlame(
        _exhaustWorld.x,
        _exhaustWorld.y,
        _exhaustWorld.z,
        -nFwdX * 10 + player.vel.x * 0.3,
        (Math.random() - 0.5) * 1.2,
        -nFwdZ * 10 + player.vel.z * 0.3,
      );
    }
  }

  // Update visual rig transform, wheels, and brake lights
  applyActorTransform(player, dt, throttleInput < 0 || isHandbrake);

  // Compute Arcade Gear & RPM for HUD + Audio
  const speedKmh = Math.abs(fwdVel) * 3.6;
  if (fwdVel < -1) {
    state.gear = 'R';
    state.rpmRatio = Math.min(1, 0.25 + speedKmh / 80);
  } else if (speedKmh < 3 && throttleInput <= 0) {
    state.gear = 'N';
    state.rpmRatio = 0.15;
  } else {
    const gearThresholds = [0, 48, 95, 145, 200, 260, 400];
    let gearIdx = 1;
    for (let g = 1; g <= 6; g++) {
      if (speedKmh >= gearThresholds[g - 1]) gearIdx = g;
    }
    const low = gearThresholds[gearIdx - 1];
    const high = gearThresholds[gearIdx];
    state.gear = String(gearIdx);
    state.rpmRatio = THREE.MathUtils.clamp(
      0.24 + ((speedKmh - low) / Math.max(20, high - low)) * 0.74,
      0.18,
      1.0,
    );
  }

  if (state.eventBannerTimer > 0) {
    state.eventBannerTimer -= dt;
    if (state.eventBannerTimer <= 0) state.eventBanner = null;
  }
  if (state.hitFlashTimer > 0) {
    state.hitFlashTimer = Math.max(0, state.hitFlashTimer - dt);
  }
}

export function stepAiRacer(
  ai: RacerActor,
  player: RacerActor,
  track: TrackData,
  playerTopSpeedMs: number,
  dt: number,
  raceTimeSec: number,
  canDrive: boolean,
): void {
  if (!canDrive) {
    applyActorTransform(ai, dt, true);
    return;
  }

  const proj = track.projectPosition(ai.pos, ai.trackSampleIdx);
  const prevT = ai.trackT;
  ai.trackSampleIdx = proj.index;
  ai.trackT = proj.t;

  // Rubber-band target speed relative to player progress
  const progressDiff = player.totalProgress - ai.totalProgress;
  // Positive diff -> player is ahead, AI speeds up; negative -> AI is ahead, eases slightly
  const rubberBand = THREE.MathUtils.clamp(1 + progressDiff * 1.45, 0.84, 1.24);
  const desiredSpeed =
    playerTopSpeedMs * 0.86 * ai.baseSpeedFactor * rubberBand;

  ai.speed = THREE.MathUtils.damp(ai.speed, desiredSpeed, 2.2, dt);

  // Lookahead point on spline
  const lookAheadT = track.config.closed
    ? (proj.t + 0.032) % 1
    : Math.min(0.999, proj.t + 0.032);
  const aheadSample = track.getSampleAtProgress(lookAheadT);

  _targetPos
    .copy(aheadSample.pos)
    .addScaledVector(aheadSample.right, ai.targetLaneOffset);

  const dx = _targetPos.x - ai.pos.x;
  const dz = _targetPos.z - ai.pos.z;
  const desiredYaw = Math.atan2(-dx, -dz);
  const yawDiff = normalizeAngle(desiredYaw - ai.yaw);

  ai.yaw += THREE.MathUtils.clamp(yawDiff, -2.6 * dt, 2.6 * dt);
  ai.steerAngle = THREE.MathUtils.clamp(yawDiff * 0.6, -0.4, 0.4);

  const fwdX = -Math.sin(ai.yaw);
  const fwdZ = -Math.cos(ai.yaw);
  ai.vel.set(fwdX * ai.speed, 0, fwdZ * ai.speed);

  ai.pos.x += ai.vel.x * dt;
  ai.pos.z += ai.vel.z * dt;
  ai.pos.y = THREE.MathUtils.damp(ai.pos.y, proj.roadY, 16, dt);

  const targetPitch = Math.asin(THREE.MathUtils.clamp(proj.tangent.y, -0.45, 0.45));
  ai.pitch = THREE.MathUtils.damp(ai.pitch, targetPitch, 10, dt);
  ai.roll = THREE.MathUtils.damp(ai.roll, THREE.MathUtils.clamp(-yawDiff * 0.14, -0.08, 0.08), 8, dt);

  // Lap update
  if (track.config.closed) {
    if (prevT > 0.85 && ai.trackT < 0.15 && ai.maxTReached > 0.65) {
      ai.lap += 1;
      ai.maxTReached = ai.trackT;
      if (ai.lap > track.config.laps && !ai.finished) {
        ai.finished = true;
        ai.finishTimeSec = raceTimeSec;
      }
    }
    ai.maxTReached = Math.max(ai.maxTReached, ai.trackT);
    ai.totalProgress = (ai.lap - 1) + ai.trackT;
  } else {
    ai.totalProgress = ai.trackT;
    if (ai.trackT >= 0.985 && !ai.finished) {
      ai.finished = true;
      ai.finishTimeSec = raceTimeSec;
    }
  }

  applyActorTransform(ai, dt, false);
}

export function stepTrafficCar(
  car: RacerActor,
  track: TrackData,
  dt: number,
): void {
  const proj = track.projectPosition(car.pos, car.trackSampleIdx);
  car.trackSampleIdx = proj.index;
  car.trackT = proj.t;

  // Cruise steadily along lane
  const cruiseSpeed = 20 * car.baseSpeedFactor;
  car.speed = THREE.MathUtils.damp(car.speed, cruiseSpeed, 3, dt);

  const lookAheadT = track.config.closed
    ? (proj.t + 0.025) % 1
    : Math.min(0.999, proj.t + 0.025);
  const aheadSample = track.getSampleAtProgress(lookAheadT);

  _targetPos
    .copy(aheadSample.pos)
    .addScaledVector(aheadSample.right, car.targetLaneOffset);

  const dx = _targetPos.x - car.pos.x;
  const dz = _targetPos.z - car.pos.z;
  const desiredYaw = Math.atan2(-dx, -dz);
  const yawDiff = normalizeAngle(desiredYaw - car.yaw);
  car.yaw += THREE.MathUtils.clamp(yawDiff, -2.2 * dt, 2.2 * dt);

  car.vel.set(-Math.sin(car.yaw) * car.speed, 0, -Math.cos(car.yaw) * car.speed);
  car.pos.x += car.vel.x * dt;
  car.pos.z += car.vel.z * dt;
  car.pos.y = THREE.MathUtils.damp(car.pos.y, proj.roadY, 16, dt);
  car.pitch = THREE.MathUtils.damp(
    car.pitch,
    Math.asin(THREE.MathUtils.clamp(proj.tangent.y, -0.45, 0.45)),
    10,
    dt,
  );

  // Wrap traffic on closed or open tracks so road stays lively ahead of player
  if (!track.config.closed && car.trackT > 0.96) {
    const resetSample = track.getSampleAtProgress(0.05);
    car.pos.copy(resetSample.pos).addScaledVector(resetSample.right, car.targetLaneOffset);
    car.yaw = Math.atan2(-resetSample.tangent.x, -resetSample.tangent.z);
    car.trackSampleIdx = Math.floor(0.05 * track.samples.length);
  }

  if (car.nearMissCooldown > 0) car.nearMissCooldown -= dt;
  applyActorTransform(car, dt, false);
}

export function stepPoliceCar(
  cop: RacerActor,
  player: RacerActor,
  track: TrackData,
  playerTopSpeedMs: number,
  dt: number,
  elapsedSec: number,
  canDrive: boolean,
): void {
  // Animate flashing red/blue lightbar
  if (cop.rig.policeLights) {
    const flash = Math.sin(elapsedSec * 16 + (cop.id.charCodeAt(cop.id.length - 1) || 0)) > 0;
    cop.rig.policeLights.redMat.emissiveIntensity = flash ? 4.0 : 0.2;
    cop.rig.policeLights.blueMat.emissiveIntensity = flash ? 0.2 : 4.0;
    cop.rig.policeLights.pointLight.color.setHex(flash ? 0xef4444 : 0x3b82f6);
  }

  if (!canDrive) {
    applyActorTransform(cop, dt, true);
    return;
  }

  const proj = track.projectPosition(cop.pos, cop.trackSampleIdx);
  cop.trackSampleIdx = proj.index;
  cop.trackT = proj.t;

  const distToPlayer = cop.pos.distanceTo(player.pos);
  const progressBehind = player.trackT - cop.trackT;

  // Catch up aggressively if behind, match & intercept if close
  let targetSpeed = playerTopSpeedMs * 0.94;
  if (progressBehind > 0.03) {
    targetSpeed = playerTopSpeedMs * 1.18;
  } else if (distToPlayer < 24) {
    targetSpeed = Math.max(player.speed + 8, playerTopSpeedMs * 0.98);
  }

  cop.speed = THREE.MathUtils.damp(cop.speed, targetSpeed, 2.8, dt);

  // Target player directly when within 48m, else follow spline toward player
  if (distToPlayer < 48 && player.trackT >= cop.trackT - 0.02) {
    _targetPos.copy(player.pos);
  } else {
    const lookT = Math.min(0.999, proj.t + 0.028);
    const s = track.getSampleAtProgress(lookT);
    _targetPos.copy(s.pos).addScaledVector(s.right, cop.targetLaneOffset);
  }

  const dx = _targetPos.x - cop.pos.x;
  const dz = _targetPos.z - cop.pos.z;
  const desiredYaw = Math.atan2(-dx, -dz);
  const yawDiff = normalizeAngle(desiredYaw - cop.yaw);

  cop.yaw += THREE.MathUtils.clamp(yawDiff, -3.1 * dt, 3.1 * dt);
  cop.steerAngle = THREE.MathUtils.clamp(yawDiff * 0.65, -0.45, 0.45);

  cop.vel.set(-Math.sin(cop.yaw) * cop.speed, 0, -Math.cos(cop.yaw) * cop.speed);
  cop.pos.x += cop.vel.x * dt;
  cop.pos.z += cop.vel.z * dt;
  cop.pos.y = THREE.MathUtils.damp(cop.pos.y, proj.roadY, 16, dt);

  // Keep cops within road walls
  const maxHalf = track.config.roadWidth * 0.5 - 1.1;
  if (Math.abs(proj.lateralOffset) > maxHalf) {
    const sign = Math.sign(proj.lateralOffset);
    cop.pos.x -= proj.right.x * sign * (Math.abs(proj.lateralOffset) - maxHalf);
    cop.pos.z -= proj.right.z * sign * (Math.abs(proj.lateralOffset) - maxHalf);
  }

  applyActorTransform(cop, dt, false);
}

export function resolveVehicleCollisions(
  player: RacerActor,
  others: RacerActor[],
  state: PlayerRuntimeState,
  callbacks: PhysicsCallbacks,
): void {
  const minDist = 2.65;
  const minDistSq = minDist * minDist;

  for (let i = 0; i < others.length; i++) {
    const other = others[i];
    const dx = player.pos.x - other.pos.x;
    const dz = player.pos.z - other.pos.z;
    const dy = Math.abs(player.pos.y - other.pos.y);
    if (dy > 2.5) continue;

    const dSq = dx * dx + dz * dz;
    if (dSq < minDistSq && dSq > 0.0001) {
      const dist = Math.sqrt(dSq);
      const nx = dx / dist;
      const nz = dz / dist;
      const overlap = minDist - dist;

      // Separate cars
      player.pos.x += nx * overlap * 0.6;
      player.pos.z += nz * overlap * 0.6;
      other.pos.x -= nx * overlap * 0.4;
      other.pos.z -= nz * overlap * 0.4;

      // Impulse exchange
      const relVx = player.vel.x - other.vel.x;
      const relVz = player.vel.z - other.vel.z;
      const sepVel = relVx * nx + relVz * nz;

      if (sepVel < 0) {
        const bounce = other.role === 'police' ? 1.35 : 1.15;
        player.vel.x -= nx * sepVel * bounce * 0.65;
        player.vel.z -= nz * sepVel * bounce * 0.65;
        other.vel.x += nx * sepVel * bounce * 0.45;
        other.vel.z += nz * sepVel * bounce * 0.45;

        // Player loses a bit of speed on heavy hit
        player.vel.multiplyScalar(0.84);
        other.nearMissCooldown = 2.5;

        const impact = Math.min(1, Math.abs(sepVel) / 28);
        if (impact > 0.16) {
          state.collisionCount++;
          state.hitFlashTimer = 0.25;
          callbacks.onCollision(
            (player.pos.x + other.pos.x) * 0.5,
            player.pos.y + 0.6,
            (player.pos.z + other.pos.z) * 0.5,
            impact,
          );
        }
      }
    } else if (
      other.role === 'traffic' &&
      other.nearMissCooldown <= 0 &&
      dSq < 21 && // within ~4.5m
      Math.abs(player.speed) > 25 // > 90 km/h
    ) {
      other.nearMissCooldown = 3.0;
      state.nearMissCount += 1;
      state.nitro = Math.min(100, state.nitro + 18);
      state.eventBanner = 'NEAR MISS! +NITRO +$150';
      state.eventBannerTimer = 1.6;
      callbacks.onNearMiss();
    }
  }
}

function applyActorTransform(actor: RacerActor, dt: number, braking: boolean): void {
  actor.rig.group.position.copy(actor.pos);
  actor.rig.group.rotation.order = 'YXZ';
  actor.rig.group.rotation.set(actor.pitch, actor.yaw, actor.roll);

  actor.wheelSpin += actor.speed * dt * 2.5;
  for (const fw of actor.rig.frontWheels) {
    fw.rotation.y = actor.steerAngle;
    fw.children[0].rotation.x = -actor.wheelSpin;
  }
  for (const rw of actor.rig.rearWheels) {
    rw.rotation.x = -actor.wheelSpin;
  }

  actor.rig.taillightMaterial.emissiveIntensity = braking ? 3.5 : 1.0;
}

export function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
