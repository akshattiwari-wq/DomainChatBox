const React = window.React;
const h = React.createElement;
const { useEffect, useState } = React;

import { apiFetch } from '../lib/api.js';

function ChatBox({ files, filesVersion }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    if (!files.length) {
      setMessages([]);
      return;
    }

    refreshHistory();
  }, [filesVersion, files.length]);

  async function refreshHistory() {
    try {
      const response = await apiFetch('/api/query/history');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unable to load chat history.');
      }

      setMessages(data.messages || []);
      setError(null);
    } catch {
      setMessages([]);
      setError('Unable to load chat history. Check that the backend is running.');
    }
  }

  async function sendMessage(event) {
    event.preventDefault();

    const question = input.trim();
    if (!question || isSending) return;

    const userMessage = { role: 'user', content: question };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setError(null);
    setIsSending(true);

    try {
      const response = await apiFetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });

      const data = await response.json();
      if (!response.ok) {
        const answer = data.answer || data.error || 'Unable to process question';
        setMessages((prev) => [...prev, { role: 'assistant', content: answer, status: 'invalid' }]);
        setError(answer);
        return;
      }

      await refreshHistory();
    } catch {
      setError('Unable to process question. Check that the backend is running.');
    } finally {
      setIsSending(false);
    }
  }

  async function handleClearHistory() {
    if (isClearing) return;
    setIsClearing(true);
    setError(null);

    try {
      const response = await apiFetch('/api/query/history', {
        method: 'DELETE',
      });
      const data = await response.json();
      if (response.ok) {
        setMessages([]);
        setInput('');
      } else {
        setError(data.error || 'Could not clear chat history.');
      }
    } catch {
      setError('Could not clear chat history. Check that the backend is running.');
    } finally {
      setIsClearing(false);
    }
  }

  return h(
    'div',
    { className: 'chat-box' },
    h(
      'div',
      { className: 'panel-heading' },
      h('div', null, h('h2', null, 'Chat'), h('p', null, `${messages.length} messages`)),
      h(
        'button',
        {
          className: 'ghost-button',
          type: 'button',
          onClick: handleClearHistory,
          disabled: isClearing || messages.length === 0,
        },
        isClearing ? 'Clearing...' : 'Start new chat'
      )
    ),
    h(
      'div',
      { className: 'chat-history' },
      messages.map((message, index) =>
        h(
          'div',
          { key: index, className: `chat-message ${message.role} ${message.status || ''}` },
          h('span', { className: 'role' }, message.role),
          h('span', null, message.content || message.message)
        )
      )
    ),
    error ? h('div', { className: 'chat-error' }, error) : null,
    !files.length
      ? h(
          'div',
          { className: 'chat-hint' },
          'Upload a document to start a new chat and ask questions from your files.'
        )
      : null,
    h(
      'form',
      { className: 'chat-input-row', onSubmit: sendMessage },
      h('input', {
        type: 'text',
        value: input,
        onChange: (e) => setInput(e.target.value),
        placeholder: files.length
          ? 'Ask a question about the uploaded documents'
          : 'Upload documents first',
        disabled: isSending || files.length === 0,
      }),
      h('button', { type: 'submit', disabled: isSending || files.length === 0 }, isSending ? 'Sending' : 'Send')
    )
  );
}

export default ChatBox;
