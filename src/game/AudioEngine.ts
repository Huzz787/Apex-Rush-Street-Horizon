import { SettingsData } from './types';

/**
 * Procedural Web Audio synthesizer for engine RPM, tire screech, nitro boost,
 * collisions, countdown cues, police sirens, and looping synthwave soundtrack.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;

  // Continuous engine nodes
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  // Continuous tire screech nodes
  private screechSource: AudioBufferSourceNode | null = null;
  private screechFilter: BiquadFilterNode | null = null;
  private screechGain: GainNode | null = null;

  // Continuous nitro hiss
  private nitroSource: AudioBufferSourceNode | null = null;
  private nitroFilter: BiquadFilterNode | null = null;
  private nitroGain: GainNode | null = null;

  // Police siren
  private sirenOsc: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;

  // Noise buffer reused across effects
  private noiseBuffer: AudioBuffer | null = null;

  // Music loop timer
  private musicTimer: number | null = null;
  private musicStep = 0;
  private musicPlaying = false;

  private settings: SettingsData = {
    muted: false,
    musicVolume: 0.45,
    sfxVolume: 0.7,
    touchControls: 'auto',
    tiltSteering: false,
  };

  private initialized = false;
  private racingActive = false;

  public applySettings(settings: SettingsData): void {
    this.settings = { ...settings };
    if (!this.ctx || !this.masterGain || !this.sfxGain || !this.musicGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(settings.muted ? 0 : 1, now, 0.04);
    this.sfxGain.gain.setTargetAtTime(settings.sfxVolume, now, 0.04);
    this.musicGain.gain.setTargetAtTime(settings.musicVolume * 0.55, now, 0.04);
  }

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.setupGraph();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    if (!this.musicPlaying) {
      this.startMusicLoop();
    }
  }

  private setupGraph(): void {
    if (!this.ctx || this.initialized) return;
    this.initialized = true;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.settings.muted ? 0 : 1;
    this.masterGain.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.settings.sfxVolume;
    this.sfxGain.connect(this.masterGain);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.settings.musicVolume * 0.55;
    this.musicGain.connect(this.masterGain);

    // Create 2-second white noise buffer
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    // Engine synth
    this.engineOsc1 = this.ctx.createOscillator();
    this.engineOsc1.type = 'sawtooth';
    this.engineOsc1.frequency.value = 55;

    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'triangle';
    this.engineOsc2.frequency.value = 110;

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineFilter.Q.value = 3.2;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;

    this.engineOsc1.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.sfxGain);

    this.engineOsc1.start();
    this.engineOsc2.start();

    // Tire screech loop
    this.screechSource = this.ctx.createBufferSource();
    this.screechSource.buffer = this.noiseBuffer;
    this.screechSource.loop = true;

    this.screechFilter = this.ctx.createBiquadFilter();
    this.screechFilter.type = 'bandpass';
    this.screechFilter.frequency.value = 1450;
    this.screechFilter.Q.value = 6.0;

    this.screechGain = this.ctx.createGain();
    this.screechGain.gain.value = 0;

    this.screechSource.connect(this.screechFilter);
    this.screechFilter.connect(this.screechGain);
    this.screechGain.connect(this.sfxGain);
    this.screechSource.start();

    // Nitro whoosh loop
    this.nitroSource = this.ctx.createBufferSource();
    this.nitroSource.buffer = this.noiseBuffer;
    this.nitroSource.loop = true;

    this.nitroFilter = this.ctx.createBiquadFilter();
    this.nitroFilter.type = 'bandpass';
    this.nitroFilter.frequency.value = 520;
    this.nitroFilter.Q.value = 1.6;

    this.nitroGain = this.ctx.createGain();
    this.nitroGain.gain.value = 0;

    this.nitroSource.connect(this.nitroFilter);
    this.nitroFilter.connect(this.nitroGain);
    this.nitroGain.connect(this.sfxGain);
    this.nitroSource.start();

    // Police siren
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'sawtooth';
    this.sirenOsc.frequency.value = 640;

    const sirenFilter = this.ctx.createBiquadFilter();
    sirenFilter.type = 'lowpass';
    sirenFilter.frequency.value = 1800;

    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;

    this.sirenOsc.connect(sirenFilter);
    sirenFilter.connect(this.sirenGain);
    this.sirenGain.connect(this.sfxGain);
    this.sirenOsc.start();
  }

  public setRacingActive(active: boolean): void {
    this.racingActive = active;
    if (!active && this.ctx) {
      const now = this.ctx.currentTime;
      this.engineGain?.gain.setTargetAtTime(0, now, 0.08);
      this.screechGain?.gain.setTargetAtTime(0, now, 0.05);
      this.nitroGain?.gain.setTargetAtTime(0, now, 0.05);
      this.sirenGain?.gain.setTargetAtTime(0, now, 0.05);
    }
  }

  public updateVehicleAudio(params: {
    rpmRatio: number;
    throttle: boolean;
    driftIntensity: number; // 0..1
    nitroActive: boolean;
    policeProximity: number; // 0..1
    elapsedSec: number;
  }): void {
    if (!this.ctx || !this.racingActive || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const baseFreq = 44 + params.rpmRatio * 145 + (params.nitroActive ? 28 : 0);
    this.engineOsc1?.frequency.setTargetAtTime(baseFreq, now, 0.04);
    this.engineOsc2?.frequency.setTargetAtTime(baseFreq * 1.98, now, 0.04);
    this.engineFilter?.frequency.setTargetAtTime(
      240 + params.rpmRatio * 1100 + (params.throttle ? 260 : 0),
      now,
      0.05,
    );
    const engineTarget = 0.09 + (params.throttle ? 0.07 : 0) + params.rpmRatio * 0.06;
    this.engineGain?.gain.setTargetAtTime(engineTarget, now, 0.06);

    // Tire screech
    const screechTarget = params.driftIntensity > 0.15 ? Math.min(0.16, params.driftIntensity * 0.18) : 0;
    this.screechGain?.gain.setTargetAtTime(screechTarget, now, 0.04);
    this.screechFilter?.frequency.setTargetAtTime(
      1250 + params.driftIntensity * 550,
      now,
      0.05,
    );

    // Nitro whoosh
    const nitroTarget = params.nitroActive ? 0.24 : 0;
    this.nitroGain?.gain.setTargetAtTime(nitroTarget, now, 0.06);
    this.nitroFilter?.frequency.setTargetAtTime(
      params.nitroActive ? 820 + Math.sin(params.elapsedSec * 12) * 160 : 400,
      now,
      0.05,
    );

    // Police siren wail
    if (params.policeProximity > 0.05) {
      const wail = 620 + Math.sin(params.elapsedSec * 6.5) * 240;
      this.sirenOsc?.frequency.setTargetAtTime(wail, now, 0.03);
      this.sirenGain?.gain.setTargetAtTime(params.policeProximity * 0.09, now, 0.08);
    } else {
      this.sirenGain?.gain.setTargetAtTime(0, now, 0.1);
    }
  }

  public playCollision(intensity = 0.7): void {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const clamped = Math.max(0.2, Math.min(1, intensity));

    // Low impact thud
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140 * clamped + 40, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.22);

    gain.gain.setValueAtTime(0.42 * clamped, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.25);

    // Metallic crunch burst
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 900;
      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.25 * clamped, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.sfxGain);
      noise.start(now);
      noise.stop(now + 0.18);
    }
  }

  public playCountdownBeep(isGo: boolean): void {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isGo ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(isGo ? 880 : 440, now);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isGo ? 0.35 : 0.18));
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + (isGo ? 0.36 : 0.2));
  }

  public playUiConfirm(): void {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(780, now + 0.08);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  public playNearMiss(): void {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(1180, now + 0.14);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  private startMusicLoop(): void {
    if (this.musicPlaying) return;
    this.musicPlaying = true;
    const bassNotes = [55, 55, 65.41, 55, 73.42, 73.42, 65.41, 49]; // A1, C2, D2, G1
    const arpNotes = [220, 261.63, 329.63, 392, 440, 329.63, 293.66, 261.63];

    const stepMs = 135; // ~111 BPM 16th-note pulse
    this.musicTimer = window.setInterval(() => {
      if (!this.ctx || !this.musicGain || this.ctx.state !== 'running' || this.settings.muted) {
        return;
      }
      if (this.settings.musicVolume <= 0.01) return;

      const now = this.ctx.currentTime;
      const step = this.musicStep % 16;

      // Driving synth bass on every 8th note
      if (step % 2 === 0) {
        const note = bassNotes[Math.floor(step / 2) % bassNotes.length];
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(note, now);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(420, now);
        filter.frequency.exponentialRampToValueAtTime(140, now + 0.18);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.musicGain);
        osc.start(now);
        osc.stop(now + 0.24);
      }

      // Kick drum on quarter notes (0, 4, 8, 12)
      if (step % 4 === 0) {
        const kick = this.ctx.createOscillator();
        const kGain = this.ctx.createGain();
        kick.type = 'sine';
        kick.frequency.setValueAtTime(135, now);
        kick.frequency.exponentialRampToValueAtTime(38, now + 0.11);
        kGain.gain.setValueAtTime(0.28, now);
        kGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
        kick.connect(kGain);
        kGain.connect(this.musicGain);
        kick.start(now);
        kick.stop(now + 0.14);
      }

      // Snare/hat accent on offbeats (4, 12)
      if ((step === 4 || step === 12) && this.noiseBuffer) {
        const sn = this.ctx.createBufferSource();
        sn.buffer = this.noiseBuffer;
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 1800;
        const sGain = this.ctx.createGain();
        sGain.gain.setValueAtTime(0.09, now);
        sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        sn.connect(hp);
        hp.connect(sGain);
        sGain.connect(this.musicGain);
        sn.start(now);
        sn.stop(now + 0.1);
      }

      // Outrun arpeggio shimmer when racing
      if (this.racingActive && step % 2 === 1) {
        const freq = arpNotes[(step + Math.floor(this.musicStep / 16)) % arpNotes.length];
        const arp = this.ctx.createOscillator();
        const aGain = this.ctx.createGain();
        arp.type = 'triangle';
        arp.frequency.setValueAtTime(freq, now);
        aGain.gain.setValueAtTime(0.06, now);
        aGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
        arp.connect(aGain);
        aGain.connect(this.musicGain);
        arp.start(now);
        arp.stop(now + 0.12);
      }

      this.musicStep++;
    }, stepMs);
  }

  public dispose(): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    this.musicPlaying = false;
    try {
      this.engineOsc1?.stop();
      this.engineOsc2?.stop();
      this.screechSource?.stop();
      this.nitroSource?.stop();
      this.sirenOsc?.stop();
      void this.ctx?.close();
    } catch {
      // Ignore cleanup errors
    }
    this.ctx = null;
    this.initialized = false;
  }
}
