import React from 'react';
import { ArrowLeft, Car, Play } from 'lucide-react';
import { CAR_SPEC_MAP, LEVEL_MAP } from '../game/data';
import { formatCash, formatRaceTime } from '../game/format';
import { LevelId, SaveData } from '../game/types';

interface PreRaceScreenProps {
  levelId: LevelId;
  save: SaveData;
  onStartRace: () => void;
  onOpenGarage: () => void;
  onBack: () => void;
}

export const PreRaceScreen: React.FC<PreRaceScreenProps> = ({
  levelId,
  save,
  onStartRace,
  onOpenGarage,
  onBack,
}) => {
  const level = LEVEL_MAP[levelId];
  const car = CAR_SPEC_MAP[save.selectedCarId];
  const bestTime = save.bestTimes[levelId];

  if (!level) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-5 sm:p-8">
      {/* Top */}
      <div className="pointer-events-auto flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 items-center gap-2 rounded-lg border border-slate-700 bg-[#0a0d14]/92 px-3.5 text-sm font-medium text-slate-200 transition-colors hover:border-amber-400 hover:text-amber-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="font-mono-num text-sm font-bold text-amber-400">
          {formatCash(save.money)}
        </div>
      </div>

      {/* Bottom Briefing Card */}
      <div className="pointer-events-auto mx-auto w-full max-w-4xl rounded-xl border border-slate-800 bg-[#0a0d14]/94 p-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-medium text-amber-400">
              Stage {level.index + 1} · {level.difficulty} ·{' '}
              {level.raceType === 'circuit'
                ? `${level.laps} Laps`
                : level.raceType === 'escape'
                  ? 'Police Escape'
                  : level.raceType === 'timetrial'
                    ? 'Time Trial'
                    : 'Sprint'}
            </div>
            <h2 className="font-display mt-1 text-3xl font-bold text-white">
              {level.name}
            </h2>
            <p className="mt-1 text-sm text-slate-400">{level.subtitle}</p>

            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-300">
              <div>
                <span className="text-slate-500">Target: </span>
                <span className="font-semibold text-white">{level.targetDescription}</span>
              </div>
              <div>
                <span className="text-slate-500">Prize: </span>
                <span className="font-mono-num font-bold text-amber-400">
                  {formatCash(level.rewardCash)}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Best Time: </span>
                <span className="font-mono-num text-cyan-400">
                  {bestTime !== undefined ? formatRaceTime(bestTime) : '--:--.--'}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Vehicle: </span>
                <span className="font-semibold text-white">{car.name}</span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onOpenGarage}
              className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200 transition-colors hover:border-cyan-400 hover:text-cyan-300"
            >
              <Car className="h-4 w-4" />
              Change Car
            </button>
            <button
              type="button"
              onClick={onStartRace}
              className="flex items-center gap-2 rounded-lg bg-amber-500 px-7 py-3 font-display text-base font-bold text-slate-950 transition-colors hover:bg-amber-400"
            >
              <Play className="h-4 w-4 fill-current" />
              Start Race
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
