/*
 * Chord parsing, spelling and saxophone transposition.
 * Plain script: defines window.SaxTheory in the browser and module.exports in Node.
 */
(function (root) {
  'use strict';

  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const NATURAL = [0, 2, 4, 5, 7, 9, 11];

  // Written = concert + interval. `steps` are letter steps, `semis` semitones (within an octave).
  // `sounds` is how many semitones the sound is below the written note.
  const INSTRUMENTS = {
    alto: { name: 'Alto', key: 'E♭', steps: 5, semis: 9, sounds: 9 },
    tenor: { name: 'Tenor', key: 'B♭', steps: 1, semis: 2, sounds: 14 },
    soprano: { name: 'Soprano', key: 'B♭', steps: 1, semis: 2, sounds: 2 },
    bari: { name: 'Bari', key: 'E♭', steps: 5, semis: 9, sounds: 21 },
    concert: { name: 'Concert', key: 'C', steps: 0, semis: 0, sounds: 0 },
  };

  // Written saxophone range (all saxes share fingerings): B♭3 .. F#6.
  const RANGE_LOW = 58;
  const RANGE_HIGH = 90;

  const NATURAL_SEMIS = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 9: 14, 11: 17, 13: 21 };

  const mod = (n, m) => ((n % m) + m) % m;

  function parseNote(str) {
    const m = /^([A-Ga-g])(##|bb|#|b|x)?$/.exec(str);
    if (!m) return null;
    const acc = { '#': 1, '##': 2, x: 2, b: -1, bb: -2 }[m[2]] || 0;
    return { letter: LETTERS.indexOf(m[1].toUpperCase()), acc };
  }

  const pitchClass = (n) => mod(NATURAL[n.letter] + n.acc, 12);

  function accText(acc, unicode) {
    if (acc === 0) return '';
    if (unicode) return acc > 0 ? (acc === 2 ? '𝄪' : '♯') : acc === -2 ? '𝄫' : '♭';
    return acc > 0 ? '#'.repeat(acc) : 'b'.repeat(-acc);
  }

  const noteName = (n, unicode) => LETTERS[n.letter] + accText(n.acc, unicode);

  // Move a note `steps` letters and `semis` semitones up.
  function transposeNote(n, steps, semis) {
    const letter = mod(n.letter + steps, 7);
    const target = mod(NATURAL[n.letter] + n.acc + semis, 12);
    let acc = mod(target - NATURAL[letter], 12);
    if (acc > 6) acc -= 12;
    return { letter, acc };
  }

  // The same pitch class spelled on a neighbouring letter, with at most one accidental.
  function respell(n) {
    const pc = pitchClass(n);
    let best = null;
    for (const d of [-1, 1, -2, 2]) {
      const letter = mod(n.letter + d, 7);
      let acc = mod(pc - NATURAL[letter], 12);
      if (acc > 6) acc -= 12;
      if (Math.abs(acc) <= 1 && (!best || Math.abs(acc) < Math.abs(best.acc))) best = { letter, acc };
    }
    return best || n;
  }

  const MAJOR_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const MINOR_ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

  // Pick the spelling a lead sheet would use for a (transposed) root.
  function friendlyRoot(n, minor) {
    const list = minor ? MINOR_ROOTS : MAJOR_ROOTS;
    if (list.includes(noteName(n))) return n;
    const pc = pitchClass(n);
    for (const name of list) {
      const c = parseNote(name);
      if (pitchClass(c) === pc) return c;
    }
    return n;
  }

  // ---------- Chord symbol parsing ----------

  function parseQuality(src) {
    let t = src.replace(/[()\[\],\s]/g, '');
    const tones = [
      { deg: 3, semis: 4, implied: true },
      { deg: 5, semis: 7, implied: true },
    ];
    const eat = (re) => {
      const m = re.exec(t);
      if (!m) return null;
      t = t.slice(m[0].length);
      return m;
    };
    const setTone = (deg, semis, implied = false) => {
      for (let i = tones.length - 1; i >= 0; i--) {
        if (tones[i].deg === deg && (tones[i].implied || implied)) tones.splice(i, 1);
      }
      if (!tones.some((x) => x.deg === deg && x.semis === semis)) tones.push({ deg, semis, implied });
    };
    const removeDeg = (deg) => {
      for (let i = tones.length - 1; i >= 0; i--) if (tones[i].deg === deg) tones.splice(i, 1);
    };

    let majSeventh = false;
    let minor = false;
    let seventh = null; // semitones of the 7th once one is implied
    let dim7 = false;

    if (eat(/^(maj|Maj|MAJ|ma(?=\d|$)|M|Δ|∆|\^)/)) {
      majSeventh = true;
      if (/^(Δ|∆|\^)$/.test(src.replace(/[()]/g, ''))) seventh = 11;
    } else if (eat(/^(ø|Ø)/)) {
      minor = true;
      setTone(3, 3, true);
      setTone(5, 6, true);
      seventh = 10;
      eat(/^7/);
    } else if (eat(/^(dim|°|o)/)) {
      minor = true;
      setTone(3, 3, true);
      setTone(5, 6, true);
      if (eat(/^7/)) {
        seventh = 9;
        dim7 = true;
      }
    } else if (eat(/^(aug|\+)/)) {
      setTone(5, 8);
    } else if (eat(/^(min|mi|m|-)/)) {
      minor = true;
      setTone(3, 3, true);
      if (eat(/^(maj|Maj|M|Δ|∆|\^)/)) {
        majSeventh = true;
        if (!/^\d/.test(t)) seventh = 11;
      }
    }

    const num = eat(/^(6\/9|69|13|11|9|7|6|5|4|2)/);
    const n = num ? num[1] : null;
    const sev = majSeventh ? 11 : 10;
    if (n === '5') {
      removeDeg(3);
    } else if (n === '6') {
      setTone(6, 9, true);
    } else if (n === '69' || n === '6/9') {
      setTone(6, 9, true);
      setTone(9, 14, true);
    } else if (n === '2') {
      setTone(9, 14, true);
    } else if (n === '4') {
      removeDeg(3);
      setTone(4, 5, true);
    } else if (n === '7' && !dim7) {
      seventh = sev;
    } else if (n === '9') {
      seventh = sev;
      setTone(9, 14, true);
    } else if (n === '11') {
      seventh = sev;
      setTone(9, 14, true);
      setTone(11, 17, true);
      if (!minor) removeDeg(3); // C11 is usually played as a sus chord
    } else if (n === '13') {
      seventh = sev;
      setTone(9, 14, true);
      if (minor) setTone(11, 17, true);
      setTone(13, 21, true);
    }
    if (seventh !== null) setTone(7, seventh, true);

    while (t.length) {
      let m;
      if ((m = eat(/^sus(2|4)?/))) {
        removeDeg(3);
        if (m[1] === '2') setTone(2, 2);
        else setTone(4, 5);
      } else if ((m = eat(/^add(b|#)?(2|4|6|9|11|13)/))) {
        const deg = Number(m[2]);
        const shift = m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0;
        setTone(deg, NATURAL_SEMIS[deg] + shift);
      } else if ((m = eat(/^(b|#|-|\+)(5|6|9|11|13)/))) {
        const deg = Number(m[2]) === 6 ? 13 : Number(m[2]);
        const shift = m[1] === 'b' || m[1] === '-' ? -1 : 1;
        if ((deg === 9 || deg === 11 || deg === 13) && seventh === null) setTone(7, 10, true);
        setTone(deg, NATURAL_SEMIS[deg] + shift);
      } else if (eat(/^alt/)) {
        if (seventh === null) setTone(7, 10, true);
        removeDeg(5);
        setTone(5, 8);
        setTone(9, 13);
        tones.push({ deg: 9, semis: 15, implied: false });
      } else if ((m = eat(/^(no|omit)(3|5)/))) {
        removeDeg(Number(m[2]));
      } else if ((m = eat(/^(maj|M|Δ|∆)7/))) {
        setTone(7, 11, true);
      } else {
        return { error: `Can't read “${t}”` };
      }
    }

    tones.push({ deg: 1, semis: 0 });
    for (const x of tones) x.abs = x.semis;
    tones.sort((a, b) => a.abs - b.abs || a.deg - b.deg);
    const hasMinorThird = tones.some((x) => x.deg === 3 && x.semis === 3);
    return { tones: tones.map(({ deg, semis, abs }) => ({ deg, semis, abs })), minor: hasMinorThird };
  }

  function parseChord(input) {
    const s = String(input).trim().replace(/♭/g, 'b').replace(/♯/g, '#');
    const m = /^([A-Ga-g])(bb|##|b|#)?(.*)$/.exec(s);
    if (!m) return { error: `“${s}” doesn't start with a note name` };
    const root = parseNote(m[1] + (m[2] || ''));
    let rest = m[3];
    let bass = null;
    const sm = /^(.*)\/([A-Ga-g](?:bb|##|b|#)?)$/.exec(rest);
    if (sm) {
      rest = sm[1];
      bass = parseNote(sm[2]);
    }
    const q = parseQuality(rest);
    if (q.error) return { error: `${s}: ${q.error}` };
    return { input: s, root, suffix: rest, bass, tones: q.tones, minor: q.minor };
  }

  // Split a line like "Dm7 G7 | Cmaj7, C/E" into chord tokens.
  function splitProgression(text) {
    return String(text)
      .split(/[\s,|;]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  // ---------- Degree labels ----------

  function degreeLabel(deg, semis) {
    if (deg === 1) return 'R';
    const diff = semis - NATURAL_SEMIS[deg];
    if (deg === 7 && diff === -2) return '°7';
    const prefix = diff === -1 ? '♭' : diff === 1 ? '♯' : diff === -2 ? '𝄫' : diff === 2 ? '𝄪' : '';
    return prefix + deg;
  }

  function degreeFamily(deg) {
    if (deg === 1) return 'root';
    if (deg === 3) return 'third';
    if (deg === 5) return 'fifth';
    if (deg === 7) return 'seventh';
    return 'ext';
  }

  // ---------- Staff placement ----------

  const staffMidi = (step, acc) => (Math.floor(step / 7) + 1) * 12 + NATURAL[mod(step, 7)] + acc;

  function makeNote(step, midi) {
    let acc = midi - staffMidi(step, 0);
    if (Math.abs(acc) >= 2) {
      // Double accidental: move to a neighbouring letter instead.
      for (const d of [-1, 1]) {
        const a = midi - staffMidi(step + d, 0);
        if (Math.abs(a) <= 1) {
          step += d;
          acc = a;
          break;
        }
      }
    }
    return { step, midi, letter: mod(step, 7), acc, octave: Math.floor(step / 7) };
  }

  function prettySuffix(suffix) {
    return suffix
      .replace(/b(?=\d)/g, '♭')
      .replace(/#/g, '♯')
      .replace(/\^/g, 'Δ');
  }

  function chordLabel(root, suffix, bass) {
    return {
      root: noteName(root, true),
      suffix: prettySuffix(suffix),
      bass: bass ? noteName(bass, true) : '',
      text: noteName(root) + suffix + (bass ? '/' + noteName(bass) : ''),
    };
  }

  // Build the written arpeggio for one instrument.
  function arpeggio(chord, instrumentId) {
    const inst = INSTRUMENTS[instrumentId] || INSTRUMENTS.tenor;
    const wRoot = friendlyRoot(transposeNote(chord.root, inst.steps, inst.semis), chord.minor);
    const rootStep = 4 * 7 + wRoot.letter;
    const rootMidi = staffMidi(rootStep, wRoot.acc);

    let notes = chord.tones.map((t) => ({
      ...makeNote(rootStep + t.deg - 1, rootMidi + t.abs),
      deg: t.deg,
      semis: t.semis,
    }));

    let wBass = null;
    if (chord.bass) {
      const bassPc = mod(pitchClass(chord.bass) + inst.semis, 12);
      const tone = notes.find((n) => mod(n.midi, 12) === bassPc);
      let bassNote;
      if (tone) {
        bassNote = { ...tone };
        while (bassNote.midi >= rootMidi) {
          bassNote = { ...bassNote, step: bassNote.step - 7, midi: bassNote.midi - 12, octave: bassNote.octave - 1 };
        }
        wBass = { letter: tone.letter, acc: tone.acc };
      } else {
        wBass = friendlyRoot(transposeNote(chord.bass, inst.steps, inst.semis), false);
        let step = 4 * 7 + wBass.letter;
        let midi = staffMidi(step, wBass.acc);
        while (midi >= rootMidi) {
          step -= 7;
          midi -= 12;
        }
        bassNote = { ...makeNote(step, midi), deg: 0, semis: null };
      }
      // Inversion: every chord tone moves to the nearest spot above the bass.
      const above = notes
        .filter((n) => mod(n.midi, 12) !== mod(bassNote.midi, 12))
        .map((n) => {
          let x = n;
          while (x.midi - 12 > bassNote.midi) x = { ...x, step: x.step - 7, midi: x.midi - 12 };
          while (x.midi <= bassNote.midi) x = { ...x, step: x.step + 7, midi: x.midi + 12 };
          return { ...x, octave: Math.floor(x.step / 7) };
        });
      above.sort((a, b) => a.midi - b.midi);
      notes = [{ ...bassNote, isBass: true }, ...above];
    }

    // Shift by octaves to sit best inside the saxophone range and near the staff.
    let best = null;
    for (const k of [-2, -1, 0, 1]) {
      const shifted = notes.map((n) => ({ ...n, step: n.step + 7 * k, midi: n.midi + 12 * k, octave: n.octave + k }));
      const out = shifted.filter((n) => n.midi < RANGE_LOW || n.midi > RANGE_HIGH).length;
      const ledger = shifted.reduce((s, n) => s + Math.max(0, 29 - n.step, n.step - 39), 0);
      const score = out * 100 + ledger;
      if (!best || score < best.score) best = { score, notes: shifted };
    }
    notes = best.notes.map((n) => ({
      ...n,
      name: noteName(n, false),
      display: noteName(n, true),
      label: n.deg === 0 ? 'bass' : degreeLabel(n.deg, n.semis),
      family: n.deg === 0 ? 'bass' : degreeFamily(n.deg),
      concertMidi: n.midi - inst.sounds,
    }));

    return {
      instrument: inst,
      written: chordLabel(wRoot, chord.suffix, wBass),
      concert: chordLabel(chord.root, chord.suffix, chord.bass),
      notes,
    };
  }

  // Concert-pitch voicing for the piano accompaniment.
  // The bass is doubled an octave up (phone speakers barely play the low octave), and
  // the right hand leaves out the bass note so a slash chord's bass stands on its own.
  function pianoVoicing(chord) {
    const rootPc = pitchClass(chord.root);
    const bassPc = chord.bass ? pitchClass(chord.bass) : rootPc;
    const bass = 40 + mod(bassPc - 4, 12); // E2..D#3
    const bassHigh = bass + 12;
    const low = Math.max(55, bassHigh + 3); // right hand starts clear of the bass
    const omitBass = Boolean(chord.bass) || chord.tones.length > 3;
    const skipFifth = chord.tones.length > 5;
    const upper = [];
    for (const t of chord.tones) {
      const pc = mod(rootPc + t.semis, 12);
      if (omitBass && pc === bassPc) continue;
      if (t.deg === 5 && t.semis === 7 && skipFifth) continue;
      let m = low + mod(pc - low, 12);
      if (!upper.includes(m)) upper.push(m);
    }
    upper.sort((a, b) => a - b);
    return { bass: [bass, bassHigh], upper };
  }

  // Turn a chord typed in written pitch for `instrumentId` into its concert-pitch symbol.
  function toConcert(text, instrumentId) {
    const c = parseChord(text);
    if (c.error) return c;
    const inst = INSTRUMENTS[instrumentId] || INSTRUMENTS.concert;
    const down = (n, minor) => friendlyRoot(transposeNote(n, -inst.steps, -inst.semis), minor);
    const root = down(c.root, c.minor);
    const bass = c.bass ? down(c.bass, false) : null;
    return { text: noteName(root) + c.suffix + (bass ? '/' + noteName(bass) : '') };
  }

  const api = {
    INSTRUMENTS,
    parseChord,
    splitProgression,
    arpeggio,
    toConcert,
    pianoVoicing,
    noteName,
    LETTERS,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SaxTheory = api;
})(typeof window !== 'undefined' ? window : globalThis);
