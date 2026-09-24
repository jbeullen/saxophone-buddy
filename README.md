# Saxophone Buddy

A mobile-first web page that turns chord symbols into saxophone arpeggios.

- Type chords (`Cmaj`, `Cmin7b5`, `Cmaj7#11`, `C/E`, `F7alt`, `Bb13`, `C6/9`, …), one at a time or a whole progression separated by spaces, either in concert pitch (as on a lead sheet) or as written on your sax part.
- Pick your horn: alto (E♭), tenor (B♭), soprano (B♭), baritone (E♭) or concert pitch.
- Each chord shows its written arpeggio on a treble staff. Every note head is a circle with its name inside (`A♭`, `F♯`), coloured by chord degree, with the degree (R, 3, ♭7, ♯11…) underneath.
- Slash chords start on the bass note and stack the chord tones above it.
- Loop the progression on a recorded grand piano (chords, the arpeggio, or both), with tempo, beats per chord and an optional click.
- Tap a chord card to hear its arpeggio once.

No build step and no dependencies. Serve the folder with any static server:

```sh
npm start        # python3 -m http.server 8000
npm test         # chord parsing and transposition tests
```

It also works on GitHub Pages: enable Pages for the branch and open `index.html`.

## Files

- `theory.js`: chord parser, note spelling, saxophone transposition and range fitting
- `audio.js`: piano playback from the recorded samples, with a small synth as fallback while they load
- `samples/piano/`: Salamander Grand Piano recordings

## Credits

Piano: [Salamander Grand Piano](https://github.com/Tonejs/audio) by Alexander Holm, CC BY 3.0.
- `app.js`: UI, staff drawing and the playback scheduler
