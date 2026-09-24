/*
 * Piano playback. Uses recordings of the Salamander Grand Piano (samples/piano),
 * one every three semitones, re-pitched to the notes in between. Until they
 * have loaded, or if they fail to, a small additive synth plays instead.
 */
(function (root) {
  'use strict';

  let ctx = null;
  let input = null;

  // ---------- Recorded piano ----------

  const SAMPLE_DIR = 'samples/piano/';
  const SAMPLE_NAMES = ['A1'];
  for (let o = 2; o <= 6; o++) SAMPLE_NAMES.push(`C${o}`, `Ds${o}`, `Fs${o}`, `A${o}`);
  SAMPLE_NAMES.push('C7');
  const NAME_PC = { C: 0, Ds: 3, Fs: 6, A: 9 };
  const nameToMidi = (n) => {
    const m = /^([A-Z][s]?)(\d)$/.exec(n);
    return (Number(m[2]) + 1) * 12 + NAME_PC[m[1]];
  };

  const samples = new Map(); // midi -> AudioBuffer
  let sampleStatus = 'idle'; // idle | loading | ready | failed
  let downloads = null;
  const listeners = new Set();
  const setStatus = (s) => {
    sampleStatus = s;
    listeners.forEach((fn) => fn(s));
  };

  // Download the files straight away; decoding needs an AudioContext, so it waits for ensure().
  function prefetch() {
    if (downloads) return;
    setStatus('loading');
    downloads = SAMPLE_NAMES.map((name) =>
      fetch(SAMPLE_DIR + name + '.mp3')
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
        .then((data) => ({ name, data }))
    );
  }

  let decoding = false;
  function decodeAll() {
    if (decoding) return;
    decoding = true;
    prefetch();
    Promise.all(
      downloads.map((p) =>
        p.then(
          ({ name, data }) =>
            new Promise((resolve, reject) => ctx.decodeAudioData(data, resolve, reject)).then((buf) =>
              samples.set(nameToMidi(name), buf)
            ),
          () => null
        )
      )
    ).then(() => setStatus(samples.size >= SAMPLE_NAMES.length - 2 ? 'ready' : 'failed'));
  }

  function nearestSample(midi) {
    let best = null;
    for (const m of samples.keys()) if (best === null || Math.abs(m - midi) < Math.abs(best - midi)) best = m;
    return best;
  }

  function sampledNote(midi, time, duration, velocity) {
    const base = nearestSample(midi);
    const src = ctx.createBufferSource();
    src.buffer = samples.get(base);
    src.playbackRate.value = Math.pow(2, (midi - base) / 12);
    const g = ctx.createGain();
    const level = 0.9 * velocity; // the recordings peak around 0.2-0.4
    const end = time + duration;
    g.gain.setValueAtTime(level, time);
    g.gain.setValueAtTime(level, end);
    g.gain.setTargetAtTime(0, end, 0.12); // damper
    src.connect(g);
    g.connect(input);
    src.start(time);
    src.stop(Math.min(end + 1, time + src.buffer.duration / src.playbackRate.value));
  }

  function makeImpulse(seconds) {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  function ensure() {
    if (!ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      ctx = new AC({ latencyHint: 'interactive' });
      // iOS: play through the silent switch like a music app would.
      try {
        if (navigator.audioSession) navigator.audioSession.type = 'playback';
      } catch (e) {}

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 3;
      comp.connect(ctx.destination);

      input = ctx.createGain();
      input.gain.value = 0.8;
      input.connect(comp);

      const verb = ctx.createConvolver();
      verb.buffer = makeImpulse(2.2);
      const wet = ctx.createGain();
      wet.gain.value = 0.16;
      input.connect(verb);
      verb.connect(wet);
      wet.connect(comp);
    }
    if (ctx.state !== 'running') ctx.resume();
    decodeAll();
    return ctx;
  }

  const PARTIALS = [1, 0.42, 0.26, 0.14, 0.09, 0.05, 0.03];

  function note(midi, time, duration, velocity = 0.7) {
    if (sampleStatus === 'ready') return sampledNote(midi, time, duration, velocity);
    synthNote(midi, time, duration, velocity);
  }

  function synthNote(midi, time, duration, velocity) {
    const f0 = 440 * Math.pow(2, (midi - 69) / 12);
    const decay = Math.max(0.5, 3.2 - (midi - 36) * 0.045); // lower notes ring longer
    const end = time + duration;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.7;
    const bright = Math.min(18000, f0 * (5 + 7 * velocity));
    filter.frequency.setValueAtTime(bright, time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(f0 * 1.5, 300), time + decay);

    const amp = ctx.createGain();
    const peak = 0.16 * velocity;
    amp.gain.setValueAtTime(0, time);
    amp.gain.linearRampToValueAtTime(peak, time + 0.004);
    amp.gain.setTargetAtTime(peak * 0.35, time + 0.004, 0.12);
    amp.gain.setTargetAtTime(0.0001, time + 0.3, decay / 2.5);
    amp.gain.cancelScheduledValues(end);
    amp.gain.setTargetAtTime(0, end, 0.09);

    filter.connect(amp);
    amp.connect(input);

    const stopAt = end + 0.6;
    PARTIALS.forEach((a, i) => {
      const n = i + 1;
      const f = f0 * n * Math.sqrt(1 + 0.00035 * n * n); // slight string stiffness
      if (f > 16000) return;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      osc.detune.value = (Math.random() - 0.5) * 4;
      const g = ctx.createGain();
      g.gain.value = a / (1 + (n > 3 ? (n - 3) * (midi > 72 ? 1.5 : 0.4) : 0));
      osc.connect(g);
      g.connect(filter);
      osc.start(time);
      osc.stop(stopAt);
    });

    // Hammer: a very short filtered noise burst.
    const len = Math.floor(ctx.sampleRate * 0.03);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = Math.min(4000, f0 * 3);
    const ng = ctx.createGain();
    ng.gain.value = 0.05 * velocity;
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(input);
    noise.start(time);
  }

  function click(time, accent) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = accent ? 1700 : 1200;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(accent ? 0.25 : 0.14, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(g);
    g.connect(input);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  root.SaxAudio = {
    ensure,
    prefetch,
    note,
    status: () => sampleStatus,
    onStatus: (fn) => listeners.add(fn),
    click,
    now: () => (ctx ? ctx.currentTime : 0),
  };
})(window);
