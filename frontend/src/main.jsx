const React = window.React;
const ReactDOM = window.ReactDOM;
const h = React.createElement;

import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  h(React.StrictMode, null, h(App))
);
