/* Controles: vertaalt de analyse naar begrijpelijke bevindingen (ok / info / let op / probleem). */
(function () {
  'use strict';
  const SC = (window.SC = window.SC || {});
  const C = SC.color;

  const nf = (v, d = 0) => v.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (v) => (v < 0.01 ? '<1' : nf(v * 100, v < 0.1 ? 1 : 0)) + '%';

  function sideLabel(res, i) {
    return res.sides.length > 1 ? (i === 0 ? 'Voorzijde: ' : 'Achterzijde: ') : '';
  }

  function build(resAll, settings, sources, yarnInfo, backInfo, used) {
    // Structurele controles alleen voor echte ontwerpen; de achterzijde "andere kleuren" heeft hetzelfde steekpatroon.
    const res = Object.assign({}, resAll, { sides: resAll.sides.filter((s) => !s.virtual) });
    const colors = yarnInfo.map((a) => a.yarn.rgb);
    const yname = (i) => yarnInfo[i].yarn.name.toLowerCase();
    const out = [];
    const add = (level, title, text, action) => out.push({ level, title, text, action });
    const { cols, rows } = res;

    // 1. Bestand & resolutie
    res.sides.forEach((side, i) => {
      const src = sources[i];
      const L = sideLabel(res, i);
      if (src.kind === 'pdf') {
        const ph = src.physical;
        const w = side.prep.rotation % 180 ? ph.h : ph.w, h = side.prep.rotation % 180 ? ph.w : ph.h;
        const ok = Math.abs(w - settings.Wcm) < 0.6 && Math.abs(h - settings.Hcm) < 1.5;
        add(ok ? 'ok' : 'info', L + 'PDF-formaat ' + nf(w, 1) + ' × ' + nf(h, 1) + ' cm',
          ok ? 'Komt overeen met het gekozen sjaalformaat.'
             : `Het gekozen formaat is ${nf(settings.Wcm)} × ${nf(settings.Hcm)} cm. De verhouding telt; zie hieronder.` +
               (src.pageCount > 1 ? ` Pagina ${src.page} van ${src.pageCount} is gebruikt.` : ''));
      } else {
        const dims = `${nf(src.pixelWidth)} × ${nf(src.pixelHeight)} px`;
        // effectieve pixels per steek, rekening houdend met draaien, bijsnijden en plaatsen
        const toOrig = src.pixelWidth / src.canvas.width;
        const ow = side.prep.canvas.width * toOrig, oh = side.prep.canvas.height * toOrig;
        let perX, perY;
        if (side.pixelExact || settings.fit === 'stretch') {
          perX = ow / cols;
          perY = oh / rows;
        } else {
          const k = settings.fit === 'contain' ? Math.min(settings.Wcm / ow, settings.Hcm / oh) : Math.max(settings.Wcm / ow, settings.Hcm / oh);
          perX = 1 / settings.stX / k;
          perY = 1 / settings.stY / k;
        }
        const per = Math.min(perX, perY);
        if (side.pixelExact) add('ok', L + `Steekraster-bestand: ${dims}`, side.pixelsPerStitch === 1 ? '1 pixel = 1 steek. Ideaal voor breiwerk: wat je ziet is wat er gebreid wordt.' : `${side.pixelsPerStitch} × ${side.pixelsPerStitch} pixels = 1 steek.`);
        else if (per < 1) add('warn', L + `Lage resolutie: ${dims}`, `Minder dan 1 pixel per steek (${cols} × ${rows} steken nodig). Details kunnen blokkerig of onvoorspelbaar uitvallen.`);
        else add('ok', L + `Resolutie ${dims}`, `Ruim genoeg: ±${nf(per, per < 10 ? 1 : 0)} pixels per steek.`);
        if (side.prep.transparentShare > 0.01) add('info', L + 'Transparante delen', `${pct(side.prep.transparentShare)} van het bestand is (deels) transparant. Dat wordt hier als wit gezien; geef in je bestand liever zelf de achtergrondkleur aan.`);
      }
      if (side.prep.autoRotated) add('info', L + 'Automatisch 90° gedraaid', 'Het ontwerp was liggend aangeleverd en is rechtop gezet, zodat de lengte langs de sjaal loopt.');
    });

    // 2. Verhouding
    res.sides.forEach((side, i) => {
      const L = sideLabel(res, i);
      const c = side.prep.canvas;
      const a = c.width / c.height, t = settings.Wcm / settings.Hcm;
      const dev = a / t - 1;
      if (side.pixelExact) {
        add('ok', L + 'Verhouding klopt', `Het bestand heeft precies ${cols} × ${rows} steken. Een steek is breder dan hoog, dus het bestand oogt smaller dan de echte sjaal.`);
      } else if (Math.abs(dev) <= 0.02) {
        add('ok', L + 'Verhouding klopt', `Het ontwerp heeft de verhouding van ${nf(settings.Wcm)} × ${nf(settings.Hcm)} cm.`);
      } else {
        const fitText = { contain: 'Het is passend geplaatst en aangevuld met de randkleur.', cover: 'Het is vergroot en bijgesneden.', stretch: 'Het is uitgerekt, dus vormen en letters worden vervormd.' }[settings.fit];
        const realH = (settings.Wcm / a);
        const title = dev >= 1 ? `Verhouding klopt niet (${nf(a / t, 1)}× te breed)` : `Verhouding wijkt ${nf(Math.abs(dev) * 100)}% af (${dev > 0 ? 'te breed' : 'te smal'})`;
        add(Math.abs(dev) > 0.08 ? 'warn' : 'info', L + title,
          `Op ${nf(settings.Wcm)} cm breed zou dit ontwerp ${nf(realH, 0)} cm lang zijn in plaats van ${nf(settings.Hcm)} cm. ${fitText}`);
      }
    });

    // 3. Kleuren
    const pal = res.palette;
    if (pal.coreShare < 0.82 || pal.detected > 12) {
      add('error', 'Kleurverloop of foto herkend',
        (pal.detected > 12 ? `Het ontwerp bevat ${pal.detected} of meer verschillende tinten. ` : `Een groot deel van het ontwerp (${pct(1 - pal.coreShare)}) bestaat uit tussentinten. `) +
        "Breiwerk kent alleen vlakke kleuren: verlopen, schaduwen en foto's vallen uiteen in vlekken. Werk met effen vlakken.");
    }
    if (pal.detected > settings.maxColors) {
      add('warn', `${pal.detected} kleuren gevonden, max. ${settings.maxColors}`,
        `De sjaal wordt gebreid uit max. ${settings.maxColors} draadkleuren. De tool heeft de best passende kleuren samengevoegd. Zie bij Garenkleuren welke kleuren zijn samengevoegd, en pas je ontwerp liever zelf aan.`);
    } else {
      add('ok', `${pal.detected} ${pal.detected === 1 ? 'kleur' : 'kleuren'} (max. ${settings.maxColors})`,
        res.sides.length > 1 ? 'De ontwerpen van voor- en achterzijde samen blijven binnen het maximum.' : 'Binnen het maximum aantal draadkleuren.');
    }
    // Garens van de kleurenkaart
    const byYarn = new Map();
    yarnInfo.forEach((a, i) => byYarn.set(a.yarn.id, (byYarn.get(a.yarn.id) || []).concat(i)));
    for (const idxs of byYarn.values()) {
      if (idxs.length < 2) continue;
      const names = idxs.map((i) => i + 1).join(' en ');
      add('warn', `Kleur ${names} worden allebei ${yarnInfo[idxs[0]].yarn.name}`,
        'Ze worden met dezelfde draad gebreid, dus het verschil tussen deze kleuren verdwijnt. Kies bij Garenkleuren voor een van beide een ander garen.');
    }
    const far = yarnInfo.map((a, i) => ({ a, i })).filter((x) => SC.yarns.matchQuality(x.a.dE).level === 'far' && !x.a.chosen);
    far.forEach(({ a, i }) => {
      add('info', `Kleur ${i + 1} heeft geen goede match op de kleurenkaart`,
        `Het dichtstbijzijnde voorraadgaren is ${SC.yarns.label(a.yarn)} (ΔE ${nf(a.dE)}). Kies zelf een garen bij Garenkleuren. Een garen in een eigen PMS-kleur kan de leverancier pas vanaf 2500 stuks maken.`);
    });
    if (!far.length && byYarn.size === yarnInfo.length) {
      add('ok', 'Elke kleur heeft een eigen garen', yarnInfo.map((a) => SC.yarns.label(a.yarn)).join(', ') + '. Schermkleuren zijn een indicatie; de PMS-code is leidend.');
    }

    // Te weinig contrast tussen de garens
    const labs = yarnInfo.map((a) => a.yarn.lab);
    for (let a = 0; a < colors.length; a++) {
      for (let b = a + 1; b < colors.length; b++) {
        if (yarnInfo[a].yarn.id === yarnInfo[b].yarn.id) continue;
        const d = C.dE2000(labs[a], labs[b]);
        if (d < 10) {
          add('warn', `Kleur ${a + 1} en ${b + 1} lijken erg op elkaar`,
            `${yname(a)} en ${yname(b)} verschillen weinig (ΔE ${nf(d)}). In garen is dat verschil vaak nauwelijks te zien. Kies meer contrast, of voeg ze samen.`);
        }
      }
    }
    pal.colors.forEach((c, i) => {
      if (c.share < 0.004) add('info', `Kleur ${i + 1} komt bijna niet voor (${pct(c.share)})`, `${yname(i)} wordt maar heel weinig gebruikt. Is deze kleur echt nodig? Elke draadkleur telt mee voor het maximum.`);
    });

    // Tubulair: achterzijde in andere kleuren
    if (backInfo) {
      const total = used.length;
      if (total > settings.maxColors) {
        add('warn', `Voor + achter samen ${total} garens (max. ${settings.maxColors})`,
          `De hele sjaal wordt gebreid uit max. ${settings.maxColors} draadkleuren, ook als voor en achter verschillen. Nu gebruikt: ${used.map((y) => y.name.toLowerCase()).join(', ')}. Kies voor de achterzijde garens die ook op de voorzijde zitten.`);
      } else {
        add('ok', `Voor + achter samen ${total} ${total === 1 ? 'garen' : 'garens'} (max. ${settings.maxColors})`, used.map((y) => SC.yarns.label(y)).join(', ') + '.');
      }
      if (backInfo.every((b, i) => b.yarn.id === yarnInfo[i].yarn.id)) {
        add('info', 'Achterzijde heeft dezelfde kleuren', 'Elke kleur heeft voor en achter hetzelfde garen. Wil je een andere achterzijde, kies dan bij Garenkleuren › Achterzijde andere garens.');
      } else {
        const same = backInfo.map((b, i) => i).filter((i) => backInfo[i].yarn.id === yarnInfo[i].yarn.id && res.palette.colors[i].share > 0.02);
        if (same.length && backInfo.length === 2) {
          add('info', `Kleur ${same.map((i) => i + 1).join(' en ')} is voor en achter gelijk`, 'Bij een tweekleurig ontwerp wordt de achterzijde meestal het negatief: de kleuren omgewisseld.');
        }
      }
      const byBack = new Map();
      backInfo.forEach((b, i) => byBack.set(b.yarn.id, (byBack.get(b.yarn.id) || []).concat(i)));
      for (const idxs of byBack.values()) {
        if (idxs.length < 2) continue;
        add('warn', `Achterzijde: kleur ${idxs.map((i) => i + 1).join(' en ')} worden allebei ${backInfo[idxs[0]].yarn.name}`,
          'Op de achterzijde vallen deze kleuren samen, dus daar verdwijnt dat deel van het ontwerp (bijvoorbeeld tekst of een logo). Kies voor een van beide een ander garen.');
      }
      for (let a = 0; a < backInfo.length; a++) {
        for (let b = a + 1; b < backInfo.length; b++) {
          if (backInfo[a].yarn.id === backInfo[b].yarn.id) continue;
          const d = C.dE2000(backInfo[a].yarn.lab, backInfo[b].yarn.lab);
          if (d < 10) {
            add('warn', `Achterzijde: kleur ${a + 1} en ${b + 1} lijken erg op elkaar`,
              `${backInfo[a].yarn.name.toLowerCase()} en ${backInfo[b].yarn.name.toLowerCase()} verschillen weinig (ΔE ${nf(d)}). Op de achterzijde is het ontwerp dan slecht te zien.`);
          }
        }
      }
    }

    // 4. Details
    res.sides.forEach((side, i) => {
      const L = sideLabel(res, i);
      const el = side.elements;
      const lost = el.lostCount, weak = el.weakCount;
      const stW = nf(10 / settings.stX, 1), stH = nf(10 / settings.stY, 1);
      if (!lost && !weak) {
        add('ok', L + 'Geen details die verdwijnen', el.elementCount === 1
          ? 'De vorm in het ontwerp blijft als steken zichtbaar.'
          : `Alle ${nf(el.elementCount)} vormen in het ontwerp blijven als steken zichtbaar.`);
      } else {
        const parts = [];
        if (lost) parts.push(`${lost} ${lost === 1 ? 'detail verdwijnt' : 'details verdwijnen'}`);
        if (weak) parts.push(`${weak} ${weak === 1 ? 'wordt' : 'worden'} dun of vervormd`);
        const areas = el.flags.length;
        add(lost ? 'warn' : 'info', L + parts.join(', '),
          `Te dunne lijnen, kleine letters of kleine gaatjes zijn smaller dan één steek (±${stW} mm breed, ${stH} mm hoog). ` +
          `Ze zijn rood (verdwijnt) en oranje (vervormd) omlijnd, verdeeld over ${areas} ${areas === 1 ? 'plek' : 'plekken'}. Maak ze minimaal 2 steken dik.`,
          { kind: 'flags', side: i });
      }
      const st = side.stitches;
      const isoShare = st.isolated.length / (cols * rows);
      if (st.isolated.length > 0) {
        add(isoShare > 0.002 ? 'warn' : 'info', L + `${nf(st.isolated.length)} losse steken`,
          'Enkele steken met een andere kleur dan alle buren. Vaak ruis of kartelranden van schuine lijnen. Ze zijn met een rood rondje gemarkeerd in het raster en de gebreide weergave.',
          { kind: 'isolated', side: i });
      }
      if (el.edgeTouch.length) {
        add('info', L + `${el.edgeTouch.length} ${el.edgeTouch.length === 1 ? 'vorm raakt' : 'vormen raken'} de zijkant`,
          'De sjaal wordt rondgebreid als koker: de zijkant is een vouw. Wat daar tegenaan ligt, loopt om de rand heen. Houd tekst en logo\'s ±2 steken (7 mm) van de zijkant. Blauw gestippeld gemarkeerd.',
          { kind: 'edge', side: i });
      }
    });

    return out;
  }

  function verdict(checks) {
    const err = checks.filter((c) => c.level === 'error').length;
    const warn = checks.filter((c) => c.level === 'warn').length;
    if (err) return { level: 'error', title: 'Niet geschikt zonder aanpassingen', text: `${err} ${err === 1 ? 'probleem' : 'problemen'}${warn ? ` en ${warn} ${warn === 1 ? 'aandachtspunt' : 'aandachtspunten'}` : ''}. Bekijk de gebreide weergave goed.` };
    if (warn) return { level: 'warn', title: `Bijna klaar: ${warn} ${warn === 1 ? 'aandachtspunt' : 'aandachtspunten'}`, text: 'Het ontwerp is te breien, maar controleer de gemarkeerde punten.' };
    return { level: 'ok', title: 'Klaar om te breien', text: 'Geen problemen gevonden. Controleer de gebreide weergave nog even op leesbaarheid.' };
  }

  SC.checks = { build, verdict };
})();
