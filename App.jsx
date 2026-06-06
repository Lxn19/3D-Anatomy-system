import React, { useState, useRef, useEffect } from 'react';
import './App.css';

export default function App() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: 'Hello! I am your Anatomy Intelligent Assistant. How can I help you today with the 3D models?'
    }
  ]);
  const [input,        setInput]        = useState('');
  const [loading,      setLoading]      = useState(false);
  const [selectedOrgan, setSelectedOrgan] = useState('Heart');
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userText = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setLoading(true); 

    try {
      const response = await fetch('http://localhost:5000/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          question:       userText,
          currentContext: selectedOrgan
        }),
      });

      const data = await response.json();

      if (data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', text: data.reply }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', text: 'Could not get a clear response.' }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Sorry, faced a problem connecting to the server.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex', padding: '20px', gap: '20px',
      height: '90vh', fontFamily: 'sans-serif', direction: 'ltr'
    }}>
      {/* 3D Model Viewport Area */}
      <div style={{
        flex: 1, background: '#f0f2f5', borderRadius: '12px',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        border: '2px dashed #ccc'
      }}>
        <h3 style={{ color: '#666' }}>[ 3D Model Viewport Area ]</h3>
        <p style={{ fontSize: '16px' }}>
          Current Active Organ:{' '}
          <strong style={{ color: '#007bff' }}>{selectedOrgan}</strong>
        </p>
        <button
          onClick={() => setSelectedOrgan('Stomach')}
          style={{
            padding: '10px 15px', backgroundColor: '#28a745',
            color: 'white', border: 'none', borderRadius: '6px',
            cursor: 'pointer', fontWeight: 'bold'
          }}
        >
          Simulate Selecting Another Organ (Stomach)
        </button>
      </div>

      {/* Chat Bot Interface */}
      <div style={{
        border: '1px solid #ddd', borderRadius: '12px', width: '380px',
        display: 'flex', flexDirection: 'column', backgroundColor: '#fff',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
      }}>
        {/* Header */}
        <div style={{
          padding: '15px', backgroundColor: '#007bff', color: 'white',
          borderTopLeftRadius: '11px', borderTopRightRadius: '11px', fontWeight: 'bold'
        }}>
          <span>🤖 Anatomy AI Assistant (MEU)</span>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1, padding: '15px', overflowY: 'auto',
          backgroundColor: '#f8f9fa', display: 'flex',
          flexDirection: 'column', gap: '12px'
        }}>
          {messages.map((msg, index) => (
            <div
              key={index}
              style={{
                alignSelf:       msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth:        '85%',
                padding:         '10px 14px',
                borderRadius:    '12px',
                backgroundColor: msg.role === 'user' ? '#007bff' : '#ffffff',
                color:           msg.role === 'user' ? 'white' : '#333',
                border:          msg.role === 'user' ? 'none' : '1px solid #eee',
                whiteSpace:      'pre-line'
              }}
            >
              {msg.text}
            </div>
          ))}
          {loading && (
            <div style={{ fontSize: '13px', color: '#666', fontStyle: 'italic' }}>
              Analyzing question...
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <form
          onSubmit={sendMessage}
          style={{
            display: 'flex', padding: '12px',
            borderTop: '1px solid #eee', gap: '8px'
          }}
        >
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about organ functions..."
            style={{
              flex: 1, padding: '10px',
              border: '1px solid #ccc', borderRadius: '6px', outline: 'none'
            }}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '10px 18px', backgroundColor: '#007bff',
              color: 'white', border: 'none', borderRadius: '6px',
              cursor: 'pointer', fontWeight: 'bold'
            }}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}