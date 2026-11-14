/* Personalized Plans: the demo state of the running lab, and the coach
   module imported and perturbed (3 days against 4, a knee constraint). */
const LEG_BAN = /bench press|barbell row|overhead press|pull-up/i;

export const PROBES = {
  'wp-label': {
    what: 'loading the lab at ?demo (no model call) and reading who it says is reasoning',
    fails: 'supported only if the reasoning shown comes from a model; unsupported when a fixed template is shown',
    async run(ctx) {
      const f = await ctx.frame('workout-plans.html?demo', { ready: (a) => a.text('#reasoning-label') && a.count('#plan .day') > 0 });
      const label = f.text('#reasoning-label'), status = f.text('#ai-status-label');
      const { text } = await ctx.file('labs/assets/js/workout-plans/PlanService.js');
      const template = text.includes('thought: this.coach.buildReasoningScript(i),');
      return {
        status: 'pass', verdict: template ? 'unsupported' : 'partial',
        detail: `the reasoning panel is labelled "${label}" while the route reads "${status || 'detecting'}"; the text shown is the coach's fixed script`,
      };
    },
  },
  'wp-plan': {
    what: 'loading the lab at ?demo and counting the day cards and exercises it built',
    fails: 'fails if the demo builds no plan',
    async run(ctx) {
      const f = await ctx.frame('workout-plans.html?demo', { ready: (a) => a.count('#plan .day') > 0 });
      const days = f.count('#plan .day'), ex = f.count('#plan .ex');
      return { status: days ? 'pass' : 'fail', verdict: 'supported', detail: `${days} day cards, ${ex} exercises, for the demo week of 4 days` };
    },
  },
  'wp-week': {
    what: 'importing the coach and building the demo week at 3 and 4 days, with a knee constraint',
    fails: 'unsupported if the plan ignores the days; partial if a knee constraint still loads upper-body lifts into the lower day',
    async run() {
      const { LocalCoach } = await import('../../../workout-plans/LocalCoach.js');
      const { DEMO_INPUTS } = await import('../../../workout-plans/constants.js');
      const c = new LocalCoach();
      const p4 = c.buildPlan(DEMO_INPUTS), p3 = c.buildPlan({ ...DEMO_INPUTS, days: 3 });
      const follows = p4.split.length === 4 && p3.split.length === 3;
      const lower = p4.split.filter((d) => /lower|leg/i.test(d.focus));
      const leak = lower.flatMap((d) => d.exercises.map((e) => e.name)).filter((n) => LEG_BAN.test(n));
      return {
        status: 'pass', verdict: !follows ? 'unsupported' : leak.length ? 'partial' : 'supported',
        detail: `3 days builds ${p3.split.length} sessions, 4 days builds ${p4.split.length}; with "${DEMO_INPUTS.constraints}" the lower day holds ${leak.length ? leak.join(', ') : 'no upper-body lift'}`,
      };
    },
  },
};
