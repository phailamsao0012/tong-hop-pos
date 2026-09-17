import test from 'node:test';
import assert from 'node:assert/strict';
import { matchShops, normalizeName } from '../lib/shop-map';

test('normalizeName strips diacritics and punctuation', () => {
  assert.equal(normalizeName('Siêu vỏ gạo'), 'sieuvogao');
  assert.equal(normalizeName('MGT - APEX'), 'mgtapex');
  assert.equal(normalizeName('Oxytetra - Megatech'), 'oxytetramegatech');
});

test('matchShops maps 6 POS and ignores the extra MGT shop', () => {
  const shops = [
    { id: '1', name: 'Siêu Vô Gạo' },
    { id: '2', name: 'MGT-APEX' },
    { id: '3', name: 'Thủy sản Megatech' },
    { id: '4', name: 'BIO NANO' },
    { id: '5', name: 'MEGAROOT' },
    { id: '6', name: 'Oxytetra Megatech' },
    { id: '7', name: 'MGT' },
  ];
  const result = matchShops(shops);
  assert.equal(result.size, 6);
  assert.equal(result.get('mgt-apex')?.id, '2');
  assert.equal(result.get('oxytetra')?.id, '6');
  assert.ok(![...result.values()].some((s) => s.id === '7'));
});

test('matchShops leaves ambiguous names unmatched', () => {
  const result = matchShops([{ id: '1', name: 'BIO NANO 1' }, { id: '2', name: 'BIO NANO 2' }]);
  assert.equal(result.get('bio-nano'), undefined);
});
