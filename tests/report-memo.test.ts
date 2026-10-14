import test from 'node:test';
import assert from 'node:assert/strict';
import { reportMemoKey } from '../lib/report-memo';

const url = 'https://example.com/api/reports/product-groups?team=sale';

void test('cùng URL và nguồn team, khác vai trò thì khóa khác nhau', () => {
  const roles = ['owner', 'director', 'sale', 'cskh', 'manager'];
  const keys = roles.map((role) => reportMemoKey(role, 'hr', url));
  assert.equal(new Set(keys).size, roles.length);
});

void test('cùng vai trò và URL, khác nguồn team thì khóa khác nhau', () => {
  assert.notEqual(
    reportMemoKey('owner', 'hr', url),
    reportMemoKey('owner', 'pc', url),
  );
});

void test('cùng vai trò, nguồn team và URL thì khóa bằng nhau', () => {
  assert.equal(
    reportMemoKey('sale', 'pc', url),
    reportMemoKey('sale', 'pc', url),
  );
  assert.equal(reportMemoKey('sale', 'pc', url), `sale|pc|${url}`);
});
