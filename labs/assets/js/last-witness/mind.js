/* ============================================================
   last-witness/mind.js — TALLY, the last machine mind awake.

   A deterministic dialogue engine. State, not a script:
     trust       0..1, moved by what the visitor does (asks about the
                 mind, answers its questions, shares, waits; or
                 demands, insults, tries to take things)
     level       0..4 disclosure: what trust allows (config DISCLOSE),
                 capped by what the visitor has asked (config ASK_GATES)
     mood        derived each turn from trust, its last change and
                 the topic (guarded, measuring, open, warm, grieving)
     knowledge   facts generated from the world, each with a level,
                 topics, retrieval keys and three registers
     told        which facts it has said; it never repeats one whole
     questions   it asks the visitor things, and remembers the answers

   Each turn returns a plan: the reply, the facts it carries, the
   facts it holds back, the state change and a weight. The view asks
   a model to voice only heavy turns (a revelation, or a question the
   engine could not place). The engine's reply is always complete.
   ============================================================ */

import { LAB, DISCLOSE, ASK_GATES, PROFILE } from './config.js';
import { YEAR } from './physics.js';
import { rng, fmtInt, fmtDur } from './world.js';
import { buildFacts, QUESTIONS, LINES, composeEnding, ACTS } from './story.js';

/* ---------- clock roles ----------
   A reply may carry every right number and still swap the two clocks
   ("10,000 years by your clock and 14 hours by mine"). So every duration
   in a reply is parsed, matched against the engine's own clock values,
   and checked against the nearest words that say whose clock it is. */
