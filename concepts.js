/* =========================================================================
   concepts.js — AEA Concept Locator data (mirrors data/located-concepts.json)
   Each: term, axes:[{axis,level}], optional off_map, explanation.
   Axis codes: P path · M multiplicity · A abstraction · R prompting · S async
   ========================================================================= */
window.LB_CONCEPTS = [
  { term:"RAG", axes:[{axis:"A",level:2},{axis:"R",level:3}],
    explanation:"Retrieval augments the prompt — memory at Abstraction L2, context-built input at Prompting L3. It feeds the node; it doesn't change who decides the next step." },
  { term:"MCP", axes:[{axis:"A",level:2},{axis:"A",level:3}],
    explanation:"A tool-use protocol, not an architecture. Lives at Abstraction L2–3 — how the model reaches tools, not how the system governs itself." },
  { term:"agents", axes:[{axis:"P",level:1},{axis:"P",level:2}],
    explanation:"Typically Path L1–2 dressed as L3. A fixed or branch-scripted loop is not yet entity-defined control." },
  { term:"fine-tuning", axes:[], off_map:true,
    explanation:"Off the map. Tunes the node, not the system — it shifts the model's weights, none of the five axes move." },
  { term:"long-context", axes:[{axis:"A",level:2}],
    explanation:"A wider raw + memory window: Abstraction L2. A bigger buffer doesn't move Path, Multiplicity, or Async." },
  { term:"RLHF", axes:[], off_map:true,
    explanation:"Off the map. Training-time alignment shapes the node's behavior; it doesn't add structure to the surrounding system." },
  { term:"LangChain", axes:[{axis:"A",level:3},{axis:"S",level:2}],
    explanation:"Tool wiring plus pipelines — Abstraction L3, Async L2. A framework for composition, not autonomy on its own." },
  { term:"world models", axes:[{axis:"A",level:5}],
    explanation:"Self-extending abstraction: Abstraction L5 territory, mostly aspirational. The node modeling its own environment to compose new capability." },
  { term:"chain-of-thought", axes:[{axis:"R",level:3}],
    explanation:"Context-dependent prompting: Prompting L3. Structures the input so reasoning unfolds; the rest of the system is unchanged." },
  { term:"ReAct", axes:[{axis:"P",level:3},{axis:"A",level:3}],
    explanation:"Explicit forks plus tools — Path L3, Abstraction L3. Reason-act interleaving begins to define its own branches." },
  { term:"function calling", axes:[{axis:"A",level:3}],
    explanation:"Tools attached to the node: Abstraction L3. The model can act on the world, but doesn't yet generate its own tools." },
  { term:"multi-agent", axes:[{axis:"M",level:3},{axis:"S",level:3}],
    explanation:"Role-differentiated and event-driven — Multiplicity L3, Async L3. Several nodes with distinct roles, reacting rather than locked in step." },
  { term:"mixture-of-agents", axes:[{axis:"M",level:3},{axis:"R",level:4}],
    explanation:"Role-differentiated multiplicity with parameterized prompting — Multiplicity L3, Prompting L4. (See groq_html in projects.)" },
  { term:"vector search", axes:[{axis:"A",level:2}],
    explanation:"Memory retrieval: Abstraction L2. Embedding lookup as a memory layer for the node." },
  { term:"prompt engineering", axes:[{axis:"R",level:2},{axis:"R",level:3}],
    explanation:"Preprompt to context-dependent: Prompting L2–3. Hand-shaping input — powerful, but bounded to one axis." },
  { term:"self-refine", axes:[{axis:"R",level:5}],
    explanation:"A self-refining input loop: Prompting L5. The system rewrites its own guidance from observed failure." },
  { term:"tool generation", axes:[{axis:"A",level:4}],
    explanation:"The model writes its own tools: Abstraction L4 — one step short of self-extending." },
  { term:"guardrails", axes:[{axis:"R",level:2}],
    explanation:"Preprompt constraints: Prompting L2. Constraint injection at the interface; doesn't alter system structure." },
  { term:"speculative decoding", axes:[], off_map:true,
    explanation:"Off the map. An inference-throughput optimization — it speeds the node, the system shape is untouched." },
  { term:"autonomous loops", axes:[{axis:"P",level:2},{axis:"S",level:4}],
    explanation:"Predetermined branches running independently — Path L2, Async L4. Unattended, but the control logic is still pre-scripted." }
];
window.LB_CHIPS = ["RAG","MCP","agents","fine-tuning","long-context","RLHF","LangChain","world models"];
