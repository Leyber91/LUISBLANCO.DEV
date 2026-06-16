/* ============================================================
   workout-plans/PlanController.js — the top-level controller.

   Composes the three single-responsibility pieces:
     LocalCoach  — deterministic plan + reasoning logic (no DOM)
     PlanService — the tiered model layer (no DOM)
     PlanView    — every DOM touch (no logic)

   It owns the request lifecycle: wires the form, runs the streamed
   model call, falls back to the local coach on parse failure, and
   renders. Demo mode renders synchronously before the network
   detect so it never races the first paint.
   ============================================================ */

import { LocalCoach } from './LocalCoach.js';
import { PlanService } from './PlanService.js';
import { PlanView } from './PlanView.js';
import { DEMO_INPUTS, DEMO_PARAM, FALLBACK_NOTE } from './constants.js';

export class PlanController {
  constructor() {
    this.coach = new LocalCoach();
    this.service = new PlanService(this.coach);
    this.view = new PlanView();
    this.controller = null;     // in-flight AbortController
  }

  async mount() {
    this.view.setYear();
    this.view.bindReasoningToggle();
    this.view.onSubmit((inputs) => this.generate(inputs));
    this.view.onStop(() => this.controller?.abort());

    // demo mode (screenshots / zero-click first impression): render
    // synchronously, before the network detect, so it never races paint.
    if (new URLSearchParams(location.search).has(DEMO_PARAM)) this.renderDemo();

    const mode = await this.service.detect();
    this.view.paintStatus(mode);
  }

  async generate(inputs) {
    this.controller?.abort();
    this.controller = new AbortController();
    const { signal } = this.controller;

    this.view.beginGenerate(this.service.mode);

    let answer = '';
    let gotReasoning = false;
    try {
      ({ answer, gotReasoning } = await this.service.stream(inputs, {
        signal,
        onReasoning: (t) => this.view.appendReasoning(t),
      }));
    } catch (err) {
      if (err?.name === 'AbortError') { /* user stopped */ }
      else console.warn('[plan] chat failed:', err);
    }

    this.view.endReasoning(gotReasoning);

    // turn the model's answer into a plan; fall back to the local coach
    let plan = this.service.extractPlan(answer);
    let note = null;
    if (!plan) {
      plan = this.coach.buildPlan(inputs);
      note = this.service.mode === 'echo' ? null : FALLBACK_NOTE;
    }
    this.view.renderPlan(plan, inputs, note);
    this.view.setBusy(false);
  }

  renderDemo() {
    const inputs = { ...DEMO_INPUTS };
    this.view.reflectInputs(inputs);
    this.view.showDemoReasoning(this.coach.buildReasoningScript(inputs).join('\n'));
    this.view.renderPlan(this.coach.buildPlan(inputs), inputs, null);
  }

  static boot() {
    const app = new PlanController();
    app.mount();
    return app;
  }
}
