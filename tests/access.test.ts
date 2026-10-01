import test from 'node:test';
import assert from 'node:assert/strict';
import { canView, parseAccess, scopeApi } from '../lib/access';

const director = parseAccess({ role: 'director', views_json: JSON.stringify(['overview', 'cskh-overview']) });
const lead = parseAccess({ role: 'lead', views_json: JSON.stringify(['overview', 'cskh-kpi', 'sale-kpi']) });
const req = (a: ReturnType<typeof parseAccess>, method: string, path: string) => scopeApi(a, method, new URL(`https://x${path}`)).blocked;

test('KPI pages are for owner and director only', () => {
  assert.equal(canView(director, 'cskh-kpi'), true);
  assert.equal(canView(director, 'sale-kpi'), true);
  assert.equal(canView(lead, 'cskh-kpi'), false);
  assert.equal(canView(lead, 'sale-kpi'), false);
  assert.equal(canView(director, 'config'), false);
});

test('director can set KPI and shifts, lead cannot', () => {
  assert.equal(req(director, 'PUT', '/api/targets'), undefined);
  assert.equal(req(director, 'PUT', '/api/staff-settings'), undefined);
  assert.equal(req(director, 'GET', '/api/reports/overview?team=sale'), undefined);
  assert.ok(req(lead, 'PUT', '/api/targets'));
  assert.ok(req(lead, 'PUT', '/api/staff-settings'));
  assert.equal(req(lead, 'GET', '/api/staff-settings'), undefined);
});
