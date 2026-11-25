/* Rekenkern: bron voorbereiden, kleuren reduceren tot garenkleuren, omzetten naar steken en analyseren. */
(function () {
  'use strict';
  const SC = (window.SC = window.SC || {});
  const C = SC.color;
  const makeCanvas = SC.loader.makeCanvas;

  const DISPLAY_PX_PER_CM = 30; // resolutie van het 'origineel'-beeld in de viewer

  function ctx2d(c, read) {
    return c.getContext('2d', read ? { willReadFrequently: true } : undefined);
  }

  /* ---------- Bron voorbereiden: plat op wit, draaien, rand weg, bijsnijden ---------- */

  function rotate(src, deg) {
    if (!deg) return src;
    const swap = deg === 90 || deg === 270;
    const c = makeCanvas(swap ? src.height : src.width, swap ? src.width : src.height);
    const g = ctx2d(c, true);
    g.translate(c.width / 2, c.height / 2);
    g.rotate((deg * Math.PI) / 180);
    g.drawImage(src, -src.width / 2, -src.height / 2);
    return c;
  }

  function cropCanvas(src, r) {
    const c = makeCanvas(r.w, r.h);
    ctx2d(c, true).drawImage(src, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    return c;
  }

  function whiteTrimRect(c) {
    const w = c.width, h = c.height;
    const d = ctx2d(c, true).getImageData(0, 0, w, h).data;
    const white = (x, y) => {
      const i = (y * w + x) * 4;
      return d[i] > 242 && d[i + 1] > 242 && d[i + 2] > 242;
    };
    const rowWhite = (y) => {
      for (let x = 0; x < w; x++) if (!white(x, y)) return false;
      return true;
    };
    const colWhite = (x, y0, y1) => {
      for (let y = y0; y <= y1; y++) if (!white(x, y)) return false;
      return true;
    };
    let top = 0;
    while (top < h && rowWhite(top)) top++;
    if (top >= h) return null;
    let bottom = h - 1;
    while (bottom > top && rowWhite(bottom)) bottom--;
    let left = 0;
    while (left < w && colWhite(left, top, bottom)) left++;
    let right = w - 1;
    while (right > left && colWhite(right, top, bottom)) right--;
    if (top === 0 && left === 0 && bottom === h - 1 && right === w - 1) return null;
    return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
  }

  function prepare(src, opts) {
    const raw = src.canvas;
    let transparentShare = 0;
    if (src.kind === 'image') {
      const d = ctx2d(raw, true).getImageData(0, 0, raw.width, raw.height).data;
      let t = 0, n = 0;
      for (let i = 3; i < d.length; i += 28) {
        n++;
        if (d[i] < 250) t++;
      }
      transparentShare = n ? t / n : 0;
    }
    const flat = makeCanvas(raw.width, raw.height);
    const fg = ctx2d(flat, true);
    fg.fillStyle = '#ffffff';
    fg.fillRect(0, 0, flat.width, flat.height);
    fg.drawImage(raw, 0, 0);

    const deg = opts.rotation === 'auto' ? (flat.width > flat.height * 1.05 ? 90 : 0) : Number(opts.rotation) || 0;
    let c = rotate(flat, deg);

    let trimmed = false;
    if (opts.trimWhite) {
      const r = whiteTrimRect(c);
      if (r) {
        c = cropCanvas(c, r);
        trimmed = true;
      }
    }

    const cr = opts.crop || {};
    const t = +cr.t || 0, rr = +cr.r || 0, b = +cr.b || 0, l = +cr.l || 0;
    if (t || rr || b || l) {
      const x = Math.round((c.width * l) / 100), y = Math.round((c.height * t) / 100);
      const w = Math.round(c.width * (1 - (l + rr) / 100)), h = Math.round(c.height * (1 - (t + b) / 100));
      if (w > 4 && h > 4) c = cropCanvas(c, { x, y, w, h });
    }

    return {
      canvas: c,
      rotation: deg,
      autoRotated: opts.rotation === 'auto' && deg !== 0,
      transparentShare,
      trimmed,
    };
  }

  /* Meest voorkomende kleur langs de rand: gebruikt om 'passend' plaatsen aan te vullen. */
  function edgeColor(c) {
    const w = c.width, h = c.height;
    const g = ctx2d(c, true);
    const strips = [
      g.getImageData(0, 0, w, 1).data,
      g.getImageData(0, h - 1, w, 1).data,
      g.getImageData(0, 0, 1, h).data,
      g.getImageData(w - 1, 0, 1, h).data,
    ];
    const buckets = new Map();
    for (const d of strips) {
      const step = Math.max(1, Math.floor(d.length / 4 / 200)) * 4;
      for (let i = 0; i < d.length; i += step) {
        const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
        const bk = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
        bk.n++;
        bk.r += d[i];
        bk.g += d[i + 1];
        bk.b += d[i + 2];
        buckets.set(key, bk);
      }
    }
    let best = null;
    for (const bk of buckets.values()) if (!best || bk.n > best.n) best = bk;
    return best ? C.toHex([best.r / best.n, best.g / best.n, best.b / best.n]) : '#ffffff';
  }

  /* Bron op het sjaalformaat tekenen. smooth=false geeft 'nearest' bemonstering (geen mengkleuren). */
  function fitted(src, W, H, s, bg, smooth) {
    const c = makeCanvas(W, H);
    const g = ctx2d(c, !smooth);
    g.imageSmoothingEnabled = smooth;
    if (smooth) g.imageSmoothingQuality = 'high';
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    if (s.fit === 'stretch') {
      g.drawImage(src, 0, 0, W, H);
      return c;
    }
    const pxX = W / s.Wcm, pxY = H / s.Hcm;
    const k = s.fit === 'contain'
      ? Math.min(s.Wcm / src.width, s.Hcm / src.height)
      : Math.max(s.Wcm / src.width, s.Hcm / src.height);
    const dw = src.width * k, dh = src.height * k;
    g.drawImage(src, ((s.Wcm - dw) / 2) * pxX, ((s.Hcm - dh) / 2) * pxY, dw * pxX, dh * pxY);
    return c;
  }

  /* ---------- Kleuren: herkennen, samenvoegen tot max. aantal garenkleuren ---------- */

  /* Ligt kleur p (bijna) op de lijn tussen twee al gevonden kleuren? Dan is het een overgangskleur. */
  function isMixOf(p, centers) {
    for (let a = 0; a < centers.length; a++) {
      for (let b = a + 1; b < centers.length; b++) {
        const A = centers[a].rgb, B = centers[b].rgb;
        const d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
        const len2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
        if (len2 < 1) continue;
        const t = ((p[0] - A[0]) * d[0] + (p[1] - A[1]) * d[1] + (p[2] - A[2]) * d[2]) / len2;
        if (t <= 0.04 || t >= 0.96) continue;
        const q = [A[0] + t * d[0] - p[0], A[1] + t * d[1] - p[1], A[2] + t * d[2] - p[2]];
        if (Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2]) < 14) return true;
      }
    }
    return false;
  }

  function analyzeColors(datas, maxColors) {
    const B6 = 1 << 18;
    const c6 = new Uint32Array(B6), r6 = new Float64Array(B6), g6 = new Float64Array(B6), b6 = new Float64Array(B6);
    const c4 = new Uint32Array(4096), r4 = new Float64Array(4096), g4 = new Float64Array(4096), b4 = new Float64Array(4096);
    let total = 0;
    for (const d of datas) {
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const k6 = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
        c6[k6]++; r6[k6] += r; g6[k6] += g; b6[k6] += b;
        const k4 = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        c4[k4]++; r4[k4] += r; g4[k4] += g; b4[k4] += b;
      }
      total += d.length / 4;
    }

    // Stap 1: duidelijk aanwezige kleuren als middelpunten (grove 4-bit bakjes, robuust tegen JPEG-ruis).
    const bins4 = [];
    for (let k = 0; k < 4096; k++) {
      const n = c4[k];
      if (!n) continue;
      const rgb = [r4[k] / n, g4[k] / n, b4[k] / n];
      bins4.push({ n, rgb, lab: C.rgbToLab(rgb[0], rgb[1], rgb[2]) });
    }
    bins4.sort((a, b) => b.n - a.n);
    const MIN_SHARE = 0.003, MERGE_DE = 15, MAX_CENTERS = 24;
    const centers = [];
    for (const b of bins4) {
      if (b.n < MIN_SHARE * total && centers.length) break;
      let near = Infinity;
      for (const c of centers) near = Math.min(near, C.dE(c.lab, b.lab));
      if (near < MERGE_DE) continue;
      // Randpixels (anti-aliasing) zijn mengsels van twee buurkleuren: geen eigen garenkleur.
      if (b.n < 0.015 * total && isMixOf(b.rgb, centers)) continue;
      centers.push({ lab: b.lab, rgb: b.rgb });
      if (centers.length >= MAX_CENTERS) break;
    }

    // Stap 2: alle fijne 6-bit bakjes toewijzen aan het dichtstbijzijnde middelpunt.
    const clusterOf = new Uint8Array(B6);
    const cl = centers.map(() => ({ n: 0, r: 0, g: 0, b: 0, bestN: 0, bestRgb: null, core: 0 }));
    let uniqueBins = 0, coreTotal = 0;
    for (let k = 0; k < B6; k++) {
      const n = c6[k];
      if (!n) continue;
      uniqueBins++;
      const rgb = [r6[k] / n, g6[k] / n, b6[k] / n];
      const lab = C.rgbToLab(rgb[0], rgb[1], rgb[2]);
      let bj = 0, bd = Infinity;
      for (let j = 0; j < centers.length; j++) {
        const dd = C.dE(lab, centers[j].lab);
        if (dd < bd) { bd = dd; bj = j; }
      }
      clusterOf[k] = bj;
      const o = cl[bj];
      o.n += n; o.r += r6[k]; o.g += g6[k]; o.b += b6[k];
      if (n > o.bestN) { o.bestN = n; o.bestRgb = rgb; }
      if (bd < 12) { o.core += n; coreTotal += n; }
    }

    // Representatieve kleur: de exacte hoofdkleur (huisstijlkleur) als die duidelijk overheerst, anders het gemiddelde.
    let clusters = cl
      .map((o, i) => {
        const mean = [o.r / o.n, o.g / o.n, o.b / o.n];
        const rep = o.bestN >= 0.25 * o.n ? o.bestRgb : mean;
        return { id: i, n: o.n, rep, lab: C.rgbToLab(mean[0], mean[1], mean[2]) };
      })
      .filter((o) => o.n > 0);
    const detected = clusters.filter((o) => o.n >= 0.002 * total).length;

    // Stap 3: samenvoegen (Ward) tot het maximale aantal garenkleuren.
    let groups = clusters.map((o) => ({ n: o.n, lab: o.lab.slice(), rep: o.rep, repN: o.n, members: [o] }));
    while (groups.length > Math.max(1, maxColors)) {
      let ba = 0, bb = 1, best = Infinity;
      for (let a = 0; a < groups.length; a++) {
        for (let b = a + 1; b < groups.length; b++) {
          const ga = groups[a], gb = groups[b];
          const d = C.dE(ga.lab, gb.lab);
          const cost = ((ga.n * gb.n) / (ga.n + gb.n)) * d * d;
          if (cost < best) { best = cost; ba = a; bb = b; }
        }
      }
      const A = groups[ba], Bg = groups[bb];
      const n = A.n + Bg.n;
      const merged = {
        n,
        lab: [0, 1, 2].map((i) => (A.lab[i] * A.n + Bg.lab[i] * Bg.n) / n),
        rep: A.repN >= Bg.repN ? A.rep : Bg.rep,
        repN: Math.max(A.repN, Bg.repN),
        members: A.members.concat(Bg.members),
      };
      groups = groups.filter((_, i) => i !== ba && i !== bb);
      groups.push(merged);
    }
    groups.sort((a, b) => b.n - a.n);

    const groupOfCluster = new Uint8Array(Math.max(1, centers.length));
    groups.forEach((g, gi) => g.members.forEach((m) => (groupOfCluster[m.id] = gi)));
    const binToIndex = new Uint8Array(B6);
    for (let k = 0; k < B6; k++) if (c6[k]) binToIndex[k] = groupOfCluster[clusterOf[k]];

    const colors = groups.map((g) => ({
      rgb: g.rep.map((v) => Math.round(v)),
      share: g.n / total,
      members: g.members
        .slice()
        .sort((a, b) => b.n - a.n)
        .map((m) => ({ rgb: m.rep.map((v) => Math.round(v)), share: m.n / total })),
    }));

    return {
      colors,
      binToIndex,
      detected,
      coreShare: total ? coreTotal / total : 1,
      uniqueBins,
      reduced: clusters.length > groups.length,
    };
  }

  function indexMap(d, binToIndex) {
    const n = d.length / 4;
    const out = new Uint8Array(n);
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      out[p] = binToIndex[((d[i] >> 2) << 12) | ((d[i + 1] >> 2) << 6) | (d[i + 2] >> 2)];
    }
    return out;
  }

  /* ---------- Steken: per steek de meerderheidskleur van het bijbehorende vlakje ---------- */

  function buildGrid(idx, W, cols, rows, k, nColors) {
    const grid = new Uint8Array(cols * rows);
    const cnt = new Uint16Array(nColors);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cnt.fill(0);
        const x0 = c * k, y0 = r * k;
        for (let y = 0; y < k; y++) {
          const p = (y0 + y) * W + x0;
          for (let x = 0; x < k; x++) cnt[idx[p + x]]++;
        }
        // Bij gelijkspel wint de minst voorkomende kleur: zo blijven details eerder behouden.
        let best = 0, bn = 0;
        for (let i = 0; i < nColors; i++) if (cnt[i] > 0 && cnt[i] >= bn) { bn = cnt[i]; best = i; }
        grid[r * cols + c] = best;
      }
    }
    return grid;
  }

  /* Vlakken in het ontwerp die bij het omzetten naar steken (grotendeels) verdwijnen. */
  function analyzeElements(idx, grid, W, H, cols, k) {
    const N = W * H;
    const seen = new Uint8Array(N);
    const stack = new Int32Array(N);
    const unit = k * k;
    const flags = [];
    const edgeTouch = [];
    let elementCount = 0;

    // achtergrond van deze zijde = meest voorkomende steekkleur
    const counts = new Uint32Array(256);
    for (let i = 0; i < grid.length; i++) counts[grid[i]]++;
    let bg = 0;
    for (let i = 1; i < 256; i++) if (counts[i] > counts[bg]) bg = i;

    for (let p = 0; p < N; p++) {
      if (seen[p]) continue;
      const color = idx[p];
      let sp = 0;
      stack[sp++] = p;
      seen[p] = 1;
      let area = 0, kept = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
      while (sp) {
        const q = stack[--sp];
        const y = (q / W) | 0, x = q - y * W;
        area++;
        if (grid[((y / k) | 0) * cols + ((x / k) | 0)] === color) kept++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        if (x > 0 && !seen[q - 1] && idx[q - 1] === color) { seen[q - 1] = 1; stack[sp++] = q - 1; }
        if (x < W - 1 && !seen[q + 1] && idx[q + 1] === color) { seen[q + 1] = 1; stack[sp++] = q + 1; }
        if (y > 0 && !seen[q - W] && idx[q - W] === color) { seen[q - W] = 1; stack[sp++] = q - W; }
        if (y < H - 1 && !seen[q + W] && idx[q + W] === color) { seen[q + W] = 1; stack[sp++] = q + W; }
      }
      if (area < unit * 0.8) continue;
      if (color !== bg) elementCount++;
      const ratio = kept / area;
      const box = { c0: (x0 / k) | 0, r0: (y0 / k) | 0, c1: (x1 / k) | 0, r1: (y1 / k) | 0 };
      if (ratio < 0.25) flags.push(Object.assign({ type: 'lost', color, ratio, stitches: area / unit }, box));
      else if (ratio < 0.5 && area >= unit * 2) flags.push(Object.assign({ type: 'weak', color, ratio, stitches: area / unit }, box));

      // Elementen die tegen de zijkant (de vouw van de koker) aan liggen, maar geen doorlopende rand of streep zijn.
      if (color !== bg && area >= unit * 2 && (x0 === 0 || x1 === W - 1) && x1 - x0 + 1 < W * 0.8 && y1 - y0 + 1 < H * 0.5) {
        edgeTouch.push(Object.assign({ type: 'edge', color, stitches: area / unit }, box));
      }
    }
    edgeTouch.sort((a, b) => a.r0 - b.r0);
    return {
      flags: groupBoxes(flags, 2).slice(0, 400),
      lostCount: flags.filter((f) => f.type === 'lost').length,
      weakCount: flags.filter((f) => f.type === 'weak').length,
      edgeTouch: groupBoxes(edgeTouch, 1).slice(0, 200),
      elementCount,
      bg,
    };
  }

  /* Dicht bij elkaar liggende probleemvlakjes (zoals de letters van één woord) samenvoegen tot één gebied. */
  function groupBoxes(list, gap) {
    let groups = list.map((f) => Object.assign({}, f, { count: 1 }));
    let merged = true;
    while (merged) {
      merged = false;
      groups.sort((a, b) => a.r0 - b.r0 || a.c0 - b.c0);
      const out = [];
      for (const g of groups) {
        const hit = out.find((o) => g.r0 <= o.r1 + gap && g.r1 >= o.r0 - gap && g.c0 <= o.c1 + gap && g.c1 >= o.c0 - gap);
        if (hit) {
          hit.r0 = Math.min(hit.r0, g.r0);
          hit.r1 = Math.max(hit.r1, g.r1);
          hit.c0 = Math.min(hit.c0, g.c0);
          hit.c1 = Math.max(hit.c1, g.c1);
          hit.count += g.count;
          hit.stitches += g.stitches;
          if (g.type === 'lost') hit.type = 'lost';
          merged = true;
        } else out.push(g);
      }
      groups = out;
    }
    return groups.sort((a, b) => a.r0 - b.r0 || a.c0 - b.c0);
  }

  function analyzeStitches(grid, cols, rows, nColors) {
    const isolated = [];
    let thinCols = 0, thinRows = 0;
    const counts = new Uint32Array(nColors);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c, v = grid[i];
        counts[v]++;
        const L = c > 0 ? grid[i - 1] : -1;
        const R = c < cols - 1 ? grid[i + 1] : -1;
        const U = r > 0 ? grid[i - cols] : -1;
        const D = r < rows - 1 ? grid[i + cols] : -1;
        let nb = 0, same = 0;
        for (const n of [L, R, U, D]) {
          if (n === -1) continue;
          nb++;
          if (n === v) same++;
        }
        if (nb >= 3 && same === 0) {
          if (isolated.length < 6000) isolated.push(i);
          continue;
        }
        if (L !== -1 && R !== -1 && L !== v && R !== v) thinCols++;
        if (U !== -1 && D !== -1 && U !== v && D !== v) thinRows++;
      }
    }
    return { isolated, thinCols, thinRows, counts };
  }

  /* ---------- Hoofdroutine ---------- */

  function compute(preps, s) {
    const cols = Math.max(2, Math.round(s.Wcm * s.stX));
    const rows = Math.max(2, Math.round(s.Hcm * s.stY));
    let k = 6;
    while (k > 2 && cols * rows * k * k > 2.2e6) k--;
    const W = cols * k, H = rows * k;

    const sides = preps.map((p) => {
      const bg = edgeColor(p.canvas);
      // Een bestand dat precies een (veelvoud van het) steekraster is: 1 pixel = 1 steek, dus 1-op-1 omzetten.
      const w = p.canvas.width, h = p.canvas.height;
      const pixelExact = w % cols === 0 && h % rows === 0 && w / cols === h / rows;
      const sf = pixelExact ? Object.assign({}, s, { fit: 'stretch' }) : s;
      const work = fitted(p.canvas, W, H, sf, bg, false);
      const disp = fitted(p.canvas, Math.round(s.Wcm * DISPLAY_PX_PER_CM), Math.round(s.Hcm * DISPLAY_PX_PER_CM), sf, bg, !pixelExact);
      const data = ctx2d(work, true).getImageData(0, 0, W, H).data;
      return { prep: p, bg, disp, data, pixelExact, pixelsPerStitch: pixelExact ? w / cols : 0 };
    });

    const palette = analyzeColors(sides.map((x) => x.data), s.maxColors);
    const n = palette.colors.length;
    for (const side of sides) {
      const idx = indexMap(side.data, palette.binToIndex);
      side.grid = buildGrid(idx, W, cols, rows, k, n);
      side.elements = analyzeElements(idx, side.grid, W, H, cols, k);
      side.stitches = analyzeStitches(side.grid, cols, rows, n);
      side.data = null;
    }
    return { cols, rows, k, palette, sides };
  }

  SC.process = { prepare, compute };
})();
