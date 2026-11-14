/* ============================================================
   heptapod/lexicon-data.js — the concepts the script can name,
   with a part of speech, a semantic class and a short gloss.

   Format, one concept per string:
     nouns  'id|gloss'  or  'id|gloss|plural'  or  'id|gloss|plural|article'
     verbs  'id|gloss'  or  'id|gloss|past|participle|-ing|-s'  (blank = regular)
   Flags after the gloss in square brackets: [dt] takes two objects
   (give us a gift), [cl] takes a 'that' clause.

   Chosen by hand for this lab (first contact, language, time, the
   body of a small world); not drawn from a published word list.
   [ILLUSTRATIVE] The order inside a class fixes each code, so new
   concepts are appended at the end of their class.
   ============================================================ */

export const PRONOUNS = [
  { id: 'i', subj: 'I', obj: 'me', num: 'sg', third: false, gloss: 'the writer' },
  { id: 'you', subj: 'you', obj: 'you', num: 'sg', third: false, gloss: 'the reader' },
  { id: 'we', subj: 'we', obj: 'us', num: 'pl', third: false, gloss: 'the writer and others' },
  { id: 'they', subj: 'they', obj: 'them', num: 'pl', third: false, gloss: 'others, named before' },
  { id: 'he', subj: 'he', obj: 'him', num: 'sg', third: true, gloss: 'one man, named before' },
  { id: 'she', subj: 'she', obj: 'her', num: 'sg', third: true, gloss: 'one woman, named before' },
];
export const THING_PRONOUNS = [
  { id: 'it', subj: 'it', obj: 'it', num: 'sg', third: true, gloss: 'a thing, named before' },
  { id: 'something', subj: 'something', obj: 'something', num: 'sg', third: true, gloss: 'a thing the lexicon cannot name (the fallback radical)' },
];

export const BEINGS = [
  'human|a person of Earth', 'person|one human being|people', 'child|a young human|children', 'mother|a female parent',
  'father|a male parent', 'daughter|a female child', 'linguist|one who studies languages', 'physicist|one who studies matter and light',
  'scientist|one who studies by measuring', 'soldier|one who fights for a state', 'visitor|one who arrives from elsewhere',
  'stranger|one not known', 'heptapod|a seven-limbed visitor', 'friend|one trusted|friends|a', 'enemy|one opposed|enemies|an',
  'teacher|one who teaches', 'leader|one who leads', 'colonel|an officer who commands', 'son|a male child',
  'sister|a female sibling', 'brother|a male sibling', 'woman|an adult female|women', 'man|an adult male|men',
  'doctor|one who heals', 'pilot|one who flies a craft', 'guard|one who protects a place', 'king|a ruler',
  'queen|a female ruler', 'student|one who learns', 'writer|one who writes', 'reader|one who reads',
  'speaker|one who speaks', 'listener|one who listens', 'translator|one who carries meaning between languages',
  'crowd|many people together|crowds', 'nation|a people under one state', 'family|people of one home|families',
  'animal|a living creature', 'bird|a creature with wings', 'fish|a creature of water|fishes', 'whale|a great creature of the sea',
  'tree|a tall plant', 'plant|a living thing that grows in place', 'body|the living form of a being|bodies',
  'mind|that which thinks', 'ghost|the shape of one who has died', 'god|a being worshipped|gods',
  'neighbour|one who lives near', 'messenger|one who carries a message', 'witness|one who saw|witnesses|a',
];

