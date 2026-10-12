'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { decodeBase58, isValidAddress } = require('../src/base58');
const { encodeBase58, fakeAddress } = require('./helpers/base58');

const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

test('decodeBase58 decodes known values', () => {
  assert.deepEqual(Array.from(decodeBase58('2g')), [97]);
  assert.deepEqual(Array.from(decodeBase58('1')), [0]);
  assert.deepEqual(Array.from(decodeBase58('11')), [0, 0]);
});

test('decodeBase58 rejects empty input and characters outside the alphabet', () => {
  assert.equal(decodeBase58(''), null);
  assert.equal(decodeBase58('0abc'), null);
  assert.equal(decodeBase58('Oabc'), null);
  assert.equal(decodeBase58('Iabc'), null);
  assert.equal(decodeBase58('labc'), null);
  assert.equal(decodeBase58(42), null);
});

test('isValidAddress accepts 32-byte addresses and rejects everything else', () => {
  assert.equal(isValidAddress(TOKEN_PROGRAM), true);
  assert.equal(isValidAddress('1'.repeat(32)), true);
  assert.equal(isValidAddress('1'.repeat(31)), false);
  assert.equal(isValidAddress('1'.repeat(33)), false);
  assert.equal(isValidAddress('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5D0'), false);
  assert.equal(isValidAddress('abc'), false);
  assert.equal(isValidAddress(undefined), false);
  assert.equal(isValidAddress(fakeAddress(5)), true);
});

test('decode and encode round-trip, including leading zero bytes', () => {
  assert.equal(encodeBase58(decodeBase58(TOKEN_PROGRAM)), TOKEN_PROGRAM);
  const bytes = [0, 0, 1, 2, 3, 250];
  assert.deepEqual(Array.from(decodeBase58(encodeBase58(bytes))), bytes);
});