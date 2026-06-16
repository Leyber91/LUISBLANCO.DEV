/* ============================================================
   ai/config.js — provider catalog + tiering policy.

   No secrets here. Keys live ONLY in the Cloudflare Worker as
   encrypted secrets (see /workers/ai-proxy). The browser never
   holds a key — a static site cannot keep one safe.

   Tiering (auto): the provider walks this order and uses the
   first that answers a health check:
     1. ollama  — your local machine (free, private, offline)
     2. worker  — the deployed Cloudflare proxy (groq / nvidia)
     3. echo    — scripted offline fallback (always works)
   ============================================================ */

export const AI_CONFIG = {
  /* Order the auto-detector tries. */
  tier: ['ollama', 'worker', 'echo'],

  ollama: {
    /* Only probed when running locally (localhost / 127.0.0.1 / file://). */
    base: 'http://localhost:11434',
    chatPath: '/api/chat',
    tagsPath: '/api/tags',
    defaultModel: 'llama3.1:8b',
    // edit to whatever you have pulled: `ollama list`
    models: ['llama3.1:8b', 'qwen2.5:14b', 'gemma2:9b'],
  },

  worker: {
    /* Set this to your deployed worker URL after `wrangler deploy`.
       Leave '' to skip the worker tier entirely. */
    base: '',                       // e.g. 'https://l212-ai.<subdomain>.workers.dev'
    chatPath: '/v1/chat',
    healthPath: '/health',
    /* Which upstream the worker should call + the model to use.
       The worker maps `provider` -> the right base URL + secret. */
    defaultProvider: 'groq',
    defaultModel: 'llama-3.3-70b-versatile',
  },

  /* Altverse pipeline knobs — the Nemotron client reads these.
     (durationMs is generous: a 550B reasoning call is minutes, not 90s;
     tune to the MEASURED p95 after the first deployed-worker run.) */
  altverse: {
    rpmMs: 1600, concurrency: 1, stallMs: 60000, durationMs: 360000, maxRetries: 4,
    provider: 'nvidia', model: 'nvidia/nemotron-3-ultra-550b-a55b',
  },

  /* Upstream catalogs — for UI pickers. The worker enforces these
     server-side too; listing here is purely cosmetic. */
  catalog: {
    groq: {
      label: 'Groq',
      models: [
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
        'openai/gpt-oss-120b',
        'openai/gpt-oss-20b',
        'qwen/qwen3-32b',
        'meta-llama/llama-4-scout-17b-16e-instruct',
        'groq/compound',
      ],
    },
    nvidia: {
      label: 'NVIDIA',
      models: ['nvidia/nemotron-3-ultra-550b-a55b'],
      reasoning: true,            // emits reasoning_content
    },
  },

  defaults: {
    temperature: 0.8,
    maxTokens: 2048,
    typeCps: 48,                  // echo / type-out speed (chars/sec)
  },
};
