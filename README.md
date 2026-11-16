# Apex Rush: Street Horizon

A 100% procedural 3D arcade street-racing game built with **Three.js**, **React**, **TypeScript**, **Tailwind CSS**, and the **Web Audio API**. Zero external image, 3D model, or audio files are required—all vehicles, tracks, environments, textures, particle effects, and sound synthesis are generated at runtime in code.

## Features

- **Arcade Driving & Chase Camera**
  - Smooth exponential-damped third-person chase camera with speed-based FOV scaling and impact/nitro camera shake
  - Responsive arcade physics with acceleration, braking/reverse, speed-dependent steering, handbrake drifting (`Space`), and surface-specific grip
  - **Nitro Boost** (`Shift`) charged by drifting and threading past traffic (**Near Miss** bonuses), complete with twin exhaust flames and radial speed lines
  - AI opponents with rubber-band pacing, ambient multi-lane traffic, and guardrail/vehicle collision impulses with sparks

- **6 Progressive Stages**
  1. **Sunset Coast** *(Circuit · 3 Laps)* — Wide oceanfront curves, palm groves, coastal villas, and golden-hour lighting
  2. **Neon City Night** *(Circuit · 3 Laps)* — Tight urban corners, wet reflective asphalt, heavy traffic, and glowing skyscrapers
  3. **Desert Highway** *(Sprint)* — High-speed canyon straights, red-rock mesas, Saguaro cacti, and blowing sand dust
  4. **Mountain Pass** *(Time Trial)* — Steep elevation switchbacks, dense alpine fog, evergreen forests, and curve chevron signs
  5. **Snowy Forest** *(Circuit · 2 Laps)* — Low-grip icy roads, snow-laden evergreens, alpine cabins, and falling snow
  6. **Midnight Police Chase** *(Police Escape)* — Outrun pursuing AI police interceptors with flashing lightbars before the timer runs out without getting **Busted**

- **Garage, Tuning & Career Persistence**
  - 6 procedurally sculpted cars with distinct silhouettes and stats:
    - **Vortex RS** *(Street Compact)*
    - **Titan V8 GT** *(Muscle Car)*
    - **Kuro S-Spec** *(Sports Coupe)*
    - **Nomad Evo X** *(Off-Road Rally — high grip bonus on snow/dirt/mountain)*
    - **Valhalla V10** *(Supercar)*
    - **Aether X-99** *(Hyper Racer — unlocked by clearing all 6 stages)*
  - Interactive 360° rotating 3D showroom with custom metallic paint swatches
  - 3-tier upgrade shop for **Engine**, **Tires**, **Nitro**, and **Brakes**
  - Persistent progress saved automatically to `localStorage`

- **Procedural Web Audio Synthesizer**
  - Dynamic RPM-linked engine tone, drift tire screech, nitro whoosh, collision crunch, countdown beeps, police sirens, and a looping synthwave soundtrack
  - Mute toggle and independent Music / SFX volume sliders

- **Full HUD & Cross-Device Controls**
  - Animated SVG tachometer, digital speedometer (`km/h`), gear indicator, nitro meter, live track minimap, lap/position timers, and `3-2-1-GO!` start countdown
  - Desktop keyboard support plus responsive mobile touch controls and optional accelerometer tilt steering

## Controls

| Action | Keyboard | Touch / Mobile |
| :--- | :--- | :--- |
| Accelerate | `W` or `↑` | **GAS** button |
| Brake / Reverse | `S` or `↓` | **BRK** button |
| Steer Left / Right | `A` / `D` or `←` / `→` | **◀** / **▶** buttons (or Tilt Steering in Settings) |
| Handbrake Drift | `Space` | **DRIFT** button |
| Nitro Boost | `Shift` | **NOS** button |
| Reset to Track | `R` | Reset icon (top-right) |
| Pause / Resume | `P` or `Esc` | Pause icon (top-right) |

## Tech Stack

- **3D Engine**: [Three.js](https://threejs.org/) (procedural `ExtrudeGeometry`, `LatheGeometry`, `CatmullRomCurve3`, `InstancedMesh`, `RoomEnvironment` PBR IBL)
- **UI & State**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons
- **Audio**: Native Web Audio API (procedural oscillators & filtered noise)
- **Build Tool**: Vite

## Getting Started

### Prerequisites
- Node.js 18+ and npm
