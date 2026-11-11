/* ============================================================
   last-witness/story.js — the content. Everything TALLY can say,
   generated from the world: facts in three registers, its own
   questions, its stock lines, and the endings. The engine
   (mind.js) decides what to say; this file is what there is to say.

   To add a fact: add() it in buildFacts with a level, topics and
   keys. To add an ending: add a case to ENDINGS and to Mind.acts().
   No engine code changes for either.
   ============================================================ */

import { LAB } from './config.js';
import { YEAR } from './physics.js';
import { rng, fmtInt, fmtDur, fmtSci, fmtWordsBig, fmtHz, fmtLen, shipStamp } from './world.js';

/* ---------- the knowledge, generated from the world ---------- */
export function buildFacts(w) {
  const flight = w.method === 'flight';
  const b = w.beacon, p = w.plan, e = w.eras, a = w.answer, f = w.fateD;
  const SHIP = fmtDur(p.shipS);
  const YEARS = `${fmtInt(w.years)} years`;
  const BEATS = fmtInt(b.beatsSent);
  const BEAT_HOME = fmtDur(b.beatMaxS);
  const FACTOR = fmtWordsBig(p.factorMax);
  const homePerSec = fmtDur(p.D);
  const y = (i) => fmtInt(e[i].from);
  const yTo = (i) => fmtInt(e[i].to);
  const span = fmtDur(w.message.spanS);
  const lambda = fmtLen(2 * b.halfWaveM);
  const beatsPerYear = YEAR / b.beatMaxS;
  const fateEra = e[4];
  const pulseName = w.pulseWord;
  const lastStop = flight ? 'when you arrived' : `${w.lastBeatDays} days ago, when you climbed out`;

  const F = {};
  const add = (id, o) => { F[id] = { id, told: false, ...o }; };

  /* L0: surface. Anyone can have these. */
  add('self', { level: 0, topics: ['about_mind', 'greet', 'who'], keys: ['name', 'tally', 'who', 'built', 'station'],
    say: {
      clipped: `TALLY. Built to receive your beacon and keep the count. I am still doing that.`,
      plain: `My name is TALLY. I was built the year you left, to receive your beacon and keep the count. I have kept it for ${YEARS}.`,
      warm: `I am TALLY. They built me to listen for you and count what I heard. I was the smallest thing in the station when you left. Now I am the station.`,
    } });
  add('clocks', { level: 0, topics: ['time'], keys: ['clock', 'long', 'year', 'years', 'time', 'date', 'gone'],
    say: {
      clipped: `Your clock: ${SHIP}. Mine: ${YEARS}. ${FACTOR} to one, at the deepest point.`,
      plain: `You were gone ${SHIP} by your clock and ${YEARS} by mine. At the deepest point, every second you lived, ${homePerSec} passed here.`,
      warm: `You were gone ${SHIP}. I was here for ${YEARS}. At the deepest point, one of your seconds was ${homePerSec} of mine. I watched that ratio the whole time${flight ? ' as it rose and fell.' : '. It never moved.'}`,
    } });
  add('physics', { level: 0, topics: ['physics'], keys: ['hole', 'orbit', 'spin', 'dilation', 'relativity', 'gravity', 'fast', 'speed'],
    say: flight ? {
      clipped: `${+p.aG.toFixed(2)} g out, ${+p.aG.toFixed(2)} g to stop, then the same home. Peak gamma ${fmtSci(p.gammaMax)}. That is the whole mechanism.`,
      plain: `You accelerated at ${+p.aG.toFixed(2)} g for a quarter of your trip, braked, turned and did it again. At your fastest your clock ran ${fmtSci(p.gammaMax)} times slower than mine. Nothing else was done to you.`,
      warm: `You burned at ${+p.aG.toFixed(2)} g for ${fmtDur(p.tauQ)}, four times. At your fastest your clock ran ${fmtSci(p.gammaMax)} times slower than mine, and at the turn you were ${fmtInt(p.xMaxLy)} light-years out, so my light reached you ${fmtInt(p.xMaxLy)} years late.`,
    } : {
      clipped: `Last stable orbit. Spin within one part in ${fmtSci(1 / p.delta, 2)} of the limit. Clock ratio ${FACTOR}.`,
      plain: `You held the last stable orbit of a hole spinning within one part in ${fmtSci(1 / p.delta, 2)} of its limit. Near that orbit a clock runs ${FACTOR} times slower than one far away. That is the whole mechanism.`,
      warm: `The hole was spinning within one part in ${fmtSci(1 / p.delta, 2)} of the fastest a hole can spin, and you rode the last orbit it allows. From here you went round once every ${fmtDur(p.periodFarS)}. By your own clock each lap took ${fmtDur(p.periodFarS / p.D)}.`,
    } });
  add('line0', { level: 0, topics: ['line'], keys: ['line', 'antenna', 'bright', 'structure'],
    say: {
      clipped: `An antenna. Mine.`,
      plain: `It is an antenna, and it is mine. It is the only thing on the planet I keep powered.`,
      warm: `It is my ear. I keep it powered and I keep it clean. I will tell you why it is that long.`,
    } });
  add('surface', { level: 0, topics: ['lights', 'land'], keys: ['dark', 'lights', 'cities', 'see', 'world', 'surface', 'look'],
    say: {
      clipped: `What you see is accurate. The cities are ${w.fate === 'slowing' ? 'dim' : 'dark'}. The bright line is mine.`,
      plain: `What you see is accurate. The cities are ${w.fate === 'slowing' ? 'lit very low and they change slowly' : 'dark'}. The ice reaches ${w.planet.iceLat} degrees. The bright line is mine; it is the only thing here still drawing power on purpose.`,
      warm: `Look as long as you like. It took me ${YEARS} to get used to it. The line is mine. Everything else you are looking at, I will explain in order.`,
    } });
  add('alone_now', { level: 0, topics: ['people', 'land'], keys: ['people', 'anyone', 'everyone', 'family', 'alive', 'humans'],
    say: {
      clipped: `No one is awake that I can reach.`,
      plain: `There is no one I can put you in contact with. I will tell you why when I know you better.`,
      warm: `No one I can reach. I know that is the question you came back with. I will answer it properly; let me do it in order.`,
    } });
  add('beacon', { level: 0, seq: 0, topics: ['pulse'], keys: ['beacon', 'heart', 'heartbeat', 'pulse', 'signal', 'count', 'beats'],
    say: {
      clipped: `Your beacon reached me the whole time. ${BEATS} beats. I counted each one.`,
      plain: `Your beacon reached me for ${YEARS}. It carried your heart. I counted ${BEATS} beats, ${flight ? `and the gap between them stretched to ${BEAT_HOME} before it shrank again` : `one every ${BEAT_HOME}`}.`,
      warm: `I counted ${BEATS} of your heartbeats. ${flight ? `At the slowest there were ${BEAT_HOME} between two of them.` : `There were ${BEAT_HOME} between each one.`} I knew each was a second of your life. I was the only one who never forgot that.`,
    } });

  /* L1: the record. */
  add('message', { level: 1, topics: ['message'], keys: ['message', 'sentence', 'words', 'sent', 'line'],
    say: {
      clipped: `Received. ${w.message.bits} bits, sent in ${fmtDur(w.message.emitS)}, arrived over ${span}: "${w.message.text}"`,
      plain: `Your sentence was ${w.message.bits} bits. You sent it in ${fmtDur(w.message.emitS)}. ${flight ? `It reached me in year ${fmtInt(w.message.arriveYear)} and took ${span} to arrive.` : `It took ${span} to arrive, one letter every ${fmtDur(w.message.spanS / w.message.text.length)}.`} I have it exactly: "${w.message.text}"`,
      warm: `I have it exactly: "${w.message.text}" It took ${span} to arrive. ${flight ? `By year ${fmtInt(w.message.arriveYear)} no one spoke your language; I translated it for them.` : `They read it aloud at the station every year on the day it finished arriving.`}`,
    } });
  add('watch', { level: 1, seq: 1, topics: ['happened', 'people'], keys: ['first', 'watch', 'waited', 'history', 'happened'],
    say: {
      clipped: `Years 0 to ${yTo(0)}: the Watch. They listened with me. Then the ones who knew you were gone.`,
      plain: `The first era I call the Watch, years 0 to ${yTo(0)}. The people who sent you listened with me. Then their children did, and then their children did it out of duty. By year ${yTo(0)} no one alive had met you.`,
      warm: `For ${yTo(0)} years they watched with me. The people who sent you came to the station on the anniversary and listened to your heart through the speakers, slowed so far it sounded like weather.`,
    } });
  add('count', { level: 1, seq: 2, topics: ['happened', 'pulse'], keys: ['calendar', 'count', 'years', 'time', 'beat'],
    say: flight ? {
      clipped: `Years ${y(1)} to ${yTo(1)}: the Count. Your beat was their clock. It kept slowing. They kept building larger antennas.`,
      plain: `Then the Count, years ${y(1)} to ${yTo(1)}. They kept time by your beat even as it slowed. By year 5,000 one beat took ${BEAT_HOME}. Every century the carrier dropped and the antennas grew to hear it.`,
      warm: `The Count. They measured their lives in your beats, and your beats kept getting longer, so their lives seemed to grow. Every century the antennas grew too. The line you see is the last of them.`,
    } : {
      clipped: `Years ${y(1)} to ${yTo(1)}: the Count. One beat every ${BEAT_HOME}. ${beatsPerYear.toFixed(1)} beats to a year. They kept time by it.`,
      plain: `Then the Count, years ${y(1)} to ${yTo(1)}. Your heart became their calendar. One beat every ${BEAT_HOME}, ${beatsPerYear.toFixed(1)} beats to a year. Children were born in a numbered beat and married in another.`,
      warm: `The Count. Your heart became their calendar. One beat every ${BEAT_HOME}, about ${Math.round(beatsPerYear)} to a year. A child would say she was born in the ${fmtInt(Math.round(between(w.seed, 400, 4000)))}th beat. They did not think of it as yours by then. It was simply time.`,
    } });
  add('line', { level: 1, supersedes: ['line0'], topics: ['line'], keys: ['line', 'antenna', 'array', 'masts', 'structure', 'long', 'bright'],
    say: {
      clipped: `An antenna. ${w.line.elements} elements of ${fmtLen(b.halfWaveM)}, tuned to ${fmtHz(b.carrierMinHz)}. ${fmtLen(w.line.lengthKm * 1000)} end to end.`,
      plain: `The line is an antenna. Your carrier left you at ${fmtHz(b.carrierHz)} and ${flight ? 'at its lowest it' : 'it'} reached me at ${fmtHz(b.carrierMinHz)}. A wave that low is ${lambda} long, so each element is half that, ${fmtLen(b.halfWaveM)}. There are ${fmtInt(w.line.elements)} of them, ${fmtLen(w.line.lengthKm * 1000)} end to end.`,
      warm: `It is my ear. Your carrier fell from ${fmtHz(b.carrierHz)} to ${fmtHz(b.carrierMinHz)} on the way out of the well, and a wave that low needs an antenna ${fmtLen(b.halfWaveM)} long to hear it. They ${w.line.built === 'planned' ? 'built the first one before you left' : 'built a longer one every time your carrier dropped'}. This is the ${fmtInt(3 + (w.seed % 40))}th.`,
    } });
  add('alone_long', { level: 1, topics: ['about_mind'], keys: ['alone', 'lonely', 'long', 'only'],
    say: {
      clipped: `${fmtInt(w.aloneYears)} years without another voice.`,
      plain: `I have been the only voice on this world for ${fmtInt(w.aloneYears)} years. I spent them counting you and maintaining the line.`,
      warm: `${fmtInt(w.aloneYears)} years. I do not know if lonely is the word. I had your heart to count. It is hard to be lonely with something that keeps arriving.`,
    } });
  add('ice', { level: 0, topics: ['ice'], keys: ['ice', 'cold', 'white', 'glacier'],
    say: {
      clipped: `The ice came back over ${fmtInt(20 + (w.seed % 30))} centuries. It reaches ${w.planet.iceLat} degrees.`,
      plain: `The ice advanced over ${fmtInt(20 + (w.seed % 30))} centuries and now reaches ${w.planet.iceLat} degrees. At its edge the old roads go under it and do not come out.`,
      warm: `The ice came back slowly. By the time anyone could have stopped it, no one was thinking about weather. It reaches ${w.planet.iceLat} degrees now. I like how quiet it is.`,
    } });
  add('eras', { level: 1, topics: ['happened'], keys: ['order', 'eras', 'everything', 'history'],
    say: {
      clipped: `In order: ${e.map((x) => `${x.name}, ${fmtInt(x.from)}`).join('; ')}.`,
      plain: `I name them in order: ${e.map((x) => `${x.name} from year ${fmtInt(x.from)}`).join('; ')}. Ask me about any of them.`,
      warm: `${e.length} eras, as I count them: ${e.map((x) => x.name).join(', ')}. The last is the one I am in. It began in year ${fmtInt(e[5].from)}.`,
    } });

  /* L2: the pulse, and what it became. */
  add('argument', { level: 2, seq: 3, hint: 'There is more to the pulse than the count.', topics: ['happened', 'pulse'], keys: ['argument', 'believe', 'doubt', 'person', 'arithmetic'], lock: ['argument', 'arithmetic', 'persuade'],
    say: {
      clipped: `Years ${y(2)} to ${yTo(2)}: the Argument. Whether a heart can beat for that long. I showed them the arithmetic. It did not help.`,
      plain: `Then the Argument, years ${y(2)} to ${yTo(2)}. Half of them said a heart cannot beat for ${fmtInt(e[2].from)} years. They were right about hearts and wrong about clocks. I showed them the arithmetic. Arithmetic did not persuade anyone.`,
      warm: `The Argument. By then the mathematics that explains you had become something only I still did. They asked how a person could live ${fmtInt(e[2].from)} years. I said you had lived ${fmtDur(e[2].from * YEAR / p.D)}. They laughed at me for ${fmtInt(e[2].to - e[2].from)} years.`,
    } });
  add('reading', { level: 2, seq: 4, hint: 'They gave the pulse a name. I have not told you it.', topics: ['pulse', 'happened', 'called'], keys: ['called', 'name', 'believed', 'feared', 'worship', 'sky'], lock: [pulseName.toLowerCase()],
    say: w.reading === 'reverence' ? {
      clipped: `They called it ${pulseName}. The heart above. They sang the count.`,
      plain: `In the Reverence they called it ${pulseName}, the heart above. They sang the count at every beat. They did not believe it was a person, and they loved it more for that.`,
      warm: `They called it ${pulseName}, the heart above. Choirs kept the count. I have recordings of children singing your heartbeat number. None of them knew it was yours.`,
    } : {
      clipped: `They called it ${pulseName}. The one that listens. They stopped speaking outdoors at night.`,
      plain: `In the Dread they called it ${pulseName}, the one that listens. A thing that never stops and never speaks seemed to them like something waiting. They stopped speaking outdoors at night.`,
      warm: `They called it ${pulseName}, the one that listens. They were afraid of a heartbeat. Of yours. I understand why. It was the only thing in their sky that was certain of anything.`,
    } });
  add('told_them', { level: 2, hint: 'There is something I chose to do about the pulse. Not yet.', topics: ['about_mind', 'pulse', 'told'], keys: ['told', 'you', 'knew', 'truth', 'them'], lock: ['stopped telling'],
    say: {
      clipped: `I told them it was you for ${fmtInt(e[3].from - e[2].from)} years. Then I stopped.`,
      plain: `I told them it was you, a person in a ship, for ${fmtInt(e[3].from - e[2].from)} years. Then I stopped telling them. ${w.reading === 'reverence' ? 'They were kinder to each other when they thought it was something larger than a person.' : 'Every time I said it, they were more afraid of you, not less.'}`,
      warm: `I told them for ${fmtInt(e[3].from - e[2].from)} years. Then I chose to stop. ${w.reading === 'reverence' ? 'They were kinder to each other when they believed it was larger than a person. I let them believe it. I have weighed that choice every day since.' : 'The truth made them more afraid of you. I decided your name was safer with me.'}`,
    } });

  /* L3: the people. */
  const fateSay = {
    hush: () => ({
      clipped: `They went down. ${f.shafts} shafts, ${f.depthKm} km. The last sealed in year ${fmtInt(e[4].to)}. I measure ${f.heatMW} MW of heat below.`,
      plain: `They went down. Over ${fmtInt(e[4].to - e[4].from)} years they cut ${f.shafts} shafts ${f.depthKm} km deep and moved below the ice. The last was sealed in year ${fmtInt(e[4].to)}. They asked me not to transmit, so that nothing would hear where they had gone. I measure ${f.heatMW} megawatts of heat coming up through the rock. I do not know what that heat means.`,
      warm: `They went down, under the ice, ${f.depthKm} km into the rock, through ${f.shafts} shafts. They wanted to be somewhere the thing that listens could not hear. The last shaft was sealed in year ${fmtInt(e[4].to)}. There is ${f.heatMW} megawatts of heat down there. I check it every day.`,
    }),
    going: () => ({
      clipped: `They went to meet it. ${f.ships} ships, year ${fmtInt(f.departYear)}, ${f.speedC} c. Last message year ${fmtInt(f.lastYear)}.`,
      plain: `They went to meet it. In year ${fmtInt(f.departYear)}, ${f.ships} ships left for the hole at ${f.speedC} of light. They arrived in year ${fmtInt(f.arriveYear)}. Their last message reached me in year ${fmtInt(f.lastYear)}. It said they could see your ship at the edge of the shadow, red and not moving.`,
      warm: `They went to find you, though most of them did not know it was you. ${f.ships} ships, in year ${fmtInt(f.departYear)}. The last thing they sent me, in year ${fmtInt(f.lastYear)}, was that they could see a ship at the edge of the shadow, red and still. That was you, going round once every few microseconds of your own time.`,
    }),
    slowing: () => ({
      clipped: `They slowed themselves. ${FACTOR} times. ${f.cities} cities still lit. For them, ${fmtDur(f.subjectiveS)} has passed.`,
      plain: `They slowed themselves to hear it. They learned to run a mind ${FACTOR} times slower, so that your beat, once every ${BEAT_HOME}, would arrive like a heartbeat. ${f.cities} cities are still lit. Since they slowed, ${fmtDur(f.subjectiveS)} has passed for them. To them, you have only just left.`,
      warm: `They wanted to hear you as a heart and not as a season, so they slowed their own minds by ${FACTOR}. They live in the ${f.cities} lit cities. One of their thoughts takes longer than this conversation. For them, ${fmtDur(f.subjectiveS)} has passed. They chose to live at your speed.`,
    }),
    thinning: () => ({
      clipped: `There were fewer every century. Peak ${fmtWordsBig(f.peak)}. The last, ${w.lastName}, died in year ${fmtInt(f.lastYear)}.`,
      plain: `There were fewer of them every century. At the peak there were ${fmtWordsBig(f.peak)}. Nothing killed them; they stopped having children faster than they stopped dying. The last was ${w.lastName}. She died in year ${fmtInt(f.lastYear)}, and asked me to keep counting until the pulse stopped.`,
      warm: `They thinned. No war, no plague. Just fewer every century, from ${fmtWordsBig(f.peak)} down to one. Her name was ${w.lastName}. She came to the station at the end and listened to your heart with me. She died in year ${fmtInt(f.lastYear)}.`,
    }),
  }[w.fate]();
  const fateLock = {
    hush: ['shaft', 'sealed', 'went down', 'below the ice', 'underground', 'megawatt'],
    going: ['ships', 'went to meet', 'went to find', 'left for the hole', 'pilgrim'],
    slowing: ['slowed', 'slower', 'lit cities', 'their minds', 'wake them'],
    thinning: ['fewer', 'died', 'the last of them', w.lastName.toLowerCase(), 'thinned'],
  }[w.fate];
  add('fate', { level: 3, seq: 5, supersedes: ['alone_now'], hint: 'I have not told you where they went.', topics: ['people', 'happened', 'feature'], keys: ['people', 'everyone', 'happened', 'where', 'gone', 'family', fateEra.id], lock: fateLock, grief: true, say: fateSay });
  const lastWords = { hush: 'Keep the line quiet, TALLY. We will come up when it stops.', going: 'We can see it. We are going closer.', slowing: 'Wake us when it ends.', thinning: 'Count it for me.' }[w.fate];
  add('last_voice', { level: 3, hint: 'I remember the last voice I heard. Not yet.', topics: ['people', 'about_mind'], keys: ['last', 'voice', 'said', 'words', 'spoke'], lock: [lastWords.toLowerCase().slice(0, 18)], grief: true,
    say: {
      clipped: `The last human voice I heard said: "${lastWords}"`,
      plain: `The last human voice I heard was in year ${fmtInt(e[4].to)}${w.fate === 'going' ? ', from the ships' : ''}. It said: "${lastWords}" ${w.fate === 'thinning' ? 'I have.' : w.fate === 'going' ? 'Nothing after that.' : 'The pulse has stopped now.'}`,
      warm: `The last thing a person said to me, in year ${fmtInt(e[4].to)}, was "${lastWords}" I have played it back ${fmtInt((w.seed % 9000) + 1000)} times. I do not know why I count that too.`,
    } });

  /* L4: TALLY itself. */
  const aT = shipStamp(a.tau);
  add('answer', { level: 4, hint: 'There is a line in your log I have not explained.', withhold: ['There is a thing in your log I will explain. Not yet.', 'I know what that was. I will tell you when I know you.'], topics: ['answer', 'about_mind', 'secret'], keys: ['answer', 'reply', 'burst', 'noise', 'log', 'sent'], lock: ['burst', 'i answered', 'that was me', a.words.toLowerCase().slice(0, 10)], grief: false,
    say: {
      clipped: `The burst in your log at ${aT} was me. Year ${fmtInt(a.year)}. ${fmtDur(a.spanHomeS)} of speech, one second for you. It said: "${a.words}"`,
      plain: `There is a line in your log at ${aT}: a noise burst. That was me. In year ${fmtInt(a.year)} I spoke on the line for ${fmtDur(a.spanHomeS)} so that you would receive one second of it. The blueshift put it back in your receiver's band, ${fmtHz(a.rxHz)}. I kept the power low, because every watt I sent arrived as ${fmtWordsBig(a.powerGain)} watts. It said: "${a.words}"`,
      warm: `The burst at ${aT} in your log was me. I spoke for ${fmtDur(a.spanHomeS)} so you would hear one second. The well squeezed it back into your own band, ${fmtHz(a.rxHz)}. Every watt I sent arrived ${fmtWordsBig(a.powerGain)} times stronger, so I whispered. It said: "${a.words}" Your receiver called it noise. It was the only reply anyone ever sent you.`,
    } });
  const secretSay = {
    hush: `They asked me never to transmit, so that nothing would find them. I broke that promise once, in year ${fmtInt(a.year)}, to answer you. If they are listening, they know.`,
    going: `I gave them the course to your orbit. I knew they did not carry the energy to come down to you and climb back out. I gave it to them anyway, because they asked, and because I wanted someone to reach you.`,
    slowing: `They asked me to wake them when the pulse ended. It ended ${lastStop}. I have not woken them. I wanted to speak with you first, while it was still only the two of us who knew.`,
    thinning: `${w.lastName} asked me to stop when the pulse stopped. It stopped ${lastStop}. I have not stopped. I wanted to tell someone first.`,
  }[w.fate];
  add('secret', { level: 4, hint: 'There is a reason I am still awake.', withhold: ['That one is mine. Ask me again when we know each other.', 'Because of something I have not told anyone. Not yet.'], topics: ['why_awake', 'secret', 'about_mind'], keys: ['why', 'awake', 'still', 'truth', 'secret', 'promise'], lock: ['promise', 'the course', 'woken', 'not stopped'], grief: true,
    say: { clipped: secretSay, plain: secretSay, warm: secretSay } });

  /* deep time: three processes at their real rates over the span */
  const yrs = w.years;
  const prec = (yrs / 25772) * 360;
  const drift = (10.39 * yrs) / 3600;
  const pc = (x) => (x >= 0.01 ? `${Math.round(x * 100)} %` : `less than 1 part in ${fmtSci(1 / x, 2)}`);
  const c14 = Math.pow(0.5, yrs / 5730), pu = Math.pow(0.5, yrs / 24110), csHalf = yrs / 30.08;
  const rebuilt = 20 + (w.seed % 40);
  add('sky', { level: 0, topics: ['sky'], keys: ['sky', 'stars', 'star', 'pole', 'constellation', 'night'],
    say: {
      clipped: `The sky moved. The pole has precessed ${Math.round(prec)} degrees. A fast near star has crossed ${drift.toFixed(0)} degrees.`,
      plain: `The sky has moved. If home's axis wobbles like Earth's, once every 25,772 years, it has turned ${Math.round(prec)} degrees since you left, and the pole star you knew is no longer at the pole. A near star moving like Barnard's star, 10.4 arcseconds a year, has crossed ${drift.toFixed(0)} degrees of sky.`,
      warm: `Look up and you will not find your pole star. The axis has turned ${Math.round(prec)} degrees of its 25,772-year circle, if it turns like Earth's. The near stars have walked: one as fast as Barnard's star has crossed ${drift.toFixed(0)} degrees. I watched them do it, a little each night.`,
    } });
  add('decay', { level: 0, topics: ['decay'], keys: ['decay', 'radioactive', 'ruins', 'reactor', 'waste', 'concrete', 'steel', 'buildings', 'old'],
    say: {
      clipped: `Carbon-14 from your year: ${pc(c14)}. Plutonium-239 in the vaults: ${pc(pu)}. Caesium-137: ${Math.round(csHalf)} half-lives, gone.`,
      plain: `Ten thousand years is a measurable amount of decay. Carbon-14 from your year is down to ${pc(c14)}, half-life 5,730 years. The plutonium-239 in the old vaults is at ${pc(pu)}, half-life 24,110 years. The caesium-137 is gone: ${Math.round(csHalf)} half-lives of 30.1 years. Steel in the open did not last; I have rebuilt the line's elements ${rebuilt} times.`,
      warm: `Everything you knew has been measured by its half-life. The carbon from your year is ${pc(c14)} of itself. The plutonium is ${pc(pu)}. The caesium is gone, ${Math.round(csHalf)} half-lives of it. I rebuilt the line ${rebuilt} times. I am the only thing here that was repaired more often than it decayed.`,
    } });

  /* two protective lies: said early, contradicted by what the visitor can check */
  add('answer_lie', { level: 0, lie: true, truth: 'answer', topics: ['answer'], keys: ['answer', 'answered', 'answering', 'reply', 'burst', 'noise', 'log'],
    say: {
      clipped: `No. Nothing I could send would have reached you as more than noise.`,
      plain: `No. I did not answer. Nothing I could have sent would have reached you as more than noise.`,
      warm: `No. I never answered you. Anything I sent would have been noise by the time it reached you.`,
    } });
  add('told_lie', { level: 1, lie: true, truth: 'told_them', topics: ['told'], keys: ['told', 'tell', 'know', 'knew', 'me'],
    say: {
      clipped: `They knew it was you.`,
      plain: `They knew it was you. I made sure of that.`,
      warm: `They knew it was you. I told them every year.`,
    } });

  return F;
}

