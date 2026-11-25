/* Voorraadgarens uit de MerchLab-kleurenkaart (gebreide en geweven producten, o.a. art. 11625).
   Volgorde = kolommen van de kaart, van boven naar beneden. De hex-waarden zijn uit de vlakjes van de
   PDF gemeten en zijn alleen een indicatie op het scherm: de PMS-kleur is leidend. */
(function () {
  'use strict';
  const SC = (window.SC = window.SC || {});

  const YARNS = [
    ['LICHT ROZE', '176', '#ffabb4'],
    ['ROZE', '230', '#f49ed2'],
    ['FLUOR ROZE', '806', '#ff3bad'],
    ['MAGENTA', '214', '#cd185e'],
    ['ROOD', '185', '#e60026'],
    ['OLYMPISCH ROOD', '186', '#c61428'],
    ['DONKERROOD', '7621', '#a72025'],
    ['BORDEAUX PAARS', '7421', '#5e1c2d'],
    ['BORDEAUX BRUIN', '188', '#6e232b'],
    ['FUCHSIA', '248', '#a01b86'],
    ['PURPER PAARS', '7677', '#674887'],
    ['TILLANDSIA PAARS', '7680', '#4b2d6e'],
    ['VIOLET', '2685', '#2a0367'],
    ['DONKERPAARS', '2765', '#1d1740'],

    ['GEEL', '102', '#fce000'],
    ['VAALGEEL', '7405', '#f0c700'],
    ['WARM GEEL', '1225V', '#ffc240'],
    ['OKERGEEL', '1235', '#ffb01a'],
    ['VAALORANJE', '714', '#fda35b'],
    ['OUD ORANJE', '138', '#dc7200'],
    ['ORANJE', '1505', '#ff6300'],
    ['TEXAS ORANJE', '159', '#ca5617'],

    ['BEIGE', '7401', '#f4dd9d'],
    ['BEIGE TAUPE', '7501', '#d5c196'],
    ['KAMEEL', '728', '#c7976c'],
    ['GOUDKLEURIG', '125', '#af7b00'],
    ['KASTANJEBRUIN', '1817', '#5c2f30'],
    ['DONKERBRUIN', '412', '#322a2a'],

    ['PASTELBLAUW', '290', '#afd3ea'],
    ['LICHTBLAUW', '291', '#8fc4e9'],
    ['LICHT HEMELSBLAUW', '542', '#6da6d0'],
    ['HEMELSBLAUW', '2925', '#0091db'],
    ['DONKER HEMELSBLAUW', '2193', '#2e96d3'],
    ['HELDERBLAUW', '285', '#0068c9'],
    ['MIDDENBLAUW', '2144', '#005db3'],
    ['KONINGSBLAUW', '2145', '#00469f'],
    ['SAFFIERBLAUW', '072', '#001295'],
    ['BARCELONA BLAUW', '2746', '#0f1e85'],
    ['BLAUWGRIJS', '2150', '#2c6a96'],
    ['OCEAANBLAUW', '280', '#001f61'],
    ['INDIGO BLAUW', '295', '#00254d'],
    ['MARINEBLAUW', '282', '#001d3c'],

    ['AQUA', '324', '#8ed6d6'],
    ['AQUAMARIJN', '3265', '#00beac'],
    ['GROENGEEL', '382', '#bcd100'],
    ['FLUORGROEN', '802', '#34d02c'],
    ['LICHT OLIJFGROEN', '576', '#6f9345'],
    ['GRASGROEN', '2257', '#00a34a'],
    ['BOSGROEN', '3415', '#006b44'],
    ['GROEN', '3425', '#00593c'],
    ['DONKERZEEGROEN', '3298', '#005f4b'],
    ['LEGERGROEN', '3308', '#003e34'],
    ['GRIJSGROEN', '2214', '#296471'],
    ['PETROL', '3155', '#00576b'],

    ['WIT', '', '#fefefe'],
    ['GEBROKEN WIT', '', '#f5f7f4'],
    ['LICHTGRIJS', 'Cool Gray 1', '#d2d4d1'],
    ['ZILVERKLEURIG', '422', '#959899'],
    ['GRIJS', '424', '#66696a'],
    ['DONKERGRIJS', '432', '#2e3841'],
    ['KAVIAAR GRIJS', '433', '#1c232a'],
    ['ZWART', '', '#141717'],
  ].map(([name, pms, hex], id) => {
    const rgb = SC.color.parseHex(hex);
    return { id, name, pms, hex, rgb, lab: SC.color.rgbToLab(rgb[0], rgb[1], rgb[2]) };
  });

  // Kolommen van de kaart: rood/roze/paars, geel/oranje, beige/bruin, blauw, groen, wit/grijs/zwart
  const GROUP_SIZES = [14, 8, 6, 14, 12, 8];
  let gi = 0, left = GROUP_SIZES[0];
  for (const y of YARNS) {
    if (left === 0) left = GROUP_SIZES[++gi];
    y.group = gi;
    left--;
  }

  function label(y) {
    return y.name + (y.pms ? ` · PMS ${y.pms}` : '');
  }

  /** Kleurverschil (CIEDE2000) tussen een rgb-kleur en een garen. */
  function distance(rgb, yarn) {
    return SC.color.dE2000(SC.color.rgbToLab(rgb[0], rgb[1], rgb[2]), yarn.lab);
  }

  /** Garens gesorteerd op kleurverschil tot de gegeven kleur. */
  function ranked(rgb) {
    const lab = SC.color.rgbToLab(rgb[0], rgb[1], rgb[2]);
    return YARNS.map((y) => ({ yarn: y, dE: SC.color.dE2000(lab, y.lab) })).sort((a, b) => a.dE - b.dE);
  }

  function nearest(rgb) {
    return ranked(rgb)[0];
  }

  /** Hoe goed past het garen bij de ontwerpkleur? (CIEDE2000: <2 nauwelijks te zien, >10 duidelijk anders) */
  function matchQuality(dE) {
    if (dE < 5) return { level: 'good', text: 'goede match' };
    if (dE < 10) return { level: 'ok', text: 'redelijke match' };
    return { level: 'far', text: 'wijkt zichtbaar af' };
  }

  SC.yarns = { list: YARNS, byId: (id) => YARNS[id], label, distance, ranked, nearest, matchQuality };
})();