export const THINGS = [
  'ship|a vessel that carries', 'tool|a made thing for a task||a', 'weapon|a tool for harm||a', 'gift|a thing given freely||a',
  'book|written pages bound', 'letter|a written message||a', 'door|a way in that closes', 'light|what lets eyes see',
  'water|the clear liquid of seas', 'stone|a piece of rock||a', 'fire|burning heat and light', 'key|what opens a lock',
  'mirror|glass that shows the one who looks', 'screen|a surface that shows images', 'glass|a hard clear solid|glasses',
  'shell|a hard outer case', 'machine|a made thing that works by itself||a', 'signal|a sign sent at a distance||a',
  'map|a picture of a place', 'message|meaning sent to another||a', 'seed|the start of a plant||a', 'ring|a closed circle||a',
  'ink|the liquid of writing', 'paper|a thin sheet for writing', 'pen|a tool for writing||a', 'image|a picture||an',
  'sound|what ears hear||a', 'voice|the sound of a speaker||a', 'radio|a machine that sends voices||a', 'camera|a machine that keeps images||a',
  'table|a raised flat surface||a', 'room|an enclosed space in a building||a', 'house|a building to live in||a', 'wall|a vertical barrier||a',
  'window|an opening that lets in light||a', 'road|a way for travel||a', 'bridge|a way over a gap||a', 'city|a great settlement|cities|a',
  'field|open ground||a', 'mountain|a great height of land||a', 'river|flowing water||a', 'cloud|vapour in the sky||a',
  'rain|water falling from clouds', 'snow|frozen rain', 'sun|the star of Earth', 'moon|the companion of Earth',
  'star|a sun far away||a', 'planet|a world that circles a star||a', 'air|the gas around Earth', 'ice|frozen water',
  'sand|grains of stone', 'blood|the red liquid of a body', 'bone|the hard frame of a body||a', 'hand|the end of an arm||a',
  'eye|the organ of sight||an', 'heart|the organ that drives blood||a', 'food|what is eaten', 'bread|baked food',
  'money|tokens of exchange', 'gold|a soft yellow metal', 'iron|a hard grey metal', 'clock|a machine that counts hours||a',
  'bomb|a weapon that explodes||a', 'gun|a weapon that fires||a', 'drawing|a picture made by hand||a', 'symbol|a mark that stands for something||a',
  'glyph|one written figure||a', 'semagram|one written proposition of the visitors||a',
];

export const ABSTRACT = [
  'language|a system for meaning||a', 'word|a unit of a language||a', 'sentence|a whole statement', 'time|the order of events',
  'future|what has not yet happened', 'past|what has already happened', 'truth|what is so', 'purpose|what a thing is for||a',
  'meaning|what is meant', 'world|the whole of a place', 'sky|the space above', 'sea|the great water',
  'home|a place one belongs||a', 'war|armed struggle||a', 'peace|the absence of war', 'fear|the feeling of danger',
  'hope|the wish that good will come||a', 'memory|what is kept of the past|memories|a', 'question|a request for an answer||a',
  'answer|a reply to a question||an', 'story|an account of events|stories|a', 'life|being alive|lives|a', 'death|the end of life',
  'name|what a thing is called||a', 'game|play with rules||a', 'night|the dark half of a day||a', 'day|one turn of the world||a',
  'year|one turn around the sun||a', 'moment|a very short time||a', 'end|the last part||an', 'beginning|the first part||a',
  'cause|what makes a thing happen||a', 'choice|a decision among ways||a', 'danger|the chance of harm||a', 'trust|belief in another',
  'love|deep care for another', 'grief|sorrow at a loss', 'joy|great gladness', 'anger|strong displeasure',
  'idea|a thought||an', 'plan|a way decided ahead||a', 'rule|what must be done||a', 'law|a rule of a state or of nature||a',
  'number|a count||a', 'pattern|an order that repeats||a', 'shape|the outline of a thing||a', 'circle|a round line||a',
  'line|a long thin mark||a', 'path|a way taken||a', 'distance|the space between||a', 'speed|how fast a thing moves||a',
  'energy|the power to change things', 'force|a push or a pull||a', 'mathematics|the science of number', 'physics|the science of matter and light',
  'music|ordered sound', 'silence|the absence of sound', 'dream|images in sleep||a', 'secret|what is hidden||a',
  'promise|a word that binds||a', 'lie|a false statement||a', 'agreement|a shared decision||an', 'problem|a difficulty||a',
  'mistake|a wrong act||a', 'chance|what may happen||a', 'freedom|the absence of restraint', 'history|the record of the past',
  'knowledge|what is known', 'grammar|the rules of a language',
];

