const React = require('react');
const { View } = require('react-native');

const MOCK_METRICS = {
  insets: { top: 0, right: 0, bottom: 0, left: 0 },
  frame: { x: 0, y: 0, width: 320, height: 640 },
};

module.exports = {
  SafeAreaProvider: ({ children }) =>
    React.createElement(React.Fragment, null, children),
  SafeAreaView: ({ children, ...props }) =>
    React.createElement(View, props, children),
  SafeAreaInsetsContext: React.createContext(MOCK_METRICS.insets),
  SafeAreaFrameContext: React.createContext(MOCK_METRICS.frame),
  useSafeAreaInsets: () => MOCK_METRICS.insets,
  useSafeAreaFrame: () => MOCK_METRICS.frame,
  initialWindowMetrics: MOCK_METRICS,
};
