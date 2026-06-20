import assert from 'node:assert/strict';
import test from 'node:test';

import { clean, cleanLine } from '../functions/_lib/http.js';

const ZWSP = String.fromCharCode(0x200b); // zero-width space
const ZWJ = String.fromCharCode(0x200d); // zero-width joiner
const BOM = String.fromCharCode(0xfeff); // byte-order mark
const RLO = String.fromCharCode(0x202e); // right-to-left override (Trojan Source)
const NUL = String.fromCharCode(0x00); // null byte

test('clean trims and caps length', () => {
  assert.equal(clean('  hello  '), 'hello');
  assert.equal(clean('abcdef', 3), 'abc');
  assert.equal(clean(null), '');
  assert.equal(clean(undefined), '');
});

test('clean strips control characters but keeps newlines and tabs', () => {
  assert.equal(clean('a' + NUL + 'bc'), 'abc');
  assert.equal(clean('line1\nline2\twrap'), 'line1\nline2\twrap');
  // Carriage returns survive for multi-line fields.
  assert.equal(clean('a\r\nb'), 'a\r\nb');
});

test('clean removes zero-width and bidi spoofing characters', () => {
  assert.equal(clean('he' + ZWSP + 'll' + ZWJ + 'o' + BOM), 'hello');
  assert.equal(clean('admin' + RLO + 'txt.exe'), 'admintxt.exe');
});

test('cleanLine collapses newlines and whitespace to single spaces', () => {
  assert.equal(cleanLine('Game\nTitle'), 'Game Title');
  assert.equal(cleanLine('a\t\t  b'), 'a b');
  assert.equal(cleanLine('  spaced  out  '), 'spaced out');
});

test('cleanLine blocks Discord-message injection via a title', () => {
  const injected = 'Cool Game\n@everyone click http://evil.example';
  const result = cleanLine(injected, 200);
  assert.ok(!result.includes('\n'), 'newlines removed');
  assert.equal(result, 'Cool Game @everyone click http://evil.example');
});

test('cleanLine also strips invisible characters', () => {
  assert.equal(cleanLine('na' + ZWSP + 'me' + BOM + 'x'), 'namex');
});
