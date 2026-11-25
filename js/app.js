/* Interface: invoer, instellingen, weergave en controles aan elkaar knopen. */
(function () {
  'use strict';
  const SC = window.SC;
  const C = SC.color;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const nf = (v, d = 0) => v.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });

  const SIZES = { '17x180': [17, 180], '17x160': [17, 160], '17x140': [17, 140], '15x110': [15, 110] };
  const REAL_SIZE = 96 / 2.54; // css px per cm bij 96 dpi

  const state = {
    sources: [null, null],
    backMode: 'inverse', // 'inverse' = zelfde ontwerp in andere kleuren · 'same' · 'custom' = eigen ontwerp
    backMap: {}, // ontwerpkleur hex → garen-id op de achterzijde (bij 'inverse')
    size: '17x180',
    stX: 3,
    stY: 5,
    maxColors: 4,
    rotation: 'auto',
    fit: 'contain',
    trimWhite: false,
    crop: { t: 0, r: 0, b: 0, l: 0 },
    yarnMode: true, // sjaal tonen in garenkleuren van de kleurenkaart
    yarnChoice: {}, // ontwerpkleur hex → zelf gekozen garen-id
    fringe: true,
    fringeSel: null, // hex-kleuren van de gekozen franjegarens
    activeSide: 0,
    cursor: null,
    overviewFlip: false,
  };
  let result = null;
  let checks = [];
  let viewer = null;
  let overviewHits = [];
  let firstView = true;

  /* ---------- Hulpjes ---------- */

  function num(v, lo, hi, dflt) {
    const n = parseFloat(String(v).replace(',', '.'));
    if (!isFinite(n)) return dflt;
    return Math.max(lo, Math.min(hi, n));
  }

  function settings() {
    const [Wcm, Hcm] = SIZES[state.size];
    return { Wcm, Hcm, stX: state.stX, stY: state.stY, maxColors: state.maxColors, fit: state.fit };
  }

  /** Per paletkleur: het gekozen of dichtstbijzijnde garen van de kleurenkaart. */
  function yarnAssignments() {
    if (!result) return [];
    return result.palette.colors.map((c) => {
      const hex = C.toHex(c.rgb);
      const id = state.yarnChoice[hex];
      if (id != null) {
        const y = SC.yarns.byId(id);
        return { yarn: y, dE: SC.yarns.distance(c.rgb, y), chosen: true };
      }
      const n = SC.yarns.nearest(c.rgb);
      return { yarn: n.yarn, dE: n.dE, chosen: false };
    });
  }

  /** Kleuren waarmee de sjaal getekend wordt: garenkleuren of de kleuren uit het ontwerp. */
  function colors() {
    if (!result) return [];
    if (state.yarnMode) return yarnAssignments().map((a) => a.yarn.rgb);
    return result.palette.colors.map((c) => c.rgb);
  }

  function colorNames() {
    if (!result) return [];
    if (state.yarnMode) return yarnAssignments().map((a) => a.yarn.name.toLowerCase());
    return colors().map((rgb) => C.name(rgb));
  }

  function isInverse() {
    return !!result && result.sides.some((s) => s.virtual);
  }

  /** Standaard achterzijde bij tubulair breien: de hoofdkleuren omgewisseld (negatief). */
  function defaultBackIndex(i, n) {
    if (n < 2) return i;
    if (i === 0) return 1;
    if (i === 1) return 0;
    return i;
  }

  /** Per paletkleur: welk garen er op de achterzijde komt (alleen bij 'andere kleuren'). */
  function backAssignments() {
    if (!isInverse()) return null;
    const front = yarnAssignments();
    return result.palette.colors.map((c, i) => {
      const id = state.backMap[C.toHex(c.rgb)];
      if (id != null) return { yarn: SC.yarns.byId(id), chosen: true };
      return { yarn: front[defaultBackIndex(i, front.length)].yarn, chosen: false };
    });
  }

  /** Kleuren per zijde (voor tekenen en exporteren). */
  function sideColors() {
    if (!result) return [];
    const front = colors();
    const back = backAssignments();
    return result.sides.map((s) => (s.virtual ? back.map((a) => a.yarn.rgb) : front));
  }

  function sideNames() {
    if (!result) return [];
    const front = colorNames();
    const back = backAssignments();
    return result.sides.map((s) => (s.virtual ? back.map((a) => a.yarn.name.toLowerCase()) : front));
  }

  /** Alle garens die in de sjaal voorkomen (voor + achter), uniek. */
  function usedYarns() {
    const list = yarnAssignments().map((a) => a.yarn);
    const back = backAssignments();
    if (back) back.forEach((a) => list.push(a.yarn));
    return list.filter((y, i) => list.findIndex((z) => z.id === y.id) === i);
  }

  function toast(msg, ms = 4200) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (t.hidden = true), ms);
  }

  function busy(on) {
    $('#busy').hidden = !on;
  }

  // Geef de browser even tijd om de 'bezig'-melding te tonen; met terugval als het tabblad op de achtergrond staat.
  const nextFrame = () =>
    new Promise((resolve) => {
      let done = false;
      const go = () => {
        if (done) return;
        done = true;
        setTimeout(resolve, 0);
      };
      requestAnimationFrame(go);
      setTimeout(go, 80);
    });

  function setSeg(el, value) {
    $$('button', el).forEach((b) => b.classList.toggle('on', b.dataset.v === String(value)));
  }

  /* ---------- Bestanden ---------- */

  async function loadInto(side, file) {
    busy(true);
    await nextFrame();
    try {
      const src = await SC.loader.load(file);
      state.sources[side] = src;
      if (side === 1) {
        state.backMode = 'custom';
        setSeg($('#backMode'), 'custom');
        $('#drop1').hidden = false;
      }
      updateDropLabels();
      await recompute();
    } catch (e) {
      console.error(e);
      toast(e.message || 'Dit bestand kon niet worden gelezen.');
      busy(false);
    }
  }

  function updateDropLabels() {
    [0, 1].forEach((i) => {
      const src = state.sources[i];
      const drop = $('#drop' + i);
      drop.classList.toggle('has-file', !!src);
      $('.drop-file', drop).textContent = src
        ? src.demo
          ? 'Voorbeeldontwerp (fictieve club). Sleep je eigen PNG, JPG of PDF hierheen, of klik om te kiezen.'
          : src.name + (src.kind === 'pdf' ? ` · PDF, ${src.pageCount} ${src.pageCount === 1 ? 'pagina' : "pagina's"}` : ` · ${src.pixelWidth} × ${src.pixelHeight} px`)
        : 'Sleep een PNG, JPG of PDF hierheen, of klik om te kiezen';
      drop.classList.toggle('is-demo', !!(src && src.demo));
      const pageBox = $('#page' + i);
      const show = src && src.kind === 'pdf' && src.pageCount > 1 && (i === 0 || state.backMode === 'custom');
      pageBox.hidden = !show;
      if (show) {
        const sel = $('select', pageBox);
        sel.innerHTML = Array.from({ length: src.pageCount }, (_, p) => `<option value="${p + 1}">Pagina ${p + 1}</option>`).join('');
        sel.value = String(src.page);
      }
    });
  }

  function setupDrop(i) {
    const drop = $('#drop' + i);
    const input = $('input', drop);
    input.addEventListener('change', () => {
      if (input.files[0]) loadInto(i, input.files[0]);
      input.value = '';
    });
    drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      drop.classList.add('over');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      drop.classList.remove('over');
      $('#dropveil').hidden = true;
      const f = e.dataTransfer.files[0];
      if (f) loadInto(i, f);
    });
    $('#page' + i + ' select').addEventListener('change', async (e) => {
      const src = state.sources[i];
      if (!src) return;
      busy(true);
      await nextFrame();
      try {
        state.sources[i] = await SC.loader.changePdfPage(src, +e.target.value);
        await recompute();
      } catch (err) {
        toast(err.message);
        busy(false);
      }
    });
  }

  function setupWindowDrop() {
    let depth = 0;
    const veil = $('#dropveil');
    window.addEventListener('dragenter', (e) => {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return;
      depth++;
      veil.hidden = false;
    });
    window.addEventListener('dragleave', () => {
      depth = Math.max(0, depth - 1);
      if (!depth) veil.hidden = true;
    });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      depth = 0;
      veil.hidden = true;
      const f = e.dataTransfer.files[0];
      if (f) loadInto(0, f);
    });
  }

  /* ---------- Rekenen ---------- */

  function activeSources() {
    const f = state.sources[0];
    if (!f) return [];
    if (state.backMode === 'custom' && state.sources[1]) return [f, state.sources[1]];
    return [f];
  }

  let pending = 0;
  async function recompute() {
    const srcs = activeSources();
    if (!srcs.length) {
      result = null;
      $('#app').classList.add('is-empty');
      busy(false);
      renderStatic();
      return;
    }
    const token = ++pending;
    busy(true);
    await nextFrame();
    if (token !== pending) return;
    try {
      const s = settings();
      const preps = srcs.map((src) =>
        SC.process.prepare(src, { rotation: state.rotation, trimWhite: state.trimWhite, crop: state.crop })
      );
      const res = SC.process.compute(preps, s);
      res.settings = s;
      res.sources = srcs;
      // Tubulair met andere kleuren: de achterzijde is hetzelfde steekpatroon, alleen in andere garens.
      if (state.backMode === 'inverse' && res.sides.length === 1) {
        res.sides.push(Object.assign({}, res.sides[0], { virtual: true }));
      }
      result = res;
      if (state.activeSide >= res.sides.length) state.activeSide = 0;
      state.cursor = null;
      $('#app').classList.remove('is-empty');
      refreshAll();
    } catch (e) {
      console.error(e);
      toast('Omzetten mislukt: ' + (e.message || e));
    } finally {
      if (token === pending) busy(false);
    }
  }

  let debounceTimer = 0;
  function recomputeSoon() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(recompute, 220);
  }

  /* ---------- Weergeven ---------- */

  function refreshAll() {
    renderStatic();
    renderPalette();
    renderChecks();
    pushViewer();
    $('#sideSel').hidden = result.sides.length < 2;
    setSeg($('#sideSel'), state.activeSide);
  }

  function renderStatic() {
    const s = settings();
    const cols = Math.round(s.Wcm * s.stX), rows = Math.round(s.Hcm * s.stY);
    $('#specline').innerHTML = `<b>${s.Wcm} × ${s.Hcm} cm</b> · ${cols} × ${rows} steken · max. ${s.maxColors} draadkleuren`;
    $('#gridNote').textContent = `${cols} × ${rows} = ${nf(cols * rows)} steken per zijde · 1 steek ≈ ${nf(10 / s.stX, 1)} × ${nf(10 / s.stY, 1)} mm`;
    const rowsSpec = [
      ['Formaat', `${s.Wcm} × ${s.Hcm} cm`],
      ['Steken', `${cols} breed × ${rows} rijen`],
      ['Per cm²', `${nf(s.stX, 1)} × ${nf(s.stY, 1)} = ${nf(s.stX * s.stY, 1)} steken`],
      ['1 steek', `${nf(10 / s.stX, 1)} × ${nf(10 / s.stY, 1)} mm`],
      ['Kleuren', `max. ${s.maxColors} draadkleuren`],
      ['Garens', `${SC.yarns.list.length} voorraadkleuren, PMS leidend`],
      ['Techniek', 'tubulair jacquard (koker)'],
      ['Zijden', 'voor en achter mogen verschillen'],
      ['Franjes', 'max. 3 kleuren, of dichtgestikt'],
    ];
    $('#specs').innerHTML = rowsSpec.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
    if (!result) {
      $('#verdict').className = 'verdict';
      $('#verdict').innerHTML = '<div class="verdict-title">Nog geen ontwerp</div><div class="verdict-text">Voeg een ontwerp toe om het te controleren.</div>';
    }
  }

  function renderPalette() {
    const pal = result.palette.colors;
    const ya = yarnAssignments();
    $('#palette').innerHTML = pal
      .map((c, i) => {
        const a = ya[i];
        const design = C.toHex(c.rgb);
        const q = SC.yarns.matchQuality(a.dE);
        const merged = c.members.length > 1
          ? `<div class="merged" title="Deze kleuren uit het ontwerp worden met dezelfde draad gebreid">samengevoegd: ${c.members
              .map((m) => `<span class="dot" style="background:${C.toHex(m.rgb)}" title="${C.toHex(m.rgb)} · ${nf(m.share * 100, 1)}%"></span>`)
              .join('')}</div>`
          : '';
        return `<li class="pal-item">
          <button type="button" class="yarn-swatch" data-i="${i}" style="--y:${a.yarn.hex};--d:${design}" title="Ander garen kiezen" aria-label="Garen kiezen voor kleur ${i + 1}">
            <span class="design-dot" title="Kleur in het ontwerp: ${design}"></span>
          </button>
          <div class="pal-body">
            <div class="pal-name"><b>${a.yarn.name}</b>${a.yarn.pms ? ` <span class="pms">PMS ${a.yarn.pms}</span>` : ''}${a.chosen ? ' <span class="tag">gekozen</span>' : ''}</div>
            <div class="pal-hex">Kleur ${i + 1} · ontwerp ${design} · <span class="q ${q.level}" title="Kleurverschil ΔE ${nf(a.dE)}">${q.text}</span></div>
            <div class="bar"><span style="width:${Math.max(2, c.share * 100)}%;background:${a.yarn.hex}"></span></div>
          </div>
          <span class="pal-pct">${nf(c.share * 100, c.share < 0.1 ? 1 : 0)}%</span>
          ${merged}
        </li>`;
      })
      .join('');
    $$('#palette .yarn-swatch').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        openPicker(+b.dataset.i, b, 'front');
      })
    );
    renderBackPalette();
    renderFringeChips();
  }

  /* Achterzijde bij 'andere kleuren': per kleur van de voorzijde het garen op de achterzijde. */
  function renderBackPalette() {
    const block = $('#backBlock');
    const back = backAssignments();
    block.hidden = !back;
    if (!back) return;
    const front = yarnAssignments();
    $('#backPalette').innerHTML = back
      .map((b, i) => `<li class="back-item">
          <span class="mini-sw" style="background:${front[i].yarn.hex}" title="Voorzijde: ${SC.yarns.label(front[i].yarn)}"></span>
          <span class="back-from">Kleur ${i + 1}</span>
          <span class="back-arrow" aria-hidden="true">→</span>
          <button type="button" class="yarn-swatch small" data-i="${i}" style="--y:${b.yarn.hex}" title="Garen voor de achterzijde kiezen" aria-label="Garen achterzijde voor kleur ${i + 1}"></button>
          <span class="back-to"><b>${b.yarn.name}</b>${b.yarn.pms ? `<small>PMS ${b.yarn.pms}</small>` : '<small>&nbsp;</small>'}</span>
        </li>`)
      .join('');
    $$('#backPalette .yarn-swatch').forEach((btn) =>
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openPicker(+btn.dataset.i, btn, 'back');
      })
    );
    const total = usedYarns().length;
    const note = $('#backNote');
    note.textContent = `Voor + achter samen: ${total} ${total === 1 ? 'garen' : 'garens'} (max. ${result.settings.maxColors}).`;
    note.classList.toggle('over', total > result.settings.maxColors);
  }

  /* ---------- Garenkiezer ---------- */

  function openPicker(i, anchor, target) {
    const pop = $('#yarnPicker');
    const isBack = target === 'back';
    const c = result.palette.colors[i];
    const hex = C.toHex(c.rgb);
    const front = yarnAssignments();
    const current = isBack ? backAssignments()[i] : front[i];
    const ranked = SC.yarns.ranked(c.rgb);
    // Voor de achterzijde: eerst de garens die al in de sjaal zitten, zodat het totaal laag blijft.
    const quick = isBack
      ? front.map((a) => a.yarn).filter((y, n, all) => all.findIndex((z) => z.id === y.id) === n).map((y) => ({ yarn: y, sub: 'al gebruikt op de voorzijde' }))
      : ranked.slice(0, 4).map((r) => ({ yarn: r.yarn, sub: `ΔE ${nf(r.dE)}` }));
    pop.innerHTML = `
      <div class="yp-head">
        <b>${isBack ? `Achterzijde voor kleur ${i + 1}` : `Garen voor kleur ${i + 1}`}</b>
        <span class="yp-design"><span class="dot" style="background:${isBack ? front[i].yarn.hex : hex}"></span>${isBack ? 'voor: ' + front[i].yarn.name.toLowerCase() : 'ontwerp ' + hex}</span>
        <button type="button" class="yp-close" aria-label="Sluiten">×</button>
      </div>
      <div class="yp-label">${isBack ? 'Garens van de voorzijde' : 'Beste matches'}</div>
      <div class="yp-best">${quick
        .map((q) => `<button type="button" class="yp-opt${q.yarn.id === current.yarn.id ? ' on' : ''}" data-id="${q.yarn.id}">
            <span class="sw" style="background:${q.yarn.hex}"></span>
            <span class="yp-txt"><b>${q.yarn.name}</b><small>${q.yarn.pms ? 'PMS ' + q.yarn.pms + ' · ' : ''}${isBack ? 'voorzijde' : q.sub}</small></span>
          </button>`)
        .join('')}</div>
      <div class="yp-label">Alle ${SC.yarns.list.length} garens van de kleurenkaart</div>
      <div class="yp-grid">${SC.yarns.list
        .map((y, n, all) => {
          const first = n === 0 || all[n - 1].group !== y.group;
          return `<button type="button" class="yp-cell${y.id === current.yarn.id ? ' on' : ''}${first ? ' row-start' : ''}" data-id="${y.id}" style="background:${y.hex}" title="${SC.yarns.label(y)}" aria-label="${SC.yarns.label(y)}"></button>`;
        })
        .join('')}</div>
      <div class="yp-foot">
        <span class="yp-hover" id="ypHover">${SC.yarns.label(current.yarn)}</span>
        ${current.chosen ? `<button type="button" class="link small" id="ypAuto">${isBack ? 'standaard (omgewisseld)' : 'automatisch kiezen'}</button>` : ''}
      </div>`;
    pop.hidden = false;
    $('.viewer-tip').hidden = true;
    const r = anchor.getBoundingClientRect();
    const side = $('.sidebar').getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = Math.max(r.right + 10, side.right + 8), top = r.top - 12;
    if (left + pw > innerWidth - 8) left = Math.max(8, r.left - pw - 10);
    if (top + ph > innerHeight - 8) top = Math.max(8, innerHeight - ph - 8);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';

    const choose = (id) => {
      if (isBack) {
        state.backMap[hex] = id;
        closePicker();
        colorsChanged(true);
        return;
      }
      state.yarnChoice[hex] = id;
      if (!state.yarnMode) {
        state.yarnMode = true;
        setSeg($('#colorMode'), 'yarn');
      }
      closePicker();
      colorsChanged(true);
    };
    $$('[data-id]', pop).forEach((b) => {
      b.addEventListener('click', () => choose(+b.dataset.id));
      b.addEventListener('mouseenter', () => {
        const y = SC.yarns.byId(+b.dataset.id);
        $('#ypHover').textContent = isBack ? SC.yarns.label(y) : `${SC.yarns.label(y)} · ΔE ${nf(SC.yarns.distance(c.rgb, y))}`;
      });
    });
    $('.yp-close', pop).addEventListener('click', closePicker);
    const auto = $('#ypAuto');
    if (auto)
      auto.addEventListener('click', () => {
        if (isBack) delete state.backMap[hex];
        else delete state.yarnChoice[hex];
        closePicker();
        colorsChanged(true);
      });
  }

  function closePicker() {
    $('#yarnPicker').hidden = true;
  }

  function colorListText() {
    const s = result.settings;
    const ya = yarnAssignments();
    const back = backAssignments();
    const sidesText = back
      ? ' (tubulair: zelfde ontwerp, achterzijde in andere kleuren)'
      : result.sides.length > 1 ? ' (eigen ontwerp voor / achter)' : ' (voor- en achterzijde gelijk)';
    const fringeNames = fringeOptions().filter((o) => fringeSelection().includes(o.hex)).map((o) => o.name);
    const lines = [
      `Gebreide sjaal ${s.Wcm} × ${s.Hcm} cm (${result.cols} × ${result.rows} steken), tubulair gebreid`,
      `Ontwerp: ${result.sources.map((x) => x.name).join(' / ')}${sidesText}`,
      '',
      back ? 'Garenkleuren (voorzijde → achterzijde):' : 'Garenkleuren:',
      ...ya.map((a, i) => `- Kleur ${i + 1}: ${SC.yarns.label(a.yarn)}${back ? ` → ${SC.yarns.label(back[i].yarn)}` : ''} (ontwerp ${C.toHex(result.palette.colors[i].rgb)}, ${nf(result.palette.colors[i].share * 100)}%)`),
      '',
      `Totaal: ${usedYarns().length} garens (${usedYarns().map((y) => y.name).join(', ')})`,
      state.fringe ? `Uiteinden: franjes in ${fringeNames.join(', ')}` : 'Uiteinden: dichtgestikt (geen franjes)',
    ];
    return lines.join('\n');
  }

  /** Kopieert naar het klembord; lukt dat niet, dan staat de tekst geselecteerd klaar om zelf te kopiëren. */
  async function copyText(text) {
    try {
      if (!navigator.clipboard) throw new Error('geen klembord');
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const modal = $('#copyModal');
      const ta = $('textarea', modal);
      ta.value = text;
      modal.hidden = false;
      ta.focus();
      ta.select();
      return false;
    }
  }

  /** Franjes kunnen in de garens van de sjaal (voor en achter). */
  function fringeOptions() {
    if (!state.yarnMode) {
      return colors().map((rgb, i) => ({ hex: C.toHex(rgb), rgb, name: `kleur ${i + 1}` }));
    }
    return usedYarns().map((y) => ({ hex: y.hex, rgb: y.rgb, name: y.name }));
  }

  function fringeSelection() {
    const opts = fringeOptions().map((o) => o.hex);
    let sel = (state.fringeSel || []).filter((h) => opts.includes(h));
    if (!sel.length) sel = opts.slice(0, Math.min(2, opts.length));
    state.fringeSel = sel;
    return sel;
  }

  function renderFringeChips() {
    const opts = fringeOptions();
    const sel = fringeSelection();
    $('#fringeField').hidden = !state.fringe;
    $('#fringeColors').innerHTML = opts
      .map((o) => `<button type="button" class="chip${sel.includes(o.hex) ? ' on' : ''}" data-hex="${o.hex}" style="background:${o.hex}" title="${o.name}"></button>`)
      .join('');
    $$('#fringeColors .chip').forEach((b) =>
      b.addEventListener('click', () => {
        const h = b.dataset.hex;
        const s = state.fringeSel;
        if (s.includes(h)) {
          if (s.length > 1) s.splice(s.indexOf(h), 1);
        } else {
          if (s.length >= 3) s.shift();
          s.push(h);
        }
        renderFringeChips();
        drawOverview();
      })
    );
  }

  function colorsChanged(full) {
    pushViewer();
    if (full) {
      renderPalette();
      renderChecks();
    }
  }

  function renderChecks() {
    checks = SC.checks.build(result, result.settings, result.sources, yarnAssignments(), backAssignments(), usedYarns());
    const v = SC.checks.verdict(checks);
    const el = $('#verdict');
    el.className = 'verdict ' + v.level;
    el.innerHTML = `<div class="verdict-title">${v.title}</div><div class="verdict-text">${v.text}</div>`;
    const icon = { ok: '✓', info: 'i', warn: '!', error: '×' };
    const order = { error: 0, warn: 1, info: 2, ok: 3 };
    const sorted = checks.map((c, i) => ({ c, i })).sort((a, b) => order[a.c.level] - order[b.c.level] || a.i - b.i);
    $('#checks').innerHTML = sorted
      .map(({ c, i }) => `<li class="chk ${c.level}">
        <span class="chk-icon">${icon[c.level]}</span>
        <div>
          <div class="chk-title">${c.title}</div>
          <div class="chk-text">${c.text}</div>
          ${c.action ? `<button type="button" class="check-action" data-i="${i}">Bekijk in sjaal ›</button>` : ''}
        </div>
      </li>`)
      .join('');
    $$('#checks .check-action').forEach((b) => b.addEventListener('click', () => jumpTo(checks[+b.dataset.i].action, b)));
  }

  function itemsFor(action) {
    const side = result.sides[action.side];
    if (action.kind === 'flags') return side.elements.flags.map((f) => ({ row: (f.r0 + f.r1) / 2, item: f }));
    if (action.kind === 'edge') return side.elements.edgeTouch.map((f) => ({ row: (f.r0 + f.r1) / 2, item: f }));
    return side.stitches.isolated.map((i) => ({ row: Math.floor(i / result.cols), item: null }));
  }

  function jumpTo(action, btn) {
    const list = itemsFor(action);
    if (!list.length) return;
    const key = action.kind + action.side;
    const cur = state.cursor && state.cursor.key === key ? state.cursor.i : -1;
    const i = (cur + 1) % list.length;
    state.cursor = { key, i };
    if (state.activeSide !== action.side) {
      state.activeSide = action.side;
      setSeg($('#sideSel'), action.side);
    }
    if (!viewer.markers) {
      viewer.markers = true;
      $('#markers').checked = true;
    }
    viewer.highlight = list[i].item;
    pushViewer();
    if (viewer.zoom < 18) viewer.setZoom(Math.min(REAL_SIZE, viewer.fitWidthZoom()));
    viewer.scrollToRow(list[i].row);
    btn.textContent = `Volgende (${i + 1}/${list.length}) ›`;
  }

  function pushViewer() {
    if (!result) return;
    const s = result.settings;
    const data = {
      cols: result.cols,
      rows: result.rows,
      stX: s.stX,
      stY: s.stY,
      Wcm: s.Wcm,
      Hcm: s.Hcm,
      sides: result.sides,
      colors: colors(),
      names: colorNames(),
      sideColors: sideColors(),
      sideNames: sideNames(),
      inverse: isInverse(),
      activeSide: state.activeSide,
    };
    viewer.set(data);
    if (firstView) {
      firstView = false;
      viewer.zoom = viewer.clampZoom(Math.min(REAL_SIZE, viewer.fitWidthZoom()));
      viewer.layout();
      viewer.scroller.scrollTop = 0;
      viewer.requestDraw();
    } else {
      viewer.zoom = viewer.clampZoom(viewer.zoom);
      viewer.layout();
    }
    syncZoomUI();
    drawOverview();
  }

  let lastView = [0, 0];
  function drawOverview() {
    if (!result || !viewer || !viewer.data) return;
    const cv = $('#overview');
    const sel = fringeSelection();
    overviewHits = SC.render.drawOverview(cv, viewer.data, {
      flip: state.overviewFlip,
      fringe: state.fringe,
      fringeColors: fringeOptions().filter((o) => sel.includes(o.hex)).map((o) => o.rgb),
      view: lastView,
    });
  }

  /* ---------- Zoom ---------- */

  function zoomBounds() {
    return [viewer.clampZoom(0), 200];
  }

  function syncZoomUI() {
    if (!viewer.data) return;
    const [lo, hi] = zoomBounds();
    const t = (Math.log(viewer.zoom) - Math.log(lo)) / (Math.log(hi) - Math.log(lo));
    $('#zoomRange').value = String(Math.round(t * 1000));
    $('#zoomLabel').textContent = Math.round((viewer.zoom / REAL_SIZE) * 100) + '%';
  }

  function setupZoom() {
    viewer.onZoom = syncZoomUI;
    $('#zoomRange').addEventListener('input', (e) => {
      const [lo, hi] = zoomBounds();
      const t = +e.target.value / 1000;
      viewer.setZoom(Math.exp(Math.log(lo) + t * (Math.log(hi) - Math.log(lo))));
    });
    $('#zoomIn').addEventListener('click', () => viewer.setZoom(viewer.zoom * 1.35));
    $('#zoomOut').addEventListener('click', () => viewer.setZoom(viewer.zoom / 1.35));
    $('#zoomReal').addEventListener('click', () => viewer.setZoom(REAL_SIZE));
    $('#zoomFit').addEventListener('click', () => {
      viewer.setZoom(viewer.fitHeightZoom());
      viewer.scroller.scrollTop = 0;
    });
  }

  /* ---------- Overzicht klikken/slepen ---------- */

  function setupOverview() {
    const cv = $('#overview');
    let dragging = false;
    const go = (e) => {
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      let hit = overviewHits.find((h) => y >= h.y0 - 16 && y <= h.y0 + h.h + 8);
      if (!hit) hit = overviewHits[0];
      if (!hit) return;
      let row = Math.max(0, Math.min(result.rows - 1, ((x - hit.x0) / hit.len) * result.rows));
      if (hit.flip) row = result.rows - 1 - row;
      if (hit.side !== state.activeSide) {
        state.activeSide = hit.side;
        setSeg($('#sideSel'), hit.side);
        pushViewer();
      }
      viewer.scrollToRow(row);
    };
    cv.addEventListener('mousedown', (e) => {
      dragging = true;
      go(e);
    });
    window.addEventListener('mousemove', (e) => dragging && go(e));
    window.addEventListener('mouseup', () => (dragging = false));
    new ResizeObserver(() => drawOverview()).observe(cv);
    $('#flipOverview').addEventListener('click', () => {
      state.overviewFlip = !state.overviewFlip;
      drawOverview();
    });
  }

  /* ---------- Export ---------- */

  /* Downloaden: lokaal via een gewone downloadlink; als gedeelde pagina via de downloads-functie van de viewer
     (die vraagt de kijker per bestand om bevestiging). */
  const inViewer = !!(window.claude && typeof window.claude.use === 'function');
  let downloadsApi = null;
  if (inViewer) {
    window.claude
      .use('downloads')
      .then((api) => {
        downloadsApi = api;
        if (!api) $('#exportGrid').hidden = $('#exportKnit').hidden = true;
      })
      .catch(() => ($('#exportGrid').hidden = $('#exportKnit').hidden = true));
  }

  const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

  async function download(canvas, name) {
    const blob = await toBlob(canvas);
    if (!inViewer) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      return true;
    }
    if (!downloadsApi) {
      toast('Downloaden kan in deze weergave niet.');
      return false;
    }
    try {
      await downloadsApi.save({ filename: name, data: blob });
      return true;
    } catch (e) {
      const code = e && e.code;
      if (code === 'declined') return false;
      if (code === 'rate_limited') toast('Er staat al een download klaar. Rond die eerst af.');
      else if (code === 'host_unavailable') toast('Downloaden kan in deze app niet. Open de pagina in een browser.');
      else toast('Downloaden lukte niet.');
      return false;
    }
  }

  function baseName() {
    const n = (result.sources[0].name || 'ontwerp').replace(/\.[a-z0-9]+$/i, '');
    return n.replace(/[^\w\-]+/g, '-').slice(0, 40);
  }

  function sideName(i) {
    return result.sides.length > 1 ? (i === 0 ? '-voorzijde' : '-achterzijde') : '';
  }

  function setupExport() {
    // Eén bestand tegelijk: de viewer toont maar één bevestiging tegelijk.
    $('#exportGrid').addEventListener('click', async () => {
      if (!result) return;
      const cols = sideColors();
      for (let i = 0; i < result.sides.length; i++) {
        const c = SC.render.gridToCanvas(result.sides[i].grid, result.cols, result.rows, cols[i]);
        if (!(await download(c, `${baseName()}-steekpatroon${sideName(i)}-${result.cols}x${result.rows}.png`))) break;
      }
    });
    $('#exportKnit').addEventListener('click', async () => {
      if (!result) return;
      const s = result.settings;
      const cw = 15, ch = (15 * s.stX) / s.stY;
      const cols = sideColors();
      for (let i = 0; i < result.sides.length; i++) {
        busy(true);
        await nextFrame();
        const c = SC.render.knitToCanvas(result.sides[i].grid, result.cols, result.rows, cols[i], cw, ch);
        busy(false);
        if (!(await download(c, `${baseName()}-gebreid${sideName(i)}.png`))) break;
      }
    });
  }

  /* ---------- Instellingen ---------- */

  function setupControls() {
    const seg = (id, fn) =>
      $$('#' + id + ' button').forEach((b) =>
        b.addEventListener('click', () => {
          setSeg($('#' + id), b.dataset.v);
          fn(b.dataset.v);
        })
      );

    seg('backMode', (v) => {
      state.backMode = v;
      $('#drop1').hidden = v !== 'custom';
      updateDropLabels();
      if (v !== 'custom' || state.sources[1]) recompute();
    });
    seg('rotation', (v) => {
      state.rotation = v;
      recomputeSoon();
    });
    seg('fit', (v) => {
      state.fit = v;
      recomputeSoon();
    });
    seg('fringe', (v) => {
      state.fringe = v === 'on';
      if (result) {
        renderFringeChips();
        drawOverview();
      }
    });
    seg('sideSel', (v) => {
      state.activeSide = +v;
      viewer.highlight = null;
      pushViewer();
    });

    $$('#panels button').forEach((b) =>
      b.addEventListener('click', () => {
        const on = !b.classList.contains('on');
        const active = $$('#panels button.on');
        if (!on && active.length === 1) return; // minstens één paneel
        b.classList.toggle('on', on);
        viewer.panels = $$('#panels button.on').map((x) => x.dataset.v);
        viewer.layout();
        viewer.setZoom(Math.min(viewer.zoom, Math.max(viewer.fitWidthZoom(), viewer.clampZoom(0))));
        viewer.requestDraw();
      })
    );

    $('#size').addEventListener('change', (e) => {
      state.size = e.target.value;
      firstView = true;
      renderStatic();
      recomputeSoon();
    });
    const numInput = (id, key, lo, hi, dflt, int) =>
      $('#' + id).addEventListener('change', (e) => {
        let v = num(e.target.value, lo, hi, dflt);
        if (int) v = Math.round(v);
        e.target.value = v;
        state[key] = v;
        renderStatic();
        recomputeSoon();
      });
    numInput('stX', 'stX', 1, 12, 3);
    numInput('stY', 'stY', 1, 20, 5);
    numInput('maxColors', 'maxColors', 1, 8, 4, true);

    $('#trimWhite').addEventListener('change', (e) => {
      state.trimWhite = e.target.checked;
      recomputeSoon();
    });
    [['cropT', 't'], ['cropR', 'r'], ['cropB', 'b'], ['cropL', 'l']].forEach(([id, k]) =>
      $('#' + id).addEventListener('change', (e) => {
        const v = num(e.target.value, 0, 45, 0);
        e.target.value = v;
        state.crop[k] = v;
        recomputeSoon();
      })
    );

    $('#markers').addEventListener('change', (e) => {
      viewer.markers = e.target.checked;
      viewer.requestDraw();
    });

    $('#resetColors').addEventListener('click', () => {
      state.yarnChoice = {};
      if (result) colorsChanged(true);
    });
    seg('colorMode', (v) => {
      state.yarnMode = v === 'yarn';
      if (result) colorsChanged(true);
    });
    $('#copyColors').addEventListener('click', async () => {
      if (!result) return;
      if (await copyText(colorListText())) toast('Kleurenlijst gekopieerd. Plak hem in je mail of bestelling.');
    });
    $('#copyClose').addEventListener('click', () => ($('#copyModal').hidden = true));
    $('#yarnPicker').addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', closePicker);
    document.addEventListener('keydown', (e) => e.key === 'Escape' && closePicker());
    $('.sidebar').addEventListener('scroll', closePicker);

    const demo = () => {
      state.sources[0] = SC.demo.demoSource();
      updateDropLabels();
      recompute();
    };
    $('#demoBtn').addEventListener('click', demo);
    $('#emptyDemo').addEventListener('click', demo);
    $('#emptyPick').addEventListener('click', () => $('#drop0 input').click());
  }

  /* ---------- Start ---------- */

  function init() {
    viewer = new SC.render.Viewer($('#viewerBody'));
    viewer.onDraw = (range) => {
      if (range[0] !== lastView[0] || range[1] !== lastView[1]) {
        lastView = range;
        drawOverview();
      }
    };
    setupDrop(0);
    setupDrop(1);
    setupWindowDrop();
    setupControls();
    setupZoom();
    setupOverview();
    setupExport();
    renderStatic();
    // De gedeelde pagina opent direct met een (gemarkeerd) voorbeeld, zodat je meteen ziet wat de tool doet.
    if ((window.SJAAL_CONFIG || {}).autoDemo) {
      state.sources[0] = SC.demo.demoSource();
      updateDropLabels();
      recompute();
    }
  }

  init();

  // Voor testen en automatisering
  window.SjaalCheck = {
    state,
    get result() { return result; },
    get checks() { return checks; },
    get viewer() { return viewer; },
    loadFile: loadInto,
    loadDemo: () => $('#demoBtn').click(),
  };
})();
