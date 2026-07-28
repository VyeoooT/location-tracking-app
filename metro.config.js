const { getDefaultConfig } = require("@expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// --- Replace Node.js-only 'ws' module with empty stub ---
// Supabase → realtime-js → websocket → ws (native C++ addon)
// Metro doesn't respect the 'browser' field, so it loads the Node.js
// version of 'websocket' which requires 'ws'. We intercept 'ws' and
// return an empty stub — realtime-js falls back to native WebSocket.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  ws: path.join(__dirname, "stubs"),
};

module.exports = config;
