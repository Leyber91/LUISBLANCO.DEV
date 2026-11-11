# LABS LEVELS

The level system for the labs at luisblanco.dev/labs, and each lab's rating before and after its evolution pass.
Started 2026-11-11 on Luis's order: every lab rises on every axis, and the developed ones rise five levels.

## The anchor (Luis, 2026-11-11, supersedes the calibration below)

Level 5 is the lab's fiction made real. For the Heptapod lab, in his words: "imagine that you're in the movie Arrival,
right at the end, you have the visitor, you can just click on a keyboard and translate and it will show it to the
heptapod civilization... I have a pod and I can translate what I say to heptapod and it will show the heptapod
language", at the film's level of detail, with the algorithms that define every shape and the language itself.
"Imagine what level 10 is. And this goes for every single project on labs. Every single project on labs is a marvel
of what thought, research, planning and your capacity can do. Not less than that."

Each lab therefore gets a deep pass, one lab at a time: investigate (the references, the science, the state of the
art, studied as specifications), assess (today's code against the bar), plan (the full design, and a recalibrated
ladder on which rung 5 is that lab's fiction made real and rungs 6 to 10 go beyond it), then build, verify and ship.

The per-lab ladders written on 2026-11-11 (v1, below) anchored rung 10 near the best existing web demo. That is about
a full scale too low. They stay as the record of each lab's first audit and as evidence for its deep pass; each is
replaced by its v2 ladder when that lab's deep plan is done.

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

## Ratings by lab axes

<!-- levels:table:begin -->
| Lab | Axes | G0 | Latest | Level | Weakest axis | Next rung |
|---|---|---|---|---|---|---|
| Labs hub | 11 | 1 | G0 | 1 | climb-display, lab-previews at 0 | Each card prints its lab level (0 to 10) read at runtime from labs/assets/js/config/levels.data.js; changing a level in labs/levels/<id>.json and running `node tools/levels.mjs write` changes the card with no hub edit. |
| Black Hole | 12 | 1 | G0 | 1 | infall-clocks at 0 | The page states at least one time effect with a number (for example, a static clock at 1.5 r_s ticks at 58% of a distant clock's rate). |
| Dimensional Test | 12 | 2 (capped) | G0 | 2 (capped) | flatland-slicing, curved-fibred-spaces at 0 | A static picture or a sentence describes a cross-section of the tesseract. |
| Exomania | 12 | 2 | G0 | 2 | system-model, population-space, frame-budget-reach at 1 | A system view draws the star and this planet's orbit at its catalogue semi-major axis, with a scale bar in AU. |
| Heptapod Codec | 11 | 1 | G0 | 1 | grammar-morphology, semagram-composition, decoder-noise, english-parser, script-identity, semasiography-explained at 1 | Negation is grammar: 'not' or 'never' adds a negation operator to the stroke of the predicate it scopes over, and no separate negation element is drawn; 'we offer' and 'we do not offer' differ by that operator. |
| Interactive Timeline | 12 | 0 | G0 | 0 | chronology-engine, divergence-structure, deep-time-zoom, single-accent-language, deep-time-navigation, cross-dimension-compare, canon-fidelity, spoiler-boundary, grounded-answers, physics-evidence, load-and-reach, engine-architecture at 0 | Events carry a hand-typed date label only; their order on the page comes from list order, not from a number. |
| Time-Slip: The Last Witness | 12 | 0 | G0 | 0 | dilation-fidelity, tide-energy, deep-time-world, horizon-cinematics, screen-sound, question-agency, witness-record, witness-mind, model-contribution, relativity-explanation, reach, engine-shape at 0 | Outside elapsed time is a fixed figure in the text (such as '10,000 years'), not computed from any input. |
| Alternate Reality Scenarios | 12 | 2 | G0 | 2 | divergence-propagation, model-contribution, baseline-grounding, causal-explanation at 1 | Code reads at least one numeric divergence parameter (e.g. g in m/s2, c in km/s) and computes at least 3 world values from it by formulas visible in the source. |
| The Figure | 12 | 2 | G0 | 2 | run-corpus at 0 | 1 complete real run (every proposer and aggregator text exactly as a model returned it) is stored in the page or a file with model id and date, and is what the page replays when the route fails. |
| Primordial Seed | 12 | 2 | G0 | 2 | autonomous-growth at 1 | The run stops on a computed condition (a depth cap or a measured plateau) and, after the run finishes, the readout names the condition that stopped it. |
| AI Content Studio | 12 | 0 | G0 | 0 | voice-rules, readability, meaning-guard, revision-accountability, diff-view, rule-authoring, edit-review, editorial-marks, provenance, mechanism-explanation, lint-latency, pipeline-modules at 0 | One voice rule runs: a regex flags dash pivots (a spaced em or en dash joining two clauses) in the pasted draft. |
| Personalized Learning | 12 | 0 | G0 | 0 | knowledge-structure, assessment-procedure, location-calibration, fringe-path, tutor-model, item-bank, knowledge-map, design-language, learner-control, certainty-explanation, inference-reach, domain-architecture at 0 | A flat list of at least 10 items from the mathematics behind neural networks (dot product, matrix product, derivative, chain rule and so on), with no prerequisite relation. |
| Social Manager | 12 | 0 | G0 | 0 | posting-windows, decay-curves, composer-checks, uncertainty-views, instrument-style, export-ingestion, calendar-export, model-contribution, uncertainty-literacy, local-performance, local-only, pipeline-shape at 0 | A fixed list of 'best times' is shown and it stays the same when a different file is loaded. |
| Token EKG | 11 | 2 | G0 | 2 | tokenizer-fidelity at 0 | A text field shows the character count and UTF-8 byte count of what the visitor types, the raw units every tokenizer splits. |
| DATASPACE | 12 | 2 | G0 | 2 | rate-distortion, run-record, compression-literacy at 1 | The requested budget and the capsule's achieved length are both shown in words for each run, so the visitor sees whether the model obeyed the budget. |
| Predictive Analytics | 12 | 0 | G0 | 0 | score-model, season-sim, forecast-calibration, rival-benchmark, probability-graphics, forecast-grammar, what-if, data-provenance, self-audit, mechanism-explained, compute-budget, engine-architecture at 0 | A static table of match probabilities typed into the page; nothing is computed. |
| AI in Healthcare | 12 | 0 | G0 | 0 | news2-fidelity, cohort-truth, learned-model, evaluation, failure-slices, patient-explanation, ward-views, chart-language, what-if-bench, checked-narrative, fit-budget-reach, engine-architecture at 0 | A NEWS2 aggregate is computed from the seven Chart 1 parameters (respiration rate, SpO2, air or oxygen, systolic BP, pulse, consciousness, temperature) for one observation set and shown as a number. |
| Virtual Mentorship | 12 | 0 | G0 | 0 | retrieval-fidelity, citation-verifier, refusal-calibration, model-contribution, answer-adequacy, evidence-view, citation-apparatus, inquiry-controls, corpus-provenance, mechanism-explained, query-speed-reach, pipeline-modules at 0 | Passages containing at least one query word are returned, ranked by a score that rises with the number of distinct query words matched. |
| Learning Pathways | 12 | 0 | G0 | 0 | memory-model, prereq-graph, retention-calibration, path-graphics, mastery-grammar, practice-session, plan-control, practice-log, decomposition-ai, spacing-explained, scheduler-budget, engine-architecture at 0 | A fixed review calendar typed into the page (for example day 1, 3, 7, 30), the same for every item whatever the answers. |
| Habit Formation | 12 | 0 | G0 | 0 | automaticity-fit, fit-honesty, miss-cost, curve-views, miss-grammar, check-in-loop, evidence-provenance, local-first, coach, habit-science, reach, engine-architecture at 0 | A rising automaticity curve is shown, at least as a fixed picture identical for every visitor. |
| Mindfulness | 12 | 0 | G0 | 0 | pacer-timing, resonance-assessment, heart-signal, session-record, soundscape, ink-field, calm-language, practice-control, guidance, grounding, steady-reach, instrument-architecture at 0 | A breathing instruction or a looping CSS animation of one breath cycle is on the page. |
| Honesty Decoder | 11 | 2 | G1 | 3 | claim-decomposition, row-truth, register-style, method-explanation, reach-and-load at 1 | Deterministic engine: a pasted claim is split into atomic sub-claims by rule (clause and conjunction splitting, extraction of load-bearing qualifiers such as live, real, autonomous, general, every), shown as a list. |
| The Roaster | 12 | 2 | G0 | 2 | hype-spans, claim-units, reality-grade, reach at 1 | A keyword list of at least 15 hype terms (conscious, sentient, AGI, understands, reasons, thinks, revolutionary) is matched in code against any claim, and the matches are listed on the page with the network off. |
| Project Management | 12 | 0 | G0 | 0 | throughput-monte-carlo, flow-metrics, forecast-backtest, flow-forecast-charts, odds-visual-grammar, forecast-controls, reference-datasets, csv-intake, forecaster-self-audit, odds-explanation, simulation-budget, engine-architecture at 0 | A completion date typed into the page, or derived from a typed average rate; nothing is computed from item data. |
| Automation & Integration | 12 | 0 | G0 | 0 | execution-semantics, transform-language, trigger-fidelity, canvas-views, editor-style, graph-editing, run-inspection, api-connectors, model-node, flow-legibility, runtime-reach, flow-contract at 0 | A page shows a flow diagram and a Run control that plays a run over it when pressed; a canned animation over a fixed diagram qualifies. |
| Rapid Prototyping | 12 | 0 | G0 | 0 | hypothesis-lint, decision-stats, generation-yield, sandbox, live-editor, version-views, evidence-log, decision-record, notebook-style, method-explanation, loop-latency, pipeline-modules at 0 | A free-text hypothesis field is required, and the generate button stays disabled while it is empty. |
| VR Fitness | 12 | 0 | G0 | 0 | pose-angle-pipeline, rep-count-truth, form-rules, ground-truth-data, motion-views, arena-style, reach-game, adaptive-play, coach-contribution, count-explained, inference-budget, pipeline-shape at 0 | A pose model runs in the browser on the webcam feed (MediaPipe Pose Landmarker or TensorFlow.js MoveNet) and returns keypoints per frame, drawn or logged, with no angle computed. |
| Community Challenges | 12 | 0 | G0 | 0 | rate-estimators, rank-uncertainty, challenge-sim, gaming-resistance, uncertainty-views, board-grammar, challenge-play, results-provenance, board-auditor, ranking-literacy, compute-reach, engine-architecture at 0 | A static leaderboard typed into the page; no rate is computed. |
| Personalized Plans | 12 | 1 | G0 | 1 | volume-map at 0 | Each lift in the exercise data carries its primary muscles, and each day card lists the muscles it trains, derived from those tags rather than from the split label. |
| AI Meme Lab | 12 | 2 | G0 | 2 | model-contribution, punch-down-guard at 1 | One model call through a local Ollama route asks for angles, slate, scores and winner as JSON, streams its reasoning into the reasoning panel, and falls back to the engine when the JSON does not parse. |
| Trending Topics | 12 | 2 | G0 | 2 | rise-validation, topic-merging, scan-memory at 0 | Each scan's top 10 rising calls are stored with time, source, item id and score. |
| User-Generated Content | 12 | 0 | G0 | 0 | chain-integrity, author-signatures, fork-merge, url-codec, archive-interchange, fork-tree, ledger-style, co-writing, model-contribution, proof-literacy, load-reach, protocol-shape at 0 | Contributions are stored as a plain list with no hash; editing a past contribution leaves no trace. |
<!-- levels:table:end -->

## Generation sheets

Each pass appends its sheet here, newest first.
