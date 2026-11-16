import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AudioEngine } from './AudioEngine';
import { buildCarModel, CarModelRig } from './CarBuilder';
import { CAR_SPEC_MAP, LEVEL_MAP } from './data';
import { ParticlePool } from './ParticlePool';
import {
  createRacerActor,
  PhysicsCallbacks,
  PlayerRuntimeState,
  RacerActor,
  resolveVehicleCollisions,
  stepAiRacer,
  stepPlayerPhysics,
  stepPoliceCar,
  stepTrafficCar,
} from './Physics';
import { SaveSystem } from './SaveSystem';
import { buildTrackScene, BuiltTrackScene, TrackData } from './TrackBuilder';
import {
  CarId,
  HudSnapshot,
  InputState,
  LevelConfig,
  LevelId,
  MinimapEntity,
  RaceResult,
} from './types';

// Pre-allocated math scratchpads (zero GC inside render loop)
const _camDesiredPos = new THREE.Vector3();
const _camLookTarget = new THREE.Vector3();
const _shakeVec = new THREE.Vector3();
const _anchorPos = new THREE.Vector3();

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export interface EngineCallbacks {
  onHudUpdate: (hud: HudSnapshot) => void;
  onRaceFinish: (result: RaceResult) => void;
  onContextLost: (lost: boolean) => void;
}

