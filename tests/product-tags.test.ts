import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupsOf, productTags } from '../lib/product-groups';

void test('productTags bỏ nhãn vận chuyển và vận hành, giữ nhãn sản phẩm', () => {
  assert.deepEqual(
    productTags(
      '[{"name":"VTP"},{"name":"spx"},{"name":"GENTADOX"},{"name":"Chưa đối soát"},{"name":"SPX SHOP"}]',
    ),
    ['GENTADOX', 'SPX SHOP'],
  );
});

void test('groupsOf xếp đơn chỉ mang nhãn vận chuyển vào Chưa gắn thẻ', () => {
  assert.deepEqual(
    groupsOf('[{"name":"VTP"}]', [], 'tag', 'tag'),
    groupsOf('[]', [], 'tag', 'tag'),
  );
});
