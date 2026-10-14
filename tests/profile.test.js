'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchProfile, formatSol, renderText, SYSTEM_PROGRAM } = require('../src/profile');
const { createMockRpc } = require('./helpers/mock-rpc');

const ENDPOINT = 'https://rpc.example.com/secret-key-123';
const ADDRESS = 'So11111111111111111111111111111111111111112';
const UPGRADEABLE_LOADER = 'BPFLoaderUpgradeab1e11111111111111111111111';
const NATIVE_LOADER = 'NativeLoader1111111111111111111111111111111';

function accountResult(value) {
  return { result: { context: { slot: 1 }, value } };
}

test('formatSol converts lamports exactly and trims trailing zeros', () => {
  assert.equal(formatSol(0), '0');
  assert.equal(formatSol(1), '0.000000001');
  assert.equal(formatSol(1000000000), '1');
  assert.equal(formatSol(1500000000), '1.5');
  assert.equal(formatSol(123456789012), '123.456789012');
});

test('fetchProfile describes a normal wallet', async () => {
  const fetchImpl = createMockRpc({
    getAccountInfo: accountResult({
      lamports: 2500000000,
      owner: SYSTEM_PROGRAM,
      executable: false,
      rentEpoch: 0,
      space: 0,
      data: ['', 'base64'],
    }),
  });

  const profile = await fetchProfile(ENDPOINT, ADDRESS, { fetchImpl });

  assert.equal(profile.exists, true);
  assert.equal(profile.lamports, 2500000000);
  assert.equal(profile.sol, '2.5');
  assert.equal(profile.kind, 'wallet');
  assert.equal(profile.ownerLabel, 'System Program');
  assert.equal(profile.dataSize, 0);

  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].method, 'getAccountInfo');
  assert.equal(fetchImpl.calls[0].params[0], ADDRESS);
  assert.equal(fetchImpl.calls[0].params[1].encoding, 'base64');
  assert.deepEqual(fetchImpl.calls[0].params[1].dataSlice, { offset: 0, length: 0 });
});

test('fetchProfile reports an account that does not exist', async () => {
  const fetchImpl = createMockRpc({ getAccountInfo: accountResult(null) });
  const profile = await fetchProfile(ENDPOINT, ADDRESS, { fetchImpl });
  assert.equal(profile.exists, false);
  assert.equal(profile.lamports, 0);
  assert.equal(profile.kind, 'unfunded');
  assert.equal(profile.owner, null);
});

test('fetchProfile marks executable accounts as programs', async () => {
  const fetchImpl = createMockRpc({
    getAccountInfo: accountResult({
      lamports: 1141440,
      owner: UPGRADEABLE_LOADER,
      executable: true,
      rentEpoch: 0,
      space: 36,
      data: ['', 'base64'],
    }),
  });
  const profile = await fetchProfile(ENDPOINT, ADDRESS, { fetchImpl });
  assert.equal(profile.kind, 'program');
  assert.equal(profile.executable, true);
  assert.equal(profile.ownerLabel, 'BPF Upgradeable Loader');
});

test('fetchProfile labels the Native Loader as an owner', async () => {
  const fetchImpl = createMockRpc({
    getAccountInfo: accountResult({
      lamports: 1,
      owner: NATIVE_LOADER,
      executable: true,
      rentEpoch: 0,
      space: 21,
      data: ['', 'base64'],
    }),
  });
  const profile = await fetchProfile(ENDPOINT, ADDRESS, { fetchImpl });
  assert.equal(profile.kind, 'program');
  assert.equal(profile.ownerLabel, 'Native Loader');
});

test('fetchProfile rejects responses with an unexpected shape', async () => {
  const notAnObject = createMockRpc({ getAccountInfo: { result: 'nope' } });
  await assert.rejects(fetchProfile(ENDPOINT, ADDRESS, { fetchImpl: notAnObject }), (err) => {
    assert.equal(err.code, 'bad-response');
    assert.doesNotMatch(err.message, /secret-key-123/);
    return true;
  });

  const badLamports = createMockRpc({
    getAccountInfo: accountResult({ lamports: 'lots', owner: SYSTEM_PROGRAM }),
  });
  await assert.rejects(fetchProfile(ENDPOINT, ADDRESS, { fetchImpl: badLamports }), (err) => {
    assert.equal(err.code, 'bad-response');
    return true;
  });
});

test('renderText prints a readable wallet profile', () => {
  const text = renderText({
    address: ADDRESS,
    exists: true,
    lamports: 2500000000,
    sol: '2.5',
    kind: 'wallet',
    owner: SYSTEM_PROGRAM,
    ownerLabel: 'System Program',
    executable: false,
    dataSize: 0,
  });
  assert.match(text, /Address\s+So1111/);
  assert.match(text, /Balance\s+2\.5 SOL \(2500000000 lamports\)/);
  assert.match(text, /Type\s+wallet/);
  assert.match(text, /Owner\s+System Program \(1111/);
  assert.match(text, /Data\s+0 bytes/);
});

test('renderText says lamport in the singular for a balance of exactly 1', () => {
  const text = renderText({
    address: ADDRESS,
    exists: true,
    lamports: 1,
    sol: '0.000000001',
    kind: 'program',
    owner: NATIVE_LOADER,
    ownerLabel: 'Native Loader',
    executable: true,
    dataSize: 21,
  });
  assert.match(text, /Balance\s+0\.000000001 SOL \(1 lamport\)/);
  assert.doesNotMatch(text, /1 lamports/);
  assert.match(text, /Owner\s+Native Loader \(NativeLoader/);
});

test('renderText explains a missing account', () => {
  const text = renderText({ address: ADDRESS, exists: false, lamports: 0, sol: '0' });
  assert.match(text, /Balance\s+0 SOL/);
  assert.match(text, /not found on chain/);
});