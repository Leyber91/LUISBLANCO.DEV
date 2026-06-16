/* ============================================================
   altverse/store.js — localStorage persistence + sharing (Phase 4).
   Namespaced, per-world keys so one big world doesn't block the
   index. Orphan-safe (bodies dropped from the index are deleted),
   quota-aware (evict oldest, retry once), and shareable (a world
   serialises into a #w= permalink that replays the EXACT artifact).
   ============================================================ */

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

export function listWorlds() { return read(K_INDEX, []); }

export function saveWorld(world) {
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

export function loadWorld(id) { return read(K_WORLD(id), null); }

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
  try { return JSON.parse(b64urlDecode(m[1])); } catch { return null; }
}

export function shareURL(world) {
  const base = location.href.split('#')[0].split('?')[0];
  return base + '#w=' + encodeShare(world);
}
