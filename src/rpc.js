'use strict';

const DEFAULT_RPC = 'https://api.mainnet-beta.solana.com';

const ENV_VAR = 'SOL_WALLET_PROFILE_RPC';

const OWN_RPC_HINT = `Use your own RPC: set ${ENV_VAR} or pass --rpc <url>.`;

class RpcError extends Error {
  constructor(message, { hint, code } = {}) {
    super(message);
    this.name = 'RpcError';
    this.hint = hint || null;
    this.code = code || null;
  }
}

function resolveEndpoint(rpcOption, env = process.env) {
  return rpcOption || env[ENV_VAR] || DEFAULT_RPC;
}

// Only the hostname is ever shown to the user: RPC URLs often carry API keys.
function hostLabel(endpoint) {
  try {
    return new URL(endpoint).hostname;
  } catch {
    return 'the RPC endpoint';
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rpcCall(endpoint, method, params = [], options = {}) {
  const {
    fetchImpl = globalThis.fetch,
    retries = 2,
    baseDelayMs = 500,
    sleepImpl = sleep,
  } = options;

  const host = hostLabel(endpoint);
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });

  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
    } catch {
      throw new RpcError(`Could not reach ${host}.`, {
        hint: 'Check your connection and the RPC URL.',
        code: 'network',
      });
    }

    if (res.status === 429) {
      if (attempt < retries) {
        await sleepImpl(baseDelayMs * 2 ** attempt);
        continue;
      }
      throw new RpcError(`${host} is rate-limiting requests (HTTP 429).`, {
        hint: OWN_RPC_HINT,
        code: 'rate-limit',
      });
    }

    const text = await res.text();

    if (!res.ok) {
      const rejected = res.status === 401 || res.status === 403;
      throw new RpcError(`${host} answered with HTTP ${res.status}.`, {
        hint: rejected ? OWN_RPC_HINT : null,
        code: 'http',
      });
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }

    if (!json || typeof json !== 'object') {
      throw new RpcError(`${host} returned a response that is not valid JSON-RPC.`, {
        code: 'bad-response',
      });
    }

    if (json.error) {
      const message = json.error.message || 'unknown error';
      throw new RpcError(`RPC error from ${host}: ${message} (code ${json.error.code}).`, {
        code: 'rpc',
      });
    }

    return json.result;
  }
}

module.exports = { rpcCall, resolveEndpoint, hostLabel, RpcError, DEFAULT_RPC, ENV_VAR };