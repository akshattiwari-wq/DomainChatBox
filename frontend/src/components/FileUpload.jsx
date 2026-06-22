const React = window.React;
const h = React.createElement;
const { useEffect, useRef, useState } = React;

import { apiFetch } from '../lib/api.js';

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
      const response = await apiFetch('/api/upload', {
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
      const response = await apiFetch(`/api/files/${fileId}`, { method: 'DELETE' });
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
      const response = await apiFetch('/api/files/status');
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
      const response = await apiFetch('/api/files', { method: 'DELETE' });
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

  return h(
    'div',
    { className: 'file-upload' },
    h(
      'div',
      { className: 'panel-heading' },
      h('div', null, h('h2', null, 'Documents'), h('p', null, `${files.length}/3 uploaded`)),
      h(
        'div',
        { className: 'file-actions' },
        files.length > 0
          ? h(
              'button',
              { className: 'ghost-button', type: 'button', onClick: handleDeleteAll },
              'Delete all'
            )
          : null,
        h('button', { className: 'ghost-button', type: 'button', onClick: fetchStatus }, 'Refresh status')
      )
    ),
    h(
      'label',
      { className: `file-upload-label ${isUploading ? 'is-disabled' : ''}` },
      h('span', null, isUploading ? 'Uploading...' : 'Choose files'),
      h('input', {
        ref: inputRef,
        type: 'file',
        multiple: true,
        accept: '.pdf,.doc,.docx,.csv,.txt,.md,.json',
        onChange: handleUpload,
        disabled: isUploading || files.length >= 3,
      })
    ),
    error ? h('div', { className: 'upload-error' }, error) : null,
    status
      ? h(
          'div',
          { className: 'file-status' },
          h(
            'span',
            null,
            `${status.fileCount} file${status.fileCount === 1 ? '' : 's'} uploaded, ${status.availableSlots} slot${status.availableSlots === 1 ? '' : 's'} available.`
          ),
          h(
            'span',
            null,
            `${status.chatCount} chat message${status.chatCount === 1 ? '' : 's'} stored.`
          )
        )
      : null,
    statusError ? h('div', { className: 'upload-error' }, statusError) : null,
    h(
      'div',
      { className: 'uploaded-file-list' },
      files.length === 0
        ? h('p', null, 'No files uploaded yet. Use the button above to choose files and start a new chat.')
        : files.map((file) =>
            h(
              'div',
              { key: file.id, className: 'uploaded-file-item' },
              h(
                'div',
                null,
                h('span', null, file.filename),
                file.size_bytes ? h('small', null, formatBytes(file.size_bytes)) : null
              ),
              h(
                'button',
                { type: 'button', onClick: () => handleDelete(file.id) },
                'Delete'
              )
            )
          )
    )
  );
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default FileUpload;
