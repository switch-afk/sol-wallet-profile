'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  fetchActivity,
  summarizeSignatures,
  activityRows,
  formatUtc,
  formatAge,
} = require('../src/activity');
const { createMockRpc } = require('./helpers/mock-rpc');

const ENDPOINT = 'https://rpc.example.com/secret-key-123';
const ADDRESS = 'So11111111111111111111111111111111111111112';

const NEWEST = 1760000000;
const MIDDLE = 1750000000;
const OLDEST = 1740000000;

function sig(n, blockTime, err = null) {
  return {
    signature: `sig${n}`,
    slot: n,
    err,
    memo: null,
    blockTime,
    confirmationStatus: 'confirmed',
  };
}

function isoOf(seconds) {
  return new Date(seconds * 1000).toISOString();
}

test('formatUtc and formatAge are readable', () => {
  const iso = '2026-10-13T09:12:45.000Z';
  const at = Date.parse(iso);
  assert.equal(formatUtc(iso), '2026-10-13 09:12 UTC');
  assert.equal(formatAge(iso, at + 30 * 1000), 'just now');
  assert.equal(formatAge(iso, at + 5 * 60 * 1000), '5m ago');
  assert.equal(formatAge(iso, at + 3 * 3600 * 1000), '3h ago');
  assert.equal(formatAge(iso, at + 2 * 86400 * 1000), '2d ago');
  assert.equal(formatAge(iso, at - 60 * 1000), 'just now');
});

test('summarizeSignatures describes a complete history', () => {
  const summary = summarizeSignatures(
    [sig(3, NEWEST), sig(2, MIDDLE, { InstructionError: [0, 'Custom'] }), sig(1, OLDEST)],
    100,
  );
  assert.equal(summary.checked, 3);
  assert.equal(summary.complete, true);
  assert.equal(summary.failed, 1);
  assert.equal(summary.lastSeen, isoOf(NEWEST));
  assert.equal(summary.firstSeen, isoOf(OLDEST));
});

test('summarizeSignatures marks the history as partial when the limit is reached', () => {
  const sigs = [];
  for (let i = 0; i < 5; i++) sigs.push(sig(i, NEWEST - i * 100));
  const summary = summarizeSignatures(sigs, 5);
  assert.equal(summary.checked, 5);
  assert.equal(summary.complete, false);
});

test('summarizeSignatures copes with missing block times', () => {
  const some = summarizeSignatures([sig(2, null), sig(1, OLDEST)], 100);
  assert.equal(some.lastSeen, isoOf(OLDEST));
  assert.equal(some.firstSeen, isoOf(OLDEST));

  const none = summarizeSignatures([sig(1, null)], 100);
  assert.equal(none.lastSeen, null);
  assert.equal(none.firstSeen, null);
});

test('summarizeSignatures handles a wallet with no transactions', () => {
  const summary = summarizeSignatures([], 100);
  assert.equal(summary.checked, 0);
  assert.equal(summary.complete, true);
  assert.equal(summary.failed, 0);
  assert.equal(summary.lastSeen, null);
});

test('fetchActivity asks for the latest 100 signatures and summarizes them', async () => {
  const fetchImpl = createMockRpc({
    getSignaturesForAddress: { result: [sig(2, NEWEST), sig(1, OLDEST)] },
  });

  const activity = await fetchActivity(ENDPOINT, ADDRESS, { fetchImpl });

  assert.equal(activity.checked, 2);
  assert.equal(activity.complete, true);
  assert.equal(activity.limit, 100);
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].method, 'getSignaturesForAddress');
  assert.equal(fetchImpl.calls[0].params[0], ADDRESS);
  assert.equal(fetchImpl.calls[0].params[1].limit, 100);
});

test('fetchActivity rejects responses with an unexpected shape', async () => {
  const notAnArray = createMockRpc({ getSignaturesForAddress: { result: { nope: true } } });
  await assert.rejects(fetchActivity(ENDPOINT, ADDRESS, { fetchImpl: notAnArray }), (err) => {
    assert.equal(err.code, 'bad-response');
    assert.doesNotMatch(err.message, /secret-key-123/);
    return true;
  });

  const badItem = createMockRpc({ getSignaturesForAddress: { result: [{ slot: 1 }] } });
  await assert.rejects(fetchActivity(ENDPOINT, ADDRESS, { fetchImpl: badItem }), (err) => {
    assert.equal(err.code, 'bad-response');
    return true;
  });
});

test('activityRows shows a complete history', () => {
  const activity = summarizeSignatures([sig(2, NEWEST), sig(1, OLDEST)], 100);
  const now = NEWEST * 1000 + 2 * 3600 * 1000;
  const rows = activityRows(activity, now);
  assert.deepEqual(rows[0], ['Activity', '2 transactions (full history)']);
  assert.equal(rows[1][0], 'Last tx');
  assert.match(rows[1][1], /UTC \(2h ago\)$/);
  assert.equal(rows[2][0], 'First tx');
  assert.doesNotMatch(rows[2][1], /oldest of the latest/);
});

test('activityRows shows a partial history honestly', () => {
  const sigs = [];
  for (let i = 0; i < 3; i++) sigs.push(sig(i, NEWEST - i * 100));
  const activity = summarizeSignatures(sigs, 3);
  const rows = activityRows(activity, NEWEST * 1000);
  assert.deepEqual(rows[0], ['Activity', '3+ transactions']);
  assert.match(rows[2][1], /\(oldest of the latest 3\)$/);
});

test('activityRows covers an empty wallet and failed transactions', () => {
  assert.deepEqual(activityRows(summarizeSignatures([], 100)), [
    ['Activity', 'no transactions found'],
  ]);

  const withFailures = summarizeSignatures([sig(2, NEWEST, { err: 1 }), sig(1, OLDEST)], 100);
  const rows = activityRows(withFailures, NEWEST * 1000);
  assert.deepEqual(rows[rows.length - 1], ['Failed', '1 of 2']);
});