/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GarageScreen } from './components/GarageScreen';
import { LevelSelect } from './components/LevelSelect';
import { LoadingScreen } from './components/LoadingScreen';
import { MainMenu } from './components/MainMenu';
import { PauseModal } from './components/PauseModal';
import { PreRaceScreen } from './components/PreRaceScreen';
import { RaceHUD } from './components/RaceHUD';
import { ResultsScreen } from './components/ResultsScreen';
import { SettingsModal } from './components/SettingsModal';
import { AudioEngine } from './game/AudioEngine';
import { LEVEL_MAP, LEVELS } from './game/data';
import { GameEngine } from './game/GameEngine';
import { SaveSystem } from './game/SaveSystem';
import {
  CarId,
  GameScreen,
  HudSnapshot,
  InputState,
  LevelId,
  RaceResult,
  SettingsData,
} from './game/types';

export default function App() {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const saveSystemRef = useRef<SaveSystem>(new SaveSystem());
  const audioRef = useRef<AudioEngine>(new AudioEngine());

  const [saveVersion, setSaveVersion] = useState(0);
  const save = useMemo(() => {
    void saveVersion;
    return { ...saveSystemRef.current.getData() };
  }, [saveVersion]);

  const [screen, setScreen] = useState<GameScreen>('loading');
  const [loadProgress, setLoadProgress] = useState(15);
  const [loadLabel, setLoadLabel] = useState('Initializing WebGL Pipeline');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedLevelId, setSelectedLevelId] = useState<LevelId>(
    () => LEVELS[Math.min(LEVELS.length - 1, saveSystemRef.current.getData().unlockedLevelIndex)].id,
  );
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [raceResult, setRaceResult] = useState<RaceResult | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  const screenRef = useRef<GameScreen>(screen);
  screenRef.current = screen;

  const refreshSave = useCallback(() => {
    setSaveVersion((v) => v + 1);
  }, []);

  // Detect touch capability once
  useEffect(() => {
    const coarse =
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window);
    setIsTouchDevice(Boolean(coarse));
  }, []);

  // Initialize Three.js GameEngine once in isolated container
  useEffect(() => {
    const container = canvasRef.current;
    if (!container) return;

    audioRef.current.applySettings(saveSystemRef.current.getData().settings);

    const engine = new GameEngine(container, saveSystemRef.current, audioRef.current, {
      onHudUpdate: (snapshot) => {
        setHud(snapshot);
      },
      onRaceFinish: (result) => {
        setRaceResult(result);
        setScreen('results');
        setSaveVersion((v) => v + 1);
      },
      onContextLost: (lost) => {
        setContextLost(lost);
      },
    });
    engineRef.current = engine;

    // Brief staged loading progress while shaders & studio environment settle
    const t1 = window.setTimeout(() => {
      setLoadProgress(68);
      setLoadLabel('Building Procedural Vehicles & Tracks');
    }, 180);
    const t2 = window.setTimeout(() => {
      setLoadProgress(100);
      setLoadLabel('Ready');
    }, 420);
    const t3 = window.setTimeout(() => {
      setScreen('menu');
    }, 620);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      engine.dispose();
      engineRef.current = null;
      audioRef.current.dispose();
    };
  }, []);

  // Keyboard driving & shortcut handlers
  useEffect(() => {
    const updateKey = (code: string, down: boolean): boolean => {
      const engine = engineRef.current;
      if (!engine) return false;
      switch (code) {
        case 'KeyW':
        case 'ArrowUp':
          engine.input.forward = down;
          return true;
        case 'KeyS':
        case 'ArrowDown':
          engine.input.backward = down;
          return true;
        case 'KeyA':
        case 'ArrowLeft':
          engine.input.left = down;
          return true;
        case 'KeyD':
        case 'ArrowRight':
          engine.input.right = down;
          return true;
        case 'Space':
          engine.input.handbrake = down;
          return true;
        case 'ShiftLeft':
        case 'ShiftRight':
          engine.input.nitro = down;
          return true;
        default:
          return false;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      audioRef.current.unlock();
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (screenRef.current === 'racing') {
          e.preventDefault();
          engineRef.current?.setPaused(true);
          setScreen('paused');
          return;
        }
        if (screenRef.current === 'paused') {
          e.preventDefault();
          engineRef.current?.setPaused(false);
          setScreen('racing');
          return;
        }
      }
      if (e.code === 'KeyR' && screenRef.current === 'racing') {
        e.preventDefault();
        engineRef.current?.resetPlayerToTrack();
        return;
      }
      if (screenRef.current === 'racing' && updateKey(e.code, true)) {
        e.preventDefault();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      updateKey(e.code, false);
    };

    const onBlur = () => {
      const engine = engineRef.current;
      if (!engine) return;
      engine.input.forward = false;
      engine.input.backward = false;
      engine.input.left = false;
      engine.input.right = false;
      engine.input.handbrake = false;
      engine.input.nitro = false;
      engine.input.steerAnalog = 0;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // Optional mobile tilt steering
  useEffect(() => {
    if (!save.settings.tiltSteering) {
      if (engineRef.current) engineRef.current.input.steerAnalog = 0;
      return;
    }

    const handleOrientation = (e: DeviceOrientationEvent) => {
      const engine = engineRef.current;
      if (!engine || screenRef.current !== 'racing') return;
      const gamma = e.gamma ?? 0; // -90..90 tilt left/right
      const normalized = Math.max(-1, Math.min(1, -gamma / 28));
      engine.input.steerAnalog = Math.abs(normalized) < 0.08 ? 0 : normalized;
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [save.settings.tiltSteering]);

  const handleSetTouchInput = useCallback((key: keyof InputState, pressed: boolean) => {
    audioRef.current.unlock();
    const engine = engineRef.current;
    if (!engine) return;
    if (key === 'steerAnalog') return;
    engine.input[key] = pressed;
  }, []);

  const handleLaunchRace = useCallback((levelId: LevelId) => {
    audioRef.current.unlock();
    audioRef.current.playUiConfirm();
    setSelectedLevelId(levelId);
    setRaceResult(null);
    engineRef.current?.startRace(levelId);
    setScreen('racing');
  }, []);

  const handleExitToMenu = useCallback(() => {
    audioRef.current.playUiConfirm();
    engineRef.current?.enterShowcaseMode();
    setScreen('menu');
  }, []);

  const handleOpenGarage = useCallback(() => {
    audioRef.current.unlock();
    audioRef.current.playUiConfirm();
    const current = saveSystemRef.current.getData();
    engineRef.current?.enterShowcaseMode(
      current.selectedCarId,
      current.carColors[current.selectedCarId],
    );
    setScreen('garage');
  }, []);

  const handlePreviewCar = useCallback((carId: CarId, colorHex: string) => {
    engineRef.current?.setShowcaseCar(carId, colorHex);
  }, []);

  const handleUpdateSettings = useCallback((partial: Partial<SettingsData>) => {
    audioRef.current.unlock();
    saveSystemRef.current.updateSettings(partial);
    const updated = saveSystemRef.current.getData().settings;
    audioRef.current.applySettings(updated);
    refreshSave();
  }, [refreshSave]);

  const handleResetSave = useCallback(() => {
    saveSystemRef.current.resetProgress();
    refreshSave();
    const s = saveSystemRef.current.getData();
    setSelectedLevelId(LEVELS[0].id);
    engineRef.current?.setShowcaseCar(s.selectedCarId, s.carColors[s.selectedCarId]);
  }, [refreshSave]);

  const showTouchControls =
    save.settings.touchControls === 'on' ||
    (save.settings.touchControls === 'auto' && isTouchDevice);

  const activeLevel = LEVEL_MAP[selectedLevelId] ?? LEVELS[0];

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#070a12]">
      {/* Dedicated Isolated 3D WebGL Viewport Container */}
      <div ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {contextLost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6 text-center">
          <div className="max-w-sm rounded-xl border border-slate-800 bg-[#0d111a] p-6">
            <h2 className="font-display text-xl font-bold text-amber-400">
              Graphics Context Restoring
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              WebGL rendering was interrupted by the browser. Reloading canvas...
            </p>
          </div>
        </div>
      )}

      {screen === 'loading' && (
        <LoadingScreen progress={loadProgress} label={loadLabel} />
      )}

      {screen === 'menu' && (
        <MainMenu
          save={save}
          onPlayNext={() => {
            audioRef.current.unlock();
            const nextLvl =
              LEVELS[Math.min(LEVELS.length - 1, save.unlockedLevelIndex)];
            setSelectedLevelId(nextLvl.id);
            setScreen('prerace');
          }}
          onOpenLevels={() => {
            audioRef.current.unlock();
            audioRef.current.playUiConfirm();
            setScreen('levels');
          }}
          onOpenGarage={handleOpenGarage}
          onOpenSettings={() => {
            audioRef.current.unlock();
            setSettingsOpen(true);
          }}
          onToggleMute={() => handleUpdateSettings({ muted: !save.settings.muted })}
        />
      )}

      {screen === 'levels' && (
        <LevelSelect
          save={save}
          onSelectLevel={(id) => {
            audioRef.current.playUiConfirm();
            setSelectedLevelId(id);
            setScreen('prerace');
          }}
          onBack={() => setScreen('menu')}
        />
      )}

      {screen === 'garage' && (
        <GarageScreen
          save={save}
          saveSystem={saveSystemRef.current}
          onPreviewCar={handlePreviewCar}
          onSaveChanged={refreshSave}
          onBack={() => setScreen('menu')}
        />
      )}

      {screen === 'prerace' && (
        <PreRaceScreen
          levelId={selectedLevelId}
          save={save}
          onStartRace={() => handleLaunchRace(selectedLevelId)}
          onOpenGarage={handleOpenGarage}
          onBack={() => setScreen('levels')}
        />
      )}

      {(screen === 'racing' || screen === 'paused') && hud && (
        <RaceHUD
          hud={hud}
          level={activeLevel}
          showTouchControls={showTouchControls}
          onSetInput={handleSetTouchInput}
          onPause={() => {
            engineRef.current?.setPaused(true);
            setScreen('paused');
          }}
          onResetTrack={() => engineRef.current?.resetPlayerToTrack()}
        />
      )}

      {screen === 'paused' && (
        <PauseModal
          settings={save.settings}
          onResume={() => {
            engineRef.current?.setPaused(false);
            setScreen('racing');
          }}
          onRestart={() => handleLaunchRace(selectedLevelId)}
          onUpdateSettings={handleUpdateSettings}
          onQuit={handleExitToMenu}
        />
      )}

      {screen === 'results' && raceResult && (
        <ResultsScreen
          result={raceResult}
          onNextRace={(nextId) => handleLaunchRace(nextId)}
          onRetry={() => handleLaunchRace(selectedLevelId)}
          onGarage={handleOpenGarage}
          onMenu={handleExitToMenu}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          settings={save.settings}
          onUpdate={handleUpdateSettings}
          onResetSave={handleResetSave}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
