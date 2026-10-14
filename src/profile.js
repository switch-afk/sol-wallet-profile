'use strict';

const { rpcCall, RpcError, hostLabel } = require('./rpc');
const { activityRows } = require('./activity');
const { tokenRows } = require('./tokens');

const SYSTEM_PROGRAM = '11111111111111111111111111111111';

const KNOWN_OWNERS = {
  [SYSTEM_PROGRAM]: 'System Program',
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: 'Token Program',
  TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: 'Token-2022 Program',
  BPFLoaderUpgradeab1e11111111111111111111111: 'BPF Upgradeable Loader',
  Stake11111111111111111111111111111111111111: 'Stake Program',
  Vote111111111111111111111111111111111111111: 'Vote Program',
};

const LAMPORTS_PER_SOL = 1000000000n;

// Exact lamports -> SOL string, no floating point. Trailing zeros are trimmed.
function formatSol(lamports) {
  const total = BigInt(lamports);
  const whole = total / LAMPORTS_PER_SOL;
  const frac = (total % LAMPORTS_PER_SOL).toString().padStart(9, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

function kindOf(owner, executable) {
  if (executable) return 'program';
  if (owner === SYSTEM_PROGRAM) return 'wallet';
  return 'data account';
}

function badResponse(endpoint) {
  return new RpcError(`${hostLabel(endpoint)} returned an unexpected account response.`, {
    code: 'bad-response',
  });
}

async function fetchProfile(endpoint, address, options = {}) {
  const result = await rpcCall(
    endpoint,
    'getAccountInfo',
    [address, { encoding: 'base64', dataSlice: { offset: 0, length: 0 }, commitment: 'confirmed' }],
    options,
  );

  if (!result || typeof result !== 'object' || !('value' in result)) {
    throw badResponse(endpoint);
  }

  const value = result.value;

  // A null value means the account does not exist (never funded, or closed).
  if (value === null) {
    return {
      address,
      exists: false,
      lamports: 0,
      sol: '0',
      kind: 'unfunded',
      owner: null,
      ownerLabel: null,
      executable: false,
      dataSize: null,
    };
  }

  if (
    typeof value !== 'object' ||
    typeof value.lamports !== 'number' ||
    !Number.isInteger(value.lamports) ||
    value.lamports < 0 ||
    typeof value.owner !== 'string'
  ) {
    throw badResponse(endpoint);
  }

  const executable = value.executable === true;

  return {
    address,
    exists: true,
    lamports: value.lamports,
    sol: formatSol(value.lamports),
    kind: kindOf(value.owner, executable),
    owner: value.owner,
    ownerLabel: KNOWN_OWNERS[value.owner] || null,
    executable,
    dataSize: typeof value.space === 'number' ? value.space : null,
  };
}

function row(label, value) {
  return `${label.padEnd(9)}${value}`;
}

function renderText(profile, now = Date.now()) {
  const lines = [row('Address', profile.address)];

  if (!profile.exists) {
    lines.push(row('Balance', '0 SOL'));
    lines.push(row('Status', 'not found on chain (never funded, or closed)'));
  } else {
    lines.push(row('Balance', `${profile.sol} SOL (${profile.lamports} lamports)`));
    lines.push(row('Type', profile.kind));
    lines.push(
      row('Owner', profile.ownerLabel ? `${profile.ownerLabel} (${profile.owner})` : profile.owner),
    );
    if (profile.dataSize !== null) lines.push(row('Data', `${profile.dataSize} bytes`));
  }

  if (profile.activity) {
    for (const [label, value] of activityRows(profile.activity, now)) {
      lines.push(row(label, value));
    }
  }

  if (profile.tokens) {
    for (const [label, value] of tokenRows(profile.tokens)) {
      lines.push(row(label, value));
    }
  }

  return lines.join('\n');
}

module.exports = { fetchProfile, formatSol, kindOf, renderText, SYSTEM_PROGRAM };