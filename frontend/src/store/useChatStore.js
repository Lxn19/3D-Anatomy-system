// =============================================================================
// src/store/useChatStore.js
// Zustand chat state store — Member 4, no changes required.
// Moved to /store/ subfolder to match the import in AIChatWidget.jsx.
// =============================================================================

import { create } from 'zustand';

const useChatStore = create((set, get) => ({

    // ── State ──────────────────────────────────────────────────────────────
    messages:         [],   // [{ id, role, content, timestamp }]
    isLoading:        false,
    isStreaming:      false,
    streamingContent: '',

    // ── Actions ────────────────────────────────────────────────────────────

    addUserMessage: (content) => {
        const msg = {
            id:        Date.now(),
            role:      'user',
            content,
            timestamp: new Date().toISOString(),
        };
        set((state) => ({ messages: [...state.messages, msg] }));
        return msg;
    },

    startStreaming: () =>
        set({ isStreaming: true, isLoading: false, streamingContent: '' }),

    appendStreamChunk: (delta) =>
        set((state) => ({ streamingContent: state.streamingContent + delta })),

    finalizeStream: () => {
        const { streamingContent, messages } = get();
        if (!streamingContent) return;

        const aiMsg = {
            id:        Date.now(),
            role:      'assistant',
            content:   streamingContent,
            timestamp: new Date().toISOString(),
        };

        set({
            messages:         [...messages, aiMsg],
            isStreaming:      false,
            streamingContent: '',
        });
    },

    setLoading: (v)   => set({ isLoading: v }),

    setError: (msg) => {
        const errMsg = {
            id:        Date.now(),
            role:      'error',
            content:   msg,
            timestamp: new Date().toISOString(),
        };
        set((state) => ({
            messages:    [...state.messages, errMsg],
            isStreaming: false,
            isLoading:   false,
        }));
    },

    clearHistory: () =>
        set({ messages: [], streamingContent: '', isLoading: false, isStreaming: false }),

    // Formatted history for OpenAI API — role + content only
    get apiHistory() {
        return get().messages
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => ({ role: m.role, content: m.content }));
    },
}));

export default useChatStore;
