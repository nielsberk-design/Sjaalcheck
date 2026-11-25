/* Bestanden inladen: PNG/JPG/WebP via de browser, PDF via pdf.js. Levert altijd een canvas op. */
(function () {
  'use strict';
  const SC = (window.SC = window.SC || {});

  const MAX_SIDE = 9000; // langste zijde van de ingelezen bron (px)
  const MAX_AREA = 36e6; // geheugengrens voor één canvas

  // Lokaal staat pdf.js in vendor/; de gepubliceerde versie zet SJAAL_CONFIG met CDN-adressen.
  const CFG = window.SJAAL_CONFIG || {};
  const WORKER_URL = CFG.pdfWorkerScript || 'vendor/pdfjs/pdf.worker.min.js';
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_URL;
  }

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function limitScale(w, h) {
    let s = 1;
    if (Math.max(w, h) * s > MAX_SIDE) s = MAX_SIDE / Math.max(w, h);
    if (w * h * s * s > MAX_AREA) s = Math.sqrt(MAX_AREA / (w * h));
    return s;
  }

  function isPdf(file) {
    return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  }

  function loadImageElement(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve({ img, url });
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Dit afbeeldingsbestand kan niet worden gelezen.'));
      };
      img.src = url;
    });
  }

  async function loadImage(file) {
    const { img, url } = await loadImageElement(file);
    const w = img.naturalWidth, h = img.naturalHeight;
    const s = limitScale(w, h);
    const c = makeCanvas(w * s, h * s);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    return {
      kind: 'image',
      name: file.name,
      pageCount: 1,
      page: 1,
      canvas: c,
      pixelWidth: w,
      pixelHeight: h,
      downscaled: s < 1,
      physical: null,
    };
  }

  async function renderPdfPage(doc, pageNo) {
    const page = await doc.getPage(pageNo);
    const base = page.getViewport({ scale: 1 });
    // Ongeveer 6000 px over de lange zijde: ruim genoeg voor een rooster van 900 rijen.
    let scale = 6000 / Math.max(base.width, base.height);
    scale *= limitScale(base.width * scale, base.height * scale);
    const vp = page.getViewport({ scale });
    const c = makeCanvas(vp.width, vp.height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const PT_TO_CM = 2.54 / 72;
    return {
      canvas: c,
      physical: { w: base.width * PT_TO_CM, h: base.height * PT_TO_CM },
    };
  }

  /* Bij openen via dubbelklik (file://) of in de gedeelde pagina kan de browser geen aparte worker starten:
     laad de PDF-lezer dan in de pagina zelf (alleen zodra er echt een PDF komt). */
  let workerInline = null;
  function ensureInlineWorker() {
    const needed = location.protocol === 'file:' || !!CFG.pdfWorkerScript;
    if (!needed || window.pdfjsWorker) return Promise.resolve();
    if (!workerInline) {
      workerInline = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = WORKER_URL;
        s.onload = resolve;
        s.onerror = () => reject(new Error('De PDF-lezer kon niet worden geladen.'));
        document.head.appendChild(s);
      });
    }
    return workerInline;
  }

  async function loadPdf(file, pageNo) {
    if (!window.pdfjsLib) throw new Error('De PDF-lezer kon niet worden geladen.');
    await ensureInlineWorker();
    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await window.pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
    const n = Math.min(Math.max(1, pageNo || 1), doc.numPages);
    const r = await renderPdfPage(doc, n);
    return {
      kind: 'pdf',
      name: file.name,
      pageCount: doc.numPages,
      page: n,
      doc,
      canvas: r.canvas,
      pixelWidth: null,
      pixelHeight: null,
      downscaled: false,
      physical: r.physical,
    };
  }

  async function load(file, pageNo) {
    if (isPdf(file)) return loadPdf(file, pageNo);
    if (/^image\//.test(file.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)) return loadImage(file);
    throw new Error('Kies een PNG-, JPG- of PDF-bestand.');
  }

  async function changePdfPage(src, pageNo) {
    const r = await renderPdfPage(src.doc, pageNo);
    return Object.assign({}, src, { page: pageNo, canvas: r.canvas, physical: r.physical });
  }

  SC.loader = { load, changePdfPage, makeCanvas };
})();