export class GameEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private maxAnisotropy: number;

  private audio: AudioEngine;
  private saveSystem: SaveSystem;
  private callbacks: EngineCallbacks;

  private mode: 'showcase' | 'race' = 'showcase';
  private paused = false;

  // Lighting
  private keyLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private rimLight: THREE.DirectionalLight;

  // Showcase state
  private showcaseGroup = new THREE.Group();
  private showcaseRig: CarModelRig | null = null;
  private showcaseCarId: CarId = 'compact';
  private showcaseColor = '#06b6d4';
  private showcaseYaw = 0.65;
  private showcaseDragActive = false;
  private showcaseLastX = 0;

  // Race state
  private raceGroup = new THREE.Group();
  private currentLevel: LevelConfig | null = null;
  private trackData: TrackData | null = null;
  private builtTrack: BuiltTrackScene | null = null;
  private particlePool: ParticlePool;

  private playerActor: RacerActor | null = null;
  private playerState: PlayerRuntimeState | null = null;
  private aiRacers: RacerActor[] = [];
  private trafficCars: RacerActor[] = [];
  private policeCars: RacerActor[] = [];

  private countdownTimer = 0;
  private lastCountdownStep = 4;
  private raceTimeSec = 0;
  private lapStartTimeSec = 0;
  private lastLap = 1;
  private raceEnded = false;
  private cameraShake = 0;
  private currentCamPos = new THREE.Vector3(0, 4, 9);
  private currentCamLook = new THREE.Vector3(0, 1, 0);
  private hudEmitAccum = 0;

  // Input state
  public input: InputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    handbrake: false,
    nitro: false,
    steerAnalog: 0,
  };

  // Loop handles
  private clock = new THREE.Clock();
  private frameId = 0;
  private disposed = false;
  private elapsedSec = 0;

  private physicsCallbacks: PhysicsCallbacks;

  constructor(
    container: HTMLElement,
    saveSystem: SaveSystem,
    audio: AudioEngine,
    callbacks: EngineCallbacks,
  ) {
    this.container = container;
    this.saveSystem = saveSystem;
    this.audio = audio;
    this.callbacks = callbacks;

    this.isSoftwareGl = detectSoftwareGl();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();

    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    canvas.addEventListener('webglcontextlost', this.handleContextLost);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#070a12');

    // Studio Environment Reflection (RoomEnvironment)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(
      52,
      (container.clientWidth || window.innerWidth) /
        Math.max(1, container.clientHeight || window.innerHeight),
      0.2,
      2800,
    );

    // 3-point lighting rig
    this.hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x0f172a, 0.85);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xfff7ed, 2.0);
    this.keyLight.position.set(45, 70, 35);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 2;
    this.keyLight.shadow.camera.far = 220;
    const d = 55;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    this.rimLight = new THREE.DirectionalLight(0x38bdf8, 0.9);
    this.rimLight.position.set(-30, 22, -40);
    this.scene.add(this.rimLight);

    // Particles
    this.particlePool = new ParticlePool();

    // Scene groups
    this.scene.add(this.showcaseGroup);
    this.scene.add(this.raceGroup);
    this.raceGroup.visible = false;

    this.buildShowcaseEnvironment();

    const save = this.saveSystem.getData();
    this.setShowcaseCar(save.selectedCarId, save.carColors[save.selectedCarId]);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.physicsCallbacks = {
      onCollision: (x, y, z, intensity) => {
        this.particlePool.spawnSparks(x, y, z, Math.round(10 + intensity * 14));
        this.cameraShake = Math.max(this.cameraShake, 0.35 + intensity * 0.55);
        this.audio.playCollision(intensity);
      },
      onNearMiss: () => {
        this.audio.playNearMiss();
      },
      onDriftSmoke: (x, y, z, vx, vz) => {
        this.particlePool.spawnSmoke(x, y, z, vx, vz);
      },
      onNitroFlame: (x, y, z, vx, vy, vz) => {
        this.particlePool.spawnFlame(x, y, z, vx, vy, vz);
      },
    };

    window.addEventListener('resize', this.handleResize);
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);

    this.clock.start();
    this.tick();
  }

  private buildShowcaseEnvironment(): void {
    // Sleek dark showroom floor + illuminated turntable ring
    const floorGeo = new THREE.CircleGeometry(42, 48);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0b0f19,
      roughness: 0.25,
      metalness: 0.45,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.receiveShadow = true;
    this.showcaseGroup.add(floor);

    const ringGeo = new THREE.RingGeometry(3.55, 3.72, 64);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.015;
    this.showcaseGroup.add(ring);

    const padGeo = new THREE.CylinderGeometry(3.55, 3.75, 0.14, 48);
    const padMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.3,
      metalness: 0.65,
    });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.y = -0.07;
    pad.receiveShadow = true;
    this.showcaseGroup.add(pad);
  }

  public enterShowcaseMode(carId?: CarId, colorHex?: string): void {
    this.mode = 'showcase';
    this.paused = false;
    this.audio.setRacingActive(false);

    this.clearRaceScene();
    this.raceGroup.visible = false;
    this.showcaseGroup.visible = true;

    this.scene.background = new THREE.Color('#070a12');
    this.scene.fog = new THREE.FogExp2('#070a12', 0.025);

    this.hemiLight.color.set('#93c5fd');
    this.hemiLight.groundColor.set('#0f172a');
    this.hemiLight.intensity = 0.9;
    this.keyLight.color.set('#fff7ed');
    this.keyLight.intensity = 2.2;
    this.keyLight.position.set(12, 18, 12);
    this.keyLight.target.position.set(0, 0, 0);

    this.camera.fov = 44;
    this.camera.updateProjectionMatrix();

    const save = this.saveSystem.getData();
    const targetCar = carId ?? save.selectedCarId;
    const targetColor = colorHex ?? save.carColors[targetCar];
    this.setShowcaseCar(targetCar, targetColor);
  }

  public setShowcaseCar(carId: CarId, colorHex: string): void {
    if (this.showcaseRig && this.showcaseCarId === carId) {
      this.showcaseColor = colorHex;
      this.showcaseRig.paintMaterial.color.set(colorHex);
      return;
    }

    if (this.showcaseRig) {
      this.showcaseGroup.remove(this.showcaseRig.group);
      this.disposeGroup(this.showcaseRig.group);
      this.showcaseRig = null;
    }

    this.showcaseCarId = carId;
    this.showcaseColor = colorHex;
    this.showcaseRig = buildCarModel(carId, colorHex);
    this.showcaseRig.group.position.set(0, 0.02, 0);
    this.showcaseRig.group.rotation.y = this.showcaseYaw;
    this.showcaseGroup.add(this.showcaseRig.group);
  }

  public startRace(levelId: LevelId): void {
    const level = LEVEL_MAP[levelId];
    if (!level) return;

    this.clearRaceScene();
    this.mode = 'race';
    this.paused = false;
    this.currentLevel = level;
    this.showcaseGroup.visible = false;
    this.raceGroup.visible = true;

    // Configure atmosphere
    const env = level.environment;
    this.scene.background = new THREE.Color(env.fogColor);
    this.scene.fog = new THREE.FogExp2(env.fogColor, env.fogDensity);

    this.hemiLight.color.set(env.hemiSky);
    this.hemiLight.groundColor.set(env.hemiGround);
    this.hemiLight.intensity = env.hemiIntensity;
    this.keyLight.color.set(env.sunColor);
    this.keyLight.intensity = env.sunIntensity;

    // Build track
    this.trackData = new TrackData(level);
    this.builtTrack = buildTrackScene(this.trackData, this.maxAnisotropy);
    this.raceGroup.add(this.builtTrack.group);

    this.particlePool.reset();
    this.particlePool.configureWeather(env.weather);
    this.raceGroup.add(this.particlePool.group);

    // Spawn Player Car
    const save = this.saveSystem.getData();
    const carId = save.selectedCarId;
    const carColor = save.carColors[carId];
    const startSample = this.trackData.samples[1];
    const startYaw = Math.atan2(-startSample.tangent.x, -startSample.tangent.z);

    const playerRig = buildCarModel(carId, carColor, {
      withHeadlightSpots: env.isNight && !this.isSoftwareGl,
    });
    this.raceGroup.add(playerRig.group);

    const startOffset = level.aiCount > 0 ? -2.6 : 0;
    const playerStartPos = startSample.pos
      .clone()
      .addScaledVector(startSample.right, startOffset);

    this.playerActor = createRacerActor(
      'player',
      'player',
      playerRig,
      playerStartPos,
      startYaw,
      1,
      startSample.t,
    );

    this.playerState = {
      nitro: 55,
      isNitroActive: false,
      isDrifting: false,
      driftScoreCurrent: 0,
      totalDriftScore: 0,
      nearMissCount: 0,
      collisionCount: 0,
      bustedProgress: 0,
      wrongWay: false,
      gear: 'N',
      rpmRatio: 0.15,
      eventBanner: null,
      eventBannerTimer: 0,
      hitFlashTimer: 0,
    };

    // Spawn AI Opponents
    const aiModels: CarId[] = ['coupe', 'muscle', 'rally', 'supercar', 'compact'];
    const aiColors = ['#3b82f6', '#ec4899', '#10b981', '#facc15', '#f43f5e'];
    for (let i = 0; i < level.aiCount; i++) {
      const sampleIdx = (3 + i * 2) % this.trackData.samples.length;
      const s = this.trackData.samples[sampleIdx];
      const laneOffset = i % 2 === 0 ? 2.8 : -2.8;
      const pos = s.pos.clone().addScaledVector(s.right, laneOffset);
      const yaw = Math.atan2(-s.tangent.x, -s.tangent.z);
      const modelId = aiModels[(i + level.index) % aiModels.length];
      const rig = buildCarModel(modelId, aiColors[i % aiColors.length]);
      this.raceGroup.add(rig.group);
      const actor = createRacerActor(
        `ai-${i}`,
        'ai',
        rig,
        pos,
        yaw,
        sampleIdx,
        s.t,
        laneOffset,
        0.92 + i * 0.035,
      );
      this.aiRacers.push(actor);
    }

    // Spawn Ambient Traffic
    const trafficColors = ['#cbd5e1', '#475569', '#0ea5e9', '#d97706', '#f8fafc', '#64748b'];
    const halfTrafficSpan = level.roadWidth * 0.28;
    for (let i = 0; i < level.trafficCount; i++) {
      const t = 0.08 + (i / Math.max(1, level.trafficCount)) * 0.86;
      const s = this.trackData.getSampleAtProgress(t);
      const laneOffset = i % 2 === 0 ? halfTrafficSpan : -halfTrafficSpan;
      const pos = s.pos.clone().addScaledVector(s.right, laneOffset);
      const yaw = Math.atan2(-s.tangent.x, -s.tangent.z);
      const rig = buildCarModel('traffic', trafficColors[i % trafficColors.length], {
        trafficVariant: i % 2,
      });
      this.raceGroup.add(rig.group);
      const tActor = createRacerActor(
        `traffic-${i}`,
        'traffic',
        rig,
        pos,
        yaw,
        Math.floor(t * this.trackData.samples.length),
        t,
        laneOffset,
        0.85 + (i % 3) * 0.14,
      );
      this.trafficCars.push(tActor);
    }

    // Spawn Police Interceptors for Level 6
    for (let i = 0; i < level.policeCount; i++) {
      const t = 0.015 + i * 0.025;
      const s = this.trackData.getSampleAtProgress(t);
      const laneOffset = (i - 1) * 3.4;
      const pos = s.pos.clone().addScaledVector(s.right, laneOffset);
      const yaw = Math.atan2(-s.tangent.x, -s.tangent.z);
      const rig = buildCarModel('police', '#0f172a');
      this.raceGroup.add(rig.group);
      const cop = createRacerActor(
        `cop-${i}`,
        'police',
        rig,
        pos,
        yaw,
        Math.floor(t * this.trackData.samples.length),
        t,
        laneOffset,
        1.05,
      );
      this.policeCars.push(cop);
    }

    // Snap chase camera behind player at start
    const fwdX = -Math.sin(startYaw);
    const fwdZ = -Math.cos(startYaw);
    this.currentCamPos.set(
      playerStartPos.x - fwdX * 8.5,
      playerStartPos.y + 3.4,
      playerStartPos.z - fwdZ * 8.5,
    );
    this.currentCamLook.set(
      playerStartPos.x + fwdX * 6,
      playerStartPos.y + 1.2,
      playerStartPos.z + fwdZ * 6,
    );
    this.camera.position.copy(this.currentCamPos);
    this.camera.lookAt(this.currentCamLook);
    this.camera.fov = 62;
    this.camera.updateProjectionMatrix();

    this.countdownTimer = 3.6;
    this.lastCountdownStep = 4;
    this.raceTimeSec = 0;
    this.lapStartTimeSec = 0;
    this.lastLap = 1;
    this.raceEnded = false;
    this.cameraShake = 0;
    this.hudEmitAccum = 0;

    this.audio.unlock();
    this.audio.setRacingActive(true);
    this.emitHud();
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
    if (this.mode === 'race') {
      this.audio.setRacingActive(!paused && !this.raceEnded);
    }
  }

  public resetPlayerToTrack(): void {
    if (this.mode !== 'race' || !this.playerActor || !this.trackData) return;
    const proj = this.trackData.projectPosition(
      this.playerActor.pos,
      this.playerActor.trackSampleIdx,
    );
    this.playerActor.pos.copy(proj.centerPos);
    this.playerActor.vel.set(0, 0, 0);
    this.playerActor.speed = 0;
    this.playerActor.yaw = Math.atan2(-proj.tangent.x, -proj.tangent.z);
    this.playerActor.roll = 0;
    this.playerActor.pitch = 0;
  }

  private clearRaceScene(): void {
    for (const r of this.aiRacers) {
      this.raceGroup.remove(r.rig.group);
      this.disposeGroup(r.rig.group);
    }
    for (const t of this.trafficCars) {
      this.raceGroup.remove(t.rig.group);
      this.disposeGroup(t.rig.group);
    }
    for (const c of this.policeCars) {
      this.raceGroup.remove(c.rig.group);
      this.disposeGroup(c.rig.group);
    }
    if (this.playerActor) {
      this.raceGroup.remove(this.playerActor.rig.group);
      this.disposeGroup(this.playerActor.rig.group);
    }
    if (this.builtTrack) {
      this.raceGroup.remove(this.builtTrack.group);
      for (const d of this.builtTrack.disposables) d.dispose();
      this.builtTrack = null;
    }
    this.aiRacers = [];
    this.trafficCars = [];
    this.policeCars = [];
    this.playerActor = null;
    this.playerState = null;
    this.trackData = null;
  }

  private disposeGroup(group: THREE.Group): void {
    group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        if (Array.isArray(m.material)) {
          m.material.forEach((mat) => mat.dispose());
        } else {
          m.material?.dispose();
        }
      }
    });
  }

  private tick = (): void => {
    if (this.disposed) return;

    const rawDt = this.clock.getDelta();
    const dt = Math.min(0.05, Math.max(0.001, rawDt));
    this.elapsedSec += dt;

    if (this.mode === 'showcase') {
      this.updateShowcase(dt);
    } else if (this.mode === 'race' && !this.paused) {
      this.updateRace(dt);
    }

    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private updateShowcase(dt: number): void {
    if (this.showcaseRig && !this.showcaseDragActive) {
      this.showcaseYaw += dt * 0.42;
    }
    if (this.showcaseRig) {
      this.showcaseRig.group.rotation.y = this.showcaseYaw;
    }
    this.camera.position.set(0, 2.2, 6.5);
    this.camera.lookAt(0, -0.15, 0);
  }

  private updateRace(dt: number): void {
    if (!this.playerActor || !this.playerState || !this.trackData || !this.currentLevel) {
      return;
    }

    // Countdown phase (3 - 2 - 1 - GO!)
    let canDrive = false;
    if (this.countdownTimer > 0) {
      this.countdownTimer -= dt;
      const step = Math.ceil(this.countdownTimer);
      if (step < this.lastCountdownStep && step >= 1 && step <= 3) {
        this.lastCountdownStep = step;
        this.audio.playCountdownBeep(false);
      } else if (this.countdownTimer <= 0.6 && this.lastCountdownStep > 0) {
        this.lastCountdownStep = 0;
        this.audio.playCountdownBeep(true);
      }
      if (this.countdownTimer <= 0.6) {
        canDrive = true;
      }
    } else {
      canDrive = true;
    }

    if (canDrive && !this.raceEnded) {
      this.raceTimeSec += dt;
    }

    const stats = this.saveSystem.getEffectiveStats(this.saveSystem.getData().selectedCarId);
    const upgrades = this.saveSystem.getUpgrades(this.saveSystem.getData().selectedCarId);
    const playerTopMs = stats.topSpeed / 3.6;

    stepPlayerPhysics(
      this.playerActor,
      this.playerState,
      stats,
      upgrades,
      this.input,
      this.trackData,
      dt,
      this.raceTimeSec,
      canDrive && !this.raceEnded,
      this.physicsCallbacks,
    );

    if (this.playerActor.lap !== this.lastLap) {
      this.lastLap = this.playerActor.lap;
      this.lapStartTimeSec = this.raceTimeSec;
    }

    for (const ai of this.aiRacers) {
      stepAiRacer(
        ai,
        this.playerActor,
        this.trackData,
        playerTopMs,
        dt,
        this.raceTimeSec,
        canDrive,
      );
    }

    for (const t of this.trafficCars) {
      stepTrafficCar(t, this.trackData, dt);
    }

    let closestCopDist = Infinity;
    for (const cop of this.policeCars) {
      stepPoliceCar(
        cop,
        this.playerActor,
        this.trackData,
        playerTopMs,
        dt,
        this.elapsedSec,
        canDrive && !this.raceEnded,
      );
      const d = cop.pos.distanceTo(this.playerActor.pos);
      if (d < closestCopDist) closestCopDist = d;
    }

    // Resolve collisions between player and all non-player vehicles
    if (!this.raceEnded) {
      const allOthers = [...this.aiRacers, ...this.trafficCars, ...this.policeCars];
      resolveVehicleCollisions(
        this.playerActor,
        allOthers,
        this.playerState,
        this.physicsCallbacks,
      );
    }

    // Police Chase "Busted" & Escape Timer checks
    if (this.currentLevel.raceType === 'escape' && !this.raceEnded && canDrive) {
      const speedKmh = Math.abs(this.playerActor.speed) * 3.6;
      if (closestCopDist < 14 && speedKmh < 44) {
        this.playerState.bustedProgress = Math.min(
          100,
          this.playerState.bustedProgress + 34 * dt,
        );
      } else {
        this.playerState.bustedProgress = Math.max(
          0,
          this.playerState.bustedProgress - 22 * dt,
        );
      }

      if (this.playerState.bustedProgress >= 100) {
        this.finishRace(false, 'busted');
        return;
      }
      if (
        this.currentLevel.targetTimeSec &&
        this.raceTimeSec >= this.currentLevel.targetTimeSec
      ) {
        this.finishRace(false, 'time_up');
        return;
      }
    }

    // Player crossed finish!
    if (this.playerActor.finished && !this.raceEnded) {
      const pos = this.computePlayerPosition();
      let won = true;
      if (this.currentLevel.targetPosition !== undefined) {
        won = pos <= this.currentLevel.targetPosition;
      } else if (
        this.currentLevel.raceType === 'timetrial' &&
        this.currentLevel.targetTimeSec !== undefined
      ) {
        won = this.raceTimeSec <= this.currentLevel.targetTimeSec;
      } else if (
        this.currentLevel.raceType === 'escape' &&
        this.currentLevel.targetTimeSec !== undefined
      ) {
        won = this.raceTimeSec <= this.currentLevel.targetTimeSec;
      }
      this.finishRace(won, won ? 'finished' : 'target_missed');
      return;
    }

    // Update particles anchored around player
    _anchorPos.copy(this.playerActor.pos);
    this.particlePool.update(dt, _anchorPos);

    // Update dynamic key light shadow frustum to follow player
    this.keyLight.position.set(
      this.playerActor.pos.x + 38,
      this.playerActor.pos.y + 62,
      this.playerActor.pos.z + 28,
    );
    this.keyLight.target.position.copy(this.playerActor.pos);

    // Third-person chase camera with smooth exponential damping + speed FOV + shake
    const fwdX = -Math.sin(this.playerActor.yaw);
    const fwdZ = -Math.cos(this.playerActor.yaw);
    const speedKmh = Math.abs(this.playerActor.speed) * 3.6;
    const speedRatio = THREE.MathUtils.clamp(speedKmh / 320, 0, 1);

    const camDist = 7.4 + (this.playerState.isNitroActive ? 0.9 : 0);
    const camHeight = 2.95 + speedRatio * 0.25;

    _camDesiredPos.set(
      this.playerActor.pos.x - fwdX * camDist,
      this.playerActor.pos.y + camHeight,
      this.playerActor.pos.z - fwdZ * camDist,
    );
    _camLookTarget.set(
      this.playerActor.pos.x + fwdX * 9.5,
      this.playerActor.pos.y + 1.1,
      this.playerActor.pos.z + fwdZ * 9.5,
    );

    this.currentCamPos.x = THREE.MathUtils.damp(this.currentCamPos.x, _camDesiredPos.x, 10.5, dt);
    this.currentCamPos.y = THREE.MathUtils.damp(this.currentCamPos.y, _camDesiredPos.y, 9.5, dt);
    this.currentCamPos.z = THREE.MathUtils.damp(this.currentCamPos.z, _camDesiredPos.z, 10.5, dt);

    this.currentCamLook.x = THREE.MathUtils.damp(this.currentCamLook.x, _camLookTarget.x, 14, dt);
    this.currentCamLook.y = THREE.MathUtils.damp(this.currentCamLook.y, _camLookTarget.y, 14, dt);
    this.currentCamLook.z = THREE.MathUtils.damp(this.currentCamLook.z, _camLookTarget.z, 14, dt);

    if (this.playerState.isNitroActive) {
      this.cameraShake = Math.max(this.cameraShake, 0.14);
    }
    this.cameraShake = Math.max(0, this.cameraShake - dt * 1.9);

    _shakeVec.set(
      (Math.random() - 0.5) * this.cameraShake * 0.55,
      (Math.random() - 0.5) * this.cameraShake * 0.4,
      (Math.random() - 0.5) * this.cameraShake * 0.4,
    );

    this.camera.position.copy(this.currentCamPos).add(_shakeVec);
    this.camera.lookAt(this.currentCamLook);

    const targetFov = 62 + speedRatio * 18 + (this.playerState.isNitroActive ? 7 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 7, dt);
      this.camera.updateProjectionMatrix();
    }

    // Audio updates
    const policeProx =
      closestCopDist < 85 ? Math.max(0, 1 - closestCopDist / 85) : 0;
    this.audio.updateVehicleAudio({
      rpmRatio: this.playerState.rpmRatio,
      throttle: this.input.forward,
      driftIntensity: this.playerState.isDrifting ? 0.85 : 0,
      nitroActive: this.playerState.isNitroActive,
      policeProximity: policeProx,
      elapsedSec: this.elapsedSec,
    });

    // Throttled HUD updates (~30 fps to React)
    this.hudEmitAccum += dt;
    if (this.hudEmitAccum >= 0.032) {
      this.hudEmitAccum = 0;
      this.emitHud();
    }
  }

  private computePlayerPosition(): number {
    if (!this.playerActor) return 1;
    let rank = 1;
    for (const ai of this.aiRacers) {
      if (ai.finished && !this.playerActor.finished) {
        rank++;
      } else if (ai.finished && this.playerActor.finished) {
        if (ai.finishTimeSec < this.playerActor.finishTimeSec) rank++;
      } else if (ai.totalProgress > this.playerActor.totalProgress) {
        rank++;
      }
    }
    return rank;
  }

  private finishRace(
    won: boolean,
    reason: RaceResult['reason'],
  ): void {
    if (this.raceEnded || !this.currentLevel || !this.playerActor || !this.playerState) return;
    this.raceEnded = true;
    this.audio.setRacingActive(false);

    const position = this.computePlayerPosition();
    const totalRacers = this.aiRacers.length + 1;

    // Calculate Rewards
    const posMultiplier = won ? Math.max(0.5, 1.25 - (position - 1) * 0.2) : 0.25;
    const baseReward = Math.round(this.currentLevel.rewardCash * posMultiplier);
    const driftBonus = Math.round(this.playerState.totalDriftScore * 0.35);
    const nearMissBonus = this.playerState.nearMissCount * 150;
    const cleanBonus = won && this.playerState.collisionCount <= 2 ? 600 : 0;
    const totalCashEarned = baseReward + driftBonus + nearMissBonus + cleanBonus;
    const xpEarned = Math.round(this.currentLevel.rewardXp * (won ? 1 : 0.35));

    const outcome = this.saveSystem.recordRaceOutcome({
      levelId: this.currentLevel.id,
      levelIndex: this.currentLevel.index,
      won,
      totalTimeSec: this.raceTimeSec,
      cashEarned: totalCashEarned,
      xpEarned,
    });

    this.callbacks.onRaceFinish({
      levelId: this.currentLevel.id,
      won,
      reason,
      position,
      totalRacers,
      totalTimeSec: this.raceTimeSec,
      isNewBestTime: outcome.isNewBestTime,
      baseReward,
      driftBonus,
      nearMissBonus,
      cleanBonus,
      totalCashEarned,
      xpEarned,
      unlockedNextLevel: outcome.unlockedNextLevel,
      unlockedHyperCar: outcome.unlockedHyperCar,
    });
  }

  private emitHud(): void {
    if (!this.playerActor || !this.playerState || !this.trackData || !this.currentLevel) return;

    let countdownText: string | null = null;
    if (this.countdownTimer > 0.6) {
      countdownText = String(Math.ceil(this.countdownTimer - 0.6));
    } else if (this.countdownTimer > 0) {
      countdownText = 'GO!';
    }

    const entities: MinimapEntity[] = [
      { x: this.playerActor.pos.x, z: this.playerActor.pos.z, type: 'player' },
      ...this.aiRacers.map((a) => ({ x: a.pos.x, z: a.pos.z, type: 'ai' as const })),
      ...this.policeCars.map((c) => ({ x: c.pos.x, z: c.pos.z, type: 'police' as const })),
    ];

    let timeRemainingSec: number | null = null;
    if (
      (this.currentLevel.raceType === 'escape' ||
        this.currentLevel.raceType === 'timetrial') &&
      this.currentLevel.targetTimeSec !== undefined
    ) {
      timeRemainingSec = Math.max(0, this.currentLevel.targetTimeSec - this.raceTimeSec);
    }

    this.callbacks.onHudUpdate({
      speedKmh: Math.round(Math.abs(this.playerActor.speed) * 3.6),
      rpmRatio: this.playerState.rpmRatio,
      gear: this.playerState.gear,
      nitro: Math.round(this.playerState.nitro),
      isNitroActive: this.playerState.isNitroActive,
      isDrifting: this.playerState.isDrifting,
      driftPoints: Math.round(this.playerState.driftScoreCurrent),
      totalDriftScore: Math.round(this.playerState.totalDriftScore),
      nearMissCount: this.playerState.nearMissCount,
      position: this.computePlayerPosition(),
      totalRacers: this.aiRacers.length + 1,
      lap: Math.min(this.currentLevel.laps, this.playerActor.lap),
      totalLaps: this.currentLevel.laps,
      lapTimeSec: Math.max(0, this.raceTimeSec - this.lapStartTimeSec),
      totalTimeSec: this.raceTimeSec,
      timeRemainingSec,
      bustedProgress: Math.round(this.playerState.bustedProgress),
      countdownText,
      wrongWay: this.playerState.wrongWay,
      eventBanner: this.playerState.eventBanner,
      minimapEntities: entities,
      minimapTrack: this.trackData.minimapPoints,
      playerHeading: this.playerActor.yaw,
    });
  }

  private handlePointerDown = (e: PointerEvent): void => {
    if (this.mode !== 'showcase') return;
    this.showcaseDragActive = true;
    this.showcaseLastX = e.clientX;
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (!this.showcaseDragActive || this.mode !== 'showcase') return;
    const dx = e.clientX - this.showcaseLastX;
    this.showcaseLastX = e.clientX;
    this.showcaseYaw += dx * 0.01;
  };

  private handlePointerUp = (): void => {
    this.showcaseDragActive = false;
  };

  private handleResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
  };

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    this.callbacks.onContextLost(true);
  };

  private handleContextRestored = (): void => {
    this.callbacks.onContextLost(false);
  };

  public getCarSpecName(id: CarId): string {
    return CAR_SPEC_MAP[id]?.name ?? id;
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);

    this.clearRaceScene();
    if (this.showcaseRig) {
      this.disposeGroup(this.showcaseRig.group);
    }
    this.particlePool.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
