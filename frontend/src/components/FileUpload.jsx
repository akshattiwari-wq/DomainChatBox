import { useEffect, useRef, useState } from 'react';

function FileUpload({ files, onFilesChange }) {
  const [error, setError] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const inputRef = useRef(null);

  async function handleUpload(event) {
    const fileList = Array.from(event.target.files);
    if (fileList.length === 0) return;

    if (files.length + fileList.length > 3) {
      setError('You can upload a maximum of 3 files at once.');
      resetInput();
      return;
    }

    const formData = new FormData();
    fileList.forEach((file) => formData.append('documents', file));

    setIsUploading(true);
    setError(null);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Upload failed');
        return;
      }

      onFilesChange(data.files || []);
    } catch {
      setError('Upload failed. Check that the backend is running.');
    } finally {
      setIsUploading(false);
      resetInput();
    }
  }

  async function handleDelete(fileId) {
    setError(null);

    try {
      const response = await fetch(`/api/files/${fileId}`, { method: 'DELETE' });
      const data = await response.json();
      if (response.ok) {
        onFilesChange(data.files || []);
      } else {
        setError(data.error || 'Delete failed');
      }
    } catch {
      setError('Delete failed. Check that the backend is running.');
    }
  }

  async function fetchStatus() {
    try {
      const response = await fetch('/api/files/status');
      const data = await response.json();
      if (response.ok) {
        setStatus(data);
        setStatusError(null);
      } else {
        setStatus(null);
        setStatusError(data.error || 'Could not retrieve file status.');
      }
    } catch {
      setStatus(null);
      setStatusError('Could not retrieve file status. Check backend connectivity.');
    }
  }

  async function handleDeleteAll() {
    setError(null);

    try {
      const response = await fetch('/api/files', { method: 'DELETE' });
      const data = await response.json();
      if (response.ok) {
        onFilesChange(data.files || []);
      } else {
        setError(data.error || 'Delete failed');
      }
    } catch {
      setError('Delete failed. Check that the backend is running.');
    }
  }

  function resetInput() {
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }

  useEffect(() => {
    fetchStatus();
  }, [files.length]);

  return (
    <div className="file-upload">
      <div className="panel-heading">
        <div>
          <h2>Documents</h2>
          <p>{files.length}/3 uploaded</p>
        </div>
        <div className="file-actions">
          {files.length > 0 && (
            <button className="ghost-button" type="button" onClick={handleDeleteAll}>
              Delete all
            </button>
          )}
          <button className="ghost-button" type="button" onClick={fetchStatus}>
            Refresh status
          </button>
        </div>
      </div>

      <label className={`file-upload-label ${isUploading ? 'is-disabled' : ''}`}>
        <span>{isUploading ? 'Uploading...' : 'Choose files'}</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.csv,.txt,.md,.json"
          onChange={handleUpload}
          disabled={isUploading || files.length >= 3}
        />
      </label>

      {error && <div className="upload-error">{error}</div>}
      {status && (
        <div className="file-status">
          <span>
            {status.fileCount} file{status.fileCount === 1 ? '' : 's'} uploaded, {status.availableSlots}{' '}
            slot{status.availableSlots === 1 ? '' : 's'} available.
          </span>
          <span>{status.chatCount} chat message{status.chatCount === 1 ? '' : 's'} stored.</span>
        </div>
      )}
      {statusError && <div className="upload-error">{statusError}</div>}

      <div className="uploaded-file-list">
        {files.length === 0 ? (
          <p>No files uploaded yet. Use the button above to choose files and start a new chat.</p>
        ) : (
          files.map((file) => (
            <div key={file.id} className="uploaded-file-item">
              <div>
                <span>{file.filename}</span>
                {file.size_bytes && <small>{formatBytes(file.size_bytes)}</small>}
              </div>
              <button type="button" onClick={() => handleDelete(file.id)}>
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default FileUpload;
