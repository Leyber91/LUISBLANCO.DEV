/* ============================================================
   heptapod/model.js — one model call: free English in, a semantic
   graph out.

   The deterministic parser reads a controlled English. For any
   other English the visitor can ask a model, once per click, to
   map the sentence onto this script's schema and radicals. The
   reply is validated by the same check that guards the parser
   (grammar.validateGraph); if no route answers or the reply does
   not validate, the parser's own reading is used and the page says
   so. Every call goes through labs/assets/js/ai/llm.js.
   ============================================================ */

import { LLM } from '../ai/llm.js';
import { parse, validateGraph, lexiconForPrompt } from './grammar.js';

function systemPrompt() {
  const { nouns, verbs } = lexiconForPrompt();
  return [
    'You translate one English sentence into a semantic graph for a constructed semasiographic script.',
    'Output one JSON object only. Schema:',
    'A proposition: {"type":"prop","pred":VERB,"agent":ENT|null,"patient":ENT|PROP|null,"recipient":ENT|null,',
    '"time":"past"|"present"|"future","aspect":"simple"|"progressive"|"perfect",',
    '"mood":"indicative"|"interrogative"|"imperative"|"potential","neg":true|false,"evid":"direct"|"inferred"|"reported"}',
    'ENT is {"c":NOUN,"num":"sg"|"pl"}. A patient may be a whole proposition (a "that" clause), one level deep, not a question or command.',
    'Two propositions joined: {"type":"rel","rel":"because"|"despite"|"after"|"before","a":PROP,"b":PROP} meaning "a REL b"; "although" and "even though" are "despite".',
    'Rules: use ONLY these concept ids. Nouns (pronouns included): ' + nouns + '.',
    'Verbs: ' + verbs + '.',
    'Map other words to the nearest listed concept (aliens -> visitor, spacecraft -> ship, comprehend -> understand).',
    'Drop what the schema cannot hold (adjectives, places, possessives). "potential" means can/could/may.',
    'A command has agent null. "apparently/it seems" is inferred; "reportedly/they say" is reported.',
    'Example: "The aliens were not giving us their weapons" -> {"type":"prop","pred":"give","agent":{"c":"visitor","num":"pl"},"patient":{"c":"weapon","num":"pl"},"recipient":{"c":"we","num":"pl"},"time":"past","aspect":"progressive","mood":"indicative","neg":true,"evid":"direct"}',
  ].join('\n');
}

/**
 * Ask a model for the graph of free English. Resolves to
 * { graph, source, model, ms, errors, note }. Never throws for a route failure.
 */
export async function graphFromModel(text, { signal, llm = LLM } = {}) {
  const fallbackParse = parse(text);
  const r = await llm.complete({
    system: systemPrompt(),
    prompt: 'Sentence: ' + text,
    json: true,
    temperature: 0.1,
    seed: 7,
    maxWaitMs: 50000,
    timeoutMs: 45000,
    signal,
    fallback: () => (fallbackParse.graph ? fallbackParse.graph : { error: fallbackParse.errors.join('; ') }),
  });
  if (r.source === 'offline') {
    return {
      graph: fallbackParse.graph, source: 'offline', model: 'parser', ms: r.ms, errors: r.errors,
      note: fallbackParse.graph ? 'no model route answered; the offline parser read it' : 'no model route answered, and the offline parser could not read it: ' + fallbackParse.errors.join('; '),
    };
  }
  const v = validateGraph(r.json);
  if (v.graph) return { graph: v.graph, source: r.source, model: r.model, ms: r.ms, errors: r.errors, note: 'graph from ' + r.model + ', validated against the schema' };
  return {
    graph: fallbackParse.graph, source: r.source, model: r.model, ms: r.ms, errors: v.errors,
    note: 'the model replied, but its graph failed validation (' + v.errors.slice(0, 2).join('; ') + ')' + (fallbackParse.graph ? '; the offline parser read it instead' : ''),
  };
}
