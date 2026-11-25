# Sjaal ontwerpcheck

Controleer een ontwerp voor een gebreide sjaal (standaard resolutie, grove steek) voordat het naar de leverancier gaat. Je ziet het ontwerp direct in breisteken en krijgt een lijst met aandachtspunten.

## Starten

Dubbelklik op `index.html`, of start de lokale server:

```bash
npm start
```

Ga daarna naar http://localhost:5178.

## Gedeelde pagina

De tool staat ook online als deelbare pagina: https://claude.ai/artifact/8dpoYhTUqDaZTaEYwR4dYd. Delen gaat via het menu Delen op die pagina.

Na een wijziging maak je de publicatieversie opnieuw met:

```bash
npm run build
```

Dat maakt `dist/index.html`: één bestand met alle CSS en JavaScript erin, en pdf.js van cdnjs. Die versie opent meteen met het voorbeeldontwerp. Downloads lopen daar via de downloadfunctie van de pagina, die per bestand om bevestiging vraagt.

## Wat het doet

- **Invoer:** PNG, JPG of PDF via slepen of kiezen. Bij een PDF met meerdere pagina's kies je de pagina. Een liggend ontwerp wordt automatisch rechtop gezet.
- **Steekraster:** standaard 3 steken per cm in de breedte en 5 rijen per cm in de hoogte. Een sjaal van 17 × 180 cm wordt zo 51 × 900 steken, en 1 steek is ±3,3 × 2,0 mm.
- **Weergaven naast elkaar:** het origineel, het steekraster (1 vakje = 1 steek) en de gebreide weergave met V-vormige steken. Met de liniaal in cm, zoom tot ware grootte, en een overzicht van de hele sjaal met franjes.
- **Garenkleuren:** de kleuren worden teruggebracht tot max. 4 draadkleuren. Elke kleur krijgt het dichtstbijzijnde garen van de MerchLab-kleurenkaart (62 voorraadgarens, met naam en PMS-code; gematcht met CIEDE2000). Klik op een kleur om zelf een garen te kiezen. Je kunt de sjaal tonen in garenkleuren of in de kleuren van je bestand. Met "Kleurenlijst kopiëren" plak je de gekozen garens in een mail of bestelling.
- **Voor- en achterzijde (tubulair gebreid):** standaard krijgt de achterzijde hetzelfde ontwerp in **andere kleuren**. De twee hoofdkleuren worden omgewisseld (bijv. wit op navy wordt navy op wit), en per kleur kun je het garen voor de achterzijde zelf kiezen. Je kunt ook kiezen voor een achterzijde die gelijk is aan de voorzijde, of een eigen ontwerp uploaden. Het maximum van 4 garens geldt voor voor en achter samen.
- **Controles:** resolutie, verhouding, PDF-formaat, aantal kleuren, verlopen of foto's, kleuren zonder goed passend garen, twee kleuren die hetzelfde garen krijgen, garens die te veel op elkaar lijken, het totaal aantal garens van voor + achter, kleuren die op de achterzijde samenvallen, details die verdwijnen of vervormen, losse steken, en vormen tegen de zijkant (de vouw van de koker). Met "Bekijk in sjaal" spring je naar elke plek.
- **Downloaden:** het steekpatroon als PNG (1 pixel = 1 steek) en de gebreide preview als PNG.

Een bestand dat precies het steekraster is (bijvoorbeeld 51 × 900 px) wordt 1-op-1 omgezet: wat je ziet is wat er gebreid wordt.

## Specificaties leverancier

Uit de productpagina [Gebreide sjaals | Grof](https://www.merchlab.nl/gebreide-sjaals-standaard-resolutie):

- Formaten 15 × 110, 17 × 140, 17 × 160 en 17 × 180 cm
- Max. 4 draadkleuren, tubulair jacquard (koker zonder naad)
- Voor- en achterzijde mogen verschillen
- Franjes in max. 3 kleuren, of dichtgestikte uiteinden
- Garens worden gematcht op opgegeven PMS-kleuren; eigen PMS-garens vanaf 2500 stuks
- Kleurenkaart: 62 voorraadgarens (staan in `js/yarns.js`). De schermkleuren zijn uit de PDF gemeten en zijn een indicatie: de PMS-code is leidend. Komt er een nieuwe kleurenkaart, werk dan dat bestand bij.

De steekdichtheid (3 × 5 per cm) is een gemiddelde. Pas die in de tool aan als de leverancier andere waarden opgeeft.

## Bestanden

- `index.html`, `css/style.css`: de interface
- `js/process.js`: kleurreductie, omzetten naar steken, analyse
- `js/checks.js`: controles en teksten
- `js/render.js`: tekenen van steken, raster, overzicht en export
- `js/yarns.js`: de garens van de kleurenkaart en het matchen daarmee
- `js/loader.js`: PNG/JPG/PDF inlezen (PDF via pdf.js in `vendor/pdfjs`)
- `server.js`: minimale lokale webserver zonder dependencies
