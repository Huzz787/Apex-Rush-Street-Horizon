import React from 'react';
import { ArrowRight, Car, Home, RotateCcw, Trophy } from 'lucide-react';
import { LEVEL_MAP } from '../game/data';
import { formatCash, formatOrdinal, formatRaceTime } from '../game/format';
import { LevelId, RaceResult } from '../game/types';

interface ResultsScreenProps {
  result: RaceResult;
  onNextRace: (nextLevelId: LevelId) => void;
  onRetry: () => void;
  onGarage: () => void;
  onMenu: () => void;
}

export const ResultsScreen: React.FC<ResultsScreenProps> = ({
  result,
  onNextRace,
  onRetry,
  onGarage,
  onMenu,
}) => {
  const level = LEVEL_MAP[result.levelId];
  const nextLevel = result.unlockedNextLevel
    ? LEVEL_MAP[result.unlockedNextLevel]
    : null;

  let headline = result.won ? 'Stage Cleared' : 'Target Missed';
  if (result.reason === 'busted') headline = 'BUSTED!';
  else if (result.reason === 'time_up') headline = 'Time Expired';

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/82 p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-[#0c101a] p-6 text-slate-100">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <div className="text-xs font-medium text-slate-400">
              {level?.name} · {level?.subtitle}
            </div>
            <h2
              className={`font-display mt-1 text-3xl font-bold ${
                result.won ? 'text-amber-400' : 'text-red-400'
              }`}
            >
              {headline}
            </h2>
          </div>

          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-800 bg-slate-900">
            <Trophy
              className={`h-6 w-6 ${result.won ? 'text-amber-400' : 'text-slate-500'}`}
            />
          </div>
        </div>

        {/* Race Summary */}
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-slate-900/90 p-3">
            <div className="text-xs text-slate-400">Position</div>
            <div className="font-display mt-0.5 text-xl font-bold text-white">
              {level?.raceType === 'timetrial' || level?.raceType === 'escape'
                ? result.won
                  ? 'Cleared'
                  : 'Failed'
                : `${formatOrdinal(result.position)} / ${result.totalRacers}`}
            </div>
          </div>

          <div className="rounded-lg bg-slate-900/90 p-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Finish Time</span>
              {result.isNewBestTime && (
                <span className="font-semibold text-cyan-400">New Best</span>
              )}
            </div>
            <div className="font-mono-num mt-0.5 text-xl font-bold text-cyan-300">
              {formatRaceTime(result.totalTimeSec)}
            </div>
          </div>
        </div>

        {/* Earnings Breakdown */}
        <div className="mt-4 space-y-2 rounded-lg border border-slate-800/80 bg-slate-900/50 p-4 text-xs">
          <div className="flex justify-between text-slate-300">
            <span>Race Purse</span>
            <span className="font-mono-num">{formatCash(result.baseReward)}</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>Drift Bonus</span>
            <span className="font-mono-num">{formatCash(result.driftBonus)}</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>Near-Miss Traffic Bonus</span>
            <span className="font-mono-num">{formatCash(result.nearMissBonus)}</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>Clean Driving Bonus</span>
            <span className="font-mono-num">{formatCash(result.cleanBonus)}</span>
          </div>
          <div className="border-t border-slate-800 pt-2 flex justify-between text-sm font-bold">
            <span className="text-white">Total Earned</span>
            <span className="font-mono-num text-amber-400">
              +{formatCash(result.totalCashEarned)} · +{result.xpEarned} XP
            </span>
          </div>
        </div>

        {/* Unlock Callouts */}
        {(nextLevel || result.unlockedHyperCar) && (
          <div className="mt-4 rounded-lg border border-cyan-500/40 bg-cyan-950/40 p-3 text-xs text-cyan-200">
            {nextLevel && <div>Unlocked Stage: {nextLevel.name}</div>}
            {result.unlockedHyperCar && (
              <div className="font-bold text-amber-300">
                Championship Complete! Unlocked Aether X-99 Hyper Racer in Garage!
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-5 flex flex-wrap gap-2.5">
          {nextLevel && (
            <button
              type="button"
              onClick={() => onNextRace(nextLevel.id)}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 font-display text-sm font-bold text-slate-950 hover:bg-amber-400 whitespace-nowrap"
            >
              Next Race
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onRetry}
            className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold whitespace-nowrap ${
              nextLevel
                ? 'border border-slate-700 bg-slate-900 text-slate-200 hover:border-cyan-400'
                : 'flex-1 bg-amber-500 font-display font-bold text-slate-950 hover:bg-amber-400'
            }`}
          >
            <RotateCcw className="h-4 w-4" />
            Race Again
          </button>
          <button
            type="button"
            onClick={onGarage}
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:border-amber-400 whitespace-nowrap"
          >
            <Car className="h-4 w-4" />
            Garage
          </button>
          <button
            type="button"
            onClick={onMenu}
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm font-semibold text-slate-400 hover:text-white whitespace-nowrap"
          >
            <Home className="h-4 w-4" />
            Menu
          </button>
        </div>
      </div>
    </div>
  );
};
