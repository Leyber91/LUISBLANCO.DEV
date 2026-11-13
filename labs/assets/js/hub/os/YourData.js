/* ============================================================
   hub/os/YourData.js — the footer's "Your data" control: where
   the record is kept (a one-line stamp), and a panel to see it,
   export it as JSON or delete it. Also shows the fixture stamp
   when the page runs on ?os-fixture=.

   Any link to #your-data opens the panel, and so does the hub
   opened at labs/index.html#your-data, so a lab can send a
   visitor straight to their record.
   ============================================================ */

import { SEL } from '../constants.js';
import { $ } from '../dom.js';
import { dataPanel, fixtureStamp, storageStamp } from '../../os/ui.js';

const DATA_HASH = '#your-data';

export class YourData {
  constructor(osReady) { this.osReady = osReady; }

  async mount() {
    const btn = $(SEL.osData);
    const os = await this.osReady;
    if (!btn || !os) return;

    $(SEL.osStorage)?.replaceChildren(storageStamp(os.storage));
    const stamp = fixtureStamp(os.storage);
    const fx = $(SEL.osFixture);
    if (stamp && fx) { fx.replaceChildren(stamp); fx.hidden = false; }

    this.panel = dataPanel(os);
    btn.hidden = false;
    btn.addEventListener('click', () => this.panel.open());
    this.onLink = (e) => {
      const a = e.target instanceof Element ? e.target.closest(`a[href="${DATA_HASH}"]`) : null;
      if (!a) return;
      e.preventDefault();
      void this.panel.open();
    };
    document.addEventListener('click', this.onLink);
    if (location.hash === DATA_HASH) void this.panel.open();
  }

  destroy() { document.removeEventListener('click', this.onLink); this.panel?.destroy(); }
}
