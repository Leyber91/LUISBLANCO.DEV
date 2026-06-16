/* =========================================================================
   aea-framework.js — the canonical AEA framework as DATA, separated from the
   WebGL renderer (aea3d.js). Edit the framework content here (axis levels,
   examples, the lit/proven rungs, seeds, mechanics, prerequisites); the
   renderer reads it and stays untouched.

   window.LB_AEA = { AX, SEEDS, MECH, OPS, PREREQ }
     AX[]     : the five axes — { key, c (code), name, sub, levels[] }
                level = { n, label, ex? (example placement), lit? (proven rung) }
     SEEDS[]  : the ten parts — { num, name, pd (plain desc), enables[] }
     MECH[]   : mechanics — { name, seeds[], on[] (axis,level), detail }
     OPS[]    : the four operations
     PREREQ[] : [fromAxis, fromLevel, toAxis, toLevel, strength] lattice edges
   ========================================================================= */
(function(){
  'use strict';
  const AX=[
   {key:'path',c:'P',name:'PATH',sub:'who decides',levels:[{n:1,label:'one-shot'},{n:2,label:'multi-step',ex:'ingestion pipeline'},{n:3,label:'branching',ex:'ops dashboard',lit:1},{n:4,label:'entity-defines',ex:'1500-tick'},{n:5,label:'anticipates'}]},
   {key:'multiplicity',c:'M',name:'MULTIPLICITY',sub:'how many',levels:[{n:1,label:'single',ex:'DATASPACE'},{n:2,label:'N-uncoord'},{n:3,label:'role-diff',ex:'HADES MoA'},{n:4,label:'coordinated',ex:'recursive MoA',lit:1},{n:5,label:'emergent'}]},
   {key:'abstraction',c:'A',name:'ABSTRACTION',sub:'composes with',levels:[{n:0,label:'raw',ex:'GPT-2'},{n:1,label:'+memory',ex:'RAG',lit:1},{n:2,label:'+tools',ex:'MCP'},{n:3,label:'+tool-gen',ex:'skills · Voyager'},{n:4,label:'+integration'},{n:5,label:'self-extend'}]},
   {key:'prompting',c:'R',name:'pROMPTING',sub:'input built',levels:[{n:1,label:'none'},{n:2,label:'preprompt'},{n:3,label:'context-dep',ex:'essence passing'},{n:4,label:'param+tools',ex:'Document DNA'},{n:5,label:'self-refine',ex:'Self-Propelling',lit:1},{n:6,label:'co-evolve'},{n:7,label:'absorption'}]},
   {key:'async',c:'S',name:'aSYNC',sub:'time',levels:[{n:1,label:'sync'},{n:2,label:'pipeline',ex:'Ouroboros'},{n:3,label:'event-driven'},{n:4,label:'independent',ex:'1500-tick',lit:1},{n:5,label:'multi-version',ex:'backwards channel'}]},
  ];
  const SEEDS=[
   {num:1,name:'RUNS ON',pd:'Something to run on — the hardware and the model itself.',enables:[]},
   {num:2,name:'THE GOAL',pd:'A clear goal it can measure its own work against.',enables:[]},
   {num:3,name:'FREEZE TO CODE',pd:'Turns work it keeps repeating into plain code that runs for free.',enables:[]},
   {num:4,name:'FALL BACK',pd:'When something new shows up, it drops back to the model instead of breaking.',enables:[]},
   {num:5,name:'SELF-UPGRADE',pd:'Builds its own next version, safely, without losing the old one.',enables:[]},
   {num:6,name:'SELF-KNOWLEDGE',pd:'A working picture of what it is made of and what each part is for.',enables:[['prompting',5],['path',4],['multiplicity',5]]},
   {num:7,name:'KNOWS IT IS STUCK',pd:'Senses when the current approach has stopped working.',enables:[]},
   {num:8,name:'THE LINES',pd:'Rules it must never cross — even with its own self-changes.',enables:[['async',4]]},
   {num:9,name:'ROLLBACK LINE',pd:'A way back to the previous version that never closes.',enables:[['prompting',7]]},
   {num:10,name:'PROGRESS CHECK',pd:'Notices when it must change shape, not just try harder.',enables:[['abstraction',5]]}];
  const MECH=[
   {name:'FREEZE TO CODE',seeds:[3],on:[['abstraction',2],['path',2]],detail:'Work it repeats becomes plain code that runs for almost nothing.'},
   {name:'FALL BACK',seeds:[4],on:[['abstraction',2],['path',4]],detail:'Hits something new? It returns to the model instead of failing.'},
   {name:'SELF-UPGRADE',seeds:[5,9],on:[['async',5],['abstraction',5],['multiplicity',5]],detail:'Builds its successor while the old version stays restorable.'},
   {name:'WHEN STUCK',seeds:[6,7],on:[],detail:'Decides what to do when it hits a wall.'}];
  const OPS=['DESIGN','TIME','SHIP','LEARN'];
  const PREREQ=[['multiplicity',5,'async',2,'locked'],['async',5,'multiplicity',2,'locked'],['path',5,'abstraction',1,'firm'],['abstraction',3,'path',2,'firm'],['abstraction',4,'prompting',4,'firm'],['abstraction',5,'prompting',5,'firm'],['prompting',6,'abstraction',3,'firm'],['path',3,'multiplicity',3,'soft'],['multiplicity',4,'prompting',3,'soft'],['prompting',4,'path',3,'soft'],['async',3,'abstraction',2,'soft']];

  window.LB_AEA = { AX, SEEDS, MECH, OPS, PREREQ };
})();
