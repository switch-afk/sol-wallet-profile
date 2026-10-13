'use strict';

function respond(status, bodyText) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => bodyText,
  };
}

// routes: { [method]: route }
// A route is a descriptor, a function (params, callNumber) => descriptor,
// or an array of descriptors used in order (the last one repeats).
// Descriptors: { result } | { error } | { status, text } | { text } | { throw }
function createMockRpc(routes = {}) {
  const calls = [];
  const counts = {};

  async function mockFetch(url, init = {}) {
    const body = JSON.parse(init.body);
    const n = counts[body.method] || 0;
    counts[body.method] = n + 1;
    calls.push({ url, method: body.method, params: body.params, headers: init.headers });

    let route = routes[body.method];
    if (Array.isArray(route)) route = route[Math.min(n, route.length - 1)];
    if (typeof route === 'function') route = route(body.params, n);

    if (route === undefined) {
      return respond(200, JSON.stringify({
        jsonrpc: '2.0',
        id: body.id,
        error: { code: -32601, message: 'Method not found' },
      }));
    }

    if (route.throw) throw route.throw;
    if (route.status) return respond(route.status, route.text || '');
    if (route.text !== undefined) return respond(200, route.text);
    if (route.error) {
      return respond(200, JSON.stringify({ jsonrpc: '2.0', id: body.id, error: route.error }));
    }
    return respond(200, JSON.stringify({ jsonrpc: '2.0', id: body.id, result: route.result }));
  }

  mockFetch.calls = calls;
  return mockFetch;
}

module.exports = { createMockRpc };