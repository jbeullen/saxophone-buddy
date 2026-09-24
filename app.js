(function () {
  'use strict';

  const T = window.SaxTheory;
  const A = window.SaxAudio;
  const $ = (sel) => document.querySelector(sel);
  const STORE_KEY = 'sax-buddy-v1';

  const state = {
    chords: T.splitProgression('Cm7 F7 Bbmaj7 Ebmaj7 Am7b5 D7b9 Gm6 Gm6'),
    instrument: 'tenor',
    bpm: 120,
    beats: 4,
    mode: 'both',
    click: false,
    follow: true,
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved && typeof saved === 'object') Object.assign(state, saved);
  } catch (e) {}

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  // ---------- Parsed view of the progression ----------

  let parsed = [];
  function reparse() {
    parsed = state.chords.map((text) => {
      const chord = T.parseChord(text);
      if (chord.error) return { text, error: chord.error };
      return { text, chord, arp: T.arpeggio(chord, state.instrument) };
    });
  }

  // ---------- Segmented controls ----------

  function segmented(el, options, get, set) {
    el.innerHTML = '';
    for (const o of options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = o.html;
      b.addEventListener('click', () => {
        set(o.value);
        paint();
      });
      el.appendChild(b);
    }
    const paint = () => {
      [...el.children].forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === get())));
    };
    paint();
    return paint;
  }

  segmented(
    $('#instrument'),
    ['alto', 'tenor', 'soprano', 'bari', 'concert'].map((id) => {
      const i = T.INSTRUMENTS[id];
      return { value: id, html: `${i.name}<small>${id === 'concert' ? 'C / piano' : i.key}</small>` };
    }),
    () => state.instrument,
    (v) => {
      state.instrument = v;
      save();
      renderAll();
    }
  );

  segmented(
    $('#beats'),
    [1, 2, 4, 8].map((n) => ({ value: n, html: String(n) })),
    () => state.beats,
    (v) => {
      state.beats = v;
      save();
    }
  );

  segmented(
    $('#mode'),
    [
      { value: 'chords', html: 'Chords' },
      { value: 'arp', html: 'Arpeggio' },
      { value: 'both', html: 'Both' },
    ],
    () => state.mode,
    (v) => {
      state.mode = v;
      save();
    }
  );

  // ---------- Chord symbol markup ----------

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function symbolHtml(label) {
    return (
      esc(label.root) +
      (label.suffix ? `<sup>${esc(label.suffix)}</sup>` : '') +
      (label.bass ? '/' + esc(label.bass) : '')
    );
  }
  const symbolText = (label) => label.root + label.suffix + (label.bass ? '/' + label.bass : '');

  // ---------- Staff drawing ----------

  const SVG_W = 360;
  const HALF = 6; // half a staff space
  const STAFF_LINES = [30, 32, 34, 36, 38]; // E4 G4 B4 D5 F5
  const ACC = { '-2': '𝄫', '-1': '♭', '1': '♯', '2': '𝄪' };

  // All cards share one vertical range so the staves line up.
  function staffRange() {
    let hi = 41;
    let lo = 27;
    for (const p of parsed) {
      if (p.error) continue;
      for (const n of p.arp.notes) {
        hi = Math.max(hi, n.step + 2);
        lo = Math.min(lo, n.step - 2);
      }
    }
    return { hi, lo };
  }

  function staffSvg(notes, range) {
    const yOf = (step) => 4 + (range.hi - step) * HALF;
    const SVG_H = yOf(range.lo) + 22;
    const x0 = 62;
    const avail = SVG_W - x0 - 16;
    const gap = Math.min(52, avail / Math.max(notes.length, 1));
    const parts = [];
    parts.push(
      `<svg class="staff" viewBox="0 0 ${SVG_W} ${SVG_H}" role="img" aria-label="${esc(
        notes.map((n) => n.display).join(', ')
      )}">`
    );
    for (const s of STAFF_LINES) {
      const y = yOf(s);
      parts.push(`<line class="line" x1="4" x2="${SVG_W - 4}" y1="${y}" y2="${y}"/>`);
    }
    parts.push(`<line class="line" x1="${SVG_W - 4}" x2="${SVG_W - 4}" y1="${yOf(38)}" y2="${yOf(30)}"/>`);
    // Treble clef: glyph origin sits on the G line.
    parts.push(`<text class="clef" x="6" y="${yOf(32)}" font-size="48">𝄞</text>`);

    notes.forEach((n, i) => {
      const x = x0 + gap * (i + 0.5);
      const y = yOf(n.step);
      const g = [`<g class="n ${n.family}" data-i="${i}">`];
      // Ledger lines
      for (let s = 28; s >= n.step; s -= 2) g.push(`<line class="line" x1="${x - 16}" x2="${x + 16}" y1="${yOf(s)}" y2="${yOf(s)}"/>`);
      for (let s = 40; s <= n.step; s += 2) g.push(`<line class="line" x1="${x - 16}" x2="${x + 16}" y1="${yOf(s)}" y2="${yOf(s)}"/>`);
      if (n.acc) g.push(`<text class="acc" x="${x - 14}" y="${y + 6}" font-size="17" text-anchor="end">${ACC[n.acc]}</text>`);
      g.push(`<circle class="head" cx="${x}" cy="${y}" r="12"/>`);
      const letter = T.LETTERS[n.letter];
      const accSmall = n.acc ? `<tspan font-size="10" dx="0.5">${ACC[n.acc]}</tspan>` : '';
      g.push(
        `<text class="letter" x="${x}" y="${y + 4.2}" font-size="${n.acc ? 11.5 : 13}" text-anchor="middle">${letter}${accSmall}</text>`
      );
      g.push(`<text class="deg" x="${x}" y="${SVG_H - 6}" text-anchor="middle">${esc(n.label)}</text>`);
      g.push('</g>');
      parts.push(g.join(''));
    });
    parts.push('</svg>');
    return parts.join('');
  }

  // ---------- Rendering ----------

  const cardsEl = $('#cards');
  const stripEl = $('#strip');

  function renderAll() {
    reparse();
    renderStrip();
    renderCards();
  }

  function renderStrip() {
    stripEl.innerHTML = '';
    parsed.forEach((p, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (p.error ? ' bad' : '');
      b.dataset.i = i;
      if (p.error) {
        b.textContent = p.text;
      } else {
        b.innerHTML = `${esc(symbolText(p.arp.written))}${
          state.instrument === 'concert' ? '' : `<small>${esc(symbolText(p.arp.concert))}</small>`
        }`;
      }
      b.addEventListener('click', () => {
        const card = cardsEl.children[i];
        if (card) card.scrollIntoView({ behavior: smooth(), block: 'center' });
        if (player.playing) player.jump(i);
      });
      stripEl.appendChild(b);
    });
  }

  const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

  function renderCards() {
    cardsEl.innerHTML = '';
    if (!parsed.length) {
      cardsEl.innerHTML = '<div class="empty">No chords yet. Type one above, or load an example.</div>';
      return;
    }
    const inst = T.INSTRUMENTS[state.instrument];
    const range = staffRange();
    parsed.forEach((p, i) => {
      const card = document.createElement('article');
      card.className = 'card' + (p.error ? ' error-card' : '');
      const tools = `<div class="tools">
          <button class="icon" type="button" data-act="left" aria-label="Move earlier" ${i === 0 ? 'disabled' : ''}>←</button>
          <button class="icon" type="button" data-act="right" aria-label="Move later" ${i === parsed.length - 1 ? 'disabled' : ''}>→</button>
          <button class="icon del" type="button" data-act="del" aria-label="Remove chord">✕</button>
        </div>`;
      if (p.error) {
        card.innerHTML = `<div class="card-head"><span class="num">${i + 1}</span><div class="names"><div class="chord-name">${esc(
          p.text
        )}</div><div class="concert">${esc(p.error)}</div></div>${tools}</div>`;
      } else {
        const sub =
          state.instrument === 'concert'
            ? 'Concert pitch'
            : `${inst.name} in ${inst.key} · concert ${esc(symbolText(p.arp.concert))}`;
        card.innerHTML = `<div class="card-head"><span class="num">${i + 1}</span><div class="names"><div class="chord-name">${symbolHtml(
          p.arp.written
        )}</div><div class="concert">${sub}</div></div>${tools}</div>${staffSvg(p.arp.notes, range)}`;
      }
      card.addEventListener('click', (e) => {
        const act = e.target.closest('button')?.dataset.act;
        if (!act) {
          if (!p.error && !e.target.closest('button')) previewArp(p);
          return;
        }
        if (act === 'del') state.chords.splice(i, 1);
        if (act === 'left' && i > 0) [state.chords[i - 1], state.chords[i]] = [state.chords[i], state.chords[i - 1]];
        if (act === 'right' && i < state.chords.length - 1)
          [state.chords[i + 1], state.chords[i]] = [state.chords[i], state.chords[i + 1]];
        save();
        renderAll();
      });
      cardsEl.appendChild(card);
    });
  }

  // Tapping a card plays that arpeggio once.
  function previewArp(p) {
    if (player.playing) return;
    A.ensure();
    const t0 = A.now() + 0.05;
    const step = 60 / state.bpm / 2;
    p.arp.notes.forEach((n, j) => {
      A.note(n.concertMidi, t0 + j * step, step * 1.6, 0.75);
      visualQueue.push({ time: t0 + j * step, chord: parsed.indexOf(p), note: j });
    });
    visualQueue.push({ time: t0 + p.arp.notes.length * step + 0.3, chord: -1, note: -1 });
    startVisuals();
  }

  // ---------- Entry ----------

  $('#entry').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#chord-input');
    const tokens = T.splitProgression(input.value);
    if (!tokens.length) return;
    const bad = tokens.map((t) => T.parseChord(t)).filter((c) => c.error);
    const errEl = $('#entry-error');
    if (bad.length) {
      errEl.textContent = bad.map((b) => b.error).join(' · ');
      errEl.hidden = false;
      return;
    }
    errEl.hidden = true;
    state.chords.push(...tokens);
    input.value = '';
    save();
    renderAll();
    cardsEl.lastElementChild?.scrollIntoView({ behavior: smooth(), block: 'nearest' });
  });

  document.querySelectorAll('[data-preset]').forEach((b) =>
    b.addEventListener('click', () => {
      state.chords = T.splitProgression(b.dataset.preset);
      save();
      renderAll();
      if (player.playing) player.jump(0);
    })
  );
  $('#clear').addEventListener('click', () => {
    player.stop();
    state.chords = [];
    save();
    renderAll();
  });

  const clickBox = $('#click');
  const followBox = $('#follow');
  clickBox.checked = state.click;
  followBox.checked = state.follow;
  clickBox.addEventListener('change', () => {
    state.click = clickBox.checked;
    save();
  });
  followBox.addEventListener('change', () => {
    state.follow = followBox.checked;
    save();
  });

  // ---------- Tempo ----------

  const bpmRange = $('#bpm');
  const bpmValue = $('#bpm-value');
  function setBpm(v) {
    state.bpm = Math.max(40, Math.min(240, Math.round(v)));
    bpmRange.value = state.bpm;
    bpmValue.textContent = state.bpm;
    save();
  }
  bpmRange.addEventListener('input', () => setBpm(Number(bpmRange.value)));
  $('#slower').addEventListener('click', () => setBpm(state.bpm - 5));
  $('#faster').addEventListener('click', () => setBpm(state.bpm + 5));
  setBpm(state.bpm);

  // ---------- Player (look-ahead scheduler) ----------

  const visualQueue = [];
  let rafId = 0;
  let wakeLock = null;

  const player = {
    playing: false,
    chord: 0,
    slot: 0, // eighth-note slot inside the current chord
    nextTime: 0,
    timer: 0,

    start() {
      if (!parsed.some((p) => !p.error)) return;
      A.ensure();
      this.playing = true;
      this.chord = 0;
      this.slot = 0;
      this.nextTime = A.now() + 0.08;
      this.timer = setInterval(() => this.tick(), 25);
      this.tick();
      startVisuals();
      setPlayIcon();
      try {
        navigator.wakeLock?.request('screen').then((l) => (wakeLock = l), () => {});
      } catch (e) {}
    },

    stop() {
      if (!this.playing) return;
      this.playing = false;
      clearInterval(this.timer);
      visualQueue.length = 0;
      visualQueue.push({ time: 0, chord: -1, note: -1 });
      setPlayIcon();
      try {
        wakeLock?.release();
      } catch (e) {}
      wakeLock = null;
    },

    jump(i) {
      this.chord = i;
      this.slot = 0;
      visualQueue.length = 0;
      this.nextTime = A.now() + 0.05;
    },

    tick() {
      const ahead = A.now() + 0.12;
      while (this.nextTime < ahead) {
        this.schedule(this.nextTime);
        this.nextTime += 60 / state.bpm / 2;
      }
    },

    schedule(time) {
      if (!parsed.length) return this.stop();
      if (this.chord >= parsed.length) this.chord = 0;
      const p = parsed[this.chord];
      const slots = state.beats * 2;
      const eighth = 60 / state.bpm / 2;

      if (!p.error) {
        const notes = p.arp.notes;
        if (this.slot === 0 && state.mode !== 'arp') {
          const v = T.pianoVoicing(p.chord);
          const len = slots * eighth * 0.97;
          const vel = state.mode === 'both' ? 0.5 : 0.7;
          A.note(v.bass, time, len, vel + 0.1);
          v.upper.forEach((m) => A.note(m, time + 0.012, len, vel));
        }
        let noteIdx = -1;
        if (state.mode !== 'chords') {
          const pattern = arpPattern(notes.length);
          noteIdx = pattern[this.slot % pattern.length];
          A.note(notes[noteIdx].concertMidi, time, eighth * 1.5, 0.8);
        }
        visualQueue.push({ time, chord: this.chord, note: noteIdx });
      } else {
        visualQueue.push({ time, chord: this.chord, note: -1 });
      }

      if (state.click && this.slot % 2 === 0) A.click(time, this.slot === 0);

      this.slot++;
      if (this.slot >= slots || p.error) {
        this.slot = 0;
        this.chord = (this.chord + 1) % parsed.length;
      }
    },
  };

  // Up then down: 0 1 2 3 2 1 0 1 2 ...
  function arpPattern(n) {
    if (n <= 1) return [0];
    const up = [...Array(n).keys()];
    return up.concat(up.slice(1, -1).reverse());
  }

  // ---------- Visual sync ----------

  let shown = { chord: -1, note: -1 };
  function startVisuals() {
    if (rafId) return;
    const loop = () => {
      const now = A.now();
      let ev = null;
      while (visualQueue.length && visualQueue[0].time <= now) ev = visualQueue.shift();
      if (ev) showPosition(ev.chord, ev.note);
      if (player.playing || visualQueue.length) rafId = requestAnimationFrame(loop);
      else {
        rafId = 0;
        showPosition(-1, -1);
      }
    };
    rafId = requestAnimationFrame(loop);
  }

  function showPosition(chord, note) {
    if (chord !== shown.chord) {
      stripEl.querySelectorAll('.chip.now').forEach((c) => c.classList.remove('now'));
      cardsEl.querySelectorAll('.card.now').forEach((c) => c.classList.remove('now'));
      if (chord >= 0) {
        stripEl.children[chord]?.classList.add('now');
        const card = cardsEl.children[chord];
        card?.classList.add('now');
        if (card && state.follow && player.playing) card.scrollIntoView({ behavior: smooth(), block: 'nearest' });
      }
    }
    if (chord !== shown.chord || note !== shown.note) {
      cardsEl.querySelectorAll('g.n.on').forEach((g) => g.classList.remove('on'));
      if (chord >= 0 && note >= 0) cardsEl.children[chord]?.querySelector(`g.n[data-i="${note}"]`)?.classList.add('on');
    }
    shown = { chord, note };
  }

  // ---------- Play button ----------

  const playBtn = $('#play');
  function setPlayIcon() {
    playBtn.innerHTML = player.playing
      ? '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';
    playBtn.setAttribute('aria-label', player.playing ? 'Stop' : 'Play');
  }
  playBtn.addEventListener('click', () => (player.playing ? player.stop() : player.start()));
  setPlayIcon();

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target === document.body) {
      e.preventDefault();
      playBtn.click();
    }
  });

  renderAll();
})();
