import test from 'node:test';
import assert from 'node:assert/strict';
import { canManageKpi, canView, parseAccess, scopeApi } from '../lib/access';

const director = parseAccess({ role: 'director', views_json: JSON.stringify(['overview', 'calls']) });
const lead = parseAccess({ role: 'lead', views_json: JSON.stringify(['overview', 'calls', 'cskh-kpi', 'sale-kpi']) });
const owner = parseAccess({ role: 'owner' });

test('KPI CSKH and KPI Sale open for owner and director only', () => {
  for (const v of ['cskh-kpi', 'sale-kpi']) {
    assert.equal(canView(owner, v), true);
    assert.equal(canView(director, v), true);
    assert.equal(canView(lead, v), false);
  }
  assert.equal(canManageKpi(director), true);
  assert.equal(canManageKpi(lead), false);
  assert.equal(canView(director, 'config'), false);
});

test('director may save targets and shifts, lead may not', () => {
  const put = (a: typeof lead, path: string) => scopeApi(a, 'PUT', new URL(`https://x.test${path}`)).blocked;
  assert.equal(put(director, '/api/targets'), undefined);
  assert.equal(put(director, '/api/staff-settings'), undefined);
  assert.ok(put(lead, '/api/targets'));
  assert.ok(put(lead, '/api/staff-settings'));
  assert.equal(scopeApi(lead, 'GET', new URL('https://x.test/api/targets?month=2026-10')).blocked, undefined);
  assert.ok(put(director, '/api/users'));
});
