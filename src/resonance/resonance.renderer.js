/* =========================================================================
   resonance.renderer.js — RESONANCE Canvas2D drawing (pure render).
   Receives an EnergySignature from the engine and draws four panels:
     1. Spectral Analyzer  — frequency bar chart of token rhythm
     2. Cognitive Radar    — hexagonal 6-axis capability profile
     3. Load History       — rolling waveform of token interval over time
     4. Health + Metadata  — composite score + energy type label
   No DOM queries. No state mutation. Takes canvas, draws, exits.
   Public API (window.RESONANCE.Renderer):
     create(canvas) → renderer instance with:
       render(signature)   — draw one frame
       resize(w, h)        — update canvas dimensions
   ========================================================================= */
(function(){
  "use strict";
  const RESONANCE = (window.RESONANCE = window.RESONANCE || {});
  const CFG  = RESONANCE.CONFIG;
  const AXES = CFG.RADAR_AXES;
  const N_AXES = AXES.length;

  // ── colour constants ────────────────────────────────────────────────────
  const C = {
    bg:         'rgba(8,10,18,0.92)',
    panel:      'rgba(16,20,36,0.80)',
    border:     'rgba(234,240,251,0.12)',
    dim:        'rgba(234,240,251,0.18)',
    text:       'rgba(234,240,251,0.55)',
    textBright: 'rgba(234,240,251,0.85)',
    gold:       '#D4A24C',
    goldDim:    'rgba(212,162,76,0.35)',
  };

  // ── helpers ─────────────────────────────────────────────────────────────
  function px(ctx, x, y){ ctx.moveTo(Math.round(x)+0.5, Math.round(y)+0.5); }
  function rect(ctx, x, y, w, h, fill, stroke){
    ctx.beginPath(); ctx.rect(x, y, w, h);
    if(fill){ ctx.fillStyle = fill; ctx.fill(); }
    if(stroke){ ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  function label(ctx, txt, x, y, size, color, align){
    ctx.font = `${size}px "IBM Plex Mono", monospace`;
    ctx.fillStyle = color || C.text;
    ctx.textAlign = align || 'left';
    ctx.fillText(txt, x, y);
  }
  function hline(ctx, x1, x2, y, color){
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y);
    ctx.strokeStyle = color; ctx.stroke();
  }

  // ── PANEL 1 — Spectral Analyzer ─────────────────────────────────────────
  function drawSpectral(ctx, sig, x, y, w, h){
    const mag    = sig.mag;                     // Float32Array, N/2 bins
    const BARS   = CFG.WAVE.BAR_COUNT;
    const gap    = CFG.WAVE.BAR_GAP;
    const binsPerBar = Math.floor(mag.length / BARS);
    const barW   = (w - gap * (BARS - 1)) / BARS;
    const color  = sig.color;
    const dimC   = sig.dim_color;

    // panel background
    rect(ctx, x, y, w, h, C.panel);
    rect(ctx, x, y, w, h, null, C.border);

    // find peak for normalisation
    let peak = 0.001;
    for(let i = 0; i < mag.length; i++) if(mag[i] > peak) peak = mag[i];

    for(let b = 0; b < BARS; b++){
      let sum = 0;
      for(let k = 0; k < binsPerBar; k++) sum += mag[b * binsPerBar + k] || 0;
      const norm   = (sum / binsPerBar) / peak;
      const barH   = Math.max(2, norm * (h - 24));
      const bx     = x + b * (barW + gap);
      const by     = y + h - 8 - barH;

      // glow (wide, dim)
      ctx.fillStyle = dimC;
      ctx.fillRect(bx - 1, by - 2, barW + 2, barH + 4);
      // bar
      ctx.fillStyle = color;
      ctx.fillRect(bx, by, barW, barH);
    }

    // panel header
    ctx.fillStyle = C.bg;
    ctx.fillRect(x + 1, y + 1, w - 2, 16);
    label(ctx, 'SPECTRAL ANALYZER', x + 6, y + 12, 8, C.textBright, 'left');
    label(ctx, sig.profile_label, x + w - 6, y + 12, 8, sig.color, 'right');

    // spectral metrics strip at bottom
    const { timing_pattern } = sig;
    const mean = timing_pattern.mean_interval.toFixed(0);
    const coh  = (sig.radar.coherence * 100).toFixed(0);
    label(ctx, `AVG ${mean}ms`, x + 6, y + h - 2, 7, C.text);
    label(ctx, `COH ${coh}%`, x + w - 6, y + h - 2, 7, C.text, 'right');
  }

  // ── PANEL 2 — Cognitive Radar ────────────────────────────────────────────
  function drawRadar(ctx, sig, cx, cy, R){
    const radar = sig.radar;
    const vals  = AXES.map(a => radar[a.id] || 0);
    const step  = (2 * Math.PI) / N_AXES;
    const START = -Math.PI / 2;   // top

    // concentric rings
    for(let ring = 1; ring <= CFG.RADAR.RINGS; ring++){
      const r = R * (ring / CFG.RADAR.RINGS);
      ctx.beginPath();
      for(let i = 0; i < N_AXES; i++){
        const a = START + i * step;
        const px = cx + r * Math.cos(a), py = cy + r * Math.sin(a);
        if(i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = ring === CFG.RADAR.RINGS ? C.border : 'rgba(234,240,251,0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // spokes
    for(let i = 0; i < N_AXES; i++){
      const a = START + i * step;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
      ctx.strokeStyle = 'rgba(234,240,251,0.08)';
      ctx.stroke();
    }

    // data polygon — filled
    ctx.beginPath();
    for(let i = 0; i < N_AXES; i++){
      const a = START + i * step;
      const r = R * Math.max(0.04, vals[i]);
      const px = cx + r * Math.cos(a), py = cy + r * Math.sin(a);
      if(i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle   = sig.dim_color;
    ctx.fill();
    ctx.strokeStyle = sig.color;
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // axis dots + labels
    ctx.font = '7px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    for(let i = 0; i < N_AXES; i++){
      const a   = START + i * step;
      const dot_r = R * Math.max(0.04, vals[i]);
      const dx  = cx + dot_r * Math.cos(a);
      const dy  = cy + dot_r * Math.sin(a);
      ctx.beginPath();
      ctx.arc(dx, dy, 2.5, 0, 2 * Math.PI);
      ctx.fillStyle = sig.color;
      ctx.fill();

      // axis label at outer ring
      const lx = cx + (R + 12) * Math.cos(a);
      const ly = cy + (R + 12) * Math.sin(a);
      ctx.fillStyle = C.text;
      ctx.fillText(AXES[i].label.slice(0, 4), lx, ly + 3);
    }
  }

  // ── PANEL 3 — Load History ────────────────────────────────────────────────
  // Rolling sparkline of token inter-arrival intervals over the history window.
  function drawHistory(ctx, sig, x, y, w, h, historyBuffer){
    rect(ctx, x, y, w, h, C.panel);
    rect(ctx, x, y, w, h, null, C.border);

    if(!historyBuffer || historyBuffer.length < 2){
      label(ctx, 'LOAD HISTORY', x + 6, y + 12, 8, C.textBright);
      return;
    }

    const n    = historyBuffer.length;
    const step = w / (n - 1);
    let   max  = 10;
    for(const v of historyBuffer) if(v > max) max = v;

    // fill
    ctx.beginPath();
    ctx.moveTo(x, y + h - 8);
    for(let i = 0; i < n; i++){
      const px = x + i * step;
      const py = y + h - 8 - (historyBuffer[i] / max) * (h - 24);
      if(i === 0) ctx.lineTo(px, y + h - 8);
      ctx.lineTo(px, py);
    }
    ctx.lineTo(x + (n - 1) * step, y + h - 8);
    ctx.closePath();
    ctx.fillStyle = sig.dim_color;
    ctx.fill();

    // line
    ctx.beginPath();
    for(let i = 0; i < n; i++){
      const px = x + i * step;
      const py = y + h - 8 - (historyBuffer[i] / max) * (h - 24);
      if(i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = sig.color;
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // header
    ctx.fillStyle = C.bg;
    ctx.fillRect(x + 1, y + 1, w - 2, 16);
    label(ctx, 'LOAD HISTORY', x + 6, y + 12, 8, C.textBright);

    // current value dot
    const last = historyBuffer[n - 1];
    const ldx  = x + (n - 1) * step;
    const ldy  = y + h - 8 - (last / max) * (h - 24);
    ctx.beginPath(); ctx.arc(ldx, ldy, 2.5, 0, 2 * Math.PI);
    ctx.fillStyle = sig.color; ctx.fill();
  }

  // ── PANEL 4 — Health + Metadata ──────────────────────────────────────────
  function drawHealth(ctx, sig, x, y, w, h){
    rect(ctx, x, y, w, h, C.panel);
    rect(ctx, x, y, w, h, null, C.border);

    const hp    = sig.health;
    const frac  = Math.min(1, Math.max(0, hp / 100));
    const barW  = w - 32;
    const barX  = x + 16;
    const barY  = y + 32;
    const barH  = 8;

    // Health label
    label(ctx, 'HEALTH', x + 16, y + 20, 8, C.text);
    label(ctx, hp.toFixed(0) + '%', x + w - 16, y + 20, 10, sig.color, 'right');

    // track
    rect(ctx, barX, barY, barW, barH, 'rgba(234,240,251,0.06)');
    // fill
    const fillColor = hp > 65 ? sig.color : hp > 35 ? C.gold : '#e74c3c';
    rect(ctx, barX, barY, barW * frac, barH, fillColor);
    // border
    rect(ctx, barX, barY, barW, barH, null, C.border);

    // Energy type + rhythm
    label(ctx, sig.energy_type.toUpperCase(), x + 16, y + 58, 9, sig.color);
    const rhy = sig.timing_pattern.burst_patterns.length > 0 ? 'BURST' : 'STABLE';
    label(ctx, rhy, x + w - 16, y + 58, 8, C.text, 'right');

    // token stats
    const mean = sig.timing_pattern.mean_interval.toFixed(0);
    const std  = sig.timing_pattern.std_interval.toFixed(0);
    label(ctx, `AVG ${mean}ms ± ${std}`, x + 16, y + 76, 8, C.text);

    // resonance potential gauge (small arc)
    const rp = sig.resonance_potential;
    const arcX = x + w - 28, arcY = y + 78;
    ctx.beginPath();
    ctx.arc(arcX, arcY, 14, Math.PI, Math.PI + Math.PI * rp * 2);
    ctx.strokeStyle = sig.color; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath();
    ctx.arc(arcX, arcY, 14, Math.PI, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(234,240,251,0.08)'; ctx.lineWidth = 1; ctx.stroke();
    label(ctx, 'RP', arcX, arcY + 4, 7, C.text, 'center');
  }

  // ── Renderer factory ─────────────────────────────────────────────────────
  function create(canvas){
    const ctx = canvas.getContext('2d');
    if(!ctx){ console.warn('[RESONANCE] no 2D context'); return null; }

    // Rolling history buffer for the load-history panel
    const HIST_BUF = 64;
    const histBuf  = [];
    let lastMean   = 0;

    function resize(w, h){
      canvas.width  = w;
      canvas.height = h;
    }

    function render(sig){
      const W = canvas.width, H = canvas.height;
      if(!W || !H) return;

      // update history buffer whenever mean shifts
      const curMean = sig.timing_pattern.mean_interval;
      if(curMean !== lastMean){
        histBuf.push(curMean);
        if(histBuf.length > HIST_BUF) histBuf.shift();
        lastMean = curMean;
      }

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, W, H);

      const PAD    = 12;
      const GAP    = 8;

      // Layout: 2×2 grid of panels
      // Top-left: Spectral    Top-right: Radar
      // Bottom-left: History  Bottom-right: Health
      const halfW   = (W - PAD * 2 - GAP) / 2;
      const halfH   = (H - PAD * 2 - GAP) / 2;

      const specX   = PAD, specY = PAD;
      const specW   = halfW, specH = halfH;

      const radX    = PAD + halfW + GAP, radY = PAD;
      const radW    = halfW, radH = halfH;

      const histX   = PAD, histY = PAD + halfH + GAP;
      const histW   = halfW, histH = halfH;

      const healX   = PAD + halfW + GAP, healY = PAD + halfH + GAP;
      const healW   = halfW, healH = halfH;

      // draw
      drawSpectral(ctx, sig, specX, specY, specW, specH);

      rect(ctx, radX, radY, radW, radH, C.panel);
      rect(ctx, radX, radY, radW, radH, null, C.border);
      ctx.fillStyle = C.bg;
      ctx.fillRect(radX + 1, radY + 1, radW - 2, 16);
      label(ctx, 'COGNITIVE RADAR', radX + 6, radY + 12, 8, C.textBright);
      drawRadar(ctx, sig, radX + radW / 2, radY + radH / 2 + 6,
                Math.min(radW, radH) / 2 - 22);

      drawHistory(ctx, sig, histX, histY, histW, histH, histBuf);
      drawHealth(ctx, sig, healX, healY, healW, healH);

      // outer frame label
      ctx.font      = '8px "IBM Plex Mono", monospace';
      ctx.fillStyle = 'rgba(234,240,251,0.20)';
      ctx.textAlign = 'right';
      ctx.fillText('AI RESONANCE · WIRTHFORGE', W - PAD, H - 4);
      ctx.textAlign = 'left';
      ctx.fillText('luisblanco.dev', PAD, H - 4);
    }

    return { render, resize };
  }

  RESONANCE.Renderer = { create };
})();
