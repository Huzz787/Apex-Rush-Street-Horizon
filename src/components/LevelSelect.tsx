import React from 'react';
import { ArrowLeft, CheckCircle2, Lock, Play } from 'lucide-react';
import { LEVELS } from '../game/data';
import { formatCash, formatRaceTime } from '../game/format';
import { LevelId, SaveData } from '../game/types';

interface LevelSelectProps {
  save: SaveData;
  onSelectLevel: (levelId: LevelId) => void;
  onBack: () => void;
}

const RACE_TYPE_LABELS: Record<string, string> = {
  circuit: 'Circuit',
  sprint: 'Sprint',
  timetrial: 'Time Trial',
  escape: 'Police Escape',
};

export const LevelSelect: React.FC<LevelSelectProps> = ({
  save,
  onSelectLevel,
  onBack,
}) => {
  return (
    <div className="fixed inset-0 z-20 flex flex-col bg-[#080b12]/94 p-5 sm:p-8 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onBack}
              className="flex h-10 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3.5 text-sm font-medium text-slate-200 transition-colors hover:border-amber-400 hover:text-amber-300"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <div>
              <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">
                World Tour Stages
              </h2>
              <p className="text-xs text-slate-400">
                Complete each stage to unlock the next tier · Finish all 6 to unlock the Hyper Racer
              </p>
            </div>
          </div>

          <div className="font-mono-num text-sm font-bold text-amber-400">
            {formatCash(save.money)}
          </div>
        </div>

        {/* 6 Stage Cards */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {LEVELS.map((lvl) => {
            const unlocked = lvl.index <= save.unlockedLevelIndex;
            const completed = save.completedLevels.includes(lvl.id);
            const bestTime = save.bestTimes[lvl.id];

            return (
              <div
                key={lvl.id}
                className={`flex flex-col justify-between rounded-xl border p-5 transition-colors ${
                  unlocked
                    ? 'border-slate-700/90 bg-[#0f1420] hover:border-amber-500/70'
                    : 'border-slate-800/60 bg-[#0a0d15] opacity-65'
                }`}
              >
                <div>
                  {/* Color atmosphere bar */}
                  <div
                    className="mb-4 h-2 w-full rounded-sm"
                    style={{
                      background: `linear-gradient(90deg, ${lvl.environment.skyTop}, ${lvl.environment.skyHorizon})`,
                    }}
                  />

                  <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                    <span>
                      Stage {lvl.index + 1} · {RACE_TYPE_LABELS[lvl.raceType]} · {lvl.difficulty}
                    </span>
                    {completed ? (
                      <span className="flex items-center gap-1 font-medium text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Cleared
                      </span>
                    ) : !unlocked ? (
                      <span className="flex items-center gap-1 text-slate-500">
                        <Lock className="h-3.5 w-3.5" />
                        Locked
                      </span>
                    ) : null}
                  </div>

                  <h3 className="font-display mt-2 text-xl font-bold text-white">
                    {lvl.name}
                  </h3>
                  <p className="mt-0.5 text-sm text-slate-400">{lvl.subtitle}</p>

                  <div className="mt-4 space-y-1.5 border-t border-slate-800/90 pt-3 text-xs text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Objective</span>
                      <span className="font-medium text-slate-100">{lvl.targetDescription}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Prize Pool</span>
                      <span className="font-mono-num font-bold text-amber-400">
                        {formatCash(lvl.rewardCash)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Best Time</span>
                      <span className="font-mono-num text-cyan-400">
                        {bestTime !== undefined ? formatRaceTime(bestTime) : '--:--.--'}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!unlocked}
                  onClick={() => onSelectLevel(lvl.id)}
                  className={`mt-5 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 font-display text-sm font-bold transition-colors ${
                    unlocked
                      ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                      : 'cursor-not-allowed bg-slate-800 text-slate-500'
                  }`}
                >
                  {unlocked ? (
                    <>
                      <Play className="h-4 w-4 fill-current" />
                      Select Stage
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4" />
                      Clear Stage {lvl.index} First
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
