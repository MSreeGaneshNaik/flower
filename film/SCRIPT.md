# The launch film: script

**Format:** 3840 × 2160, 60 fps, 60.0 s. HEVC on the hardware encoder at 60 Mb/s, or H.264 at 72 Mb/s; AAC at 320 kb/s, 48 kHz.
Every flower is drawn by the real Flower engine at native 4K, and every title and piece of interface is drawn as vector type at 4K. Nothing is upscaled and nothing is rendered off the machine.

**Angle:** the product is the film. Every shot is the engine drawing a real flower, cut to the song: a dot in silence, a bloom on the drop, everything the app can do across the chorus, and the gift blowing away in the outro.

## The beat grid

The track runs at 105 BPM. Beat *n* of the film lands at **0.04 + n × 60/105 s**, and every cut, title and ending is placed on that grid (`T(n)` in `src/film.ts`).

## The audio edit

The page cuts the full 3:05 track down to exactly one minute (`src/audio.ts`):

| Film | Song | Part |
|---|---|---|
| 0:00.000 – 0:22.857 | 1:54.334 – 2:17.191 | the riser, the drop at beat 8, the drop section |
| 0:22.857 – 0:50.286 | 0:36.620 – 1:04.049 | the chorus |
| 0:50.286 – 1:00.000 | 2:53.763 – 3:03.477 | the outro, last hit at 0:59.47, a 0.45 s fade |

The first piece fades in over 60 ms. The two joins are 30 ms equal-power crossfades, placed 40 ms before a downbeat so every kick stays whole.

## Shot by shot

*Cold open, beats 0–8 (0:00–0:04.6)*
- 0–4: a dot pulses in the middle of the frame. "Every / flower / starts / as a dot." arrives one word per beat.
- 4–6: the dot grows into a bud drawn in dots.
- 6–8: sixteenth-note strobes through the character sets: letters, dots, kana, binary, blocks, words.

*Drop, beats 8–16 (0:04.6–0:09.2)*
- 8–12: the rose blooms open in two beats. **Flower** slams in, then "Made of letters."
- 12–16: a macro dive, "let it bloom" written across the petals.

*Everything it has, beats 16–40 (0:09.2–0:22.9)*
- 16–24: seven flowers, one per beat, with their Latin names.
- 24–32: ten palettes.
- 32–38: six character sets.
- 38–40: a whip zoom into the chorus.

*Chorus, beats 40–88 (0:22.9–0:50.3)*
- 40–48: the label slip; the note is typed in sixteenths and appears on the petals as it is typed.
- 48–56: "Or made of dots." Eight flowers in the Dots set.
- 56–60: three grounds, the whole frame changing on each beat.
- 60–64: four character sizes.
- 64–68: brightness and glow, on the app's own sliders.
- 68–72: "Any angle." Front, Angled, Side, Above.
- 72–80: "Up to 4K." Clip frames, then PNG · JPG · SVG · GIF.
- 80–84: the "Copy gift link" button is pressed.
- 84–88: "It blooms for them." The gift view, "For Mira".

*Outro, beats 88–104 (0:50.3–1:00)*
- 88–96: five endings side by side, each starting on its own beat: Stay, Wilt, Petal fall, Burst, Wind.
- 96–104: the end card, **Flower** / "Let it bloom.", final hit on beat 104, then a fade to black from 0:59.6.

The poster is the title card at beat 11.3. It is also frame 0 of the file, so players and feeds show it as the thumbnail.

## Look

- **Ground:** Night, rgb(3, 5, 11).
- **Type:** Archivo throughout, 600 for headlines (tracking −0.03em) and 500 for names. Courier Prime only inside the label slip, as in the app.
- **Colour:** ink #eeeeec. The only colour comes from the flowers; the label slip is bone #e4e2dd with ink #1b1a17.
- **Layout:** text left-aligned on equal 288 px margins; one centred moment, the end card.
- **Never:** text glow, gradients, uppercase tracked labels, or scaled raster frames. Zoom happens inside the engine and offsets snap to whole pixels.
- **No hitches:** every engine and look is drawn once when the page opens, so the preview never stalls on a cut.

The names Mira and Sam are fictional stand-ins.