export const MOTION = [
  'give|hand over|gave|given|| [dt]', 'offer|hold out to be taken|||| [dt]', 'send|cause to go|sent|sent|| [dt]',
  'bring|carry here|brought|brought|| [dt]', 'show|let be seen||shown|| [dt] [cl]', 'take|get hold of|took|taken', 'carry|hold while moving',
  'arrive|reach a place', 'leave|go away from|left|left', 'return|come back', 'come|move toward|came|come', 'follow|go after',
  'find|come upon|found|found', 'lose|no longer have|lost|lost', 'hold|keep in the hand|held|held', 'open|make open', 'close|make closed',
  'keep|continue to have|kept|kept', 'throw|send through the air|threw|thrown', 'lend|give for a time|lent|lent|| [dt]',
  'go|move away|went|gone||goes', 'run|move fast on foot|ran|run|running', 'walk|move on foot', 'fly|move through air|flew|flown||flies',
  'fall|drop down|fell|fallen', 'rise|go up|rose|risen', 'enter|go into', 'cross|go across', 'move|change place', 'push|press away',
  'pull|draw toward', 'lift|raise up', 'drop|let fall|dropped|dropped|dropping', 'hide|put out of sight|hid|hidden|hiding',
  'reach|arrive at', 'pass|go by', 'touch|meet with the hand||||touches', 'meet|come together with|met|met', 'sell|give for money|sold|sold|| [dt]',
  'buy|get for money|bought|bought',
];

export const MIND = [
  'see|perceive with the eyes|saw|seen|| [cl]', 'hear|perceive with the ears|heard|heard|| [cl]', 'watch|look at for a time||||watches',
  'know|hold as true|knew|known|| [cl]', 'understand|grasp the meaning of|understood|understood|| [cl]', 'learn|come to know|||| [cl]',
  'teach|cause to know|taught|taught||teaches [dt] [cl]', 'remember|keep in mind|||| [cl]', 'forget|lose from mind|forgot|forgotten|forgetting| [cl]',
  'ask|put a question to|||| [dt]', 'answer|reply to', 'tell|say to|told|told|| [dt] [cl]', 'say|put into words|said|said|| [cl]',
  'write|put into writing|wrote|written|writing| [dt] [cl]', 'read|take meaning from writing|read|read', 'believe|accept as true|||| [cl]',
  'trust|rely on', 'fear|be afraid of|||| [cl]', 'want|wish to have', 'need|require', 'love|care deeply for', 'choose|pick out|chose|chosen',
  'expect|think will happen|||| [cl]', 'study|learn by attention|||| ', 'translate|carry the meaning into another language', 'speak|use the voice|spoke|spoken',
  'think|use the mind|thought|thought|| [cl]', 'decide|settle on a choice|||| [cl]', 'imagine|form an image in the mind|||| [cl]',
  'doubt|be unsure of|||| [cl]', 'hope|wish for|||| [cl]', 'notice|become aware of|||| [cl]', 'recognise|know again|||| [cl]',
  'mean|intend to say|meant|meant|| [cl]', 'explain|make clear|||| [cl]', 'describe|tell what a thing is like', 'name|give a name to',
  'call|speak to from afar', 'warn|tell of danger|||| [dt] [cl]', 'promise|bind oneself to|||| [dt] [cl]', 'forgive|stop blaming|forgave|forgiven',
  'ignore|pay no attention to', 'listen|attend to sound', 'feel|sense|felt|felt|| [cl]', 'dream|see in sleep|||| [cl]', 'count|number one by one',
];

export const CHANGE = [
  'make|bring into being|made|made', 'build|put together|built|built', 'change|make different', 'begin|start|began|begun|beginning',
  'end|bring to a close', 'destroy|ruin completely', 'save|keep from harm', 'help|make easier for', 'protect|keep safe',
  'break|split apart|broke|broken', 'grow|become larger|grew|grown', 'live|be alive', 'die|stop living|||dying', 'wake|stop sleeping|woke|woken',
  'sleep|rest with closed eyes|slept|slept', 'wait|stay until', 'fight|struggle against|fought|fought', 'attack|move against',
  'heal|make well', 'win|gain by effort|won|won|winning', 'stop|bring to an end|stopped|stopped|stopping', 'become|come to be|became|become',
  'create|cause to exist', 'fix|repair||||fixes', 'burn|consume with fire', 'cut|divide with an edge|cut|cut|cutting', 'join|bring together',
  'divide|split into parts', 'fill|make full', 'empty|make empty||||empties', 'cover|put over', 'mark|make a sign on', 'draw|make a picture|drew|drawn',
  'paint|colour with a brush', 'kill|cause to die', 'feed|give food to|fed|fed', 'plant|put in the ground to grow', 'shine|give light|shone|shone',
  'freeze|turn to ice|froze|frozen', 'repeat|do again', 'finish|bring to completion||||finishes',
];
