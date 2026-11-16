import React, { useState } from 'react';
import { ArrowLeft, Check, Lock, Wrench } from 'lucide-react';
import { CAR_SPECS, PAINT_SWATCHES, UPGRADE_INFO } from '../game/data';
import { formatCash } from '../game/format';
import { SaveSystem } from '../game/SaveSystem';
import { CarId, SaveData, UpgradeKey } from '../game/types';

interface GarageScreenProps {
  save: SaveData;
  saveSystem: SaveSystem;
  onPreviewCar: (carId: CarId, colorHex: string) => void;
  onSaveChanged: () => void;
  onBack: () => void;
}

export const GarageScreen: React.FC<GarageScreenProps> = ({
  save,
  saveSystem,
  onPreviewCar,
  onSaveChanged,
  onBack,
}) => {
  const [inspectedCarId, setInspectedCarId] = useState<CarId>(save.selectedCarId);
  const [tab, setTab] = useState<'vehicles' | 'upgrades'>('vehicles');

  const spec = CAR_SPECS.find((c) => c.id === inspectedCarId) ?? CAR_SPECS[0];
  const isOwned = save.ownedCars.includes(inspectedCarId);
  const isSelected = save.selectedCarId === inspectedCarId;
  const activeColor = save.carColors[inspectedCarId] ?? spec.defaultColor;
  const upgrades = saveSystem.getUpgrades(inspectedCarId);
  const effectiveStats = saveSystem.getEffectiveStats(inspectedCarId);

  const handleSelectPreview = (id: CarId) => {
    setInspectedCarId(id);
    const color = save.carColors[id] ?? CAR_SPECS.find((c) => c.id === id)?.defaultColor ?? '#06b6d4';
    onPreviewCar(id, color);
  };

  const handlePaint = (hex: string) => {
    saveSystem.setCarColor(inspectedCarId, hex);
    onPreviewCar(inspectedCarId, hex);
    onSaveChanged();
  };

  const handleBuyOrEquip = () => {
    if (isOwned) {
      saveSystem.selectCar(inspectedCarId);
      onSaveChanged();
    } else if (spec.id !== 'hyper' && save.money >= spec.price) {
      saveSystem.buyCar(inspectedCarId);
      onSaveChanged();
    }
  };

  const handleBuyUpgrade = (key: UpgradeKey) => {
    const tier = upgrades[key];
    if (tier >= 3) return;
    const cost = UPGRADE_INFO[key].costs[tier];
    if (saveSystem.buyUpgrade(inspectedCarId, key, cost)) {
      onSaveChanged();
    }
  };

  const speedPct = Math.min(100, Math.round((effectiveStats.topSpeed / 375) * 100));
  const weightPct = Math.min(100, Math.round((1 - (effectiveStats.weight - 950) / 900) * 100));

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4 sm:p-6">
      {/* Top Bar */}
      <div className="pointer-events-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              const currentColor = save.carColors[save.selectedCarId];
              onPreviewCar(save.selectedCarId, currentColor);
              onBack();
            }}
            className="flex h-10 items-center gap-2 rounded-lg border border-slate-700 bg-[#0a0d14]/92 px-3.5 text-sm font-medium text-slate-200 transition-colors hover:border-amber-400 hover:text-amber-300"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div>
            <h2 className="font-display text-xl font-bold text-white sm:text-2xl">
              Performance Garage
            </h2>
            <p className="hidden text-xs text-slate-400 sm:block">
              Drag 3D car to rotate · Paint & upgrade tuning apply immediately
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-[#0a0d14]/92 px-4 py-2 font-mono-num text-sm font-bold text-amber-400">
          {formatCash(save.money)}
        </div>
      </div>

      {/* Bottom Dock: keeps center 3D car completely visible */}
      <div className="pointer-events-auto mx-auto w-full max-w-6xl rounded-xl border border-slate-800 bg-[#0a0d14]/94 p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Left: Car Selector & Paint / Upgrade Tabs */}
          <div className="lg:col-span-7 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 rounded-lg bg-slate-900 p-1">
                <button
                  type="button"
                  onClick={() => setTab('vehicles')}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    tab === 'vehicles'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Showroom ({save.ownedCars.length}/{CAR_SPECS.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTab('upgrades')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    tab === 'upgrades'
                      ? 'bg-cyan-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Wrench className="h-3.5 w-3.5" />
                  Upgrade Shop
                </button>
              </div>

              {/* Paint Swatches */}
              <div className="flex items-center gap-1.5">
                <span className="mr-1 text-xs text-slate-400">Paint</span>
                {PAINT_SWATCHES.map((sw) => (
                  <button
                    key={sw.hex}
                    type="button"
                    title={sw.name}
                    aria-label={`Paint ${sw.name}`}
                    onClick={() => handlePaint(sw.hex)}
                    className={`h-5 w-5 rounded-full border transition-transform hover:scale-110 ${
                      activeColor.toLowerCase() === sw.hex.toLowerCase()
                        ? 'border-white ring-2 ring-amber-400'
                        : 'border-slate-700'
                    }`}
                    style={{ backgroundColor: sw.hex }}
                  />
                ))}
              </div>
            </div>

            {tab === 'vehicles' ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {CAR_SPECS.map((c) => {
                  const owned = save.ownedCars.includes(c.id);
                  const active = save.selectedCarId === c.id;
                  const inspecting = inspectedCarId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelectPreview(c.id)}
                      className={`flex flex-col items-start rounded-lg border p-2.5 text-left transition-colors ${
                        inspecting
                          ? 'border-amber-500 bg-slate-900'
                          : 'border-slate-800 bg-slate-900/50 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex w-full items-center justify-between text-[11px] text-slate-400">
                        <span className="truncate">{c.category}</span>
                        {active ? (
                          <span className="font-semibold text-cyan-400">Equipped</span>
                        ) : owned ? (
                          <span className="text-emerald-400">Owned</span>
                        ) : c.id === 'hyper' ? (
                          <Lock className="h-3 w-3 text-slate-500" />
                        ) : (
                          <span className="font-mono-num text-amber-400">
                            {formatCash(c.price)}
                          </span>
                        )}
                      </div>
                      <div className="font-display mt-0.5 text-sm font-bold text-white truncate w-full">
                        {c.name}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(Object.keys(UPGRADE_INFO) as UpgradeKey[]).map((key) => {
                  const info = UPGRADE_INFO[key];
                  const tier = upgrades[key];
                  const maxed = tier >= 3;
                  const cost = maxed ? 0 : info.costs[tier];
                  const canAfford = isOwned && !maxed && save.money >= cost;

                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/70 p-2.5"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-display text-sm font-bold text-white">
                            {info.label}
                          </span>
                          <span className="font-mono-num text-xs text-cyan-400">
                            Tier {tier}/3
                          </span>
                        </div>
                        <p className="truncate text-[11px] text-slate-400">
                          {info.description}
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={!canAfford}
                        onClick={() => handleBuyUpgrade(key)}
                        className={`shrink-0 rounded-md px-3 py-1.5 font-mono-num text-xs font-bold transition-colors ${
                          maxed
                            ? 'bg-emerald-950 text-emerald-400'
                            : canAfford
                              ? 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                              : 'cursor-not-allowed bg-slate-800 text-slate-500'
                        }`}
                      >
                        {maxed ? 'MAX' : formatCash(cost)}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Car Details & 5 Stat Bars + Action Button */}
          <div className="lg:col-span-5 flex flex-col justify-between border-t border-slate-800 pt-4 lg:border-t-0 lg:border-l lg:pl-5 lg:pt-0">
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-display text-xl font-bold text-white">
                  {spec.name}
                </h3>
                <span className="text-xs text-slate-400">{spec.category}</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">{spec.description}</p>

              {/* Stat Bars */}
              <div className="mt-3 space-y-2 text-xs">
                <StatBar
                  label="Top Speed"
                  valueLabel={`${effectiveStats.topSpeed} km/h`}
                  pct={speedPct}
                  color="bg-amber-500"
                />
                <StatBar
                  label="Acceleration"
                  valueLabel={`${effectiveStats.acceleration}`}
                  pct={effectiveStats.acceleration}
                  color="bg-cyan-400"
                />
                <StatBar
                  label="Handling"
                  valueLabel={`${effectiveStats.handling}`}
                  pct={effectiveStats.handling}
                  color="bg-emerald-400"
                />
                <StatBar
                  label="Nitro Capacity"
                  valueLabel={`${effectiveStats.nitroCapacity}`}
                  pct={effectiveStats.nitroCapacity}
                  color="bg-sky-400"
                />
                <StatBar
                  label="Lightweight"
                  valueLabel={`${effectiveStats.weight} kg`}
                  pct={weightPct}
                  color="bg-violet-400"
                />
              </div>
            </div>

            <div className="mt-4">
              {isSelected ? (
                <div className="flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-950/50 py-2.5 font-display text-sm font-bold text-cyan-300">
                  <Check className="h-4 w-4" />
                  Currently Selected
                </div>
              ) : isOwned ? (
                <button
                  type="button"
                  onClick={handleBuyOrEquip}
                  className="w-full rounded-lg bg-amber-500 py-2.5 font-display text-sm font-bold text-slate-950 transition-colors hover:bg-amber-400"
                >
                  Select Car
                </button>
              ) : spec.id === 'hyper' ? (
                <div className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-800 py-2.5 text-xs font-semibold text-slate-400">
                  <Lock className="h-4 w-4" />
                  {spec.unlockRequirement}
                </div>
              ) : (
                <button
                  type="button"
                  disabled={save.money < spec.price}
                  onClick={handleBuyOrEquip}
                  className={`w-full rounded-lg py-2.5 font-display text-sm font-bold transition-colors ${
                    save.money >= spec.price
                      ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                      : 'cursor-not-allowed bg-slate-800 text-slate-500'
                  }`}
                >
                  {save.money >= spec.price
                    ? `Buy for ${formatCash(spec.price)}`
                    : `Need ${formatCash(spec.price)}`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatBar: React.FC<{
  label: string;
  valueLabel: string;
  pct: number;
  color: string;
}> = ({ label, valueLabel, pct, color }) => (
  <div>
    <div className="mb-1 flex justify-between">
      <span className="text-slate-400">{label}</span>
      <span className="font-mono-num text-slate-200">{valueLabel}</span>
    </div>
    <div className="h-1.5 w-full overflow-hidden rounded-sm bg-slate-800">
      <div
        className={`h-full ${color} transition-transform duration-200 origin-left`}
        style={{ transform: `scaleX(${Math.max(0.05, Math.min(1, pct / 100))})` }}
      />
    </div>
  </div>
);
