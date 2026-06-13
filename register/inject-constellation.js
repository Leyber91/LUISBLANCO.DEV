#!/usr/bin/env node
/* =========================================================================
   inject-constellation.js — Extract named concepts from BOOK_CONSTELLATION
   HTML files and inject them as new CX- entries in III-COMPOSITION.
   Sources: 01_the_laws, 03_the_watcher, 04_lineage_and_failures, 05_practice
   Input:   work/02_assigned.json (existing canonical entries)
   Output:  work/02_assigned.json (appended with new CONSTELLATION entries)
   ========================================================================= */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REF_DIR = path.join(ROOT, '_reference', 'BOOK_CONSTELLATION');
const WORK = path.join(__dirname, 'work');
const ASSIGNED = path.join(WORK, '02_assigned.json');

function readFile(f) { return fs.readFileSync(path.join(REF_DIR, f), 'utf-8'); }
function stripTags(s) { return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }
function extractP(html, afterTag) {
  /* get first <p> text after a given tag's position */
  const idx = html.indexOf(afterTag);
  if (idx === -1) return '';
  const after = html.slice(idx + afterTag.length);
  const m = after.match(/<p>([\s\S]*?)<\/p>/);
  return m ? stripTags(m[1]).slice(0, 300) : '';
}

/* ── 1. Laws from 01_the_laws.html ── */
function extractLaws() {
  const html = readFile('01_the_laws.html');
  const entries = [];
  const lawBlocks = html.split(/<h2[^>]*>/);
  for (const block of lawBlocks.slice(1)) {
    const nameMatch = block.match(/^([^<]+)/);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();
    if (!name.startsWith('LAW')) continue;
    /* extract first <p> as essence */
    const pm = block.match(/<p>([\s\S]*?)<\/p>/);
    const essence = pm ? stripTags(pm[1]).slice(0, 350) : '';
    /* extract receipt */
    const rm = block.match(/<i>([\s\S]*?)<\/i>/);
    const source = rm ? stripTags(rm[1]).slice(0, 200) : 'BOOK_CONSTELLATION/01_the_laws.html';
    entries.push({ name: `CONSTELLATION · ${name}`, essence, source, tier: 'A' });
  }
  return entries;
}

/* ── 2. Watcher chapter from 03_the_watcher.html ── */
function extractWatcher() {
  const html = readFile('03_the_watcher.html');
  const entries = [];
  const sections = html.split(/<h2[^>]*>/);
  for (const block of sections.slice(1)) {
    const nameMatch = block.match(/^([^<]+)/);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();
    const pm = block.match(/<p>([\s\S]*?)<\/p>/);
    const essence = pm ? stripTags(pm[1]).slice(0, 300) : '';
    entries.push({ name: `CONSTELLATION · ${name}`, essence, source: 'BOOK_CONSTELLATION/03_the_watcher.html', tier: null });
  }
  return entries;
}

/* ── 3. Four failure modes from 04_lineage_and_failures.html ── */
function extractFailures() {
  const html = readFile('04_lineage_and_failures.html');
  const entries = [];
  const blocks = html.split(/<h3[^>]*>/);
  for (const block of blocks.slice(1)) {
    const nameMatch = block.match(/^([^<]+)/);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();
    const pm = block.match(/<p>([\s\S]*?)<\/p>/);
    const essence = pm ? stripTags(pm[1]).slice(0, 300) : '';
    entries.push({ name: `CONSTELLATION · ANTI-PATTERN · ${name}`, essence, source: 'BOOK_CONSTELLATION/04_lineage_and_failures.html', tier: null });
  }
  return entries;
}

/* ── 4. Practice sections from 05_practice.html ── */
function extractPractice() {
  const html = readFile('05_practice.html');
  const entries = [];
  const blocks = html.split(/<h2[^>]*>/);
  for (const block of blocks.slice(1)) {
    const nameMatch = block.match(/^([^<]+)/);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();
    if (!name || name.length < 4) continue;
    const pm = block.match(/<p>([\s\S]*?)<\/p>/);
    const essence = pm ? stripTags(pm[1]).slice(0, 300) : '';
    entries.push({ name: `CONSTELLATION · PRACTICE · ${name}`, essence, source: 'BOOK_CONSTELLATION/05_practice.html', tier: null });
  }
  return entries;
}

/* ── main ── */
const existing = JSON.parse(fs.readFileSync(ASSIGNED, 'utf-8'));
const existingNames = new Set(existing.map(c => c.name.toLowerCase()));

/* find max CX- ID */
let maxSeq = 0;
for (const c of existing) {
  const m = c.id && c.id.match(/CX-(\d+)/);
  if (m) maxSeq = Math.max(maxSeq, +m[1]);
}

const newEntries = [
  ...extractLaws(),
  ...extractWatcher(),
  ...extractFailures(),
  ...extractPractice()
];

let added = 0, skipped = 0;
for (const e of newEntries) {
  if (existingNames.has(e.name.toLowerCase())) { skipped++; continue; }
  maxSeq++;
  existing.push({
    id: `CX-${String(maxSeq).padStart(4, '0')}`,
    name: e.name,
    cluster: 'CONSTELLATION',
    part: 'III-COMPOSITION',
    law: null,
    tier: e.tier || null,
    essence: e.essence,
    status: 'paper-only',
    eras: [],
    sources: [e.source],
    aliases: [],
    potential: [],
    merged_from: ['inject-constellation'],
    links: {
      derives_from: [], enables: [], requires: [], watches: [],
      transports: [], opposes: [], implements: [], refines: [], proves: []
    }
  });
  existingNames.add(e.name.toLowerCase());
  added++;
}

fs.writeFileSync(ASSIGNED, JSON.stringify(existing, null, 2));

console.log('=== INJECT-CONSTELLATION REPORT ===');
console.log('New entries added:', added);
console.log('Skipped (already exists):', skipped);
console.log('Total concepts now:', existing.length);
const iii = existing.filter(c => c.part === 'III-COMPOSITION').length;
console.log('III-COMPOSITION total:', iii);
console.log('Max CX- ID:', `CX-${String(maxSeq).padStart(4, '0')}`);
console.log('\nWrote:', ASSIGNED);
