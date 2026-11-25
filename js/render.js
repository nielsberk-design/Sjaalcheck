/* Tekenen: gebreide steek (V-vorm), steekraster, origineel, liniaal, markeringen en het sjaaloverzicht. */
(function () {
  'use strict';
  const SC = (window.SC = window.SC || {});
  const C = SC.color;
  const makeCanvas = SC.loader.makeCanvas;

  const EXT = 0.6; // hoe ver een steek omhoog doorloopt in de rij erboven (in rijhoogtes)

  /* ---------- Eén gebreide steek als sprite ---------- */

  function makeStitchSprite(rgb, cw, ch) {
    const pad = 2;
    const w = Math.ceil(cw) + pad * 2;
    const h = Math.ceil(ch * (1 + EXT)) + pad * 2;
    const c = makeCanvas(w, h);
    const g = c.getContext('2d');
    const ox = pad, oy = ch * EXT + pad;

    const light = C.mix(rgb, [255, 255, 255], 0.3);
    const dark = C.mix(rgb, [0, 0, 0], 0.42);
    const edge = C.mix(rgb, [0, 0, 0], 0.62);
    const lineW = Math.max(0.5, cw * 0.035);

    for (const side of [-1, 1]) {
      const bx = ox + cw * 0.5 + side * cw * 0.05, by = oy + ch * 0.96;
      const tx = ox + cw * 0.5 + side * cw * 0.38, ty = oy - ch * (EXT - 0.12);
      const cx = (bx + tx) / 2, cy = (by + ty) / 2;
      const len = Math.hypot(tx - bx, ty - by);
      const ang = Math.atan2(ty - by, tx - bx);
      const a = len / 2, b = cw * 0.215;

      g.save();
      g.translate(cx, cy);
      g.rotate(ang);
      const grad = g.createLinearGradient(0, -b * side, 0, b * side);
      grad.addColorStop(0, C.rgba(edge, 1));
      grad.addColorStop(0.3, C.rgba(light, 1));
      grad.addColorStop(0.55, C.rgba(rgb, 1));
      grad.addColorStop(1, C.rgba(dark, 1));
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(0, 0, a, b, 0, 0, Math.PI * 2);
      g.fill();

      // twist in het garen: een paar schuine glimlijntjes
      if (cw >= 9) {
        g.strokeStyle = C.rgba(light, 0.45);
        g.lineWidth = Math.max(0.5, b * 0.18);
        g.beginPath();
        for (let t = -0.55; t <= 0.56; t += 0.37) {
          g.moveTo(a * t - b * 0.25, -b * 0.55 * side);
          g.lineTo(a * t + b * 0.35, b * 0.35 * side);
        }
        g.stroke();
      }

      g.strokeStyle = C.rgba(edge, 0.55);
      g.lineWidth = lineW;
      g.beginPath();
      g.ellipse(0, 0, a, b, 0, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
    return { canvas: c, ox, oy };
  }

  class SpriteCache {
    constructor() {
      this.key = '';
      this.sprites = [];
    }
    get(colors, cw, ch) {
      const key = colors.map(C.toHex).join(',') + '|' + cw.toFixed(2) + 'x' + ch.toFixed(2);
      if (key !== this.key) {
        this.sprites = colors.map((rgb) => makeStitchSprite(rgb, cw, ch));
        this.key = key;
      }
      return this.sprites;
    }
  }

  /* ---------- Tekenroutines (in apparaatpixels) ---------- */

  function gapColors(colors) {
    return colors.map((rgb) => C.toHex(C.mix(rgb, [0, 0, 0], 0.55)));
  }

  function fillRuns(g, grid, cols, r, x0, y, cw, h, fills) {
    let c = 0;
    while (c < cols) {
      const v = grid[r * cols + c];
      let e = c + 1;
      while (e < cols && grid[r * cols + e] === v) e++;
      g.fillStyle = fills[v];
      const xa = Math.floor(x0 + c * cw), xb = Math.ceil(x0 + e * cw);
      g.fillRect(xa, y, xb - xa, h);
      c = e;
    }
  }

  function drawFlat(g, grid, cols, r0, r1, x0, y0, cw, ch, colors) {
    const fills = colors.map(C.toHex);
    for (let r = r0; r <= r1; r++) {
      const ya = Math.floor(y0 + r * ch), yb = Math.ceil(y0 + (r + 1) * ch);
      fillRuns(g, grid, cols, r, x0, ya, cw, yb - ya, fills);
    }
  }

  function drawKnit(g, grid, cols, r0, r1, x0, y0, cw, ch, colors, cache) {
    if (cw < 4.5) {
      drawFlat(g, grid, cols, r0, r1, x0, y0, cw, ch, colors.map((c) => C.mix(c, [0, 0, 0], 0.08)));
      return;
    }
    const gaps = gapColors(colors);
    const rs = Math.max(0, r0 - 1), re = r1 + 1;
    for (let r = rs; r <= re && r * cols < grid.length; r++) {
      const ya = Math.floor(y0 + r * ch), yb = Math.ceil(y0 + (r + 1) * ch);
      fillRuns(g, grid, cols, r, x0, ya, cw, yb - ya, gaps);
    }
    const sprites = cache.get(colors, cw, ch);
    // Van onder naar boven: de rij erboven valt over de bovenkant van de lussen eronder.
    for (let r = Math.min(re, grid.length / cols - 1); r >= rs; r--) {
      const y = y0 + r * ch;
      for (let c = 0; c < cols; c++) {
        const s = sprites[grid[r * cols + c]];
        g.drawImage(s.canvas, Math.round(x0 + c * cw - s.ox), Math.round(y - s.oy));
      }
    }
  }

  function drawGrid(g, grid, cols, r0, r1, x0, y0, cw, ch, colors, S) {
    drawFlat(g, grid, cols, r0, r1, x0, y0, cw, ch, colors);
    if (ch < 5 * S) return;
    const top = y0 + r0 * ch, bottom = y0 + (r1 + 1) * ch;
    g.lineWidth = 1;
    for (let c = 0; c <= cols; c++) {
      g.strokeStyle = c % 10 === 0 ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.16)';
      const x = Math.round(x0 + c * cw) + 0.5;
      g.beginPath();
      g.moveTo(x, top);
      g.lineTo(x, bottom);
      g.stroke();
    }
    for (let r = r0; r <= r1 + 1; r++) {
      g.strokeStyle = r % 10 === 0 ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.16)';
      const y = Math.round(y0 + r * ch) + 0.5;
      g.beginPath();
      g.moveTo(x0, y);
      g.lineTo(x0 + cols * cw, y);
      g.stroke();
    }
  }

  /* ---------- Viewer: panelen naast elkaar, verticaal scrollen ---------- */

  class Viewer {
    constructor(host, onHover) {
      this.host = host;
      this.canvas = host.querySelector('canvas');
      this.scroller = host.querySelector('.viewer-scroll');
      this.spacer = host.querySelector('.viewer-spacer');
      this.tip = host.querySelector('.viewer-tip');
      this.cache = new SpriteCache();
      this.data = null;
      this.zoom = 30; // px per cm
      this.panels = ['orig', 'knit'];
      this.markers = true;
      this.highlight = null;
      this.onHover = onHover;
      this.RULER = 46;
      this.HEADER = 34;
      this.GAP = 28;
      this.PAD = 16;
      this.raf = 0;
      this.scroller.addEventListener('scroll', () => this.requestDraw());
      new ResizeObserver(() => this.requestDraw(true)).observe(this.host);
      this.scroller.addEventListener('mousemove', (e) => this.hover(e));
      this.scroller.addEventListener('mouseleave', () => {
        this.tip.hidden = true;
      });
      this.scroller.addEventListener(
        'wheel',
        (e) => {
          if (!(e.ctrlKey || e.metaKey)) return;
          e.preventDefault();
          const f = Math.exp(-e.deltaY * 0.0025);
          this.setZoom(this.zoom * f, e.offsetY);
        },
        { passive: false }
      );
    }

    set(data) {
      this.data = data;
      this.layout();
      this.requestDraw();
    }

    geometry() {
      const d = this.data;
      const cw = this.zoom / d.stX, ch = this.zoom / d.stY;
      const panelW = d.cols * cw;
      const n = this.panels.length;
      const contentW = this.RULER + this.PAD + n * panelW + (n - 1) * this.GAP + this.PAD;
      const contentH = this.HEADER + this.PAD + d.rows * ch + this.PAD;
      return { cw, ch, panelW, contentW, contentH };
    }

    layout() {
      if (!this.data) return;
      const geo = this.geometry();
      this.spacer.style.width = Math.ceil(geo.contentW) + 'px';
      this.spacer.style.height = Math.ceil(geo.contentH) + 'px';
    }

    fitWidthZoom() {
      const d = this.data;
      const n = this.panels.length;
      const avail = this.scroller.clientWidth - this.RULER - 2 * this.PAD - (n - 1) * this.GAP - 4;
      return avail / (n * d.Wcm);
    }

    fitHeightZoom() {
      const avail = this.scroller.clientHeight - this.HEADER - 2 * this.PAD - 4;
      return avail / this.data.Hcm;
    }

    clampZoom(z) {
      const min = Math.min(this.fitHeightZoom() * 0.95, 4);
      return Math.max(min, Math.min(200, z));
    }

    setZoom(z, anchorY) {
      if (!this.data) return;
      const ay = anchorY == null ? this.scroller.clientHeight / 2 : anchorY;
      const before = this.geometry();
      const rowAt = (this.scroller.scrollTop + ay - this.HEADER - this.PAD) / before.ch;
      const fracX = this.scroller.scrollWidth > this.scroller.clientWidth
        ? (this.scroller.scrollLeft + this.scroller.clientWidth / 2) / this.scroller.scrollWidth
        : 0.5;
      this.zoom = this.clampZoom(z);
      this.layout();
      const after = this.geometry();
      this.scroller.scrollTop = rowAt * after.ch + this.HEADER + this.PAD - ay;
      if (this.scroller.scrollWidth > this.scroller.clientWidth) {
        this.scroller.scrollLeft = fracX * this.scroller.scrollWidth - this.scroller.clientWidth / 2;
      }
      this.requestDraw();
      if (this.onZoom) this.onZoom(this.zoom);
    }

    scrollToRow(row, center = true) {
      if (!this.data) return;
      const geo = this.geometry();
      const y = this.HEADER + this.PAD + row * geo.ch;
      this.scroller.scrollTop = center ? y - this.scroller.clientHeight / 2 : y;
      this.requestDraw();
    }

    visibleRows() {
      if (!this.data) return [0, 0];
      const geo = this.geometry();
      const top = this.scroller.scrollTop - this.PAD;
      const r0 = Math.max(0, Math.floor(top / geo.ch));
      const r1 = Math.min(this.data.rows - 1, Math.ceil((top + this.scroller.clientHeight - this.HEADER) / geo.ch));
      return [r0, r1];
    }

    requestDraw(resize) {
      if (resize) this.needResize = true;
      if (this.raf) return;
      this.raf = requestAnimationFrame(() => {
        this.raf = 0;
        this.draw();
      });
    }

    panelX(i, geo, offsetX) {
      return offsetX + this.RULER + this.PAD + i * (geo.panelW + this.GAP);
    }

    contentOffsetX(geo) {
      const vw = this.scroller.clientWidth;
      return geo.contentW < vw ? (vw - geo.contentW) / 2 : -this.scroller.scrollLeft;
    }

    draw() {
      const dpr = window.devicePixelRatio || 1;
      const vw = this.scroller.clientWidth, vh = this.scroller.clientHeight;
      if (this.canvas.width !== Math.round(vw * dpr) || this.canvas.height !== Math.round(vh * dpr)) {
        this.canvas.width = Math.round(vw * dpr);
        this.canvas.height = Math.round(vh * dpr);
        this.canvas.style.width = vw + 'px';
        this.canvas.style.height = vh + 'px';
      }
      const g = this.canvas.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = getComputedStyle(this.host).getPropertyValue('--viewer-bg') || '#efece6';
      g.fillRect(0, 0, this.canvas.width, this.canvas.height);
      if (!this.data) return;

      const d = this.data;
      const geo = this.geometry();
      const ox = this.contentOffsetX(geo);
      const scrollY = this.scroller.scrollTop;
      const y0 = this.HEADER + this.PAD - scrollY; // y van rij 0 (css px)
      const [r0, r1] = this.visibleRows();

      // alles in apparaatpixels tekenen voor scherpe steken
      const S = dpr;
      const side = d.sides[d.activeSide] || d.sides[0];
      const colors = (d.sideColors && d.sideColors[d.activeSide]) || d.colors;
      g.save();
      g.beginPath();
      g.rect(0, this.HEADER * S, this.canvas.width, this.canvas.height - this.HEADER * S);
      g.clip();

      this.panels.forEach((p, i) => {
        const px = this.panelX(i, geo, ox) * S;
        const py = y0 * S;
        const cw = geo.cw * S, ch = geo.ch * S;
        // schaduw onder het paneel
        g.fillStyle = 'rgba(40,30,20,0.12)';
        g.fillRect(px + 3 * S, py + r0 * ch + 3 * S, d.cols * cw, (r1 - r0 + 1) * ch);
        if (p === 'orig') {
          const src = side.disp;
          const fch = src.height / d.rows;
          g.imageSmoothingEnabled = true;
          g.imageSmoothingQuality = 'high';
          g.drawImage(src, 0, r0 * fch, src.width, (r1 - r0 + 1) * fch, px, py + r0 * ch, d.cols * cw, (r1 - r0 + 1) * ch);
        } else if (p === 'grid') {
          drawGrid(g, side.grid, d.cols, r0, r1, px, py, cw, ch, colors, S);
        } else {
          g.save();
          g.beginPath();
          g.rect(px, py + r0 * ch - ch, d.cols * cw, (r1 - r0 + 3) * ch);
          g.clip();
          drawKnit(g, side.grid, d.cols, r0, r1, px, py, cw, ch, colors, this.cache);
          g.restore();
        }
        if (this.markers) this.drawMarkers(g, side, px, py, cw, ch, r0, r1, S, p);
      });
      g.restore();

      this.drawRuler(g, y0, geo, S);
      this.drawHeader(g, geo, ox, S);
      if (this.onDraw) this.onDraw([r0, r1]);
    }

    drawMarkers(g, side, px, py, cw, ch, r0, r1, S, panel) {
      const d = this.data;
      g.save();
      g.lineWidth = Math.max(1.5, 2 * S);
      for (const f of side.elements.flags) {
        if (f.r1 < r0 - 1 || f.r0 > r1 + 1) continue;
        const isHL = this.highlight === f;
        g.strokeStyle = f.type === 'lost' ? '#d9342b' : '#e08a00';
        g.setLineDash(isHL ? [] : [5 * S, 3 * S]);
        g.lineWidth = (isHL ? 3 : 2) * S;
        const pad = 2 * S;
        g.strokeRect(px + f.c0 * cw - pad, py + f.r0 * ch - pad, (f.c1 - f.c0 + 1) * cw + 2 * pad, (f.r1 - f.r0 + 1) * ch + 2 * pad);
      }
      for (const f of side.elements.edgeTouch) {
        if (f.r1 < r0 - 1 || f.r0 > r1 + 1) continue;
        g.strokeStyle = '#2f6fdb';
        g.setLineDash([2 * S, 3 * S]);
        g.lineWidth = 2 * S;
        const x = f.c0 === 0 ? px - 4 * S : px + d.cols * cw + 4 * S;
        g.beginPath();
        g.moveTo(x, py + f.r0 * ch);
        g.lineTo(x, py + (f.r1 + 1) * ch);
        g.stroke();
      }
      if (panel !== 'orig' && cw >= 3) {
        g.setLineDash([]);
        g.strokeStyle = '#d9342b';
        g.lineWidth = Math.max(1, 1.5 * S);
        for (const i of side.stitches.isolated) {
          const r = (i / d.cols) | 0;
          if (r < r0 || r > r1) continue;
          const c = i - r * d.cols;
          g.beginPath();
          g.ellipse(px + (c + 0.5) * cw, py + (r + 0.5) * ch, cw * 0.62, ch * 0.75, 0, 0, Math.PI * 2);
          g.stroke();
        }
      }
      g.restore();
    }

    drawRuler(g, y0, geo, S) {
      const d = this.data;
      const H = this.canvas.height;
      g.fillStyle = 'rgba(255,255,255,0.92)';
      g.fillRect(0, this.HEADER * S, this.RULER * S, H);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(this.RULER * S - S, this.HEADER * S, S, H);
      const pxPerCm = geo.ch * d.stY;
      let major = 10, minor = 1;
      if (pxPerCm < 3) { major = 20; minor = 5; }
      else if (pxPerCm < 7) { major = 10; minor = 5; }
      else if (pxPerCm > 60) { major = 1; minor = 0.5; }
      else if (pxPerCm > 25) { major = 5; minor = 1; }
      g.font = `${11 * S}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      for (let cm = 0; cm <= d.Hcm + 1e-6; cm += minor) {
        const y = (y0 + cm * pxPerCm) * S;
        if (y < this.HEADER * S - 10 || y > H + 10) continue;
        const isMajor = Math.abs(cm / major - Math.round(cm / major)) < 1e-6;
        g.fillStyle = isMajor ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.25)';
        const len = isMajor ? 10 : 5;
        g.fillRect((this.RULER - len) * S, Math.round(y), len * S, S);
        if (isMajor) {
          g.fillStyle = '#4a4339';
          g.fillText(String(Math.round(cm * 10) / 10), (this.RULER - 13) * S, y);
        }
      }
    }

    drawHeader(g, geo, ox, S) {
      const W = this.canvas.width;
      g.fillStyle = getComputedStyle(this.host).getPropertyValue('--viewer-head') || '#f7f5f1';
      g.fillRect(0, 0, W, this.HEADER * S);
      g.fillStyle = 'rgba(0,0,0,0.1)';
      g.fillRect(0, this.HEADER * S - S, W, S);
      g.font = `600 ${12 * S}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#3a342c';
      const back = (this.data.sides[this.data.activeSide] || {}).virtual;
      const names = { orig: back ? 'Origineel (kleuren voorzijde)' : 'Origineel', grid: 'Steekraster', knit: back ? 'Gebreid · achterzijde' : 'Gebreid' };
      this.panels.forEach((p, i) => {
        const x = (this.panelX(i, geo, ox) + geo.panelW / 2) * S;
        g.fillText(names[p], x, (this.HEADER / 2) * S);
      });
      g.textAlign = 'left';
      g.font = `${10.5 * S}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
      g.fillStyle = '#7a7166';
      g.fillText('cm', 12 * S, (this.HEADER / 2) * S);
    }

    hover(e) {
      if (!this.data) return;
      const d = this.data;
      const geo = this.geometry();
      const rect = this.scroller.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const ox = this.contentOffsetX(geo);
      const y = my + this.scroller.scrollTop - this.HEADER - this.PAD;
      let hit = null;
      this.panels.forEach((p, i) => {
        const px = this.panelX(i, geo, ox);
        if (mx >= px && mx < px + geo.panelW && my > this.HEADER) hit = { p, x: mx - px };
      });
      if (!hit || y < 0 || y >= d.rows * geo.ch) {
        this.tip.hidden = true;
        return;
      }
      const c = Math.floor(hit.x / geo.cw), r = Math.floor(y / geo.ch);
      const side = d.sides[d.activeSide] || d.sides[0];
      const v = side.grid[r * d.cols + c];
      const rgb = ((d.sideColors && d.sideColors[d.activeSide]) || d.colors)[v];
      const names = (d.sideNames && d.sideNames[d.activeSide]) || d.names;
      this.tip.innerHTML = `<span class="sw" style="background:${C.toHex(rgb)}"></span>` +
        `Rij <b>${r + 1}</b> · steek <b>${c + 1}</b><br><span class="muted">${((r + 0.5) / d.stY).toFixed(1).replace('.', ',')} cm van boven · kleur ${v + 1} (${names ? names[v] : C.name(rgb)})</span>`;
      this.tip.hidden = false;
      const tw = this.tip.offsetWidth, th = this.tip.offsetHeight;
      let tx = mx + 14, ty = my + 14;
      if (tx + tw > rect.width - 8) tx = mx - tw - 14;
      if (ty + th > rect.height - 8) ty = my - th - 14;
      this.tip.style.transform = `translate(${tx}px, ${ty}px)`;
    }
  }

  /* ---------- Overzicht: hele sjaal liggend, met franjes ---------- */

  function drawOverview(canvas, d, opts) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const n = d.sides.length;
    const fringeCm = opts.fringe ? 9 : 0;
    const labelW = 0;
    const avail = cssW - labelW - 24;
    let s = avail / (d.Hcm + 2 * fringeCm); // px per cm
    const stripH = d.Wcm * s;
    const rowGap = 30;
    const cssH = Math.round(n * (stripH + rowGap) + 4);
    if (canvas.height !== Math.round(cssH * dpr) || canvas.width !== Math.round(cssW * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.height = cssH + 'px';
    }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cssW, cssH);

    const x0 = labelW + 12 + fringeCm * s;
    const len = d.Hcm * s;
    const hits = [];
    d.sides.forEach((side, si) => {
      const y0 = si * (stripH + rowGap) + 24;
      g.font = '600 11.5px ui-sans-serif, system-ui, -apple-system, sans-serif';
      g.fillStyle = si === d.activeSide ? '#2b2620' : '#8a8176';
      g.textBaseline = 'alphabetic';
      g.textAlign = 'left';
      const label = n === 1 ? 'Voor- en achterzijde (gelijk)'
        : si === 0 ? 'Voorzijde'
        : side.virtual ? 'Achterzijde (zelfde ontwerp, andere kleuren)' : 'Achterzijde (eigen ontwerp)';
      g.fillText(label, x0, y0 - 10);
      const sideCols = (d.sideColors && d.sideColors[si]) || d.colors;

      // rooster liggend: rij → x (boven = links), steek → y (linkerrand = onder)
      const img = new ImageData(d.rows, d.cols);
      const px = img.data;
      const flip = !!opts.flip;
      for (let r = 0; r < d.rows; r++) {
        for (let c = 0; c < d.cols; c++) {
          const rgb = sideCols[side.grid[r * d.cols + c]];
          const xi = flip ? d.rows - 1 - r : r, yi = flip ? c : d.cols - 1 - c;
          const o = (yi * d.rows + xi) * 4;
          px[o] = rgb[0]; px[o + 1] = rgb[1]; px[o + 2] = rgb[2]; px[o + 3] = 255;
        }
      }
      const tmp = makeCanvas(d.rows, d.cols);
      tmp.getContext('2d').putImageData(img, 0, 0);

      // franjes
      if (opts.fringe) {
        const cols = opts.fringeColors.length ? opts.fringeColors : [d.colors[0]];
        const strands = Math.max(8, Math.round(stripH / 3.2));
        g.lineCap = 'round';
        for (const end of [0, 1]) {
          for (let i = 0; i < strands; i++) {
            const y = y0 + ((i + 0.5) / strands) * stripH;
            const group = Math.floor(i / Math.max(1, Math.round(strands / (cols.length * 3))));
            const rgb = cols[group % cols.length];
            const L = fringeCm * s * (0.86 + 0.14 * Math.sin(i * 2.3 + end));
            const xs = end === 0 ? x0 : x0 + len;
            const dir = end === 0 ? -1 : 1;
            g.strokeStyle = C.toHex(C.mix(rgb, [0, 0, 0], 0.12));
            g.lineWidth = Math.max(1.2, stripH / strands * 0.85);
            g.beginPath();
            g.moveTo(xs, y);
            g.quadraticCurveTo(xs + dir * L * 0.5, y + Math.sin(i * 1.7) * 2, xs + dir * L, y + Math.sin(i * 0.9 + end) * 3);
            g.stroke();
          }
        }
      }

      g.save();
      g.shadowColor = 'rgba(40,30,20,0.22)';
      g.shadowBlur = 8;
      g.shadowOffsetY = 3;
      g.imageSmoothingEnabled = len / d.rows < 1;
      g.drawImage(tmp, x0, y0, len, stripH);
      g.restore();
      g.imageSmoothingEnabled = len / d.rows < 1;
      g.drawImage(tmp, x0, y0, len, stripH);
      // licht/schaduw: een platgedrukte koker
      const sh = g.createLinearGradient(0, y0, 0, y0 + stripH);
      sh.addColorStop(0, 'rgba(255,255,255,0.16)');
      sh.addColorStop(0.18, 'rgba(255,255,255,0)');
      sh.addColorStop(0.8, 'rgba(0,0,0,0)');
      sh.addColorStop(1, 'rgba(0,0,0,0.2)');
      g.fillStyle = sh;
      g.fillRect(x0, y0, len, stripH);

      if (si === d.activeSide && opts.view) {
        const [r0, r1] = opts.view;
        const startRow = opts.flip ? d.rows - 1 - r1 : r0;
        const vx = x0 + (startRow / d.rows) * len, vw = Math.max(3, ((r1 - r0 + 1) / d.rows) * len);
        g.strokeStyle = '#1f1b16';
        g.lineWidth = 2;
        g.strokeRect(vx, y0 - 3, vw, stripH + 6);
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.fillRect(vx, y0, vw, stripH);
      }
      hits.push({ side: si, x0, y0, len, h: stripH, flip: !!opts.flip });
    });
    return hits;
  }

  /* ---------- Export ---------- */

  function gridToCanvas(grid, cols, rows, colors) {
    const c = makeCanvas(cols, rows);
    const g = c.getContext('2d');
    const img = g.createImageData(cols, rows);
    for (let i = 0; i < grid.length; i++) {
      const rgb = colors[grid[i]];
      img.data[i * 4] = rgb[0];
      img.data[i * 4 + 1] = rgb[1];
      img.data[i * 4 + 2] = rgb[2];
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  function knitToCanvas(grid, cols, rows, colors, cw, ch) {
    const c = makeCanvas(cols * cw, rows * ch);
    const g = c.getContext('2d');
    drawKnit(g, grid, cols, 0, rows - 1, 0, 0, cw, ch, colors, new SpriteCache());
    return c;
  }

  SC.render = { Viewer, drawOverview, gridToCanvas, knitToCanvas };
})();
