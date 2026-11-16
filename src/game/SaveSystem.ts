import { CAR_SPEC_MAP, CAR_SPECS, LEVELS } from './data';
import {
  CarId,
  CarStats,
  CarUpgrades,
  LevelId,
  SaveData,
  SettingsData,
  UpgradeKey,
} from './types';

const STORAGE_KEY = 'apex_rush_street_horizon_save_v1';

const DEFAULT_UPGRADES = (): Record<CarId, CarUpgrades> => ({
  compact: { engine: 0, tires: 0, nitro: 0, brakes: 0 },
  muscle: { engine: 0, tires: 0, nitro: 0, brakes: 0 },
  coupe: { engine: 0, tires: 0, nitro: 0, brakes: 0 },
  rally: { engine: 0, tires: 0, nitro: 0, brakes: 0 },
  supercar: { engine: 0, tires: 0, nitro: 0, brakes: 0 },
  hyper: { engine: 0, tires: 0, nitro: 0, brakes: 0 },
});

const DEFAULT_COLORS = (): Record<CarId, string> => {
  const colors = {} as Record<CarId, string>;
  for (const spec of CAR_SPECS) {
    colors[spec.id] = spec.defaultColor;
  }
  return colors;
};

export function createDefaultSave(): SaveData {
  return {
    money: 2000,
    xp: 0,
    unlockedLevelIndex: 0,
    completedLevels: [],
    ownedCars: ['compact'],
    selectedCarId: 'compact',
    carColors: DEFAULT_COLORS(),
    carUpgrades: DEFAULT_UPGRADES(),
    bestTimes: {},
    settings: {
      muted: false,
      musicVolume: 0.45,
      sfxVolume: 0.7,
      touchControls: 'auto',
      tiltSteering: false,
    },
  };
}

export class SaveSystem {
  private data: SaveData;

  constructor() {
    this.data = this.load();
  }

  private load(): SaveData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createDefaultSave();
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      const def = createDefaultSave();
      return {
        money: typeof parsed.money === 'number' ? parsed.money : def.money,
        xp: typeof parsed.xp === 'number' ? parsed.xp : def.xp,
        unlockedLevelIndex:
          typeof parsed.unlockedLevelIndex === 'number'
            ? Math.max(0, Math.min(LEVELS.length - 1, parsed.unlockedLevelIndex))
            : def.unlockedLevelIndex,
        completedLevels: Array.isArray(parsed.completedLevels)
          ? parsed.completedLevels
          : def.completedLevels,
        ownedCars:
          Array.isArray(parsed.ownedCars) && parsed.ownedCars.length > 0
            ? parsed.ownedCars
            : def.ownedCars,
        selectedCarId:
          parsed.selectedCarId && CAR_SPEC_MAP[parsed.selectedCarId]
            ? parsed.selectedCarId
            : def.selectedCarId,
        carColors: { ...def.carColors, ...(parsed.carColors || {}) },
        carUpgrades: { ...def.carUpgrades, ...(parsed.carUpgrades || {}) },
        bestTimes: { ...(parsed.bestTimes || {}) },
        settings: { ...def.settings, ...(parsed.settings || {}) },
      };
    } catch {
      return createDefaultSave();
    }
  }

  public save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Ignore storage quota errors in private browsing
    }
  }

  public getData(): SaveData {
    return this.data;
  }

  public getUpgrades(carId: CarId): CarUpgrades {
    return this.data.carUpgrades[carId] ?? { engine: 0, tires: 0, nitro: 0, brakes: 0 };
  }

  /**
   * Computes effective stats after applying 0-3 upgrade tiers.
   */
  public getEffectiveStats(carId: CarId): CarStats {
    const base = CAR_SPEC_MAP[carId].stats;
    const up = this.getUpgrades(carId);
    return {
      topSpeed: Math.round(base.topSpeed * (1 + up.engine * 0.055)),
      acceleration: Math.min(100, Math.round(base.acceleration + up.engine * 5)),
      handling: Math.min(
        100,
        Math.round(base.handling + up.tires * 5 + up.brakes * 2),
      ),
      nitroCapacity: Math.min(
        100,
        Math.round(base.nitroCapacity + up.nitro * 6),
      ),
      weight: Math.round(base.weight * (1 - up.brakes * 0.015)),
      offroadBonus: base.offroadBonus + up.tires * 0.05,
    };
  }

  public selectCar(carId: CarId): boolean {
    if (!this.data.ownedCars.includes(carId)) return false;
    this.data.selectedCarId = carId;
    this.save();
    return true;
  }

  public buyCar(carId: CarId): boolean {
    if (this.data.ownedCars.includes(carId)) return true;
    const spec = CAR_SPEC_MAP[carId];
    if (!spec || spec.id === 'hyper') return false; // Hyper unlocked by completing all levels
    if (this.data.money < spec.price) return false;
    this.data.money -= spec.price;
    this.data.ownedCars.push(carId);
    this.data.selectedCarId = carId;
    this.save();
    return true;
  }

  public setCarColor(carId: CarId, hex: string): void {
    this.data.carColors[carId] = hex;
    this.save();
  }

  public buyUpgrade(carId: CarId, key: UpgradeKey, cost: number): boolean {
    if (!this.data.ownedCars.includes(carId)) return false;
    const current = this.getUpgrades(carId);
    if (current[key] >= 3) return false;
    if (this.data.money < cost) return false;
    this.data.money -= cost;
    this.data.carUpgrades[carId] = {
      ...current,
      [key]: current[key] + 1,
    };
    this.save();
    return true;
  }

  public updateSettings(partial: Partial<SettingsData>): void {
    this.data.settings = { ...this.data.settings, ...partial };
    this.save();
  }

  public recordRaceOutcome(params: {
    levelId: LevelId;
    levelIndex: number;
    won: boolean;
    totalTimeSec: number;
    cashEarned: number;
    xpEarned: number;
  }): {
    isNewBestTime: boolean;
    unlockedNextLevel: LevelId | null;
    unlockedHyperCar: boolean;
  } {
    this.data.money += params.cashEarned;
    this.data.xp += params.xpEarned;

    let isNewBestTime = false;
    let unlockedNextLevel: LevelId | null = null;
    let unlockedHyperCar = false;

    if (params.won) {
      const prevBest = this.data.bestTimes[params.levelId];
      if (prevBest === undefined || params.totalTimeSec < prevBest) {
        this.data.bestTimes[params.levelId] = params.totalTimeSec;
        isNewBestTime = true;
      }

      if (!this.data.completedLevels.includes(params.levelId)) {
        this.data.completedLevels.push(params.levelId);
      }

      if (
        params.levelIndex + 1 < LEVELS.length &&
        this.data.unlockedLevelIndex < params.levelIndex + 1
      ) {
        this.data.unlockedLevelIndex = params.levelIndex + 1;
        unlockedNextLevel = LEVELS[params.levelIndex + 1].id;
      }

      // Check if all 6 levels are completed -> unlock Hyper Racer
      if (
        this.data.completedLevels.length >= LEVELS.length &&
        !this.data.ownedCars.includes('hyper')
      ) {
        this.data.ownedCars.push('hyper');
        unlockedHyperCar = true;
      }
    }

    this.save();
    return { isNewBestTime, unlockedNextLevel, unlockedHyperCar };
  }

  public resetProgress(): void {
    const settings = this.data.settings;
    this.data = createDefaultSave();
    this.data.settings = settings;
    this.save();
  }
}
