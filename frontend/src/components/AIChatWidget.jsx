// =============================================================================
// AIChatWidget.jsx — AI Anatomy Chat Interface
// Replaces Member 4's App.jsx which contained a critical crash bug.
//
// BUGS FIXED (Member 4 App.jsx):
//   1. `loading(true)` called instead of `setLoading(true)` — calling a boolean
//      as a function throws a TypeError and crashes the component on every send.
//   2. Server hard-coded to localhost:5000 — updated to use REACT_APP_API_URL
//      env var with a fallback, matching the backend's PORT 3001.
//   3. No JWT token attached to requests — AI endpoint requires Authorization
//      header. Token is read from localStorage (set by SearchBar's auth flow).
//   4. Mock server.js replaced by proper aiRoutes.js — no changes needed here.
//
// INTEGRATION (Member 3 → Member 4):
//   `prefilledOrgan` prop accepts an organ object from SearchBar.jsx.
//   When the user selects an organ from search, the chat input is pre-filled
//   with "Tell me about the <organ name>" and focused automatically.
// =============================================================================

import { useState, useEffect, useRef } from 'react';
import useChatStore from '../store/useChatStore';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const QUICK_PROMPTS = [
    'What does the heart do?',
    'Explain the nervous system',
    'How do bones grow?',
    'What is the largest organ?',
    'Describe blood circulation',
];

/**
 * @param {{ prefilledOrgan?: { name: string, system: string } }} props
 *   prefilledOrgan — organ object passed from SearchBar when user selects a result.
 */
export default function AIChatWidget({ prefilledOrgan }) {
    const [input, setInput]     = useState('');
    const messagesEndRef        = useRef(null);
    const inputRef              = useRef(null);
    const store                 = useChatStore();

    // Pre-fill input when an organ is selected from the search bar (Member 3 integration)
    useEffect(() => {
        if (prefilledOrgan) {
            setInput(`Tell me about the ${prefilledOrgan.name}`);
            inputRef.current?.focus();
        }
    }, [prefilledOrgan]);

    // Auto-scroll to the latest message
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [store.messages, store.streamingContent]);

    const sendMessage = async (messageText) => {
        const text = (messageText || input).trim();
        if (!text || store.isLoading || store.isStreaming) return;

        setInput('');
        store.addUserMessage(text);
        store.setLoading(true);   // FIX: was `loading(true)` (crash bug)

        try {
            const token = localStorage.getItem('accessToken');

            const response = await fetch(`${API_BASE}/api/ai/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type':  'application/json',
                    // FIX: JWT now attached — required by verifyToken middleware
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ message: text, history: store.apiHistory }),
            });

            if (!response.ok) throw new Error(`API error ${response.status}`);

            const reader  = response.body.getReader();
            const decoder = new TextDecoder();

            store.startStreaming();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.delta) store.appendStreamChunk(data.delta);
                        if (data.done)  store.finalizeStream();
                        if (data.error) store.setError(data.error);
                    } catch { /* incomplete SSE chunk — ignore */ }
                }
            }

        } catch (err) {
            store.setError('Connection failed. Please try again.');
        } finally {
            store.setLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <div className="chat-widget">

            {/* Header */}
            <div className="chat-header">
                <div className="chat-avatar">🧠</div>
                <div>
                    <h3 className="chat-title">Anatomy AI Assistant</h3>
                    <span className="chat-status">
                        {store.isStreaming ? 'Thinking…' : 'Online'}
                    </span>
                </div>
                <button className="chat-clear" onClick={store.clearHistory} title="Clear chat">
                    🗑
                </button>
            </div>

            {/* Messages */}
            <div className="chat-messages">

                {/* Welcome screen with quick prompts */}
                {store.messages.length === 0 && (
                    <div className="chat-welcome">
                        <p>👋 Hi! I'm your Anatomy AI Assistant. Ask me anything about the human body.</p>
                        <div className="quick-prompts">
                            {QUICK_PROMPTS.map((q, i) => (
                                <button
                                    key={i}
                                    className="quick-prompt-btn"
                                    onClick={() => sendMessage(q)}
                                >
                                    {q}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Message history */}
                {store.messages.map((msg) => (
                    <div key={msg.id} className={`chat-msg ${msg.role}`}>
                        {msg.role === 'assistant' && <span className="msg-avatar">🧬</span>}
                        <div className={`msg-bubble ${msg.role}`}>
                            <p>{msg.content}</p>
                            <span className="msg-time">
                                {new Date(msg.timestamp).toLocaleTimeString([], {
                                    hour:   '2-digit',
                                    minute: '2-digit',
                                })}
                            </span>
                        </div>
                        {msg.role === 'user' && <span className="msg-avatar">👤</span>}
                    </div>
                ))}

                {/* Streaming response (word-by-word) */}
                {store.isStreaming && (
                    <div className="chat-msg assistant">
                        <span className="msg-avatar">🧬</span>
                        <div className="msg-bubble assistant streaming">
                            <p>{store.streamingContent}<span className="cursor-blink">|</span></p>
                        </div>
                    </div>
                )}

                {/* Typing indicator (before first chunk arrives) */}
                {store.isLoading && !store.isStreaming && (
                    <div className="chat-msg assistant">
                        <span className="msg-avatar">🧬</span>
                        <div className="msg-bubble assistant typing">
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="chat-input-area">
                <textarea
                    ref={inputRef}
                    className="chat-input"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about any organ, system, or condition…"
                    rows={2}
                    disabled={store.isLoading || store.isStreaming}
                />
                <button
                    className={`chat-send-btn ${(!input.trim() || store.isLoading) ? 'disabled' : ''}`}
                    onClick={() => sendMessage()}
                    disabled={!input.trim() || store.isLoading || store.isStreaming}
                >
                    ➤
                </button>
            </div>
        </div>
    );
}
