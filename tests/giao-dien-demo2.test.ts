import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const design = readFileSync(new URL('../docs/plans/2026-10-16-demo-imimran/mau/tokens.css', import.meta.url), 'utf8');
const declarations = (body: string) => new Map([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const block = (source: string, selector: string) => {
  const start = source.indexOf(`${selector} {`);
  assert.ok(start >= 0, `Missing ${selector}`);
  return declarations(source.slice(start, source.indexOf('}', start)));
};

for (const selector of [':root', '.dark', ':root, .dark']) {
  void test(`Demo 2: ${selector} contains every design token and value`, () => {
    const actual = block(css, selector);
    const expected = block(design, selector);
    assert.ok(expected.size > 20);
    for (const [name, value] of expected) assert.equal(actual.get(name), value, name);
  });
}

void test('Demo 2: light primary preserves Megatech brand', () => {
  assert.equal(block(css, ':root').get('--primary'), '#17684b');
});
