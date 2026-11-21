/* ============================================================
   tools/drives/folded-probe.mjs: the probe of Folded Space's level 1 (ROAD.md, level 1, "Probe"; ticket 1.05).

   Does the network read a digit drawn with a pointer on the pad, reduced the way MNIST's digits were? Twenty digits
   are drawn by the drive's mouse: ten shapes, each in two hands (upright; slanted and smaller). The shapes are written
   here as strokes in a unit square, before any run. The thresholds were fixed in ROAD.md before this scenario ran:
   - the probe: fewer than 15 of 20 read right means the reduction is wrong or the network needs drawn digits in its
     training, and that is fixed before the mosaic;
   - ticket 1.05 is done at 18 of 20.
   The strokes are a program's, not a person's: this measures the pad and the reduction, not a stranger's hand.
   ============================================================ */

const ellipse = (cx, cy, rx, ry, n = 28) => Array.from({ length: n + 1 }, (_, k) => [cx + rx * Math.sin((2 * Math.PI * k) / n), cy - ry * Math.cos((2 * Math.PI * k) / n)]);
const SHAPES = [
  [0, [ellipse(0.5, 0.5, 0.27, 0.42)]],
  [1, [[[0.42, 0.22], [0.55, 0.1], [0.55, 0.92]]]],
  [2, [[[0.25, 0.3], [0.32, 0.15], [0.5, 0.1], [0.68, 0.15], [0.74, 0.3], [0.68, 0.46], [0.5, 0.63], [0.25, 0.9], [0.8, 0.9]]]],
  [3, [[[0.25, 0.15], [0.5, 0.08], [0.72, 0.18], [0.72, 0.35], [0.5, 0.47], [0.72, 0.58], [0.75, 0.78], [0.55, 0.92], [0.25, 0.85]]]],
  [4, [[[0.6, 0.1], [0.22, 0.62], [0.82, 0.62]], [[0.64, 0.32], [0.64, 0.92]]]],
  [5, [[[0.75, 0.1], [0.32, 0.1], [0.28, 0.45], [0.5, 0.4], [0.7, 0.5], [0.73, 0.7], [0.55, 0.9], [0.25, 0.85]]]],
  [6, [[[0.7, 0.1], [0.45, 0.25], [0.3, 0.5], [0.28, 0.72], [0.4, 0.9], [0.6, 0.9], [0.72, 0.75], [0.65, 0.58], [0.45, 0.55], [0.3, 0.66]]]],
  [7, [[[0.2, 0.12], [0.8, 0.12], [0.42, 0.92]]]],
  [8, [[[0.5, 0.5], [0.3, 0.35], [0.35, 0.15], [0.5, 0.1], [0.65, 0.15], [0.7, 0.35], [0.5, 0.5], [0.28, 0.68], [0.32, 0.88], [0.5, 0.93], [0.68, 0.88], [0.72, 0.68], [0.5, 0.5]]]],
  [9, [[[0.7, 0.3], [0.6, 0.12], [0.42, 0.1], [0.3, 0.25], [0.35, 0.42], [0.55, 0.45], [0.7, 0.3], [0.68, 0.6], [0.62, 0.92]]]],
];
// The second hand: smaller by 0.85 about the centre, and slanted forward by 0.12 of the height.
const hand2 = (strokes) => strokes.map((s) => s.map(([x, y]) => [0.5 + 0.85 * (x - 0.5) + 0.12 * (0.5 - y), 0.5 + 0.85 * (y - 0.5)]));
export const PROBE = SHAPES.flatMap(([label, strokes]) => [{ label, strokes, hand: 'upright' }, { label, strokes: hand2(strokes), hand: 'slanted' }]);

export default async function probe(p, { base }) {
  await p.go(`${base}/labs/folded.html`);
  p.check('the page is ready', await p.until('document.body.dataset.state === "ready"', 30000));
  const reads = [];
  for (const d of PROBE) {
    const box = await p.ev(`(() => { const c = document.getElementById('clear'); c.scrollIntoView({ block: 'center' }); const b = c.getBoundingClientRect(); const pad = document.getElementById('pad').getBoundingClientRect(); return { cx: b.x + b.width / 2, cy: b.y + b.height / 2, x: pad.x, y: pad.y, w: pad.width, h: pad.height }; })()`);
    await p.click(box.cx, box.cy); await p.sleep(80);
    const before = await p.ev('+(document.body.dataset.drawn || 0)');
    const X = (u) => box.x + box.w * (0.08 + 0.84 * u), Y = (v) => box.y + box.h * (0.08 + 0.84 * v);
    for (const s of d.strokes) {
      await p.down(X(s[0][0]), Y(s[0][1]));
      for (let i = 1; i < s.length; i++) {
        const [x0, y0] = s[i - 1], [x1, y1] = s[i];
        const steps = Math.max(2, Math.ceil((Math.hypot((x1 - x0) * box.w, (y1 - y0) * box.h)) / 6));
        for (let k = 1; k <= steps; k++) await p.move(X(x0 + ((x1 - x0) * k) / steps), Y(y0 + ((y1 - y0) * k) / steps));
      }
      const e = s[s.length - 1];
      await p.up(X(e[0]), Y(e[1]));
    }
    await p.until(`+(document.body.dataset.drawn || 0) > ${before}`, 5000);
    const read = await p.ev('+document.body.dataset.read');
    reads.push({ ...d, read });
  }
  const right = reads.filter((r) => r.read === r.label).length;
  const detail = reads.map((r) => `${r.label}${r.hand === 'upright' ? 'u' : 's'}:${r.read}`).join(' ');
  p.check(`the probe: at least 15 of 20 pointer-drawn digits read right (${right} of 20)`, right >= 15, detail);
  p.check(`ticket 1.05's mark: at least 18 of 20 read right (${right} of 20)`, right >= 18, detail);
  await p.shot('probe-last');
}
