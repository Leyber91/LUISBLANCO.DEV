# LABS LEVELS

The level system for the labs at luisblanco.dev/labs, and each lab's rating before and after its evolution pass.
Started 2026-11-11 on Luis's order: every lab rises on every axis, and the developed ones rise five levels.

## The axes

Nine axes, from the evolve skill's niche grid, named for what a lab is. A lab is rated on each.

| Axis | What "up" means |
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

## The ladder

The same ten levels on every axis.

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

A lab's level is the median of its nine axes, and it holds that level only if no axis sits more than two levels below
it. A beautiful shell with an empty model does not count.

Targets for this pass: every lab at 7 or higher, no axis below 5. Black Hole, Exomania and Dimensions at 9.

## The public model route (measured 2026-11-11)

The site is static and holds no key. Every lab reaches a model through labs/assets/js/ai/llm.js, which tries the
visitor's local Ollama, then a key the visitor brings, then a deployed worker if one exists, then
text.pollinations.ai, then the lab's own deterministic engine. The keyless public route answered HTTP 402
FREE_LIMIT with "1 reply every 45 seconds per IP" on 2026-11-11, so a lab gets about one model call per
interaction on the public site. Labs batch their stages into one call and say which route answered.

## Ratings

G0 is the audit of 2026-11-11, from screenshots at 1440 px and a reading of each lab's code. G1 is the rating after
its pass, written by the pass that built it and checked against its screenshots.

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
