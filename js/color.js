/* Kleurhulpjes: sRGB ↔ Lab, kleurverschil (ΔE), mengen en Nederlandse kleurnamen. */
(function () {
  'use strict';
  const SC = (window.SC = window.SC || {});

  const LIN = new Float64Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  const fLab = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);

  function rgbToLab(r, g, b) {
    const R = LIN[Math.round(r)], G = LIN[Math.round(g)], B = LIN[Math.round(b)];
    const x = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047;
    const y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
    const z = (R * 0.0193339 + G * 0.119192 + B * 0.9503041) / 1.08883;
    const fx = fLab(x), fy = fLab(y), fz = fLab(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  function dE(a, b) {
    const d0 = a[0] - b[0], d1 = a[1] - b[1], d2 = a[2] - b[2];
    return Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2);
  }

  /** CIEDE2000: kleurverschil zoals het oog het ziet. Gebruikt voor het matchen met garens. */
  function dE2000(l1, l2) {
    const rad = Math.PI / 180;
    const [L1, a1, b1] = l1, [L2, a2, b2] = l2;
    const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
    const Cb7 = Math.pow((C1 + C2) / 2, 7);
    const G = 0.5 * (1 - Math.sqrt(Cb7 / (Cb7 + 6103515625)));
    const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
    const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
    const hue = (b, a) => {
      if (a === 0 && b === 0) return 0;
      const h = Math.atan2(b, a) / rad;
      return h < 0 ? h + 360 : h;
    };
    const h1p = hue(b1, a1p), h2p = hue(b2, a2p);
    const dLp = L2 - L1, dCp = C2p - C1p;
    let dhp = 0;
    if (C1p * C2p !== 0) {
      dhp = h2p - h1p;
      if (dhp > 180) dhp -= 360;
      else if (dhp < -180) dhp += 360;
    }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
    const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
    let hbp = h1p + h2p;
    if (C1p * C2p !== 0) {
      if (Math.abs(h1p - h2p) > 180) hbp += hbp < 360 ? 360 : -360;
      hbp /= 2;
    }
    const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad) +
      0.32 * Math.cos((3 * hbp + 6) * rad) - 0.2 * Math.cos((4 * hbp - 63) * rad);
    const dTheta = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
    const Cbp7 = Math.pow(Cbp, 7);
    const RC = 2 * Math.sqrt(Cbp7 / (Cbp7 + 6103515625));
    const SL = 1 + (0.015 * Math.pow(Lbp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
    const SC_ = 1 + 0.045 * Cbp, SH = 1 + 0.015 * Cbp * T;
    const RT = -Math.sin(2 * dTheta * rad) * RC;
    const x = dLp / SL, y = dCp / SC_, z = dHp / SH;
    return Math.sqrt(x * x + y * y + z * z + RT * y * z);
  }

  function toHex(rgb) {
    return '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }

  function parseHex(h) {
    const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
    if (!m) return [0, 0, 0];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  function rgba(rgb, a) {
    return `rgba(${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])},${a})`;
  }

  function luminance(rgb) {
    return 0.2126 * LIN[Math.round(rgb[0])] + 0.7152 * LIN[Math.round(rgb[1])] + 0.0722 * LIN[Math.round(rgb[2])];
  }

  /** Grove Nederlandse kleurnaam, puur als geheugensteun in de interface. */
  function name(rgb) {
    const [r, g, b] = rgb.map((v) => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (d !== 0) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }
    if (h < 0) h += 360;

    if (l < 0.1) return 'zwart';
    if (l > 0.93 && s < 0.5) return 'wit';
    if (s < 0.12) return l < 0.35 ? 'donkergrijs' : l > 0.7 ? 'lichtgrijs' : 'grijs';

    let base;
    if (h < 12 || h >= 340) base = 'rood';
    else if (h < 40) base = l < 0.4 ? 'bruin' : 'oranje';
    else if (h < 65) base = l < 0.35 ? 'olijf' : s < 0.45 && l > 0.6 ? 'beige' : 'geel';
    else if (h < 160) base = 'groen';
    else if (h < 195) base = 'turquoise';
    else if (h < 255) base = 'blauw';
    else if (h < 290) base = 'paars';
    else base = l > 0.6 ? 'roze' : 'magenta';

    if (base === 'rood' && l > 0.72) base = 'roze';
    if (base === 'rood' && l < 0.3) return 'bordeaux';
    if (base === 'blauw' && l < 0.25) return 'marineblauw';
    if (l < 0.3) return 'donker' + base;
    if (l > 0.72) return 'licht' + base;
    return base;
  }

  SC.color = { rgbToLab, dE, dE2000, toHex, parseHex, mix, rgba, luminance, name };
})();
