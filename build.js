// Maakt dist/index.html: één bestand om als gedeelde pagina (Claude-artifact) te publiceren.
// - CSS en eigen JavaScript worden ingevoegd (de gedeelde pagina laadt geen losse bestanden)
// - pdf.js komt van cdnjs (de enige toegestane bron voor scripts)
// - geen <html>/<head>/<body>: die zet de publicatie er zelf omheen
// Gebruik: npm run build
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const html = read('index.html');
const title = (html.match(/<title>[\s\S]*?<\/title>/) || ['<title>Sjaal ontwerpcheck</title>'])[0];
let body = html.match(/<body>([\s\S]*)<\/body>/)[1];

const config = {
  autoDemo: true,
  pdfWorkerScript: `${PDFJS}/pdf.worker.min.js`,
};

body = body.replace(
  /<script src="vendor\/pdfjs\/pdf\.min\.js"><\/script>/,
  `<script>window.SJAAL_CONFIG = ${JSON.stringify(config)};</script>\n  <script src="${PDFJS}/pdf.min.js"></script>`
);
body = body.replace(/<script src="(js\/[\w-]+\.js)"><\/script>/g, (_, file) => {
  const code = read(file).replace(/<\/script/gi, '<\\/script');
  return `<script>\n/* ${file} */\n${code}\n</script>`;
});

if (/<script src="(?!https:\/\/cdnjs)/.test(body)) throw new Error('Er staat nog een lokaal script in de pagina.');

const css = read('css/style.css');
const out = [
  title,
  '<meta name="claude:viewport-fit-sides" content="cover">',
  `<style>\n${css}\n</style>`,
  body.trim(),
  '',
].join('\n');

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist', 'index.html'), out);
console.log(`dist/index.html: ${(out.length / 1024).toFixed(0)} KB`);
