const test = require('node:test');
const assert = require('node:assert');
const T = require('../theory.js');

const names = (chord, inst) => T.arpeggio(T.parseChord(chord), inst).notes.map((n) => n.name);

test('concert spellings', () => {
  assert.deepStrictEqual(names('Cmaj', 'concert'), ['C', 'E', 'G']);
  assert.deepStrictEqual(names('Cmin7b5', 'concert'), ['C', 'Eb', 'Gb', 'Bb']);
  assert.deepStrictEqual(names('Cmaj7#11', 'concert'), ['C', 'E', 'G', 'B', 'F#']);
  assert.deepStrictEqual(names('C/E', 'concert'), ['E', 'G', 'C']);
  assert.deepStrictEqual(names('Cdim7', 'concert'), ['C', 'Eb', 'Gb', 'A']);
  assert.deepStrictEqual(names('C6/9', 'concert'), ['C', 'E', 'G', 'A', 'D']);
  assert.deepStrictEqual(names('C7sus4', 'concert'), ['C', 'F', 'G', 'Bb']);
});

test('tenor and alto transposition', () => {
  assert.deepStrictEqual(names('Bb7', 'tenor'), ['C', 'E', 'G', 'Bb']);
  assert.deepStrictEqual(names('Ab', 'tenor'), ['Bb', 'D', 'F']);
  assert.deepStrictEqual(names('Cmaj7', 'alto'), ['A', 'C#', 'E', 'G#']);
  assert.strictEqual(T.arpeggio(T.parseChord('Db7'), 'alto').written.text, 'Bb7');
  assert.strictEqual(T.arpeggio(T.parseChord('C/E'), 'tenor').written.text, 'D/F#');
});

test('written notes stay in sax range', () => {
  for (const c of ['Ab13', 'B7alt', 'Gbmaj9', 'E13', 'F#m11']) {
    for (const inst of ['alto', 'tenor', 'soprano', 'bari']) {
      for (const n of T.arpeggio(T.parseChord(c), inst).notes) {
        assert.ok(n.midi >= 58 && n.midi <= 90, `${c} ${inst} ${n.name}${n.octave}`);
      }
    }
  }
});

test('rejects nonsense', () => {
  assert.ok(T.parseChord('H7').error);
  assert.ok(T.parseChord('Cxyz').error);
});
