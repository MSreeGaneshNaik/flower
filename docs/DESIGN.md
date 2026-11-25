# Flower: design system

The flower is the product and always leads: full-bleed stage on the left, controls docked right (a bottom sheet under 900px). It is dressed as a herbarium: black mounting board, a bone paper label slip, typed fields, an accession stamp.

## Shared structure
- Stage: canvas fills its region; topbar (mark and wordmark) top-left at 20/24px; transport (play, replay, scrubber with Bloom and ending marks, clock) bottom-centre, max 680px wide.
- Panel: 392px column, 24px padding. Sections in order: flower, words, look, ending, share. On desktop each is a collapsible row (52px header, 1px rule between rows) whose header shows its current setting ("Natural · Classic · Black"); only the flower list starts open, and open rows are remembered. The body opens by animating its grid row from 0fr to 1fr on an ease-out-quint glide (560ms open, 320ms close); the content fades and slides 10px into place just behind it, and a row opening near the bottom scrolls itself into view on the same curve. It is inert while closed. The phone sheet shows one section, always open.
- Controls: 40px inputs and buttons, 30px segments inside a 3px tray, 34x20 switches, 14px range thumbs on a 2px track. One filled primary per screen: Copy gift link.
- Phone and tablet (<=900px): stage full screen, five-tab bar, sheet at 58vh; the stage shrinks above the open sheet so the flower stays visible.
- Gift viewer (`?v=1`): no editor; message bottom-left, fades in at 2.4s once the bloom is under way; Replay and Make your own.
- Motion: press feedback scale 0.97 on every control; menu scales from its trigger; sheet rises 24px; all transitions end at 1ms under reduced motion.

## Tokens
| Token | Herbarium |
|---|---|
| UI face | Archivo 400/500/600 |
| Display / data face | Courier Prime (typed label data) |
| Panel ground | #e4e2dd bone label paper |
| Ink / muted | #1b1a17 / #55524b |
| Control line | #bab6ac |
| Selected | #d2cec5 tone step |
| Primary | #1b1a17 near-black |
| Accent | #9b2219 stamp red (record, links) |
| Radius card / control | 12 / 9px |
| Signature | Specimen label slip with accession number |

## Stage chrome by ground
Black (default) #eeeeec ink on #141414 surfaces; Night and Plum tint the surfaces. The flower renders identically on all three. (A Paper ground was tried and removed at the owner's request.)

## The engine's looks
Palettes: Natural plus nine recolours. Every palette can tone each part separately (petals, heart, stem, leaves), keeping each part's own lightness, so parts never merge: Phosphor is green petals, lime heart, teal stem, chartreuse leaves; Amber is amber petals, red heart, copper stem, olive leaves; Gold gets a dark burnt-brown eye. In Classic, the heart, stem and leaves also have their own characters (`* % # @`, `! | l I`, `, ; + =`). Characters: Classic (ramp plus outline glyphs and phrase patches), Blocks, Dots, Binary, Kana, Words. Grounds: Black, Night, Plum. Character size: Large, Medium, Small, Very small (70% of Small). Endings: Wind, Petal fall, Burst, Wilt, Stay. The lotus carries a true lotus (Nelumbo) leaf, not a water-lily pad: a full circle with no slit, the stalk joined at the centre underneath, a shallow bowl with a wavy rim and pale veins radiating from a pale centre. It opens from a tight funnel while its stalk draws down to meet the flower stem's foot. Brightness (50–200%) is an exposure before the hue-preserving highlight roll-off, so bright petals stay coloured instead of clipping to white.

## Soft corners

No sharp corners anywhere. The desktop panel floats 10px inside the ground as a 22px-radius card, the phone sheet has a 22px top edge, and nested radii step down by their padding (segments sit 3px inside their tray, thumbnails 5px inside their row).

## Export dialog

A modal on the panel's own colours. Left: the live preview in the exact file frame, drawn at twice its box so characters keep the file's proportions; drag turns it (1:1, with a little momentum on release), arrows turn 15° and tilt 8°, presets jump the short way round. The angle is absolute, so moving the moment slider does not swing the camera. Right: format, size, frame, transparency, one line of help. Footer: the pixel size or file result on the left, one pill-shaped Download button on the right, replaced by a progress bar with Cancel while a GIF encodes. The stage holds still while the dialog is open.
