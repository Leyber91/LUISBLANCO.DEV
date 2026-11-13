---
name: labs-design
description: The visual, motion and copy language of luisblanco.dev/labs, the material of each of the seven lab worlds, and the looks that read as generated. Use before designing, restyling or judging any page, canvas, hub view or copy under labs/, including when reading a lab's screenshots.
---

# Labs design

The labs are instruments drawn on engineering plates in deep space. A visitor should be able to tell, from one
screenshot and without a logo, that a page belongs to this site, and to tell from its material which world it
belongs to. Everything below serves those two recognitions.

## The plate

- Ground: `--void` (#06080D), near-black with a faint 32 px drafting grid at most. Plates raised on it carry
  hairline borders (`--line`), never a fill heavier than the ground plus a few percent.
- A plate has gold corner brackets, small uppercase mono labels with wide tracking ("PLATE C · EVERY LAB"), and,
  where the page is a drawing, an engineering title block (sheet, revision, scale, date). Sections are plates of
  one drawing, lettered in sequence.
- Line and light over solid matter: hairlines, registration ticks, feathered glows, brushed ink. Controls are
  outlined, small and exact; a filled button is reserved for the one action the page exists for.
- One focal living element that means something, with quiet around it. The page is alive at rest: it shows a
  running example on load, never an empty panel waiting for input.
- An evidence footer tags each claim [REAL] or [ILLUSTRATIVE].

## Type

- IBM Plex Mono for everything a visitor reads or operates (the token font).
- Fraunces for display only: page titles, world names (italic), large numerals. It is the main site's display face,
  so the labs and the site read as one hand.
- Orbitron and Space Grotesk survive on six older pages and are retired: a page you touch moves to Plex Mono and
  Fraunces. The anti-tells gate rejects them on new pages.
- Numbers use tabular figures and carry their unit and their source.

## Colour

- The ink ladder: `--text-bright` for headings, `--text` for body, `--text-dim` for metadata, `--text-faint` for
  the deep background; `--horizon` (#9FB3D6) for cold structure.
- Gold, the `--accretion` family, marks only what has fired: live, chosen, computed, decided, the finished strand.
  A visitor learns in seconds that gold means "this happened"; any decorative gold breaks that.
- No third hue. A world's material may tint the ink (a cold blue in Cosmos, a fog grey in Contact) but never adds
  a new accent.

## The seven worlds and their materials

Each world's look is derived from its subject, so two worlds never look alike while both stay on the plate.

| World | Labs | Material | Marks | Motion | What goes gold |
|---|---|---|---|---|---|
| Cosmos | Black Hole, Exomania, Dimensions | measured light | ray-traced optics, photometric curves, star fields from real catalogues | slow orbital time, lensing | a measured value, a confirmed planet |
| Contact | Heptapod, Timeline, Alternate Reality, Last Witness | ink in fog | brushed ink with no first stroke, fog fields, logograms built from rules | ink blooming and settling | a decoded meaning, a translation that held |
| Inside the Machine | Token EKG, DATASPACE, The Figure, AI in Healthcare, Primordial Seed | oscilloscope traces | phosphor traces, sweep lines, graticules, token ticks | sweeps and persistence decay | a measured run, a matched token |
| Claims | Honesty Decoder, Roaster, Virtual Mentorship, AI Content Studio | the editor's pencil | strike-throughs, margin marks, proof-correction symbols over set type | the pencil moving across a line | the mark that caught a claim |
| Self | Claude Prep, Personalized Plans, Habits, Mindfulness, VR Fitness, Learning Pathways, Personalized Learning | breath and slow curves | long easing curves, rings of days, growth lines | breathing rhythms, never jitter | a session done, a streak kept |
| Signals | Trending, Meme Lab, Predictive Analytics, Social Manager, User-Generated Content, Community Challenges | seismograph fields | stacked traces, change-point ticks, fields of small multiples | tremor and its record | a detected burst, a resolved prediction |
| Workshop | Project Management, Automation, Rapid Prototyping | drafting lines | construction lines, dimension arrows, revision clouds, title blocks | a line being drafted | a shipped item, a passing check |

The hub is the orrery of these worlds: rings that close as their labs reach level 5, filaments whose reach is each
lab's level, gold where a lab is live. Its motion philosophy is in [closing-rings.md](closing-rings.md).

## Motion

- Every mark is computed from data, so the image cannot flatter: an arc's length, a filament's reach, a trace's
  height. If a mark encodes nothing, remove it.
- Reveal by ignition (the figure draws itself to its measured state), then let the material move: ink on a curl
  field, a phosphor sweep, a breath. Seed the randomness so a given state always draws the same picture.
- prefers-reduced-motion gets the finished frame, still and complete. Pause animation when the page is hidden or
  the element is offscreen.

## Copy

Plain, exact sentences in the site's voice (SITE_RULES.md, "Voice for copy"). The verb names what the instrument
does; the number names what was measured, with its unit and source. Labels are nouns.

## Looks that read as generated

The gate (`node tools/anti_tells.mjs`) rejects these on new work: a gradient from purple to blue or pink;
gradient-filled text; frosted-glass panels; Inter, Poppins or Space Grotesk; emoji; cream grounds with terracotta;
em-dash asides; "not X, but Y" pivots; stock words (delve, seamless, unleash, cutting-edge and the rest of its
list).

The gate cannot see these, so judge them on the screenshot:

- A grid of identical rounded cards, each an icon in a circle, a bold title and two lines of grey text.
- A centred hero with a soft colour blob behind a headline and two pill buttons.
- Neon glow on everything, so nothing is emphasised.
- KPI tiles in four bright colours with up-arrows.
- Decoration that encodes nothing: floating particles, orbiting dots, a gradient mesh.
- An icon library sprinkled on labels to fill space.
- Three of anything for rhythm.

## Method

1. Read the lab's subject until you can name what its fiction made real looks like (LABS_LEVELS.md, anchor).
2. Write the motion and material philosophy first, four to six short paragraphs in the manner of
   closing-rings.md: what each mark encodes, how it moves, what goes gold. Then write the code from it.
3. Study reference images at full resolution and extract their vocabulary as a system before drawing.
4. Render at 1440 and 390 px (`node tools/labs-wt.mjs shoot <lab>`), read both images, and judge them against
   this file. A still cannot judge motion; say so where motion matters.
