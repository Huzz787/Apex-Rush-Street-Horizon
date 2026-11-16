import React from 'react';

interface LoadingScreenProps {
  progress: number;
  label: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ progress, label }) => {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#070a12] px-6 text-slate-100">
      <div className="w-full max-w-md">
        <div className="mb-2 text-xs font-medium tracking-widest text-amber-400 uppercase">
          Street Racing Championship
        </div>
        <h1 className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
          APEX RUSH
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Street Horizon · Procedural 3D Engine
        </p>

        <div className="mt-8 h-2 w-full overflow-hidden rounded-sm bg-slate-800">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-cyan-400 transition-transform duration-150 ease-out origin-left"
            style={{ transform: `scaleX(${Math.max(0.05, Math.min(1, progress / 100))})` }}
          />
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
          <span>{label}</span>
          <span className="font-mono-num text-slate-200">{Math.round(progress)}%</span>
        </div>
      </div>
    </div>
  );
};
