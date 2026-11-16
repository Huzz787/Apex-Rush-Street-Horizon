import React from 'react';
import { Home, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { SettingsData } from '../game/types';

interface PauseModalProps {
  settings: SettingsData;
  onResume: () => void;
  onRestart: () => void;
  onUpdateSettings: (partial: Partial<SettingsData>) => void;
  onQuit: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  settings,
  onResume,
  onRestart,
  onUpdateSettings,
  onQuit,
}) => {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-[#0d111a] p-6 text-slate-100">
        <h2 className="font-display text-2xl font-bold text-white">Race Paused</h2>
        <p className="mt-1 text-xs text-slate-400">
          Press P or Esc to resume driving
        </p>

        <div className="mt-5 space-y-2.5">
          <button
            type="button"
            onClick={onResume}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 py-2.5 font-display text-sm font-bold text-slate-950 transition-colors hover:bg-amber-400"
          >
            <Play className="h-4 w-4 fill-current" />
            Resume Race
          </button>

          <button
            type="button"
            onClick={onRestart}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 py-2.5 text-sm font-semibold text-slate-100 transition-colors hover:border-cyan-400 hover:text-cyan-300"
          >
            <RotateCcw className="h-4 w-4" />
            Restart Stage
          </button>

          <button
            type="button"
            onClick={() => onUpdateSettings({ muted: !settings.muted })}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 py-2.5 text-sm font-semibold text-slate-100 transition-colors hover:border-slate-500"
          >
            {settings.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            {settings.muted ? 'Unmute Audio' : 'Mute Audio'}
          </button>

          <button
            type="button"
            onClick={onQuit}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-800 bg-slate-950 py-2.5 text-sm font-semibold text-slate-400 transition-colors hover:border-red-500/60 hover:text-red-300"
          >
            <Home className="h-4 w-4" />
            Exit to Menu
          </button>
        </div>
      </div>
    </div>
  );
};
