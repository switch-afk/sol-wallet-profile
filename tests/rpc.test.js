'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { rpcCall, resolveEndpoint, hostLabel, DEFAULT_RPC } = require('../src/rpc');
const { createMockRpc } = require('./helpers/mock-rpc');

const ENDPOINT = 'https://rpc.example.com/secret-key-123';
const noWait = async () => {};

test('resolveEndpoint prefers --rpc, then the env var, then the public RPC', () => {
  assert.equal(resolveEndpoint('https://a.test', { SOL_WALLET_PROFILE_RPC: 'https://b.test' }), 'https://a.test');
  assert.equal(resolveEndpoint(null, { SOL_WALLET_PROFILE_RPC: 'https://b.test' }), 'https://b.test');
  assert.equal(resolveEndpoint(null, {}), DEFAULT_RPC);
});

test('hostLabel returns only the hostname', () => {
  assert.equal(hostLabel(ENDPOINT), 'rpc.example.com');
  assert.equal(hostLabel('not a url'), 'the RPC endpoint');
});

test('rpcCall sends a JSON-RPC request and returns the result', async () => {
  const fetchImpl = createMockRpc({ getVersion: { result: { 'solana-core': '2.0.0' } } });
  const result = await rpcCall(ENDPOINT, 'getVersion', [], { fetchImpl });
  assert.deepEqual(result, { 'solana-core': '2.0.0' });
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].method, 'getVersion');
  assert.equal(fetchImpl.calls[0].url, ENDPOINT);
});

test('rpcCall retries on 429 and then succeeds', async () => {
  const fetchImpl = createMockRpc({
    getVersion: [{ status: 429 }, { status: 429 }, { result: 'ok' }],
  });
  const result = await rpcCall(ENDPOINT, 'getVersion', [], { fetchImpl, sleepImpl: noWait });
  assert.equal(result, 'ok');
  assert.equal(fetchImpl.calls.length, 3);
});

test('rpcCall gives a rate-limit error with a hint and never leaks the URL path', async () => {
  const fetchImpl = createMockRpc({ getVersion: { status: 429 } });
  await assert.rejects(
    rpcCall(ENDPOINT, 'getVersion', [], { fetchImpl, sleepImpl: noWait }),
    (err) => {
      assert.equal(err.code, 'rate-limit');
      assert.match(err.message, /rpc\.example\.com/);
      assert.doesNotMatch(err.message, /secret-key-123/);
      assert.match(err.hint, /SOL_WALLET_PROFILE_RPC/);
      return true;
    },
  );
  assert.equal(fetchImpl.calls.length, 3);
});

test('rpcCall reports a JSON-RPC error', async () => {
  const fetchImpl = createMockRpc({ getVersion: { error: { code: -32005, message: 'Node is behind' } } });
  await assert.rejects(rpcCall(ENDPOINT, 'getVersion', [], { fetchImpl }), (err) => {
    assert.equal(err.code, 'rpc');
    assert.match(err.message, /Node is behind/);
    return true;
  });
});

test('rpcCall reports a response that is not JSON', async () => {
  const fetchImpl = createMockRpc({ getVersion: { text: '<html>oops</html>' } });
  await assert.rejects(rpcCall(ENDPOINT, 'getVersion', [], { fetchImpl }), (err) => {
    assert.equal(err.code, 'bad-response');
    return true;
  });
});

test('rpcCall reports a network failure without leaking the URL path', async () => {
  const fetchImpl = createMockRpc({
    getVersion: { throw: new Error('connect failed https://rpc.example.com/secret-key-123') },
  });
  await assert.rejects(rpcCall(ENDPOINT, 'getVersion', [], { fetchImpl }), (err) => {
    assert.equal(err.code, 'network');
    assert.doesNotMatch(err.message, /secret-key-123/);
    return true;
  });
});

test('rpcCall reports HTTP errors and hints on 403', async () => {
  const serverError = createMockRpc({ getVersion: { status: 500 } });
  await assert.rejects(rpcCall(ENDPOINT, 'getVersion', [], { fetchImpl: serverError }), (err) => {
    assert.equal(err.code, 'http');
    assert.match(err.message, /HTTP 500/);
    assert.equal(err.hint, null);
    return true;
  });

  const forbidden = createMockRpc({ getVersion: { status: 403 } });
  await assert.rejects(rpcCall(ENDPOINT, 'getVersion', [], { fetchImpl: forbidden }), (err) => {
    assert.match(err.hint, /--rpc/);
    return true;
  });
});