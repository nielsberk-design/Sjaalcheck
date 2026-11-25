/* Voorbeeldontwerp om de tool mee uit te proberen (liggend getekend, zoals ontwerpers vaak doen). */
(function () {
  'use strict';
  const SC = (window.SC = window.SC || {});

  function star(g, cx, cy, R, r, n) {
    g.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = (Math.PI / n) * i - Math.PI / 2;
      const rad = i % 2 ? r : R;
      g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    }
    g.closePath();
  }

  function makeDemo() {
    const PX = 20; // px per cm
    const W = 180 * PX, H = 17 * PX;
    const c = SC.loader.makeCanvas(W, H);
    const g = c.getContext('2d');
    const navy = '#14284b', white = '#ffffff', red = '#c8102e', gold = '#f2b705', sky = '#6fb7e9';

    g.fillStyle = navy;
    g.fillRect(0, 0, W, H);

    // blokstrepen aan beide uiteinden
    for (const x0 of [0, W - 22 * PX]) {
      const seq = [[white, 4], [red, 6], [white, 2], [red, 6], [white, 4]];
      let x = x0;
      for (const [col, w] of seq) {
        g.fillStyle = col;
        g.fillRect(x, 0, w * PX, H);
        x += w * PX;
      }
    }

    // dunne biesjes (te dun om te breien: 1 mm)
    g.fillStyle = gold;
    g.fillRect(22 * PX, 2 * PX, W - 44 * PX, 0.1 * PX);
    g.fillRect(22 * PX, H - 2.1 * PX, W - 44 * PX, 0.1 * PX);

    // logo: cirkel met ster
    const lx = 40 * PX, ly = H / 2;
    g.fillStyle = gold;
    g.beginPath();
    g.arc(lx, ly, 6 * PX, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = navy;
    g.beginPath();
    g.arc(lx, ly, 5.2 * PX, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = sky;
    star(g, lx, ly, 4.2 * PX, 1.8 * PX, 5);
    g.fill();

    // hoofdtekst
    g.fillStyle = white;
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.font = `900 ${8.6 * PX}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    g.fillText('VOORBEELD', 52 * PX, H / 2 + 0.3 * PX);

    // kleine tekst (te klein)
    g.font = `600 ${1.1 * PX}px Georgia, serif`;
    g.fillStyle = gold;
    g.fillText('sinds 1923 · altijd trouw', 120 * PX, H / 2 + 5.2 * PX);

    // tweede logo-ster rechts, raakt de zijkant
    g.fillStyle = red;
    star(g, 145 * PX, 2.2 * PX, 3 * PX, 1.3 * PX, 5);
    g.fill();

    return c;
  }

  function demoSource() {
    const c = makeDemo();
    return {
      kind: 'image',
      demo: true,
      name: 'voorbeeldontwerp.png',
      pageCount: 1,
      page: 1,
      canvas: c,
      pixelWidth: c.width,
      pixelHeight: c.height,
      downscaled: false,
      physical: null,
    };
  }

  SC.demo = { demoSource };
})();
