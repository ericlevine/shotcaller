// Forward uncaught browser errors to the server log (logs/server.log, event "client.error").
(() => {
  const send = (kind, message, stack, where) => {
    try {
      const body = JSON.stringify({ kind, message: String(message || ''), stack: stack || '', where: where || '' });
      navigator.sendBeacon ? navigator.sendBeacon('/api/client-log', new Blob([body], { type: 'application/json' }))
        : fetch('/api/client-log', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true });
    } catch {}
  };
  addEventListener('error', (e) => send('error', e.message, e.error && e.error.stack, `${e.filename}:${e.lineno}:${e.colno}`));
  addEventListener('unhandledrejection', (e) => {
    const r = e.reason || {};
    if (r.name === 'AbortError' || r.code === 'cancelled') return;
    send('unhandledrejection', r.message || JSON.stringify(r), r.stack);
  });
})();
