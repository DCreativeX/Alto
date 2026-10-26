let ctx: AudioContext | null = null;
let engineGain: GainNode | null = null;
let osc: OscillatorNode | null = null;
let filter: BiquadFilterNode | null = null;

export function ensureAudio() {
  if (typeof window === "undefined") return;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  if (!ctx) {
    ctx = new AC();
    osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 54;
    filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 220;
    filter.Q.value = 0.4;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    osc.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(ctx.destination);
    osc.start();

    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.value = 520;
    nf.Q.value = 0.6;
    const ng = ctx.createGain();
    ng.gain.value = 0.012;
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(ctx.destination);
    noise.start();
  }
  if (ctx.state === "suspended") void ctx.resume();
}

export function updateAudio(speed: number, thrust: number, muted: boolean, active: boolean) {
  if (!ctx || !engineGain || !osc || !filter) return;
  const drive = active && !muted ? Math.max(0, thrust) : 0;
  const target = active && !muted ? 0.008 + drive * 0.02 + Math.min(speed, 70) / 70 * 0.018 : 0;
  const now = ctx.currentTime;
  engineGain.gain.setTargetAtTime(target, now, 0.08);
  osc.frequency.setTargetAtTime(46 + Math.min(speed, 80) * 1.15 + drive * 22, now, 0.08);
  filter.frequency.setTargetAtTime(160 + Math.min(speed, 80) * 14 + drive * 80, now, 0.1);
}
