import { useEffect, useState } from 'react';

function ChatBox({ files, historyVersion }) {
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

    fetch('/api/query/history')
      .then((res) => res.json())
      .then((data) => {
        setMessages(data.messages || []);
        setError(null);
      })
      .catch(() => setError('Unable to load chat history.'));
  }, [historyVersion, files.length]);

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
      const response = await fetch('/api/query', {
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

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.answer, status: data.status },
      ]);
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
      const response = await fetch('/api/query/history', {
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

  return (
    <div className="chat-box">
      <div className="panel-heading">
        <div>
          <h2>Chat</h2>
          <p>{messages.length} messages</p>
        </div>
        <button className="ghost-button" type="button" onClick={handleClearHistory} disabled={isClearing || messages.length === 0}>
          {isClearing ? 'Clearing...' : 'Start new chat'}
        </button>
      </div>

      <div className="chat-history">
        {messages.map((message, index) => (
          <div key={index} className={`chat-message ${message.role} ${message.status || ''}`}>
            <span className="role">{message.role}</span>
            <span>{message.content || message.message}</span>
          </div>
        ))}
      </div>

      {error && <div className="chat-error">{error}</div>}
      {!files.length && (
        <div className="chat-hint">Upload a document to start a new chat and ask questions from your files.</div>
      )}

      <form className="chat-input-row" onSubmit={sendMessage}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={files.length ? 'Ask a question about the uploaded documents' : 'Upload documents first'}
          disabled={isSending || files.length === 0}
        />
        <button type="submit" disabled={isSending || files.length === 0}>
          {isSending ? 'Sending' : 'Send'}
        </button>
      </form>
    </div>
  );
}

export default ChatBox;
