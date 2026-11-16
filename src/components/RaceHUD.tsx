import React, { useMemo } from 'react';
import { Pause, RotateCcw } from 'lucide-react';
import { formatOrdinal, formatRaceTime } from '../game/format';
import { HudSnapshot, InputState, LevelConfig } from '../game/types';

interface RaceHUDProps {
  hud: HudSnapshot;
  level: LevelConfig;
  showTouchControls: boolean;
  onSetInput: (key: keyof InputState, pressed: boolean) => void;
  onPause: () => void;
  onResetTrack: () => void;
}

export const RaceHUD: React.FC<RaceHUDProps> = ({
  hud,
  level,
  showTouchControls,
  onSetInput,
  onPause,
  onResetTrack,
}) => {
  // Compute normalized minimap SVG coordinates
  const minimapData = useMemo(() => {
    const pts = hud.minimapTrack;
    if (pts.length === 0) return { path: '', transform: (x: number, z: number) => ({ x: 50, y: 50 }) };

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    const spanX = Math.max(10, maxX - minX);
    const spanZ = Math.max(10, maxZ - minZ);
    const scale = 84 / Math.max(spanX, spanZ);
    const offsetX = 56 - ((minX + maxX) * 0.5) * scale;
    const offsetY = 56 - ((minZ + maxZ) * 0.5) * scale;

    const toSvg = (x: number, z: number) => ({
      x: x * scale + offsetX,
      y: z * scale + offsetY,
    });

    const d = pts
      .map((p, i) => {
        const s = toSvg(p.x, p.z);
        return `${i === 0 ? 'M' : 'L'} ${s.x.toFixed(1)} ${s.y.toFixed(1)}`;
      })
      .join(' ') + (level.closed ? ' Z' : '');

    return { path: d, transform: toSvg };
  }, [hud.minimapTrack, level.closed]);

  // SVG Tachometer Arc math (220 degree sweep)
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const sweepFraction = 220 / 360;
  const maxArc = circumference * sweepFraction;
  const filledArc = maxArc * Math.max(0.04, Math.min(1, hud.rpmRatio));

  const speedStreakOpacity = hud.isNitroActive
    ? 0.55
    : Math.max(0, (hud.speedKmh - 190) / 160) * 0.32;

  return (
    <div className="pointer-events-none fixed inset-0 z-20 overflow-hidden select-none">
      {/* Radial Speed Lines Overlay during high speed / Nitro */}
      {speedStreakOpacity > 0.02 && (
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-100"
          style={{
            opacity: speedStreakOpacity,
            background:
              'repeating-conic-gradient(from 0deg at 50% 50%, rgba(56,189,248,0.22) 0deg 1.5deg, transparent 1.5deg 11deg)',
            maskImage:
              'radial-gradient(circle at center, transparent 42%, black 88%)',
            WebkitMaskImage:
              'radial-gradient(circle at center, transparent 42%, black 88%)',
          }}
        />
      )}

      {/* Top Row: Race Standings + Minimap & Controls */}
      <div className="flex items-start justify-between p-4 sm:p-6">
        {/* Top-Left: Position, Lap, Timers */}
        <div className="rounded-xl border border-slate-800/90 bg-[#080b12]/88 px-4 py-3">
          <div className="flex items-baseline gap-4">
            {level.raceType !== 'timetrial' && level.raceType !== 'escape' && (
              <div>
                <span className="text-[11px] font-medium text-slate-400">POS</span>
                <div className="font-display text-2xl font-bold text-amber-400 leading-none">
                  {formatOrdinal(hud.position)}
                  <span className="text-sm text-slate-400">/{hud.totalRacers}</span>
                </div>
              </div>
            )}

            <div>
              <span className="text-[11px] font-medium text-slate-400">
                {level.closed ? 'LAP' : 'STAGE'}
              </span>
              <div className="font-display text-2xl font-bold text-white leading-none">
                {level.closed ? `${hud.lap}/${hud.totalLaps}` : level.raceType === 'escape' ? 'ESCAPE' : 'SPRINT'}
              </div>
            </div>

            <div className="border-l border-slate-800 pl-4">
              <span className="text-[11px] font-medium text-slate-400">TIME</span>
              <div className="font-mono-num text-lg font-bold text-slate-100 leading-none">
                {formatRaceTime(hud.totalTimeSec)}
              </div>
              {hud.timeRemainingSec !== null && (
                <div
                  className={`font-mono-num mt-1 text-xs font-bold ${
                    hud.timeRemainingSec < 15 ? 'text-red-400' : 'text-cyan-400'
                  }`}
                >
                  LEFT {formatRaceTime(hud.timeRemainingSec)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Top-Right: Minimap + Pause/Reset */}
        <div className="flex items-start gap-3">
          <div className="pointer-events-auto flex flex-col gap-2">
            <button
              type="button"
              onClick={onPause}
              title="Pause (P / Esc)"
              aria-label="Pause race"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700/80 bg-[#080b12]/88 text-slate-200 hover:border-amber-400 hover:text-amber-300"
            >
              <Pause className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onResetTrack}
              title="Reset car to track (R)"
              aria-label="Reset car to track"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700/80 bg-[#080b12]/88 text-slate-200 hover:border-cyan-400 hover:text-cyan-300"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          <div className="rounded-xl border border-slate-800/90 bg-[#080b12]/88 p-2">
            <svg width="112" height="112" viewBox="0 0 112 112" className="block">
              <path
                d={minimapData.path}
                fill="none"
                stroke="#334155"
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {hud.minimapEntities.map((ent, idx) => {
                const pt = minimapData.transform(ent.x, ent.z);
                const fill =
                  ent.type === 'player'
                    ? '#f59e0b'
                    : ent.type === 'police'
                      ? '#ef4444'
                      : '#38bdf8';
                const r = ent.type === 'player' ? 4.2 : 3;
                return (
                  <circle
                    key={idx}
                    cx={pt.x}
                    cy={pt.y}
                    r={r}
                    fill={fill}
                    stroke="#090d16"
                    strokeWidth="1"
                  />
                );
              })}
            </svg>
          </div>
        </div>
      </div>

      {/* Center Banners: Countdown, Wrong Way, Busted, Drift / Near Miss */}
      <div className="pointer-events-none absolute inset-x-0 top-24 flex flex-col items-center gap-2 px-4">
        {hud.countdownText && (
          <div className="font-display text-6xl font-bold tracking-wider text-amber-400 drop-shadow-[0_4px_20px_rgba(0,0,0,0.85)] sm:text-7xl">
            {hud.countdownText}
          </div>
        )}

        {hud.wrongWay && (
          <div className="rounded-lg border border-red-500/80 bg-red-950/90 px-5 py-2 font-display text-lg font-bold tracking-wider text-red-200">
            WRONG WAY
          </div>
        )}

        {hud.bustedProgress > 0 && (
          <div className="w-64 rounded-lg border border-red-500/80 bg-[#0a0d14]/92 p-2.5">
            <div className="mb-1 flex justify-between font-display text-xs font-bold text-red-400">
              <span>BUSTED WARNING</span>
              <span className="font-mono-num">{hud.bustedProgress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-sm bg-slate-800">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-red-600 origin-left"
                style={{ transform: `scaleX(${hud.bustedProgress / 100})` }}
              />
            </div>
          </div>
        )}

        {hud.isDrifting && hud.driftPoints > 20 && (
          <div className="rounded-lg border border-amber-500/50 bg-[#080b12]/88 px-4 py-1.5 font-display text-base font-bold text-amber-300">
            DRIFTING · <span className="font-mono-num">+{hud.driftPoints}</span>
          </div>
        )}

        {hud.eventBanner && (
          <div className="rounded-lg border border-cyan-400/60 bg-[#080b12]/90 px-4 py-1.5 font-display text-sm font-bold text-cyan-300">
            {hud.eventBanner}
          </div>
        )}
      </div>

      {/* Bottom Area: Touch Controls (if active) + Speedometer/Tachometer/Nitro */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4 sm:p-6">
        {/* Left Touch Controls or Drift/Score hint */}
        {showTouchControls ? (
          <div className="pointer-events-auto flex items-center gap-3">
            <TouchButton
              label="◀"
              onChange={(p) => onSetInput('left', p)}
              className="h-16 w-16 text-xl"
            />
            <TouchButton
              label="▶"
              onChange={(p) => onSetInput('right', p)}
              className="h-16 w-16 text-xl"
            />
          </div>
        ) : (
          <div className="hidden rounded-xl border border-slate-800/80 bg-[#080b12]/82 px-3.5 py-2 text-xs text-slate-400 sm:block">
            <span className="font-semibold text-slate-200">Drift</span> Space
            <span className="mx-2 text-slate-600">·</span>
            <span className="font-semibold text-slate-200">Nitro</span> Shift
            <span className="mx-2 text-slate-600">·</span>
            <span className="font-semibold text-slate-200">Reset</span> R
          </div>
        )}

        {/* Right Cluster: Touch Pedals (optional) + Speedometer / Tachometer / Nitro */}
        <div className="flex items-end gap-4">
          {showTouchControls && (
            <div className="pointer-events-auto flex items-end gap-2.5">
              <div className="flex flex-col gap-2">
                <TouchButton
                  label="NOS"
                  onChange={(p) => onSetInput('nitro', p)}
                  className="h-12 w-16 border-cyan-500/70 bg-cyan-950/85 text-xs font-bold text-cyan-300"
                />
                <TouchButton
                  label="DRIFT"
                  onChange={(p) => onSetInput('handbrake', p)}
                  className="h-12 w-16 border-amber-500/70 bg-amber-950/85 text-xs font-bold text-amber-300"
                />
              </div>
              <TouchButton
                label="BRK"
                onChange={(p) => onSetInput('backward', p)}
                className="h-16 w-14 border-red-500/60 bg-red-950/80 text-xs font-bold text-red-200"
              />
              <TouchButton
                label="GAS"
                onChange={(p) => onSetInput('forward', p)}
                className="h-20 w-16 border-emerald-500/60 bg-emerald-950/85 text-xs font-bold text-emerald-200"
              />
            </div>
          )}

          {/* Tachometer + Digital Speedometer + Nitro Bar */}
          <div className="rounded-xl border border-slate-800/90 bg-[#080b12]/90 px-4 py-3">
            <div className="flex items-center gap-4">
              {/* SVG Tachometer */}
              <div className="relative h-24 w-24 shrink-0">
                <svg viewBox="0 0 120 120" className="h-full w-full">
                  <circle
                    cx="60"
                    cy="60"
                    r={radius}
                    fill="none"
                    stroke="#1e293b"
                    strokeWidth="9"
                    strokeDasharray={`${maxArc} ${circumference}`}
                    strokeLinecap="round"
                    transform="rotate(160 60 60)"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r={radius}
                    fill="none"
                    stroke={hud.rpmRatio > 0.85 ? '#ef4444' : '#f59e0b'}
                    strokeWidth="9"
                    strokeDasharray={`${filledArc} ${circumference}`}
                    strokeLinecap="round"
                    transform="rotate(160 60 60)"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center pt-1">
                  <div className="font-display text-2xl font-bold text-white leading-none">
                    {hud.gear}
                  </div>
                  <div className="text-[10px] text-slate-400">GEAR</div>
                </div>
              </div>

              {/* Digital Speed + Nitro */}
              <div className="min-w-[116px]">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono-num text-4xl font-bold text-white leading-none">
                    {hud.speedKmh}
                  </span>
                  <span className="text-xs font-semibold text-slate-400">km/h</span>
                </div>

                {/* Nitro Meter */}
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-[11px]">
                    <span className={hud.isNitroActive ? 'font-bold text-cyan-300' : 'text-slate-400'}>
                      NITRO
                    </span>
                    <span className="font-mono-num text-slate-200">{hud.nitro}%</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-sm bg-slate-800">
                    <div
                      className={`h-full origin-left ${
                        hud.isNitroActive ? 'bg-cyan-300' : 'bg-cyan-500'
                      }`}
                      style={{ transform: `scaleX(${Math.max(0.02, hud.nitro / 100)})` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const TouchButton: React.FC<{
  label: string;
  onChange: (pressed: boolean) => void;
  className?: string;
}> = ({ label, onChange, className = '' }) => (
  <button
    type="button"
    onPointerDown={(e) => {
      e.preventDefault();
      onChange(true);
    }}
    onPointerUp={() => onChange(false)}
    onPointerLeave={() => onChange(false)}
    onPointerCancel={() => onChange(false)}
    className={`flex items-center justify-center rounded-xl border border-slate-700 bg-[#0b101b]/90 font-display font-bold text-white active:scale-95 ${className}`}
  >
    {label}
  </button>
);
