import test from 'node:test';
import assert from 'node:assert/strict';
import { canView, parseAccess, scopeApi } from '../lib/access';

const owner = parseAccess({ role: 'owner' });
const director = parseAccess({ role: 'director', views_json: JSON.stringify(['overview', 'cskh-kpi', 'sale-kpi']) });
const req = (a: ReturnType<typeof parseAccess>, method: string, path: string) => scopeApi(a, method, new URL(`https://x${path}`)).blocked;

test('KPI pages are owner-only, even for a director granted them', () => {
  assert.equal(canView(owner, 'cskh-kpi'), true);
  assert.equal(canView(owner, 'sale-kpi'), true);
  assert.equal(canView(director, 'cskh-kpi'), false);
  assert.equal(canView(director, 'sale-kpi'), false);
  assert.equal(canView(director, 'overview'), true);
});

test('only the owner can set KPI and shifts', () => {
  assert.equal(req(owner, 'PUT', '/api/targets'), undefined);
  assert.equal(req(owner, 'PUT', '/api/staff-settings'), undefined);
  assert.ok(req(director, 'PUT', '/api/targets'));
  assert.ok(req(director, 'PUT', '/api/staff-settings'));
});
