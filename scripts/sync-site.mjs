import { copyFileSync } from 'node:fs';

copyFileSync('NamaIAv17.html', 'index.html');
copyFileSync('NamaIAv17.html', 'nama-ia-netlify-premium.html');
copyFileSync('NamaIAv17.html', 'site/index.html');
copyFileSync('cgv.html', 'site/cgv.html');
copyFileSync('confidentialite.html', 'site/confidentialite.html');
copyFileSync('mentions-legales.html', 'site/mentions-legales.html');

console.log('Site files synced.');
