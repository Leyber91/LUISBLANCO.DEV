/* ============================================================
   workout-plans/main.js — entry point for Personalized Plans.

   Module map:
     constants.js   every parameter, rule table, source and prompt
     library.js     the exercise library and substitution graph
     Planner.js     the deterministic planner and the re-planner
     LoadModel.js   session load, fitness-fatigue, variable dose
     LocalCoach.js  deterministic narration and the claim checker
     PlanService.js the one model call, through ai/llm.js
     charts.js, bodymap.js, graphview.js, PlanView.js   the views
     PlanController.js  state in the URL, orchestration, export
   ============================================================ */

import { PlanController } from './PlanController.js';

PlanController.boot();
