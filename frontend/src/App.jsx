const React = window.React;
const h = React.createElement;
const { useEffect, useState } = React;

import ChatBox from './components/ChatBox.jsx';
import FileUpload from './components/FileUpload.jsx';
import { apiFetch } from './lib/api.js';

function App() {
  const [files, setFiles] = useState([]);
  const [filesVersion, setFilesVersion] = useState(0);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    apiFetch('/api/files')
      .then((res) => res.json())
      .then((data) => {
        setFiles(data.files || []);
        setLoadError(null);
      })
      .catch(() => setLoadError('Unable to load uploaded files.'));
  }, [filesVersion]);

  function handleFilesChange(nextFiles) {
    setFiles(nextFiles || []);
    setFilesVersion((version) => version + 1);
  }

  return h(
    'div',
    { className: 'app-shell' },
    h(
      'header',
      null,
      h('h1', null, 'Document Chat Assistant'),
      h('p', null, 'Persistent chat grounded in your uploaded documents.')
    ),
    loadError ? h('div', { className: 'app-error' }, loadError) : null,
    h(
      'main',
      null,
      h(
        'section',
        { className: 'upload-panel' },
        h(FileUpload, { files, onFilesChange: handleFilesChange })
      ),
      h(
        'section',
        { className: 'chat-panel' },
        h(ChatBox, { files, filesVersion })
      )
    )
  );
}

export default App;
