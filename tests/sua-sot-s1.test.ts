import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

void test('S1: production workflow only deploys production', () => {
  const workflow = read('../.github/workflows/deploy.yml');
  assert.doesNotMatch(workflow, /deploy-demo\.mjs|^  deploy-demo:/m);
  const deploy = workflow.split('  deploy:')[1];
  assert.match(deploy, /pnpm db:migrate/);
  assert.match(deploy, /pnpm run deploy/);
});

void test('S1: card info excludes legacy warehouse definitions and keeps current definitions', () => {
  const source = read('../app/product-group-blocks.tsx');
  const expression = source.slice(source.lastIndexOf('info={') + 6).split('\n      }')[0];
  const definitions = {
    groups: 'groups', packed: 'packed', waiting: 'waiting',
    whConfirmed: 'XN kho', warehouseConfirmed: 'XN kho',
    backToWaiting: 'XN kho', otherUnconfirmed: 'XN kho',
  };
  const info = (r: { definitions: Record<string, string> } | null): unknown =>
    runInNewContext(`(${expression})`, { r });
  assert.equal(info({ definitions }), 'groups packed waiting');
  assert.doesNotMatch(String(info({ definitions })), /XN kho/);
  assert.equal(info(null), undefined);
  const route = read('../app/api/reports/product-groups/route.ts');
  assert.match(route.slice(route.indexOf('    definitions: {')), /whConfirmed:/);
});
