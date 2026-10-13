'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../package.json');
const { run } = require('../src/cli');
const { createMockRpc } = require('./helpers/mock-rpc');

const ADDRESS = 'So11111111111111111111111111111111111111112';
const ENDPOINT = 'https://rpc.example.com/secret-key-123';
const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const BLOCK_TIME = 1760000000;

const walletRoute = {
  result: {
    context: { slot: 1 },
    value: {
      lamports: 2500000000,
      owner: SYSTEM_PROGRAM,
      executable: false,
      rentEpoch: 0,
      space: 0,
      data: ['', 'base64'],
    },
  },
};

const twoTransactions = {
  result: [
    { signature: 'sigB', slot: 2, err: null, memo: null, blockTime: BLOCK_TIME },
    { signature: 'sigA', slot: 1, err: null, memo: null, blockTime: BLOCK_TIME - 86400 },
  ],
};

async function runCli(argv, routes = {}, deps = {}) {
  const out = [];
  const err = [];
  const fetchImpl = createMockRpc({ getSignaturesForAddress: { result: [] }, ...routes });
  const code = await run(
    argv,
    { out: (t) => out.push(t), err: (t) => err.push(t) },
    { fetchImpl, sleepImpl: async () => {}, env: {}, ...deps },
  );
  return { code, out: out.join('\n'), err: err.join('\n'), fetchImpl };
}

test('--help prints usage and exits 0', async () => {
  const r = await runCli(['--help']);
  assert.equal(r.code, 0);
  assert.match(r.out, /Usage:/);
  assert.equal(r.err, '');
});

test('--version prints the package version', async () => {
  const r = await runCli(['--version']);
  assert.equal(r.code, 0);
  assert.equal(r.out, pkg.version);
});

test('unknown option exits 2 with a hint', async () => {
  const r = await runCli(['--nope']);
  assert.equal(r.code, 2);
  assert.match(r.err, /unknown option: --nope/);
  assert.match(r.err, /--help/);
});

test('a missing address exits 2', async () => {
  const r = await runCli([]);
  assert.equal(r.code, 2);
  assert.match(r.err, /address is required/);
});

test('an invalid address exits 2 without calling the RPC', async () => {
  const r = await runCli(['not-an-address']);
  assert.equal(r.code, 2);
  assert.match(r.err, /not a valid Solana address/);
  assert.equal(r.fetchImpl.calls.length, 0);
});

test('a second address exits 2', async () => {
  const r = await runCli([ADDRESS, ADDRESS]);
  assert.equal(r.code, 2);
  assert.match(r.err, /only one wallet address/);
});

test('a valid address prints the wallet profile', async () => {
  const r = await runCli([ADDRESS], { getAccountInfo: walletRoute });
  assert.equal(r.code, 0);
  assert.match(r.out, /Balance\s+2\.5 SOL \(2500000000 lamports\)/);
  assert.match(r.out, /Type\s+wallet/);
  assert.match(r.out, /Activity\s+no transactions found/);
  assert.equal(r.fetchImpl.calls.length, 2);
  assert.equal(r.fetchImpl.calls[0].method, 'getAccountInfo');
  assert.equal(r.fetchImpl.calls[1].method, 'getSignaturesForAddress');
});

test('recent activity is printed with a readable age', async () => {
  const r = await runCli(
    [ADDRESS],
    { getAccountInfo: walletRoute, getSignaturesForAddress: twoTransactions },
    { now: BLOCK_TIME * 1000 + 2 * 3600 * 1000 },
  );
  assert.equal(r.code, 0);
  assert.match(r.out, /Activity\s+2 transactions \(full history\)/);
  assert.match(r.out, /Last tx\s+\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC \(2h ago\)/);
  assert.match(r.out, /First tx\s+\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/);
});

test('--json prints machine-readable JSON including activity', async () => {
  const r = await runCli([ADDRESS, '--json'], {
    getAccountInfo: walletRoute,
    getSignaturesForAddress: twoTransactions,
  });
  assert.equal(r.code, 0);
  const data = JSON.parse(r.out);
  assert.equal(data.address, ADDRESS);
  assert.equal(data.lamports, 2500000000);
  assert.equal(data.sol, '2.5');
  assert.equal(data.kind, 'wallet');
  assert.equal(data.activity.checked, 2);
  assert.equal(data.activity.complete, true);
  assert.equal(data.activity.failed, 0);
  assert.equal(data.activity.lastSeen, new Date(BLOCK_TIME * 1000).toISOString());
});

test('an account that does not exist is reported, not an error', async () => {
  const r = await runCli([ADDRESS], {
    getAccountInfo: { result: { context: { slot: 1 }, value: null } },
  });
  assert.equal(r.code, 0);
  assert.match(r.out, /not found on chain/);
});

test('--rpc wins over the env var, and the env var wins over the default', async () => {
  const env = { SOL_WALLET_PROFILE_RPC: 'https://env.test' };

  const flag = await runCli([ADDRESS, '--rpc', ENDPOINT], { getAccountInfo: walletRoute }, { env });
  assert.equal(flag.fetchImpl.calls[0].url, ENDPOINT);

  const fromEnv = await runCli([ADDRESS], { getAccountInfo: walletRoute }, { env });
  assert.equal(fromEnv.fetchImpl.calls[0].url, 'https://env.test');
});

test('an RPC failure exits 1 with a hint and never leaks the URL path', async () => {
  const r = await runCli([ADDRESS, '--rpc', ENDPOINT], { getAccountInfo: { status: 429 } });
  assert.equal(r.code, 1);
  assert.match(r.err, /rate-limiting/);
  assert.match(r.err, /SOL_WALLET_PROFILE_RPC/);
  assert.doesNotMatch(r.err, /secret-key-123/);
});

test('a failure while fetching activity exits 1 and prints no partial profile', async () => {
  const r = await runCli([ADDRESS, '--rpc', ENDPOINT], {
    getAccountInfo: walletRoute,
    getSignaturesForAddress: { status: 500 },
  });
  assert.equal(r.code, 1);
  assert.match(r.err, /HTTP 500/);
  assert.doesNotMatch(r.err, /secret-key-123/);
  assert.equal(r.out, '');
});