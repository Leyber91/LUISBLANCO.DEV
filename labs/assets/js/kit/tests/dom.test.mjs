/* ============================================================
   Reading HTML's character references back into characters
   (kit/dom.js unesc). Run from the repository root:
     node labs/assets/js/kit/tests/dom.test.mjs

   Every bound has a case just inside it and just outside it, and
   every entry of every table has a case, so that
   kit/tests/dom.mutants.test.mjs can break each rule and see a
   check fail here. The expected texts are written as code points
   and checked against Unicode's own decomposition, not against
   the tables they test: a letter with its accent is, in NFD, the
   letter followed by the accent's combining mark.
   ============================================================ */

const { unesc, esc } = await import('../dom.js');

let failed = 0, passed = 0;
const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
process.on('uncaughtException', (e) => { console.log(`FAIL  the tests stopped on an error: ${e && e.message}`); process.exit(1); });
const is = (got, want, name) => yes(name, got === want, `${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);

/* ---- the archive's labels, as the snapshot carries them (2026-11-17) ---- */
is(unesc('Anglada-Escud&eacute; et al. 2016'), 'Anglada-Escud\u00e9 et al. 2016', 'an acute accent');
is(unesc('Lafreni&egrave;re et al. 2011'), 'Lafreni\u00e8re et al. 2011', 'a grave accent');
is(unesc('M&acirc;lin et al. 2025'), 'M\u00e2lin et al. 2025', 'a circumflex');
is(unesc('Gajdo&scaron; et al. 2019'), 'Gajdo\u0161 et al. 2019', 'a caron');
is(unesc('&Aacute;&ntilde;&ccedil;&uuml;&aring;&Ouml;'), '\u00c1\u00f1\u00e7\u00fc\u00e5\u00d6', 'acute, tilde, cedilla, umlaut, ring');
is(unesc('Bo&#x10D;ek &#321;ukasz O&#39;Brien'), 'Bo\u010dek \u0141ukasz O\'Brien', 'hexadecimal and decimal references');
is(unesc('Smith &amp; Jones'), 'Smith & Jones', 'the ampersand');

/* ---- every accent, on every letter HTML names with it, and on none it does not ---- */
const MARKS = { grave: 0x300, acute: 0x301, circ: 0x302, tilde: 0x303, uml: 0x308, ring: 0x30a, cedil: 0x327, caron: 0x30c };
const HTML = { grave: 'AEIOUaeiou', acute: 'ACEILNORSUYZacegilnorsuyz', circ: 'ACEGHIJOSUWYaceghijosuwy', tilde: 'AINOUainou',
  uml: 'AEIOUYaeiouy', ring: 'AUau', cedil: 'CGKLNRSTcklnrst', caron: 'CDELNRSTZcdelnrstz' };   // the WHATWG table's names
for (const [accent, mark] of Object.entries(MARKS)) {
  const wrong = [], kept = [];
  for (const L of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz') {
    const ref = `&${L}${accent};`, got = unesc(ref);
    if (HTML[accent].includes(L)) { if (got.length !== 1 || got.normalize('NFD') !== L + String.fromCodePoint(mark)) wrong.push(`${ref}=${got}`); }
    else if (got !== ref) kept.push(`${ref}=${got}`);
  }
  yes(`every letter HTML names with the ${accent} reads as that letter and its mark`, wrong.length === 0, wrong.join(' '));
  yes(`no letter HTML does not name with the ${accent} is read`, kept.length === 0, kept.join(' '));
}

/* ---- the named characters that are not a letter and an accent ---- */
is(unesc('&szlig;&aelig;&AElig;&oslash;&Oslash;&eth;&ETH;&thorn;&THORN;&oelig;&OElig;'),
  '\u00df\u00e6\u00c6\u00f8\u00d8\u00f0\u00d0\u00fe\u00de\u0153\u0152', 'the eleven Latin letters HTML names on their own');
is(unesc('&lt;&gt;&quot;&apos;&amp;'), '<>"\'&', 'the five of esc');
is(unesc('a&nbsp;b'), 'a\u00a0b', 'the no-break space');
is(unesc('&toString; &constructor; &hasOwnProperty;'), '&toString; &constructor; &hasOwnProperty;', 'a name an object inherits is not a reference');
is(unesc('&etilde; &Acaron; &wring; &xcirc; &bogus;'), '&etilde; &Acaron; &wring; &xcirc; &bogus;', 'a name outside the tables stays as written');

/* ---- numbers: the bounds ---- */
is(unesc('&#x10FFFF;'), '\u{10FFFF}', 'the last code point is read');
is(unesc('&#x110000;'), '&#x110000;', 'past the last code point stays as written');
is(unesc('&#xD7FF;'), '\ud7ff', 'the code point before the surrogates is read');
is(unesc('&#xD800;'), '&#xD800;', 'the first surrogate stays as written');
is(unesc('&#xDFFF;'), '&#xDFFF;', 'the last surrogate stays as written');
is(unesc('&#xE000;'), '\ue000', 'the code point after the surrogates is read');
is(unesc('&#0;'), '&#0;', 'zero stays as written');
is(unesc('&#1;'), '\u0001', 'one is read');
is(unesc('&#X10D;'), '\u010d', 'an upper-case X is read as hexadecimal');
is(unesc('&#x10d;&#269;'), '\u010d\u010d', 'hexadecimal and decimal name one code point alike');

/* ---- 128 to 159, as windows-1252 ---- */
const W = [0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178];   // Python's html.unescape, 2026-11-17
const cp = [];
for (let n = 128; n <= 159; n++) { const got = unesc(`&#${n};`); if (got.codePointAt(0) !== W[n - 128] || got.length !== 1) cp.push(`${n}=${got.codePointAt(0).toString(16)}`); }
yes('128 to 159 read as windows-1252, the five it leaves as themselves', cp.length === 0, cp.join(' '));
is(unesc('&#127;&#160;'), '\u007f\u00a0', 'the code points either side of 128 to 159 read as themselves');

/* ---- once, and nothing else ---- */
is(unesc('&amp;eacute;'), '&eacute;', 'it reads once: an escaped reference becomes the reference, not the letter');
is(unesc(esc('<a href="x">O\'Hara & co</a>')), '<a href="x">O\'Hara & co</a>', 'it undoes esc');
is(unesc('a & b; &; &#; &#x; c'), 'a & b; &; &#; &#x; c', 'an ampersand that starts no reference stays');
is(unesc(null), '', 'nothing is the empty string');
is(unesc(12), '12', 'a number is its text');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
