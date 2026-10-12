'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs } = require('../src/args');

test('no arguments gives defaults', () => {
  const opts = parseArgs([]);
  assert.equal(opts.help, false);
  assert.equal(opts.version, false);
  assert.equal(opts.json, false);
  assert.equal(opts.rpc, null);
  assert.equal(opts.address, null);
  assert.deepEqual(opts.errors, []);
});

test('parses the address, flags and values in any order', () => {
  const opts = parseArgs(['--json', 'SomeAddress', '--rpc', 'https://example.com']);
  assert.equal(opts.address, 'SomeAddress');
  assert.equal(opts.json, true);
  assert.equal(opts.rpc, 'https://example.com');
  assert.deepEqual(opts.errors, []);
});

test('unknown option is reported', () => {
  assert.deepEqual(parseArgs(['--nope']).errors, ['unknown option: --nope']);
  assert.deepEqual(parseArgs(['-x']).errors, ['unknown option: -x']);
});

test('--rpc without a value is reported', () => {
  assert.deepEqual(parseArgs(['--rpc']).errors, ['--rpc needs a value']);
  assert.deepEqual(parseArgs(['--rpc', '--json']).errors, ['--rpc needs a value']);
});

test('a second address is reported once', () => {
  const opts = parseArgs(['A', 'B', 'C']);
  assert.equal(opts.address, 'A');
  assert.deepEqual(opts.errors, ['only one wallet address can be given at a time']);
});