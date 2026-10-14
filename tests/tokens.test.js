'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  fetchTokens,
  summarizeTokenAccounts,
  tokenRows,
  formatUnits,
  TOKEN_PROGRAM,
  TOKEN_2022_PROGRAM,
} = require('../src/tokens');
const { createMockRpc } = require('./helpers/mock-rpc');

const ENDPOINT = 'https://rpc.example.com/secret-key-123';
const ADDRESS = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const MINT_A = 'MintA11111111111111111111111111111111111111';
const MINT_B = 'MintB11111111111111111111111111111111111111';
const MINT_C = 'MintC11111111111111111111111111111111111111';

function parsed(mint, raw, decimals, program = 'token') {
  return { mint, raw: BigInt(raw), decimals, program };
}

function account(mint, amount, decimals) {
  return {
    pubkey: `account-${mint}`,
    account: {
      lamports: 2039280,
      owner: TOKEN_PROGRAM,
      executable: false,
      rentEpoch: 0,
      space: 165,
      data: {
        program: 'spl-token',
        space: 165,
        parsed: {
          type: 'account',
          info: {
            isNative: false,
            mint,
            owner: ADDRESS,
            state: 'initialized',
            tokenAmount: { amount, decimals, uiAmount: 0, uiAmountString: '0' },
          },
        },
      },
    },
  };
}

test('formatUnits converts raw amounts exactly', () => {
  assert.equal(formatUnits(0, 6), '0');
  assert.equal(formatUnits(1, 9), '0.000000001');
  assert.equal(formatUnits('1234500000', 6), '1234.5');
  assert.equal(formatUnits('42', 0), '42');
  assert.equal(
    formatUnits('123456789012345678901234567890', 18),
    '123456789012.34567890123456789',
  );
});

test('summarizeTokenAccounts merges accounts of one mint and drops empty balances', () => {
  const summary = summarizeTokenAccounts([
    parsed(MINT_A, 5, 6),
    parsed(MINT_A, 7, 6),
    parsed(MINT_B, 0, 9),
    parsed(MINT_C, 1, 0),
  ]);

  assert.equal(summary.accounts, 4);
  assert.equal(summary.withBalance, 2);
  assert.equal(summary.nftLike, 1);

  const a = summary.holdings.find((h) => h.mint === MINT_A);
  assert.equal(a.amount, '12');
  assert.equal(a.uiAmount, '0.000012');
  assert.equal(a.accounts, 2);
  assert.equal(summary.holdings.some((h) => h.mint === MINT_B), false);
});

test('only decimals 0 with a balance of exactly 1 counts as NFT-like', () => {
  const { holdings } = summarizeTokenAccounts([
    parsed(MINT_A, 1, 0),
    parsed(MINT_B, 5, 0),
    parsed(MINT_C, 1, 6),
  ]);
  const byMint = Object.fromEntries(holdings.map((h) => [h.mint, h]));
  assert.equal(byMint[MINT_A].nftLike, true);
  assert.equal(byMint[MINT_B].nftLike, false);
  assert.equal(byMint[MINT_C].nftLike, false);
});

test('holdings are sorted by balance, biggest first', () => {
  const { holdings } = summarizeTokenAccounts([
    parsed(MINT_A, 10, 0),
    parsed(MINT_B, 2500, 0),
    parsed(MINT_C, 2, 0),
  ]);
  assert.deepEqual(
    holdings.map((h) => h.mint),
    [MINT_B, MINT_A, MINT_C],
  );
});

test('fetchTokens queries both token programs and merges the results', async () => {
  const fetchImpl = createMockRpc({
    getTokenAccountsByOwner: [
      { result: { context: { slot: 1 }, value: [account(USDC, '1234500000', 6)] } },
      { result: { context: { slot: 1 }, value: [account(MINT_C, '1', 0)] } },
    ],
  });

  const tokens = await fetchTokens(ENDPOINT, ADDRESS, { fetchImpl });

  assert.equal(fetchImpl.calls.length, 2);
  assert.equal(fetchImpl.calls[0].params[0], ADDRESS);
  assert.equal(fetchImpl.calls[0].params[1].programId, TOKEN_PROGRAM);
  assert.equal(fetchImpl.calls[1].params[1].programId, TOKEN_2022_PROGRAM);
  assert.equal(fetchImpl.calls[0].params[2].encoding, 'jsonParsed');

  assert.equal(tokens.accounts, 2);
  assert.equal(tokens.withBalance, 2);
  assert.equal(tokens.nftLike, 1);

  const usdc = tokens.holdings.find((h) => h.mint === USDC);
  assert.equal(usdc.symbol, 'USDC');
  assert.equal(usdc.uiAmount, '1234.5');
  assert.equal(usdc.program, 'token');

  const nft = tokens.holdings.find((h) => h.mint === MINT_C);
  assert.equal(nft.program, 'token-2022');
});

test('fetchTokens rejects responses with an unexpected shape', async () => {
  const badResults = [
    { context: { slot: 1 }, value: 'nope' },
    { context: { slot: 1 }, value: [{ pubkey: 'x', account: { data: ['', 'base64'] } }] },
    { context: { slot: 1 }, value: [account(MINT_A, '12.5', 6)] },
  ];

  for (const result of badResults) {
    const fetchImpl = createMockRpc({ getTokenAccountsByOwner: { result } });
    await assert.rejects(fetchTokens(ENDPOINT, ADDRESS, { fetchImpl }), (err) => {
      assert.equal(err.code, 'bad-response');
      assert.doesNotMatch(err.message, /secret-key-123/);
      return true;
    });
  }
});

test('tokenRows handles no accounts, empty balances and a single account', () => {
  assert.deepEqual(tokenRows(summarizeTokenAccounts([])), [['Tokens', 'none']]);

  assert.deepEqual(tokenRows(summarizeTokenAccounts([parsed(MINT_A, 0, 6)])), [
    ['Tokens', '0 with a balance (1 token account)'],
  ]);

  assert.deepEqual(tokenRows(summarizeTokenAccounts([parsed(MINT_A, 5, 0)])), [
    ['Tokens', '1 with a balance (1 token account)'],
    ['', `5  ${MINT_A}`],
  ]);
});

test('tokenRows lists known symbols, aligns amounts and counts NFT-like tokens', () => {
  const rows = tokenRows(
    summarizeTokenAccounts([
      parsed(USDC, '1234500000', 6),
      parsed(MINT_B, 25, 0),
      parsed(MINT_C, 1, 0),
    ]),
  );

  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], ['Tokens', '3 with a balance (3 token accounts, 1 NFT-like)']);
  assert.deepEqual(rows[1], ['', '1234.5  USDC']);
  assert.deepEqual(rows[2], ['', `    25  ${MINT_B}`]);
});

test('tokenRows shows the top 10 and says how many more there are', () => {
  const accounts = [];
  for (let i = 0; i < 12; i++) accounts.push(parsed(`Mint${i}`, i + 2, 0));

  const rows = tokenRows(summarizeTokenAccounts(accounts));

  assert.equal(rows.length, 12);
  assert.deepEqual(rows[0], ['Tokens', '12 with a balance (12 token accounts)']);
  assert.deepEqual(rows[11], ['', '+2 more (use --json for all)']);
});