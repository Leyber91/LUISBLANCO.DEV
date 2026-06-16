/* ============================================================
   workout-plans/main.js — entry point for the Personalized Plans
   showcase.

   A reasoning model thinks through the user's constraints out loud
   (streamed), then commits to a structured training block. Wired to
   the shared tiered backend (ollama -> worker -> echo) so it works
   live with a local model, live via the hosted Nemotron relay, or
   fully offline against a built-in coach.

   All behaviour lives in PlanController and its collaborators
   (PlanService / PlanView / LocalCoach); this just boots it. The
   module is loaded at the end of <body>, so the DOM is ready.
   ============================================================ */

import { PlanController } from './PlanController.js';

PlanController.boot();
