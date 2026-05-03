import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync('site/index.html', 'utf8');
const badChars = [0x00c3, 0x00c2, 0x00e2, 0xfffd].map((code) => String.fromCharCode(code));
const bad = badChars.reduce((count, ch) => count + (html.match(new RegExp(ch, 'g')) || []).length, 0);
if (bad) throw new Error(`Encoding check failed: ${bad} suspicious characters`);

if (!html.includes('data-checkout-plan="standard"')) throw new Error('Missing Standard checkout button');
if (!html.includes('data-checkout-plan="pro"')) throw new Error('Missing Pro checkout button');
if (!html.includes('data-checkout-plan="business"')) throw new Error('Missing Business checkout button');
if (/sms/i.test(html)) throw new Error('SMS mention found');

const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
for (let i = 0; i < scripts.length; i += 1) {
  new vm.Script(scripts[i], { filename: `inline-script-${i}.js` });
}

console.log(`Checks passed. Inline scripts: ${scripts.length}`);