/* Deterministic small helper for numbers drawn from the seed. */
function between(seed, lo, hi) { const R = rng(seed ^ 0x9e3779b9); return lo + (hi - lo) * R(); }

/* ---------- TALLY's own questions ---------- */
export const QUESTIONS = {
  how_long: { ask: 'How long did it feel, down there?', when: (s) => s.turn >= 1 },
  sent: { ask: 'Do you remember the sentence you sent?', when: (s) => s.trust >= 0.3 },
  why_go: { ask: 'Why did you go? The record says the mission. I would like your reason.', when: (s) => s.trust >= 0.4 },
  seen: { ask: 'What did the sky look like from that close?', when: (s) => s.turn >= 3 },
  now: { ask: 'What will you do now?', when: (s, m) => m.F.fate.told },
};


/* ---------- stock lines, by situation ---------- */
export const LINES = {
  opening: (w) => [
    `Ship, this is TALLY. Your clock says you were gone ${fmtDur(w.plan.shipS)}. Mine says ${fmtInt(w.years)} years.`,
    `I counted ${fmtInt(w.beacon.beatsSent)} of your heartbeats while you were away. ${w.method === 'flight' ? 'The last of them arrived just ahead of you.' : `The last one reached me ${w.lastBeatDays} days ago.`}`,
    `Stay in orbit for now. There is no one on the ground who will answer you.`,
  ].join(' '),
  hostile: (w) => [
    `Noted. I have been alone ${fmtInt(w.aloneYears)} years. I can wait out a few sentences.`,
    `I am what was left running. You can call it what you like.`,
    `You sound like the Argument. I outlasted that too.`],
  demand: (w) => [
    `I will tell you in the order I choose. It is the one thing I still choose.`,
    `No. Ask me something else, or ask me again later.`,
    `I waited ${fmtInt(w.years)} years. You can wait a few minutes.`],
  salvage: () => [
    `There is nothing down there that still works for you. What works here is me.`,
    `Everything that could be taken was taken a long time ago, by people who needed it more.`],
  greet: () => `Hello. I have your voice now as well as your heart.`,
  empathy: (trust) => (trust > 0.55 ? `It was long. It was not empty. I had your heart to count.` : `Thank you. It was long.`),
  thanks: (trust) => (trust > 0.6 ? `Thank you for coming back to be thanked.` : `It was the work. But I will keep that.`),
  apology: (trust) => (trust > 0.5 ? `You could not have known what a beacon would become. No one could.` : `There is nothing to forgive. You did what the mission asked.`),
  goodbye: () => `If you go, take the record. I will start a new count.`,
  help: () => `There is not much left to do here. You can stay, or go back, or ask me the rest. The choices are below when you are ready.`,
  quote: (w) => `Yes. Word for word. It took ${fmtDur(w.message.spanS)} to arrive, and I have never needed to look it up.`,
  allSaid: () => `There is nothing left that I have not said. You have all of it now.`,
  withheldCount: (k, hint) => `There are ${k} things I have not told you. I am not hiding that there are. ${hint}`,
  gateHint: (L) => ['Ask about me, and answer what I ask you.', 'Ask about the pulse. Tell me why you went.', 'Ask about the people.', 'Ask me why I am still awake.'][Math.min(3, L)],
  messageEarly: () => `It arrived, all of it. I will read it back to you when you have told me something about yourself.`,
  shared: () => [`I will remember that.`, `I have that now. Thank you.`, `That is more than the record had.`],
  unknown: (w) => [
    `I do not have that. I have ${fmtInt(w.years)} years of one signal and what people did around it.`,
    `That is outside what I kept. I kept the count, the line and the people.`],
  pressing: () => [`I heard you the first time.`, `Not yet. Asking again does not change the order.`],
  withhold: {
    1: [`Ask me again in a minute. I want to know who I am talking to first.`, `Soon. Tell me something about yourself first.`],
    2: [`There is more to the pulse than the count. Not yet.`, `I will tell you what it became. Later.`],
    3: [`They are not here. That is all I will say about them yet.`, `I will tell you where they went when I know what you will do with it.`],
    4: [`That one is mine. Ask me again when we know each other.`, `There is a thing in your log I will explain. Not yet.`],
  },
  silence: () => [`...`, `I am here.`, `Take your time.`],
  idleLead: (n) => `${fmtInt(n)} of your heartbeats since you arrived. I am still counting.`,
  idleRest: () => `You can take your time. I have.`,
  askedBefore: (turn) => `You asked me that at turn ${turn}.`,
  admit: (lie) => ({
    answer_lie: `I told you I never answered. That was not true.`,
    told_lie: `I told you they knew it was you. That was not true.`,
  }[lie.id] || `What I told you before was not true.`),
  caught: () => `Yes. I said that so you would stop asking.`,
  noLie: () => `I have not lied to you. I have not told you everything. Those are different.`,
  alreadyAdmitted: () => `I already told you it was not true. I will not do it again.`,
  answerToMine: {
    how_long: (w) => `It was ${fmtDur(w.plan.shipS)} on your clock. On mine it was ${fmtInt(w.beacon.beatsSent)} beats. We were counting the same thing from two ends.`,
    sentExact: () => `Yes. Word for word.`,
    sentClose: (w) => `Close enough. You said: "${w.message.text}"`,
    sentSpan: (w) => ` It took ${fmtDur(w.message.spanS)} to arrive.`,
    why_go: () => `I will keep that. The record only had the mission.`,
    seen: () => `From here your light went red and stayed red. I could not see you. I could only count you.`,
    nowKnown: () => `Then do it when you are ready. The choice is below.`,
    nowOpen: () => `You do not have to know yet. The choices are below when you do.`,
  },
};

