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

const luminance = (hex: string) => {
  const full = hex.length === 4 ? '#' + hex.slice(1).replace(/./g, (c) => c + c) : hex;
  const rgb = [1, 3, 5].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
    .map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
};

void test('Demo 2 G7: dark body, sidebar, button and status text meet 4.5:1', () => {
  const tokens = block(css, '.dark');
  const pairs: [string, string][] = [];
  for (const ink of ['--ink', '--ink-2', '--ink-3', '--ink-4']) {
    for (const surface of ['--bg', '--surface', '--surface-2', '--surface-3']) pairs.push([ink, surface]);
  }
  for (const ink of ['--sb-ink', '--sb-ink-2', '--sb-ink-3']) {
    for (const surface of ['--sb', '--sb-accent', '--sb-hover', '--sb-box']) pairs.push([ink, surface]);
  }
  pairs.push(['--primary-ink', '--primary']);
  for (const status of ['good', 'bad', 'warn']) pairs.push([`--${status}`, `--${status}-bg`]);
  for (const [foreground, background] of pairs) {
    const a = luminance(tokens.get(foreground)!), b = luminance(tokens.get(background)!);
    const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    assert.ok(ratio >= 4.5, `${foreground} on ${background}: ${ratio.toFixed(2)}:1`);
  }
});
