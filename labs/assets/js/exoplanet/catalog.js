/* ============================================================
   exoplanet/catalog.js — loads the two archive files and joins
   them into one list of planet records.

   1. The PSCompPars snapshot (config DATA.snapshot): one row per
      confirmed planet, the archive's recommended composite values
      with error bars, provenance flags, discovery facts and the
      stellar parameters. First paint needs only this file.
   2. The weekly roster (labs/exoplanet_data.json, written by the
      site's data workflow): every planet with a radius measured in
      some published solution. It marks which radii are measured,
      and adds planets confirmed after the snapshot, with the few
      fields that file carries.
   ============================================================ */

import { DATA } from './config.js';

const num = (v) => (v === null || v === undefined || v === '' || isNaN(v)) ? null : +v;
const TRUE_MASS = new Set(['Mass', 'Msini', 'Msin(i)/sin(i)']);

const ADS = 'https://ui.adsabs.harvard.edu/abs/';
const ARCHIVE = 'https://exoplanetarchive.ipac.caltech.edu';
function refOf(json, i) {
  const r = i === null || i === undefined ? null : json.refs && json.refs[i];
  if (!r) return null;
  const [label, key] = r;
  return { label, url: key.startsWith('/') ? ARCHIVE + key : key.startsWith('http') ? key : ADS + key + '/abstract' };
}

function fromSnapshot(json) {
  const I = Object.fromEntries(json.cols.map((c, i) => [c, i]));
  return json.rows.map((r, idx) => {
    const name = r[I.pl_name];
    const host = r[I.host] === 0 ? name.replace(/ \w$/, '') : r[I.host];
    const e1 = num(r[I.pl_radeerr1]), e2 = num(r[I.pl_radeerr2]);
    const p = {
      idx, name, host,
      method: json.methods[r[I.method]] ?? null,
      year: num(r[I.year]),
      facility: json.facilities[r[I.facility]] ?? null,
      dist: num(r[I.sy_dist]), P: num(r[I.pl_orbper]), a: num(r[I.pl_orbsmax]), ecc: num(r[I.pl_orbeccen]),
      R: num(r[I.pl_rade]), Rerr1: e1, Rerr2: e2,
      Rerr: e1 !== null && e2 !== null ? (Math.abs(e1) + Math.abs(e2)) / 2 : (e1 ?? (e2 !== null ? Math.abs(e2) : null)),
      M: num(r[I.pl_bmasse]), Merr1: num(r[I.pl_bmasseerr1]), Merr2: num(r[I.pl_bmasseerr2]),
      Mlim: r[I.pl_bmasselim] || 0, Mprov: json.massprov[r[I.massprov]] ?? null,
      S: num(r[I.pl_insol]), Teq: num(r[I.pl_eqt]), b: num(r[I.pl_imppar]),
      depth: num(r[I.pl_trandep]), dur: num(r[I.pl_trandur]),
      Teff: num(r[I.st_teff]), Rs: num(r[I.st_rad]), Ms: num(r[I.st_mass]), logL: num(r[I.st_lum]),
      ra: num(r[I.ra]), dec: num(r[I.dec]),
      aErr: num(r[I.pl_orbsmaxerr]), TeffErr: num(r[I.st_tefferr]), RsErr: num(r[I.st_raderr]),
      refs: I.ref_r === undefined ? {} : {
        R: refOf(json, r[I.ref_r]), M: refOf(json, r[I.ref_m]), P: refOf(json, r[I.ref_p]),
        star: refOf(json, r[I.ref_star]), disc: refOf(json, r[I.ref_disc]),
      },
      measuredR: null, source: 'snapshot',
    };
    return withRendererFields(p);
  });
}

/* The renderer (data.js) reads the archive's own column names. */
function withRendererFields(p) {
  p.pl_name = p.name;
  p.hostname = p.host;
  p.sy_dist = p.dist;
  p.pl_orbper = p.P;
  p.pl_orbsmax = p.a;
  p.pl_rade = p.R;
  p.pl_masse = p.M !== null && TRUE_MASS.has(p.Mprov) && !p.Mlim ? p.M : null;
  p.pl_eqt = p.Teq;
  p.st_teff = p.Teff;
  p.st_rad = p.Rs;
  p.st_mass = p.Ms;
  return p;
}

function fromRoster(r, idx) {
  return withRendererFields({
    idx, name: r.pl_name, host: r.hostname || r.pl_name.replace(/ \w$/, ''),
    method: null, year: null, facility: null,
    dist: num(r.sy_dist), P: num(r.pl_orbper), a: num(r.pl_orbsmax), ecc: null,
    R: num(r.pl_rade), Rerr1: null, Rerr2: null, Rerr: null,
    M: num(r.pl_masse), Merr1: null, Merr2: null, Mlim: 0, Mprov: num(r.pl_masse) !== null ? 'Mass' : null,
    S: null, Teq: num(r.pl_eqt), b: null, depth: null, dur: null,
    Teff: num(r.st_teff), Rs: null, Ms: null, logL: null, ra: null, dec: null,
    aErr: null, TeffErr: null, RsErr: null, refs: {},
    measuredR: true, source: 'roster',
  });
}

async function fetchJSON(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ': HTTP ' + res.status);
  const reader = res.body && res.body.getReader ? res.body.getReader() : null;
  if (!reader) return res.json();
  const enc = (res.headers.get('content-encoding') || '').toLowerCase();
  const total = (!enc || enc === 'identity') ? (+res.headers.get('content-length') || 0) : 0;
  const chunks = []; let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
    onProgress && onProgress(got, total);
  }
  const buf = new Uint8Array(got); let o = 0;
  for (const c of chunks) { buf.set(c, o); o += c.length; }
  return JSON.parse(new TextDecoder('utf-8').decode(buf));
}

export async function loadSnapshot(onProgress) {
  const json = await fetchJSON(DATA.snapshot, onProgress);
  const list = fromSnapshot(json);
  return { list, meta: json.meta };
}

/* Join the weekly roster. Returns the planets it added (confirmed after the snapshot). */
export async function joinRoster(list) {
  const rows = await fetchJSON(DATA.roster);
  if (!Array.isArray(rows) || !rows.length) throw new Error('roster empty');
  const byName = new Map(list.map((p) => [p.name, p]));
  const names = new Set();
  const added = [];
  for (const r of rows) {
    if (!r || !r.pl_name) continue;
    names.add(r.pl_name);
    if (!byName.has(r.pl_name) && num(r.pl_rade) !== null) {
      const p = fromRoster(r, list.length + added.length);
      added.push(p);
    }
  }
  for (const p of list) p.measuredR = names.has(p.name);
  list.push(...added);
  return { added, rosterCount: names.size };
}

/* Before the roster arrives (or if it fails), a transit or imaging detection with a
   radius is the best guess for "measured". */
export function provisionalMeasured(list) {
  for (const p of list) if (p.measuredR === null) p.measuredR = p.R !== null && (p.method === 'Transit' || p.depth !== null);
}