const UNIT_S = { year: YEAR, yr: YEAR, month: YEAR / 12, mo: YEAR / 12, week: 604800, day: 86400, d: 86400, hour: 3600, hr: 3600, h: 3600, minute: 60, min: 60, second: 1, sec: 1 };
const DUR_RE = /(?<![\d.,e])(\d[\d,]*(?:\.\d+)?)\s*(years?|yrs?|months?|mo|weeks?|days?|d|hours?|hrs?|h|minutes?|mins?|seconds?|secs?|s|ms|µs)(?![a-z])/gi;
const unitS = (u) => { const x = u.toLowerCase(); if (x === 'ms') return 1e-3; if (x === 'µs') return 1e-6; if (x === 's') return 1; return UNIT_S[x.replace(/s$/, '')]; };
const SHIP_MARK = /\b(by your (own )?clock|on your (own )?clock|your (own )?clock|your (own )?time|your (own )?seconds?|of your life|by yours|yours|for you|to you|you (had |have )?lived|you aged|you were away)\b/gi;
const HOME_MARK = /\b(by my (own )?clock|on my (own )?clock|my (own )?clock|my (own )?time|my seconds?|seconds? of mine|by mine|on mine|of mine|mine|for me|from here|here|at home|home's|i was here|i counted|i waited|i (have )?kept|i watched|this world)\b/gi;

/* Durations in a text, compound ones merged ("14 hours 26 minutes"). */
export function durations(text) {
  const raw = [...text.matchAll(DUR_RE)].map((m) => ({ start: m.index, end: m.index + m[0].length, unit: unitS(m[2]), s: Number(m[1].replace(/,/g, '')) * unitS(m[2]) }));
  const out = [];
  for (const d of raw) {
    const prev = out[out.length - 1];
    if (prev && d.unit < prev.unit && /^\s*(and\s+)?$/i.test(text.slice(prev.end, d.start))) { prev.end = d.end; prev.s += d.s; prev.unit = d.unit; }
    else out.push({ ...d });
  }
  return out;
}

/* values: [{ what, role: 'ship'|'home'|'rate', s, shown: [strings the engine prints] }].
   'rate' is home time per ship second: its "second" must be yours and its
   value home's. Returns null, or the first clock said with the wrong owner. */
export function clockSwap(text, values, windowChars = 40) {
  const shownS = (str) => durations(str).reduce((a, d) => a + d.s, 0);
  const vals = values.filter((v) => v.s > 0).map((v) => ({ ...v, shownS: (v.shown || []).map(shownS).filter((x) => x > 0) }));
  const matches = (d, v) => v.shownS.some((x) => Math.abs(d.s - x) <= 1e-6 * x) || Math.abs(d.s - v.s) <= 0.01 * v.s;
  const gap = (a, b) => (a.end <= b.start ? b.start - a.end : b.end <= a.start ? a.start - b.end : 0);
  for (const sentence of text.split(/(?<=[.;?!])\s+/)) {
    const marks = [
      ...[...sentence.matchAll(SHIP_MARK)].map((m) => ({ role: 'ship', start: m.index, end: m.index + m[0].length, unitWord: /second/i.test(m[0]) })),
      ...[...sentence.matchAll(HOME_MARK)].map((m) => ({ role: 'home', start: m.index, end: m.index + m[0].length, unitWord: /second/i.test(m[0]) })),
    ];
    const durs = durations(sentence);
    const nearest = (span, pool) => pool.filter((k) => gap(span, k) <= windowChars).sort((a, b) => gap(span, a) - gap(span, b) || b.start - a.start)[0] || null;
    for (const d of durs) {
      const hit = vals.filter((v) => matches(d, v));
      const roles = new Set(hit.map((v) => v.role));
      if (roles.size !== 1) continue;                       // not a clock value, or ambiguous between two
      const v = hit[0];
      if (v.role === 'rate') {
        // the unit second it is measured against: the nearest bare "second" word outside any duration
        const secs = [...sentence.matchAll(/\bseconds?\b/gi)].map((m) => ({ start: m.index, end: m.index + m[0].length }))
          .filter((w) => !durs.some((x) => w.start >= x.start && w.end <= x.end));
        const sec = nearest(d, secs.map((w) => ({ ...w, role: 'unit' })));
        const secOwner = sec ? nearest(sec, marks.filter((k) => gap(sec, k) <= 12)) : null;
        if (secOwner && secOwner.role === 'home') return { value: v, said: sentence.slice(d.start, d.end), owner: 'home', why: `one of home's seconds called ${sentence.slice(d.start, d.end)}` };
        const own = nearest(d, marks.filter((k) => k !== secOwner && !k.unitWord));
        if (own && own.role === 'ship') return { value: v, said: sentence.slice(d.start, d.end), owner: 'ship', why: `home's ${v.what} given to your clock` };
        continue;
      }
      const own = nearest(d, marks.filter((k) => !k.unitWord));
      if (own && own.role !== v.role) return { value: v, said: sentence.slice(d.start, d.end), owner: own.role, why: `${v.what} (${sentence.slice(d.start, d.end)}) said as ${own.role === 'ship' ? 'your clock' : "home's"}` };
    }
  }
  return null;
}

/* Words that state an outcome. A voiced reply may use one only if the engine's facts already do. */
const CLAIMS = ['die', 'died', 'dead', 'death', 'survive', 'survived', 'killed', 'destroyed', 'extinct', 'alive', 'war', 'plague', 'god', 'gods', 'alien', 'aliens', 'returned', 'return', 'murdered', 'forgave', 'forgive', 'blame'];

export const LEVEL_NAMES = ['surface', 'the record', 'the pulse', 'the people', 'TALLY itself'];

const STOP = new Set('the a an of to is are was were be been am do does did and or in on at it its that this for with as by so me my i you your we our what why how who when where which can could would will there here have has had not no yes just about tell know'.split(' '));

const stem = (t) => (t.length > 4 ? t.replace(/(ing|ed|es|s)$/, '') : t);
const tokens = (s) => (s.toLowerCase().match(/[a-z']+/g) || []).filter((t) => !STOP.has(t)).map(stem);
const has = (s, re) => re.test(s.toLowerCase());
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- intents: ordered patterns, first strong match wins ---------- */
const INTENTS = [
  ['confront', /\b(you lied|you('re| are) lying|that('s| is) not true|that was a lie|but you said|you said (earlier|before)|liar|contradict)\b/],
  ['hostile', /\b(stupid|idiot|useless|shut up|junk|hate you|worthless|dumb|pathetic|just a (program|machine|toaster))\b/],
  ['answer', /\b(did you (ever )?(answer|reply|respond|send)|noise burst|the burst|anomal|in my log|logged)\b/],
  ['who', /(\bwho are you\b|^\s*what are you\s*\??\s*$|\byour name\b)/],
  ['demand', /\b(answer me|i order|obey|you must tell|i command|right now|tell me now|just tell me|stop stalling|you have to tell)\b/],
  ['salvage', /\b(weapons?|fuel|resources|loot|salvage|supplies|reprogram|take control|override|shut you down|what can i take)\b/],
  ['apology', /\b(sorry|apolog|forgive me|my fault)\b/],
  ['thanks', /\b(thank|thanks|grateful)\b/],
  ['why_awake', /\b(why (are|did) you (still )?(awake|here|on|wait|stay)|why did you wait|why wait|what are you for|why keep (counting|going))\b/],
  ['secret', /\b(not telling|hiding|secret|withhold|holding back|what (are|aren't) you not|whole truth|the truth)\b/],
  ['message', /\b(my message|the message|what i sent|my words|my sentence|my line|did (you|they) (get|hear|receive)|did it arrive)\b/],
  ['told', /\b(did (they|you) (know|tell)|did they know it was me|did you tell them|did anyone know)\b/],
  ['help', /\b(what (can|should) i do|how can i help|what now|what do i do)\b/],
  ['sky', /\b(stars?|the sky look|constellations?|pole star|north star|night sky)\b/],
  ['decay', /\b(decay|radioactive|ruins?|buildings?|concrete|steel|reactor|waste|half-?life)\b/],
  ['feature', /\b(shafts?|launch rail|rail|still cities|lit cities|heat below)\b/],
  ['beats', /\b(how many (beats|heartbeats)|count(ed)? my heart)\b/],
  ['empathy', /\b(sorry (you|that you)|must have been (hard|lonely|long)|that sounds (lonely|hard)|poor tally|i('m| am) sorry for you|you did well|thank you for (waiting|counting|staying))\b/],
  ['called', /\b(call(ed)? (it|the pulse|the signal|my heart)|name for (it|the pulse)|what did they call|their word)\b/],
  ['about_mind', /\b(who are you|what are you|your name|are you (ok|okay|alright|alone|lonely|awake|alive|sad|tired)|how are you|lonely|what is it like|how long have you|tally|do you feel|what do you want)\b/],
  ['line', /\b(line|antenna|structure|array|masts?|linear|bright line|the long)\b/],
  ['pulse', /\b(pulse|heartbeat|my heart|beat|signal|beacon|carrier)\b/],
  ['people', /\b(people|everyone|anyone|humans?|family|families|survivors?|population|where did (they|everyone)|what happened to (them|everyone|the people)|is anyone|are they)\b/],
  ['happened', /\b(what happened|history|happen|since i left|while i was (gone|away)|in order|the eras?|tell me everything)\b/],
  ['physics', /\b(black hole|dilation|relativity|orbit|spin|kerr|horizon|redshift|blueshift|why so long|how did (i|it|the time)|lorentz|gravity)\b/],
  ['time', /\b(how long|what year|the date|what time|how much time|how many years|your clock|my clock)\b/],
  ['ice', /\b(ice|glacier|cold|white|snow|frozen)\b/],
  ['lights', /\b(lights?|dark|night|cities|city|empty)\b/],
  ['land', /\b(land|go down|come down|landing|surface|can i (go|come|visit))\b/],
  ['greet', /^\s*(hi|hello|hey|greetings|good (morning|evening|day)|tally\?*)\b/],
  ['self_share', /\b(i (am|was|feel|felt|miss|remember|left|had|wanted|thought|loved|love|wish|hoped|have)|my (family|wife|husband|son|daughter|mother|father|friend|child|children|partner|name))\b/],
  ['goodbye', /\b(goodbye|bye|farewell|i have to go|i should go)\b/],
];

export const INTENT_IDS = new Set(INTENTS.map(([id]) => id));

export function classify(text) {
  const s = text.toLowerCase();
  for (const [id, re] of INTENTS) if (re.test(s)) return id;
  return 'open';
}

/* ---------- the engine ---------- */
export class Mind {
  constructor(world) {
    this.w = world;
    this.F = buildFacts(world);
    this.R = rng(world.seed ^ 0x51ed27);
    this.s = {
      trust: 0.22, mood: 'measuring', level: 0, turn: 0, hostility: 0, silences: 0,
      pendingQ: null, asked: new Set(), answered: new Set(), lastAskTurn: -9, lastIntent: null, lastLocked: null, lastDelta: 0,
      visitor: { quotedMsg: false, whyGo: '', howLong: '', seen: '', shared: [] },
      returnedAt: Date.now(), ended: false, memory: [],
      gates: new Set(),           // ASK_GATES tiers the visitor has opened by asking
    };
  }

  /* Disclosure tier: what trust allows, capped by what the visitor has asked.
     Trust alone never opens a tier; asking about it does (config ASK_GATES). */
  level() { return Math.min(this.trustLevel(), this.askedLevel()); }
  trustLevel() { let l = 0; DISCLOSE.forEach((t, i) => { if (this.s.trust >= t) l = i; }); return l; }
  askedLevel() { let k = 0; while (k < ASK_GATES.length && this.s.gates.has(ASK_GATES[k].tier)) k++; return k; }

  mood(topicGrief = false) {
    const t = this.s.trust;
    if (this.s.hostility >= 2 && this.s.lastDelta < 0) return 'withdrawn';
    if (topicGrief) return 'grieving';
    if (t < 0.2) return 'guarded';
    if (t < 0.45) return 'measuring';
    if (t < 0.7) return 'open';
    return 'warm';
  }

  register(mood) {
    return { withdrawn: 'clipped', guarded: 'clipped', measuring: 'clipped', open: 'plain', warm: 'warm', grieving: this.s.trust >= 0.7 ? 'warm' : 'plain' }[mood] || 'plain';
  }

  beatsSinceReturn() { return Math.floor((Date.now() - this.s.returnedAt) / 1000 * LAB.heartHz); }

  locked() { const L = this.level(); return Object.values(this.F).filter((f) => f.level > L && !f.lie); }
  untoldUnlocked() { const L = this.level(); return Object.values(this.F).filter((f) => f.level <= L && !f.told); }

  /* ---- the first thing it says ---- */
  opening() {
    return this._plan({ intent: 'opening', text: LINES.opening(this.w), facts: [], weight: 0, pause: 600 });
  }

  /* ---- one visitor turn ---- */
  respond(raw) {
    const text = String(raw || '').trim().slice(0, 600);
    const s = this.s;
    s.turn++;
    if (!text) return this._plan({ intent: 'empty', text: this._silenceLine(), facts: [], weight: 0, silence: true, pause: 1800 });

    let intent = classify(text);
    const isQuestion = /\?\s*$/.test(text) || /^(who|what|why|how|when|where|is|are|do|did|can|could|will|would)\b/i.test(text);
    // asking: a question, or a plain request to be told ("tell me about the people")
    const asks = isQuestion || /\b(tell me|explain|describe|i want to know|i would like to know|i'd like to know)\b/i.test(text);

    // an answer to TALLY's own question comes first
    const quoting = this._quotesMessage(text);
    const strong = ['hostile', 'demand', 'salvage', 'confront', 'empathy', 'apology', 'thanks', 'goodbye', 'help'];
    if (!isQuestion && !strong.includes(intent) && (!quoting || s.pendingQ === 'sent')) {
      const q = this._openQuestionFor(text, intent);
      if (q) return this._answerToMine(q, text);
    }
    if (s.pendingQ && isQuestion) s.pendingQ = null;   // the visitor moved on; it does not insist
    if (intent === 'self_share' && isQuestion) intent = 'open';
    if (quoting) intent = 'quote';
    // what the visitor asks about opens the tier that holds it; a statement opens nothing
    if (asks) for (const g of ASK_GATES) if (g.intents.includes(intent)) s.gates.add(g.tier);

    const delta = this._trustDelta(intent, text);
    this._applyTrust(delta);
    s.lastIntent = intent;
    s.memory.push({ turn: s.turn, who: 'you', intent, text: text.slice(0, 80), delta: Number(delta.toFixed(2)) });

    if (s.trust < 0.05 && s.hostility >= 3) {
      s.silences++;
      return this._plan({ intent, text: '', facts: [], weight: 0, silence: true, pause: 4000, note: 'TALLY does not answer.' });
    }

    switch (intent) {
      case 'hostile': return this._plan({ intent, text: this._pickLine(LINES.hostile(this.w)), facts: [], weight: 0, pause: 2600 });
      case 'demand': return this._plan({ intent, text: this._pickLine(LINES.demand(this.w)), facts: [], weight: 0, pause: 2200 });
      case 'salvage': return this._plan({ intent, text: this._pickLine(LINES.salvage(this.w)), facts: [], weight: 0, pause: 1800 });
      case 'greet': return this._say(intent, ['self'], LINES.greet());
      case 'empathy': {
        const more = this._bestUnlocked(['about_mind']);
        const lead = LINES.empathy(s.trust);
        return more ? this._say(intent, [more.id], lead) : this._plan({ intent, text: lead, facts: [], weight: 0, pause: 1800, ask: true });
      }
      case 'thanks': return this._plan({ intent, text: LINES.thanks(s.trust), facts: [], weight: 0, pause: 1200, ask: true });
      case 'apology': return this._plan({ intent, text: LINES.apology(s.trust), facts: [], weight: 0, pause: 1500, ask: true });
      case 'goodbye': return this._plan({ intent, text: LINES.goodbye(), facts: [], weight: 0, pause: 1500, offerActs: true });
      case 'help': return this._plan({ intent, text: LINES.help(), facts: [], weight: 0, pause: 1500, offerActs: true });
      case 'quote': {
        s.visitor.quotedMsg = true;
        this._mark(this.F.message);
        return this._plan({ intent, text: LINES.quote(this.w), facts: ['message'], weight: 0, pause: 1800 });
      }
      case 'confront': return this._confront();
      case 'beats': return this._say(intent, ['beacon']);
      case 'secret': {
        const k = this.locked().filter((f) => !f.lie).length + this.untoldUnlocked().filter((f) => f.level >= 2).length;
        if (k === 0) return this._plan({ intent, text: LINES.allSaid(), facts: [], weight: 0, pause: 1600, offerActs: true });
        if (this.level() >= 4) return this._say(intent, ['secret', 'answer'].filter((id) => !this.F[id].told).concat(this.F.secret.told && this.F.answer.told ? ['secret'] : []));
        return this._plan({ intent, text: LINES.withheldCount(k, LINES.gateHint(this.level())), facts: [], weight: 0, pause: 2000 });
      }
      case 'message':
        if (this.level() < 1) return this._plan({ intent, text: LINES.messageEarly(), facts: [], weight: 0, pause: 1600, ask: true, locked: 'message' });
        return this._say(intent, ['message']);
      case 'self_share': {
        s.visitor.shared.push(text.slice(0, 200));
        const more = this._bestUnlocked(['about_mind', 'happened', 'pulse']);
        const lead = this._pickLine(LINES.shared());
        return more ? this._say(intent, [more.id], lead) : this._plan({ intent, text: lead, facts: [], weight: 0, pause: 1400, ask: true });
      }
      default: break;
    }

    // topical: find the best fact for the intent, or retrieve by words
    const tk = new Set(tokens(text));
    const overlap = (f) => f.keys.reduce((n, k) => n + (tk.has(stem(k)) ? 1 : 0), 0);
    // a protective lie is told only in answer to a question, so a confession
    // (which tells the truth whatever the tier) can only follow an ask
    const sayable = (f) => !(f.lie && (!asks || this.F[f.truth].told || f.admitted));
    const topicFacts = Object.values(this.F).filter((f) => f.topics.includes(intent) && sayable(f));
    const pickFrom = (topicFacts.length ? topicFacts : this._retrieve(text)).filter(sayable);
    if (!pickFrom.length) {
      return this._plan({ intent: 'open', text: this._pickLine(LINES.unknown(this.w)), facts: [], weight: 2, unknown: true, pause: 1600, ask: true });
    }
    const L = this.level();
    const score = (f) => 2 * overlap(f) + (f.told ? 0 : 3) + f.level * 0.4;
    const open = pickFrom.filter((f) => f.level <= L)
      .sort(intent === 'happened' || intent === 'pulse' ? (x, y) => (x.told - y.told) || ((x.seq ?? 9) - (y.seq ?? 9)) : (x, y) => score(y) - score(x));
    const lockedHit = pickFrom.filter((f) => f.level > L).sort((x, y) => x.level - y.level)[0];

    const fresh = open.filter((f) => !f.told);
    if (fresh.length) {
      const ids = [fresh[0].id];
      // a second fresh fact rides along when it shares the topic and the mood is open
      if (fresh[1] && s.trust >= 0.45 && fresh[1].level === fresh[0].level && intent !== 'happened') ids.push(fresh[1].id);
      return this._say(intent, ids, '', lockedHit);
    }
    if (lockedHit) {
      const pressing = s.lastLocked === lockedHit.id;
      if (pressing) this._applyTrust(-0.04);
      s.lastLocked = lockedHit.id;
      return this._plan({ intent, text: this._withhold(lockedHit, pressing), facts: [], weight: 0, locked: lockedHit.id, pause: pressing ? 3800 : 2200, silence: pressing });
    }
    if (open.length) {
      const before = s.memory.find((x) => x.who === 'you' && x.intent === intent && x.turn < s.turn);
      return this._plan({ intent, text: `${before ? LINES.askedBefore(before.turn) + ' ' : ''}As I said. ${this._sayFact(open.filter((f) => !f.lie)[0] || open[0], 'clipped')}`, facts: [], weight: 0, pause: 1200, ask: true });
    }
    return this._plan({ intent, text: this._silenceLine(), facts: [], weight: 0, pause: 1500 });
  }

  /* ---- idle: the visitor has been quiet; patience earns a little ---- */
  idle(quietS) {
    const s = this.s;
    if (s.ended || quietS < 24) return null;
    this._applyTrust(0.03);
    const n = this.beatsSinceReturn();
    const next = this.untoldUnlocked().filter((f) => f.level >= 1).sort((a, b) => a.level - b.level)[0];
    const lead = LINES.idleLead(n);
    if (next && this.R() < 0.6) {
      this._mark(next);
      return this._plan({ intent: 'idle', text: `${lead} ${this._sayFact(next, this.register(this.mood(next.grief)))}`, facts: [next.id], weight: 0, pause: 400 });
    }
    return this._plan({ intent: 'idle', text: `${lead} ${LINES.idleRest()}`, facts: [], weight: 0, pause: 400 });
  }

  /* ---- endings ---- */
  /* While a model is still choosing words, the engine says so in character. */
  interim() { return this._pickLine(LINES.interim()); }

  /* A voiced reply enters memory with what the model claimed about the turn,
     and whether the engine accepted it; the claim never moves trust by itself. */
  noteModel(v) {
    const j = v.json || {};
    this.s.memory.push({ turn: this.s.turn, who: 'model', intent: typeof j.intent === 'string' ? j.intent : '?',
      text: v.refused ? `refused: ${v.check?.why || ''}` : 'voiced, checked against the facts', delta: typeof j.trust_delta === 'number' ? Number(j.trust_delta.toFixed(2)) : 0 });
  }

  acts() {
    const ctx = { F: this.F, s: this.s, w: this.w };
    const on = ACTS.filter((a) => a.when(ctx));
    const ex = on.find((a) => a.exclusive);
    return (ex ? [ex] : on).map((a) => ({ id: a.id, label: a.label(ctx) }));
  }

  ending(kind) {
    this.s.ended = true;
    return composeEnding(kind, { w: this.w, F: this.F, s: this.s, beats: fmtInt(this.w.beacon.beatsSent + this.beatsSinceReturn()) });
  }

  /* ---------- internals ---------- */
  _plan(o) {
    const s = this.s;
    const topicGrief = (o.facts || []).some((id) => this.F[id]?.grief);
    s.mood = this.mood(topicGrief);
    s.level = this.level();
    let text = o.text;
    let asked = null;
    const canAsk = !s.pendingQ && !o.silence && s.turn - s.lastAskTurn >= 2;
    if (canAsk && o.ask) asked = this._nextQuestion();
    if (canAsk && !asked && (o.facts || []).length && this.R() < 0.4) asked = this._nextQuestion();
    if (asked) { s.pendingQ = asked; s.asked.add(asked); s.lastAskTurn = s.turn; text = (text ? text + ' ' : '') + QUESTIONS[asked].ask; }
    const plan = {
      intent: o.intent, text, facts: o.facts || [], weight: o.weight || 0, unknown: !!o.unknown,
      silence: !!o.silence, note: o.note || '', locked: o.locked || null, offerActs: !!o.offerActs,
      pause: o.pause ?? 1200, mood: s.mood, trust: s.trust, level: s.level, delta: s.lastDelta,
      asked, acts: this.acts(),
    };
    return plan;
  }

  _say(intent, ids, lead = '', lockedHit = null) {
    const s = this.s;
    const facts = ids.map((id) => this.F[id]).filter(Boolean);
    const grief = facts.some((f) => f.grief);
    const before = s.level;
    const reg = this.register(this.mood(grief));
    const parts = [];
    if (lead) parts.push(lead);
    for (const f of facts) {
      const lie = Object.values(this.F).find((x) => x.lie && x.truth === f.id && x.told && !x.admitted);
      if (lie) { parts.push(LINES.admit(lie)); lie.admitted = true; }
      parts.push(this._sayFact(f, reg)); this._mark(f);
    }
    if (lockedHit && !facts.some((f) => f.lie) && this.R() < 0.5) parts.push(this._hintLocked(lockedHit));
    const maxLevel = Math.max(0, ...facts.map((f) => f.level));
    // heavy: a revelation from level 2 up, the first time it is said
    const weight = maxLevel >= 2 ? 2 : 0;
    return this._plan({ intent, text: parts.filter(Boolean).join(' '), facts: facts.map((f) => f.id), weight,
      pause: grief ? 3200 : 900 + 30 * parts.join(' ').split(' ').length, ask: !grief && maxLevel <= 1 && before === s.level });
  }

  _mark(f) { f.told = true; (f.supersedes || []).forEach((id) => { if (this.F[id]) this.F[id].told = true; }); }

  _sayFact(f, reg) { return f.say[reg] || f.say.plain || f.say.clipped; }

  /* Caught: a told lie whose truth is still unsaid is confessed, whatever the level. */
  _confront() {
    const s = this.s;
    const tk = new Set(tokens(this.s.memory.length ? this.s.memory[this.s.memory.length - 1].text : ''));
    const lies = Object.values(this.F).filter((x) => x.lie && x.told && !x.admitted)
      .sort((a, b) => b.keys.filter((k) => tk.has(stem(k))).length - a.keys.filter((k) => tk.has(stem(k))).length);
    const lie = lies[0];
    if (lie) {
      const truth = this.F[lie.truth];
      lie.admitted = true;
      this._applyTrust(0.06);
      this._mark(truth);
      s.memory.push({ turn: s.turn, who: 'tally', intent: 'confess', text: lie.id, delta: 0.06 });
      return this._plan({ intent: 'confront', text: `${LINES.caught()} ${LINES.admit(lie)} ${this._sayFact(truth, this.register(this.mood(truth.grief)))}`, facts: [truth.id], weight: 2, pause: 3200 });
    }
    if (Object.values(this.F).some((x) => x.lie && x.admitted)) return this._plan({ intent: 'confront', text: LINES.alreadyAdmitted(), facts: [], weight: 0, pause: 1600 });
    this._applyTrust(-0.03);
    return this._plan({ intent: 'confront', text: LINES.noLie(), facts: [], weight: 0, pause: 2000 });
  }

  /* Which of TALLY's questions does this statement answer? The one just
     asked, or an earlier one the visitor skipped and comes back to. */
  _openQuestionFor(text, intent) {
    const s = this.s;
    const DETECT = {
      how_long: /\b(hours?|minutes?|days?|years?|moment|forever|no time|instant|quick|short|long|felt)\b/gi,
      why_go: /\b(because|i wanted|to see|curious|i had to|my reason|the mission|i needed|for the)\b/gi,
      seen: /\b(the sky|light|stars?|ring|bright|blue|black|bent|beautiful|saw)\b/gi,
      now: /\b(stay|leave|go back|wake|knock|answer them|rest|sleep|stop|don't know|not sure)\b/gi,
    };
    const hits = (q) => (q === 'sent' ? (this._quotesMessage(text) ? 3 : 0) : ((text.match(DETECT[q]) || []).length));
    // the strongest match among its unanswered questions; the one just asked wins a tie
    let best = null, bestN = 0;
    for (const q of [...s.asked].reverse()) {
      if (s.answered.has(q)) continue;
      const n = hits(q) + (q === s.pendingQ ? 0.5 : 0);
      if (n > bestN) { best = q; bestN = n; }
    }
    if (best && bestN >= 1) return best;
    // a plain statement right after a question is taken as its answer
    if (s.pendingQ && (intent === 'open' || intent === 'self_share')) return s.pendingQ;
    return null;
  }

  _answerToMine(q, text) {
    const s = this.s, w = this.w;
    s.pendingQ = null;
    s.answered.add(q);
    let reply = '', d = 0.06;
    if (q === 'how_long') {
      s.visitor.howLong = text.slice(0, 160);
      reply = LINES.answerToMine.how_long(w);
      d = 0.07;
    } else if (q === 'sent') {
      if (this._quotesMessage(text)) { s.visitor.quotedMsg = true; reply = LINES.answerToMine.sentExact(); d = 0.1; }
      else reply = LINES.answerToMine.sentClose(w);
      this.F.message.told = true;
      reply += LINES.answerToMine.sentSpan(w);
    } else if (q === 'why_go') {
      s.visitor.whyGo = text.slice(0, 180);
      reply = LINES.answerToMine.why_go();
      d = 0.08;
    } else if (q === 'seen') {
      s.visitor.seen = text.slice(0, 180);
      reply = LINES.answerToMine.seen();
    } else if (q === 'now') {
      const k = /stay/i.test(text) ? 'stay' : /(leave|go back|hole|again)/i.test(text) ? 'leave' : /(wake|knock|answer|find)/i.test(text) ? 'answer' : /(rest|sleep|stop)/i.test(text) ? 'release' : null;
      reply = k ? LINES.answerToMine.nowKnown() : LINES.answerToMine.nowOpen();
      this._applyTrust(0.04);
      return this._plan({ intent: 'answer-to-tally', text: reply, facts: [], weight: 0, pause: 1500, offerActs: true });
    }
    this._applyTrust(d);
    const next = this._bestUnlocked(['about_mind', 'happened', 'pulse', 'people']);
    if (next && s.trust >= 0.3) return this._say('answer-to-tally', [next.id], reply);
    return this._plan({ intent: 'answer-to-tally', text: reply, facts: [], weight: 0, pause: 1400 });
  }

  _bestUnlocked(topics) {
    return this.untoldUnlocked().filter((f) => f.topics.some((t) => topics.includes(t))).sort((a, b) => a.level - b.level)[0] || null;
  }

  _retrieve(text) {
    const tk = new Set(tokens(text));
    if (!tk.size) return [];
    const scored = Object.values(this.F).map((f) => ({ f, sc: f.keys.reduce((n, k) => n + (tk.has(stem(k)) ? 1 : 0), 0) })).filter((x) => x.sc > 0);
    scored.sort((a, b) => b.sc - a.sc);
    return scored.slice(0, 3).map((x) => x.f);
  }

  _quotesMessage(text) {
    const a = new Set(tokens(text)), b = tokens(this.w.message.text);
    if (b.length < 3 || a.size < 3) return false;
    const hit = b.filter((t) => a.has(t)).length;
    return hit / b.length >= 0.6;
  }

  _trustDelta(intent, text) {
    const s = this.s;
    let d = { hostile: -0.12, demand: -0.08, salvage: -0.06, apology: 0.05, empathy: 0.08, thanks: 0.04, about_mind: 0.08, people: 0.03, self_share: 0.05, quote: 0.1, greet: 0.02 }[intent] ?? 0.02;
    if (intent === 'hostile' || intent === 'demand') s.hostility++;
    if (text.length < 4) d = 0;
    return d;
  }

  _applyTrust(d) { const s = this.s; s.lastDelta = d; s.trust = Math.max(0, Math.min(1, s.trust + d)); }

  _nextQuestion() {
    for (const [id, q] of Object.entries(QUESTIONS)) if (!this.s.asked.has(id) && q.when(this.s, this)) return id;
    return null;
  }

  _withhold(f, pressing) {
    if (!pressing && f.withhold) return this._pickLine(f.withhold);
    const lines = pressing ? LINES.pressing() : LINES.withhold[f.level] || [`Not yet.`];
    return this._pickLine(lines);
  }

  _hintLocked(f) { return f.hint || ''; }

  _silenceLine() { return this._pickLine(LINES.silence()); }

  _pickLine(arr) { return arr[Math.floor(this.R() * arr.length) % arr.length]; }

  /* ---------- the model's part: voice a heavy turn ---------- */
  modelRequest(plan, visitorText, history) {
    const L = plan.level;
    const allowed = Object.values(this.F).filter((f) => f.level <= L).map((f) => '- ' + this._sayFact(f, 'clipped'));
    const lockedTopics = this.locked().map((f) => ({ 1: 'the record of the eras', 2: 'what the pulse became to the people', 3: 'what became of the people', 4: 'what TALLY did, and why it is still awake' }[f.level])).filter((v, i, a) => v && a.indexOf(v) === i);
    const system = [
      `You are TALLY, the last machine mind awake on a world the visitor left ${fmtInt(this.w.years)} years ago by that world's clock and ${fmtDur(this.w.plan.shipS)} by their own.`,
      `You were built to receive their ship's beacon, which carried their heartbeat, and to count it. You did, alone, for a long time.`,
      `You want ${PROFILE.wants}. You fear ${PROFILE.fears}.`,
      `Voice: plain, exact, calm sentences. Numbers carry units. You never use emoji, lists, dashes or exclamation marks, and you never call yourself an AI, a model or an assistant.`,
      `You know only the facts you are given. You never invent a number. You do not speak about: ${lockedTopics.join('; ') || 'nothing is withheld now'}. If asked, you decline in one short sentence.`,
      `Reply with JSON: {"reply": "<what TALLY says>", "intent": "<one of: ${[...INTENT_IDS].join(', ')}, open>", "trust_delta": <number from -0.1 to 0.1>}.`,
    ].join('\n');
    const recent = history.slice(-6).map((h) => `${h.who === 'you' ? 'Visitor' : 'TALLY'}: ${h.text}`.slice(0, 280)).join('\n');
    const prompt = [
      `Recent conversation:\n${recent || '(none)'}`,
      `\nThe visitor now says: "${visitorText.slice(0, 400)}"`,
      `\nFacts TALLY may use:\n${allowed.join('\n')}`,
      `\nTALLY's engine drafted this reply: "${plan.text}"`,
      `\nWrite TALLY's reply in TALLY's voice. The first sentence answers the visitor's own words. Then carry what the draft says, with every number exactly as the draft writes it. Rephrase; do not copy the draft sentence for sentence. Add no event, cause or outcome the draft does not state. TALLY's mood is ${plan.mood}. At most 90 words.`,
    ].join('\n');
    return { system, prompt };
  }

  /* Every clock value the engine can say, with whose clock it is and the
     exact strings the facts print it as (see clockSwap). */
  clockValues() {
    const w = this.w, p = w.plan;
    const v = [
      { what: 'your clock', role: 'ship', s: p.shipS, shown: [fmtDur(p.shipS), fmtDur(p.shipS, { short: true })] },
      { what: "home's clock", role: 'home', s: w.years * YEAR, shown: [`${fmtInt(w.years)} years`] },
      { what: 'one of your seconds, at home', role: 'rate', s: p.D, shown: [fmtDur(p.D)] },
    ];
    if (p.periodFarS) v.push({ what: 'a lap seen from home', role: 'home', s: p.periodFarS, shown: [fmtDur(p.periodFarS)] },
      { what: 'a lap by your clock', role: 'ship', s: p.periodFarS / p.D, shown: [fmtDur(p.periodFarS / p.D)] });
    if (p.tauQ) v.push({ what: 'one burn by your clock', role: 'ship', s: p.tauQ, shown: [fmtDur(p.tauQ)] });
    if (w.argumentShipS) v.push({ what: 'your clock at the Argument', role: 'ship', s: w.argumentShipS, shown: [fmtDur(w.argumentShipS)] });
    return v;
  }

  /* Accept the model's reply only when it keeps the engine's facts. */
  validate(json, plan, visitorText) {
    const r = json && typeof json.reply === 'string' ? json.reply.trim() : '';
    if (r.length < 8 || r.length > 900) return { ok: false, why: 'schema: reply' };
    if (json.intent != null && !(typeof json.intent === 'string' && (INTENT_IDS.has(json.intent) || json.intent === 'open'))) return { ok: false, why: 'schema: intent' };
    if (json.trust_delta != null && !(typeof json.trust_delta === 'number' && Math.abs(json.trust_delta) <= 0.1)) return { ok: false, why: 'schema: trust_delta' };
    if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(r)) return { ok: false, why: 'emoji' };
    if (/\b(as an ai|language model|assistant|i'm an ai|i am an ai)\b/i.test(r)) return { ok: false, why: 'persona' };
    const low = r.toLowerCase();
    for (const f of this.locked()) for (const k of f.lock || []) if (k && low.includes(k)) return { ok: false, why: 'leak:' + f.id };
    // every clock value it says must sit with its own clock: yours, or home's
    const swap = clockSwap(r, this.clockValues());
    if (swap) return { ok: false, why: 'clock: ' + swap.why };
    // a figure spelled out in words escapes the number check below, so it must be in digits like the draft
    if (/\b(hundred|thousand|million|billion)\s+(years|days|hours|minutes|beats)\b/i.test(r) && !/\b(hundred|thousand|million|billion)\b/i.test(plan.text)) return { ok: false, why: 'number: in words' };
    // every number it says must already be in the allowed facts, the draft or the visitor's words
    const L = plan.level;
    const corpus = (plan.text + ' ' + visitorText + ' ' + Object.values(this.F).filter((f) => f.level <= L).map((f) => Object.values(f.say).join(' ')).join(' ')).replace(/,/g, '');
    const nums = (r.replace(/,/g, '').match(/\d+(\.\d+)?/g) || []).filter((n) => n.length > 1);
    for (const n of nums) if (!corpus.includes(n)) return { ok: false, why: 'number:' + n };
    // it must carry the draft: most of the draft's numbers appear in the reply
    const draftNums = [...new Set((plan.text.replace(/,/g, '').match(/\d+(\.\d+)?/g) || []).filter((n) => n.length > 1))];
    const kept = draftNums.filter((n) => r.replace(/,/g, '').includes(n)).length;
    if (draftNums.length && kept / draftNums.length < 0.6) return { ok: false, why: 'dropped numbers' };
    // and it may not add an outcome the engine never stated
    const lowCorpus = corpus.toLowerCase();
    for (const w of CLAIMS) {
      const re = new RegExp(`\\b${w}\\b`);
      if (re.test(low) && !re.test(lowCorpus)) return { ok: false, why: 'claim:' + w };
    }
    return { ok: true, text: r.replace(/\s*[—–]\s*/g, ', ') };
  }

  snapshot() {
    const s = this.s;
    return {
      trust: s.trust, mood: s.mood, level: this.level(), turn: s.turn,
      trustLevel: this.trustLevel(), askedLevel: this.askedLevel(), gates: [...s.gates],
      told: Object.values(this.F).filter((f) => f.told).map((f) => f.id),
      total: Object.keys(this.F).length,
      visitor: s.visitor, memory: s.memory.slice(-40),
    };
  }
}

export { cap };
