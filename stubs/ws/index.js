// Stub for the 'ws' Node.js module — not available in React Native.
// Supabase's realtime-js pulls in the 'websocket' npm package which depends on 'ws'.
// Metro bundles the Node.js version (not the browser entry), so we block 'ws' entirely.
module.exports = {};
