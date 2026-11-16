export type CarId =
  | 'compact'
  | 'muscle'
  | 'coupe'
  | 'rally'
  | 'supercar'
  | 'hyper';

export type LevelId =
  | 'sunset-coast'
  | 'neon-city'
  | 'desert-highway'
  | 'mountain-pass'
  | 'snowy-forest'
  | 'midnight-chase';

export type RaceType = 'circuit' | 'sprint' | 'timetrial' | 'escape';

export type GameScreen =
  | 'loading'
  | 'menu'
  | 'levels'
  | 'garage'
  | 'prerace'
  | 'racing'
  | 'paused'
  | 'results';

export type UpgradeKey = 'engine' | 'tires' | 'nitro' | 'brakes';

export interface CarUpgrades {
  engine: number; // 0..3
  tires: number;  // 0..3
  nitro: number;  // 0..3
  brakes: number; // 0..3
}

export interface CarStats {
  topSpeed: number;      // km/h scale display & m/s physics (e.g. 210 - 360 km/h)
  acceleration: number;  // 0..100 stat bar
  handling: number;      // 0..100 stat bar
  nitroCapacity: number; // 0..100 stat bar
  weight: number;        // kg (950 - 1750)
  offroadBonus: number;  // 0..1 multiplier bonus on snow/dirt/mountain
}

export interface CarSpec {
  id: CarId;
  name: string;
  category: string;
  description: string;
  price: number;
  unlockRequirement?: string;
  defaultColor: string;
  stats: CarStats;
}

export interface LevelEnvironment {
  skyTop: string;
  skyHorizon: string;
  fogColor: string;
  fogDensity: number;
  sunColor: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  roadColor: string;
  roadRoughness: number;
  roadMetalness: number;
  shoulderColor: string;
  terrainColor: string;
  isNight: boolean;
  isWet: boolean;
  sceneryType: 'coast' | 'city' | 'desert' | 'mountain' | 'snow' | 'chase';
  weather: 'none' | 'dust' | 'snow' | 'rain';
}

export interface LevelConfig {
  id: LevelId;
  index: number;
  name: string;
  subtitle: string;
  raceType: RaceType;
  laps: number; // 1 for sprint/timetrial/escape
  roadWidth: number;
  surfaceGrip: number; // 1.0 normal, 0.78 wet, 0.58 snow
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Extreme';
  aiCount: number;
  trafficCount: number;
  policeCount: number;
  targetDescription: string;
  targetPosition?: number; // e.g., <= 3 means top 3
  targetTimeSec?: number;  // for timetrial or escape countdown
  rewardCash: number;
  rewardXp: number;
  controlPoints: [number, number, number][];
  closed: boolean;
  environment: LevelEnvironment;
}

export interface SettingsData {
  muted: boolean;
  musicVolume: number; // 0..1
  sfxVolume: number;   // 0..1
  touchControls: 'auto' | 'on' | 'off';
  tiltSteering: boolean;
}

export interface SaveData {
  money: number;
  xp: number;
  unlockedLevelIndex: number; // 0..5
  completedLevels: LevelId[];
  ownedCars: CarId[];
  selectedCarId: CarId;
  carColors: Record<CarId, string>;
  carUpgrades: Record<CarId, CarUpgrades>;
  bestTimes: Partial<Record<LevelId, number>>;
  settings: SettingsData;
}

export interface MinimapEntity {
  x: number;
  z: number;
  type: 'player' | 'ai' | 'police';
}

export interface HudSnapshot {
  speedKmh: number;
  rpmRatio: number; // 0..1
  gear: string;     // 'R' | 'N' | '1'..'6'
  nitro: number;    // 0..100
  isNitroActive: boolean;
  isDrifting: boolean;
  driftPoints: number;
  totalDriftScore: number;
  nearMissCount: number;
  position: number;
  totalRacers: number;
  lap: number;
  totalLaps: number;
  lapTimeSec: number;
  totalTimeSec: number;
  timeRemainingSec: number | null; // Used in Escape & Time Trial reference
  bustedProgress: number;          // 0..100 in Police Chase
  countdownText: string | null;    // '3' | '2' | '1' | 'GO!' | null
  wrongWay: boolean;
  eventBanner: string | null;      // e.g. "NEAR MISS +$150"
  minimapEntities: MinimapEntity[];
  minimapTrack: { x: number; z: number }[];
  playerHeading: number;
}

export interface RaceResult {
  levelId: LevelId;
  won: boolean;
  reason: 'finished' | 'target_missed' | 'busted' | 'time_up';
  position: number;
  totalRacers: number;
  totalTimeSec: number;
  isNewBestTime: boolean;
  baseReward: number;
  driftBonus: number;
  nearMissBonus: number;
  cleanBonus: number;
  totalCashEarned: number;
  xpEarned: number;
  unlockedNextLevel: LevelId | null;
  unlockedHyperCar: boolean;
}

export interface InputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
  nitro: boolean;
  steerAnalog: number; // -1..1 for tilt/touch smooth steer
}
