import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('shared controls grow with wrapped Azerbaijani labels instead of clipping', () => {
  assert.match(css, /\.btn,[\s\S]*?padding:\s*8px 14px;[\s\S]*?line-height:\s*1\.25;[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?white-space:\s*normal;/);
  assert.match(css, /\.badge\s*\{[\s\S]*?padding:\s*5px 10px;[\s\S]*?line-height:\s*1\.25;[\s\S]*?overflow-wrap:\s*anywhere;/);
  assert.match(css, /\.toolbar select,[\s\S]*?padding:\s*9px 12px;[\s\S]*?line-height:\s*1\.35;/);
});

test('mobile cards and dialogs avoid horizontal overflow', () => {
  assert.match(css, /@media \(max-width:\s*768px\)/);
  assert.match(css, /\.responsive-table tr\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?grid-template-columns:/);
  assert.match(css, /\.responsive-table td\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?overflow-wrap:\s*anywhere;/);
  assert.match(css, /\.modal\s*\{[\s\S]*?max-height:\s*calc\(100dvh - 36px\);[\s\S]*?overflow-y:\s*auto;/);
  assert.match(css, /\.modal-actions > \*\s*\{[\s\S]*?min-height:\s*44px;[\s\S]*?flex:\s*1 1 140px;/);
});
