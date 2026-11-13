/* ============================================================
   hub/os/catalogue.js — the labs a visitor can open, in the
   shape Labs OS ranks ("what's next"): id, title, a site path,
   and the world each belongs to. Built from site.config.js, so
   a lab that goes live appears here with no edit.
   ============================================================ */

import { ALL_PROJECTS, STATUS } from '../../config/site.config.js';
import { WORLDS } from '../constants.js';

const WORLD_OF = new Map(Object.entries(WORLDS).flatMap(([id, w]) => w.labs.map((lab) => [lab, { id, name: w.name }])));

/** Live labs with a page, in hub order. */
export function catalogue(base = location.href) {
  return ALL_PROJECTS
    .filter((p) => STATUS[p.status]?.interactive && p.href)
    .map((p) => {
      const w = WORLD_OF.get(p.id) || { id: p.category, name: p.categoryLabel };
      return { id: p.id, title: p.title, href: new URL(p.href, base).pathname, world: w.id, worldName: w.name };
    });
}
