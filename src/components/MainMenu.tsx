import React from 'react';
import { Car, Map, Play, Settings, Volume2, VolumeX } from 'lucide-react';
import { CAR_SPEC_MAP, LEVELS } from '../game/data';
import { formatCash } from '../game/format';
import { SaveData } from '../game/types';

interface MainMenuProps {
  save: SaveData;
  onPlayNext: () => void;
  onOpenLevels: () => void;
  onOpenGarage: () => void;
  onOpenSettings: () => void;
  onToggleMute: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  save,
  onPlayNext,
  onOpenLevels,
  onOpenGarage,
  onOpenSettings,
  onToggleMute,
}) => {
  const activeCar = CAR_SPEC_MAP[save.selectedCarId];
  const nextLevel = LEVELS[Math.min(LEVELS.length - 1, save.unlockedLevelIndex)];

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-5 sm:p-8">
      {/* Top Bar */}
      <header className="pointer-events-auto flex items-center justify-between gap-4">
        <div className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
          APEX RUSH
        </div>

        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-4 text-slate-300">
            <span className="font-mono-num font-bold text-amber-400">
              {formatCash(save.money)}
            </span>
            <span className="text-slate-600" aria-hidden="true">
              ·
            </span>
            <span className="font-mono-num text-cyan-400">
              {save.xp.toLocaleString()} XP
            </span>
          </div>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={save.settings.muted ? 'Unmute audio' : 'Mute audio'}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700/80 bg-[#0d111a]/90 text-slate-200 transition-colors hover:border-amber-500 hover:text-amber-400"
          >
            {save.settings.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* Bottom Left Hero & Action Dock (keeps center 3D car showcase completely open) */}
      <div className="pointer-events-auto flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-lg rounded-xl border border-slate-800/90 bg-[#0a0d14]/90 p-5 sm:p-6">
          <div className="text-xs font-medium text-slate-400">
            <span>{activeCar.category}</span>
            <span className="mx-2 text-slate-600" aria-hidden="true">·</span>
            <span>{activeCar.name}</span>
            <span className="mx-2 text-slate-600" aria-hidden="true">·</span>
            <span>Drag car to inspect</span>
          </div>

          <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Next Stage: {nextLevel.name}
          </h1>
          <p className="mt-1.5 text-sm text-slate-300">
            {nextLevel.subtitle} · {nextLevel.targetDescription}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onPlayNext}
              className="flex items-center gap-2 rounded-lg bg-amber-500 px-6 py-3 font-display text-sm font-bold tracking-wide text-slate-950 transition-colors hover:bg-amber-400 whitespace-nowrap shrink-0"
            >
              <Play className="h-4 w-4 fill-current" />
              Play Race
            </button>

            <button
              type="button"
              onClick={onOpenLevels}
              className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/90 px-4 py-3 text-sm font-semibold text-slate-100 transition-colors hover:border-cyan-400 hover:text-cyan-300 whitespace-nowrap shrink-0"
            >
              <Map className="h-4 w-4" />
              Level Select
            </button>

            <button
              type="button"
              onClick={onOpenGarage}
              className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/90 px-4 py-3 text-sm font-semibold text-slate-100 transition-colors hover:border-amber-400 hover:text-amber-300 whitespace-nowrap shrink-0"
            >
              <Car className="h-4 w-4" />
              Garage
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/90 px-4 py-3 text-sm font-semibold text-slate-100 transition-colors hover:border-slate-500 whitespace-nowrap shrink-0"
            >
              <Settings className="h-4 w-4" />
              Settings
            </button>
          </div>
        </div>

        <div className="hidden rounded-xl border border-slate-800/80 bg-[#0a0d14]/88 px-4 py-3 text-xs text-slate-400 lg:block">
          <div className="font-semibold text-slate-200">Quick Controls</div>
          <div className="mt-1 space-y-0.5">
            <div>Drive: W A S D / Arrows</div>
            <div>Drift: Space · Nitro: Shift</div>
            <div>Reset: R · Pause: P / Esc</div>
          </div>
        </div>
      </div>
    </div>
  );
};
