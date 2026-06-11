import { useEffect, useState } from 'react';
import ChatBox from './components/ChatBox.jsx';
import FileUpload from './components/FileUpload.jsx';

function App() {
  const [files, setFiles] = useState([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    fetch('/api/files')
      .then((res) => res.json())
      .then((data) => {
        setFiles(data.files || []);
        setLoadError(null);
      })
      .catch(() => setLoadError('Unable to load uploaded files.'));
  }, []);

  function handleFilesChange(nextFiles) {
    setFiles(nextFiles || []);
    if (!nextFiles || nextFiles.length === 0) {
      setHistoryVersion((version) => version + 1);
    }
  }

  return (
    <div className="app-shell">
      <header>
        <h1>Document Chat Assistant</h1>
        <p>Persistent chat grounded in your uploaded documents.</p>
      </header>

      {loadError && <div className="app-error">{loadError}</div>}

      <main>
        <section className="upload-panel">
          <FileUpload files={files} onFilesChange={handleFilesChange} />
        </section>
        <section className="chat-panel">
          <ChatBox files={files} historyVersion={historyVersion} />
        </section>
      </main>
    </div>
  );
}

export default App;
