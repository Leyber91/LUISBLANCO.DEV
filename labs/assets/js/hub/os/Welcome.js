/* ============================================================
   hub/os/Welcome.js — the "since your last visit" plate.

   Shown only to a visitor with history: the last lab they
   opened, how long ago, a continue link (to the lab's own resume
   point when it set one), and up to three what's-next rows from
   Labs OS, each with its reason. A first-time visitor sees
   nothing here. After rendering, the hub saves the catalogue it
   showed, so the next visit can name the labs that are new; with
   recording off it saves nothing, and the plate's title block says
   "Recording off" with the way back on (and follows the switch).
   ============================================================ */

import { SEL, OS_HUB } from '../constants.js';
import { $ } from '../dom.js';
import { describeVisit } from '../../os/resume.js';
import { resumePlate } from '../../os/ui.js';
import { dayMonth } from '../../os/util.js';
import { catalogue } from './catalogue.js';

export class Welcome {
  constructor(osReady) { this.osReady = osReady; }

  async mount() {
    const slot = $(SEL.osWelcome);
    const os = await this.osReady;
    if (!slot || !os) return;

    const cat = catalogue();
    const byId = new Map(cat.map((c) => [c.id, c]));
    const hubRecord = await os.progress.get();
    const known = Array.isArray(hubRecord?.data?.known) ? hubRecord.data.known : null;

    const [last] = (await os.resume.lastSessions({ exclude: [OS_HUB.lab], limit: 20 })).filter((v) => byId.has(v.lab));
    const next = await os.resume.whatsNext(cat, {
      known,
      lastVisit: os.previousVisit?.t ?? null,
      exclude: last ? [last.lab] : [],
      limit: OS_HUB.suggestions,
    });
    if (os.recording.on) await os.progress.set({ known: cat.map((c) => c.id) });

    if (!last && !next.length) return;
    let plateLast = null;
    if (last) {
      const entry = byId.get(last.lab);
      const rec = await os.progress.of(last.lab);
      const resume = rec?.resume && !rec.finished ? rec.resume : null;
      plateLast = { title: entry.title, href: resume?.url ?? entry.href, when: describeVisit(last, Date.now()), resumeLabel: resume?.label ?? null };
    }
    const { counts, firstEvent, dropped } = await os.privacy.summary();
    const n = counts.events.toLocaleString('en-US');
    const record = firstEvent === null ? null
      : `${n} ${counts.events === 1 ? 'event' : 'events'} since ${dayMonth(firstEvent)}${dropped ? ', earlier ones summarised' : ''}`;
    const render = () => slot.replaceChildren(resumePlate({
      last: plateLast, next, persistent: os.storage.persistent, record, recording: os.recording.on,
    }));
    render();
    slot.hidden = false;
    os.recording.onChange(render);
    os.onDeleted(() => { slot.hidden = true; slot.replaceChildren(); });
  }
}