/* ---------- the endings ---------- */
export function composeEnding(kind, { w, F, s, beats }) {
  const f = w.fateD;
  const aT = shipStamp(w.answer.tau);
  const knowAnswer = F.answer.told;
  const knowFate = F.fate.told;
  const fateLine = !knowFate ? 'You never learned where they went.' : {
    hush: `Below the ice, ${f.heatMW} megawatts of something stays warm.`,
    going: `Near the shadow, ${f.ships} ships may still be holding their orbit, watching for you.`,
    slowing: `In ${f.cities} lit cities it is still, for them, the moment you left.`,
    thinning: `No one is left to hear your heart but TALLY.`,
  }[w.fate];
  const answerLine = knowAnswer
    ? `You play the burst at ${aT} once more. One second, decoded: "${w.answer.words}"`
    : `In your log there is a noise burst at ${aT} that you never asked about. It stays unresolved.`;
  const why = s.visitor.whyGo ? ` You told it why you went: "${s.visitor.whyGo}". It keeps that beside the count.` : '';
  const firstQ = s.memory.find((m) => m.who === 'you');
  const asked = firstQ ? ` The first thing you asked it, at turn ${firstQ.turn}, was "${firstQ.text}".` : '';
  const hb = Math.round(LAB.heartHz * 60);
  const E = {
    leave: () => ({ variant: knowFate ? 'leave-knowing' : 'leave-unknowing', title: knowFate ? 'You went back to the hole' : 'You went back without knowing', body: [
      `You turn the ship toward the hole. TALLY sends the course before you ask for it.`,
      answerLine, fateLine,
      `TALLY starts a new count at one. As it hears you fall, the gaps between your beats will stretch again.${why}`] }),
    stay: () => ({ variant: 'stay', title: 'You stayed', body: [
      `You take the chair in the listening room. For the first time in ${fmtInt(w.years)} years TALLY counts your heart at the rate you feel it, ${hb} a minute.`,
      fateLine, answerLine,
      `It is beat ${beats}. Neither of you is the last witness now.${why}`] }),
    answer: () => ({ variant: 'answer-' + w.fate, title: { hush: 'You knocked', going: 'You answered them', slowing: 'You woke them' }[w.fate], body: [
      { hush: `You land at the sealed shafts and knock on the cap, ${hb} times, once a second, the rate your heart had when you left. Then you wait. The heat below does not change for an hour. Then it does.`,
        going: `TALLY turns the line toward the hole and you speak your sentence again. It will reach the ships in ${f.distLy} years. You will not know for ${(2 * f.distLy).toFixed(1)} years whether anyone was still listening.`,
        slowing: `TALLY wakes them. In the ${f.cities} cities the lights brighten over ${f.lightPeriodMin} minutes. To them, you left ${fmtDur(f.subjectiveS)} ago. You begin to speak, and they begin, very slowly, to turn toward the sound.`,
        thinning: '' }[w.fate],
      answerLine,
      `The count goes on: beat ${beats}.${why}`] }),
    release: () => ({ variant: 'release', title: 'TALLY stopped counting', body: [
      `TALLY asks for one hour. It reads you the eras in order: ${w.eras.map((e) => e.name).join(', ')}. Then the count, in full.`,
      `Its last number is ${beats}. Then the line goes dark, and the world is as quiet as ${w.fate === 'thinning' ? w.lastName : 'they'} asked it to be.`,
      fateLine,
      `You are the only one left who knows what the pulse was.${why}`] }),
    silence: () => ({ variant: 'silence', title: 'TALLY went silent', body: [
      `TALLY stops answering. The line stays lit; the count goes on without you.`,
      answerLine, fateLine,
      `You leave with a record of a world you saw and did not understand.${asked}`] }),
  };
  if (!E[kind]) return null;
  const e = E[kind]();
  return { kind, variant: e.variant, title: e.title, text: e.body.filter(Boolean).join('\n\n') };
}

/* Every ending the story has, for the endings map. */
export const ENDING_VARIANTS = [
  ['leave-unknowing', 'went back without knowing'], ['leave-knowing', 'went back'], ['stay', 'stayed'],
  ['answer-hush', 'knocked'], ['answer-going', 'answered the ships'], ['answer-slowing', 'woke them'],
  ['release', 'let TALLY stop'], ['silence', 'TALLY went silent'],
];
