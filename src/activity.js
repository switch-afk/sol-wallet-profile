'use strict';

const { rpcCall, RpcError, hostLabel } = require('./rpc');

const SIGNATURE_LIMIT = 100;

function badResponse(endpoint) {
  return new RpcError(`${hostLabel(endpoint)} returned an unexpected transaction list.`, {
    code: 'bad-response',
  });
}

function toIso(seconds) {
  return new Date(seconds * 1000).toISOString();
}

// '2026-10-13T09:12:45.000Z' -> '2026-10-13 09:12 UTC'
function formatUtc(iso) {
  return iso.slice(0, 16).replace('T', ' ') + ' UTC';
}

function formatAge(iso, nowMs = Date.now()) {
  const diff = Math.floor(nowMs / 1000) - Math.floor(Date.parse(iso) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// If fewer signatures come back than the limit, that is the wallet's whole history.
function summarizeSignatures(signatures, limit = SIGNATURE_LIMIT) {
  const times = signatures.map((s) => s.blockTime).filter((t) => typeof t === 'number');

  return {
    checked: signatures.length,
    limit,
    complete: signatures.length < limit,
    failed: signatures.filter((s) => s.err !== null && s.err !== undefined).length,
    lastSeen: times.length > 0 ? toIso(Math.max(...times)) : null,
    firstSeen: times.length > 0 ? toIso(Math.min(...times)) : null,
  };
}

async function fetchActivity(endpoint, address, options = {}) {
  const result = await rpcCall(
    endpoint,
    'getSignaturesForAddress',
    [address, { limit: SIGNATURE_LIMIT, commitment: 'confirmed' }],
    options,
  );

  if (
    !Array.isArray(result) ||
    result.some((s) => !s || typeof s !== 'object' || typeof s.signature !== 'string')
  ) {
    throw badResponse(endpoint);
  }

  return summarizeSignatures(result, SIGNATURE_LIMIT);
}

// Returns [label, value] pairs; profile.js owns the layout.
function activityRows(activity, now = Date.now()) {
  if (activity.checked === 0) return [['Activity', 'no transactions found']];

  const rows = [
    [
      'Activity',
      activity.complete
        ? `${activity.checked} transactions (full history)`
        : `${activity.checked}+ transactions`,
    ],
  ];

  if (activity.lastSeen) {
    rows.push(['Last tx', `${formatUtc(activity.lastSeen)} (${formatAge(activity.lastSeen, now)})`]);
  }

  if (activity.firstSeen) {
    rows.push([
      'First tx',
      activity.complete
        ? formatUtc(activity.firstSeen)
        : `${formatUtc(activity.firstSeen)} (oldest of the latest ${activity.limit})`,
    ]);
  }

  if (activity.failed > 0) rows.push(['Failed', `${activity.failed} of ${activity.checked}`]);

  return rows;
}

module.exports = {
  fetchActivity,
  summarizeSignatures,
  activityRows,
  formatUtc,
  formatAge,
  SIGNATURE_LIMIT,
};