/* ============================================================
   altverse/store.js — localStorage persistence + sharing (Phase 4).
   Namespaced, per-world keys so one big world doesn't block the
   index. Orphan-safe (bodies dropped from the index are deleted),
   quota-aware (evict oldest, retry once), and shareable (a world
   serialises into a #w= permalink that replays the EXACT artifact).
   ============================================================ */

import { cleanDeep, noTags } from '../kit/guard.js';

const K_INDEX = 'altverse:index';
const K_WORLD = (id) => 'altverse:world:' + id;

function read(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function write(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch { return false; }
}

/* A world reaches this page from a share link, from this browser's storage and from a model, and the
   views write its text into the page as HTML. No world text needs markup, so the two characters that
   open and close a tag are replaced by look-alikes wherever a world enters or is drawn. Without a "<"
   no element can start, and no view puts world text inside an attribute. Keys are cleaned too: the
   dossier prints the names of facts. On 2026-11-14 a crafted #w= link ran script on this origin, where
   a visitor's own model key is stored; tests.mjs keeps that link harmless. */
export const cleanWorld = (v) => cleanDeep(v, { clean: noTags });

export function listWorlds() { const v = read(K_INDEX, []); return Array.isArray(v) ? cleanWorld(v).filter((e) => e && typeof e === 'object') : []; }

export function saveWorld(world) {
  world = cleanWorld(world);
  const { log, ...persist } = world;          // drop the volatile telemetry log

  let ok = write(K_WORLD(world.id), persist);
  if (!ok) {                                   // quota: evict oldest, retry once
    const idx = listWorlds();
    const victim = idx[idx.length - 1];
    if (victim && victim.id !== world.id) { removeWorld(victim.id); ok = write(K_WORLD(world.id), persist); }
  }
  if (!ok) return false;

  const index = listWorlds().filter((e) => e.id !== world.id);
  index.unshift({
    id: world.id,
    title: world.name || world.divergence.statement,
    divergenceSummary: world.divergence.statement,
    domain: world.divergence.domain,
    createdAt: world.createdAt,
    partial: world.partial,
    tier: world.tier,
  });
  const kept = index.slice(0, 60);
  index.slice(60).forEach((e) => { try { localStorage.removeItem(K_WORLD(e.id)); } catch (_) {} }); // no orphans
  write(K_INDEX, kept);
  return true;
}

export function loadWorld(id) { const w = cleanWorld(read(K_WORLD(id), null)); return w && typeof w === 'object' && !Array.isArray(w) ? w : null; }

export function removeWorld(id) {
  try { localStorage.removeItem(K_WORLD(id)); } catch (_) {}
  write(K_INDEX, listWorlds().filter((e) => e.id !== id));
}

/* ---- sharing: a world replays exactly from a #w= permalink ----
   (A hosted stochastic model is not server-reproducible, so we store
   the generated ARTIFACT, not just the seed.) */
function b64urlEncode(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return decodeURIComponent(escape(atob(s)));
}

export function encodeShare(world) {
  const { log, ...w } = world;                 // keep facts/audit/consistency; drop telemetry
  return b64urlEncode(JSON.stringify(w));
}

export function decodeShareHash(hash) {
  const m = /[#&?]?w=([^&]+)/.exec(hash || '');
  if (!m) return null;
  try { const w = cleanWorld(JSON.parse(b64urlDecode(m[1]))); return w && typeof w === 'object' && !Array.isArray(w) ? w : null; } catch { return null; }
}

export function shareURL(world) {
  const base = location.href.split('#')[0].split('?')[0];
  return base + '#w=' + encodeShare(world);
}
