import React from 'react';
import { Volume2, VolumeX, X } from 'lucide-react';
import { SettingsData } from '../game/types';

interface SettingsModalProps {
  settings: SettingsData;
  onUpdate: (partial: Partial<SettingsData>) => void;
  onResetSave: () => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onUpdate,
  onResetSave,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-[#0d111a] p-6 text-slate-100">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="font-display text-xl font-bold text-white">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-5 text-sm">
          {/* Mute Toggle */}
          <div className="flex items-center justify-between">
            <span className="text-slate-300">Audio Output</span>
            <button
              type="button"
              onClick={() => onUpdate({ muted: !settings.muted })}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                settings.muted
                  ? 'bg-red-950 text-red-300 border border-red-800'
                  : 'bg-slate-800 text-emerald-300 border border-slate-700'
              }`}
            >
              {settings.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              {settings.muted ? 'Muted' : 'Active'}
            </button>
          </div>

          {/* Music Volume */}
          <div>
            <div className="mb-1.5 flex justify-between text-xs">
              <span className="text-slate-400">Synthwave Music Volume</span>
              <span className="font-mono-num text-slate-200">
                {Math.round(settings.musicVolume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.musicVolume}
              onChange={(e) => onUpdate({ musicVolume: parseFloat(e.target.value) })}
              className="w-full accent-amber-500"
            />
          </div>

          {/* SFX Volume */}
          <div>
            <div className="mb-1.5 flex justify-between text-xs">
              <span className="text-slate-400">Engine & SFX Volume</span>
              <span className="font-mono-num text-slate-200">
                {Math.round(settings.sfxVolume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.sfxVolume}
              onChange={(e) => onUpdate({ sfxVolume: parseFloat(e.target.value) })}
              className="w-full accent-cyan-400"
            />
          </div>

          {/* Touch Controls */}
          <div className="flex items-center justify-between">
            <span className="text-slate-300">On-Screen Touch Controls</span>
            <div className="flex rounded-lg bg-slate-900 p-1 text-xs">
              {(['auto', 'on', 'off'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onUpdate({ touchControls: mode })}
                  className={`rounded-md px-2.5 py-1 font-semibold capitalize transition-colors ${
                    settings.touchControls === mode
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Tilt Steering */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-slate-300">Mobile Tilt Steering</div>
              <div className="text-xs text-slate-500">Uses device accelerometer when available</div>
            </div>
            <button
              type="button"
              onClick={() => onUpdate({ tiltSteering: !settings.tiltSteering })}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                settings.tiltSteering
                  ? 'bg-cyan-500 text-slate-950'
                  : 'bg-slate-800 text-slate-300'
              }`}
            >
              {settings.tiltSteering ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          {/* Reset Save */}
          <div className="border-t border-slate-800 pt-4 flex items-center justify-between">
            <span className="text-xs text-slate-500">Clear career cash, cars & best times</span>
            <button
              type="button"
              onClick={onResetSave}
              className="rounded-lg border border-red-900/80 bg-red-950/60 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-900/70"
            >
              Reset Progress
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
