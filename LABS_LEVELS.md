# LABS LEVELS

The level system for the labs at luisblanco.dev/labs, and each lab's rating before and after its evolution pass.
Started 2026-11-11 on Luis's order: every lab rises on every axis, and the developed ones rise five levels.

## Each lab has its own axes

A black hole and a habit tracker do not climb the same ladder. Each lab defines its own axes in
labs/levels/<id>.json: six to twelve of them, each named for what that lab does (geodesic fidelity, decoder
robustness, forecast calibration), each with a measurable metric, and each with its own eleven-rung ladder from 0
to 10 written for that lab. A rung is a concrete state a rater can check with a yes or no.

Three rules keep the ladders honest:

1. A lab's ladders are written before its generation is graded, from the code as it stands, and reviewed by a second
   pass that tries to break them (a rung nobody can check, a G0 set too high, a rung 10 that is not the best in the
   field).
2. The builder of a generation does not grade it. A separate rater grades every axis against the fixed ladder, from
   the running page and its code, with evidence.
3. A ladder changes only between generations, with the reason recorded, never to fit a result.

The arithmetic, computed by tools/levels.mjs:

    lab level = min(median of its axis levels, weakest axis + 2)

The median is the lower median when the count is even. A beautiful shell with an empty model is capped by its
weakest axis. The "next rung" of a lab is the next rung of its weakest axis: the routine always knows what to build
next.

Commands: `node tools/levels.mjs check | table | sheet <id> | next [<id>] | write | selftest`.

## The nine frames

Every lab's axes roll up to these nine frames, from the evolve skill's niche grid, so labs stay comparable. Every
frame needs at least one axis in every lab.

| Frame | What "up" means |
|---|---|
| Model | What it computes. From a lookup table, to a working mechanism, to a model checked against published values. |
| Graphics | What becomes visible. From a static block, to one live view, to linked views with cinematic choreography. |
| Style | The craft of the design language: type, line and light, motion, gold kept for what is active. |
| Interaction | How the visitor touches it. From one button, to open-ended play the designer did not script. |
| Data | Where its facts come from. From invented values, to real sources with dates and citations, to exports. |
| Intelligence | What it does on its own: guided tours, model calls, recovery when a route fails. |
| Explanation | What the visitor understands after five minutes, and whether every claim is tagged real or illustrative. |
| Performance | Load, frame time, phone width, reduced motion, keyboard and screen-reader reach. |
| Architecture | Code shape: modules, config separate from logic, what can be added without touching the core. |

## The general ladder

What each level means in general. A lab's own ladders say what it means for that lab on that axis; where the two
disagree, the lab's ladder wins, and its rungs should sit near these.

| Level | Name | What it means |
|---|---|---|
| 0 | absent | Named in the hub. Nothing runs. |
| 1 | stub | A page exists. Placeholder or static mock. |
| 2 | sample | One mechanism works along one path. Template interface. Empty until clicked. |
| 3 | working | Works end to end. One view. Controls are form fields with little feedback. |
| 4 | instrument | A real model, several linked controls, on-brand, legible at rest. |
| 5 | rich | Several modes or views. Live state readable at a glance. Guided explanation. Works on a phone. Reduced motion handled. |
| 6 | deep | The visitor can ask questions the designer did not script. States shareable by URL. Measurements shown with units and sources. |
| 7 | crafted | Cinematic visual choreography. Performance tiers. Accessible. The page explains its own mechanism while it runs. |
| 8 | research-grade | Fidelity documented and cited, compared against reference values. Results export. Several linked views. |
| 9 | signature | Does something no comparable public demo does. The visitor leaves with an artifact or an insight. |
| 10 | reference | The interactive people cite for its topic. |

Targets for this pass: every lab at 7 or higher, no axis below 5. Black Hole, Exomania and Dimensions at 9.

## The public model route (measured 2026-11-11)

The site is static and holds no key. Every lab reaches a model through labs/assets/js/ai/llm.js, which tries the
visitor's local Ollama, then a key the visitor brings, then a deployed worker if one exists, then
text.pollinations.ai, then the lab's own deterministic engine. The keyless public route answered HTTP 402
FREE_LIMIT with "1 reply every 45 seconds per IP" on 2026-11-11, so a lab gets about one model call per
interaction on the public site. Labs batch their stages into one call and say which route answered.

## First audit (general ladder)

The first audit of 2026-11-11, on the general ladder, from screenshots at 1440 px and a reading of each lab's code.
It stays as the record of the first look. The ratings by each lab's own axes follow it and supersede it.

| Lab | Page | G0 | Weakest axis at G0 | G1 | Shipped |
|---|---|---|---|---|---|
| Black Hole | bh_animation_page.html | 4 | Intelligence 1 | | |
| Dimensions | md_animation_page.html | 4 | Data 1 | | |
| Exomania | exomania.html | 4 | Intelligence 2 | | |
| Heptapod Codec | heptapod.html | 2 | Model 2: a closed-lexicon lookup | | |
| Interactive Timeline | none | 0 | all | | |
| Time-Slip: The Last Witness | none | 0 | all | | |
| Alternate Reality Scenarios | altverse.html | 3 | Intelligence 2: no model reachable on the public site | | |
| The Figure | figure.html | 3 | Graphics 2 | | |
| Primordial Seed | seed.html | 3 | Graphics 2 | | |
| AI Content Studio | none | 0 | all | | |
| Personalized Learning | none | 0 | all | | |
| Social Manager | none | 0 | all | | |
| Token EKG | token-ekg.html | 1 | Model 1: measures nothing real | | |
| DATASPACE | dataspace.html | 3 | Model 2 | | |
| Predictive Analytics | none | 0 | all | | |
| AI in Healthcare | none | 0 | all | | |
| Virtual Mentorship | none | 0 | all | | |
| Learning Pathways | none | 0 | all | | |
| Habit Formation | none | 0 | all | | |
| Mindfulness | none | 0 | all | | |
| Honesty Decoder | honesty-decoder.html | 3 | Interaction 2 | | |
| The Roaster | roaster.html | 3 | Model 2 | | |
| Project Management | none | 0 | all | | |
| Automation & Integration | none | 0 | all | | |
| Rapid Prototyping | none | 0 | all | | |
| VR Fitness | none | 0 | all | | |
| Community Challenges | none | 0 | all | | |
| Personalized Plans | workout-plans.html | 1 | Model 1: a form in front of a model call | | |
| AI Meme Lab | memes.html | 2 | Model 2 | | |
| Trending Topics | trending.html | 3 | Graphics 2 | | |
| User-Generated Content | none | 0 | all | | |
| Labs hub | index.html | 3 | Data 2: counts only | | |

## Generation sheets

Each pass appends its sheet here, newest first.
