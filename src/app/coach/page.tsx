'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Loader2, Brain, AlertTriangle } from 'lucide-react';

export default function CoachPage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: conversationsData } = useQuery({
    queryKey: ['coach-conversations'],
    queryFn: async () => {
      const res = await fetch('/api/coach');
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  const { data: conversationData, isLoading: messagesLoading } = useQuery({
    queryKey: ['coach-messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return null;
      const res = await fetch(`/api/coach?conversationId=${conversationId}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: !!conversationId,
  });

  const chatMutation = useMutation({
    mutationFn: async (msg: string) => {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, message: msg }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to get response');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setConversationId(data.conversationId);
      queryClient.invalidateQueries({ queryKey: ['coach-messages', data.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['coach-conversations'] });
    },
  });

  const handleSend = () => {
    if (message.trim() && !chatMutation.isPending) {
      chatMutation.mutate(message.trim());
      setMessage('');
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationData]);

  const messages = conversationData?.conversation?.messages ?? [];
  const conversations = conversationsData?.conversations ?? [];

  return (
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 64px - env(safe-area-inset-bottom))' }}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
        <div className="flex items-center gap-2">
          <Brain size={20} style={{ color: 'var(--color-accent)' }} />
          <h1 className="text-xl font-bold">Coach</h1>
        </div>
        {!conversationId && conversations.length > 0 && (
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
            {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {!conversationId && messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 py-8">
            <Brain size={40} style={{ color: 'var(--color-text-tertiary)', opacity: 0.3 }} />
            <div>
              <p className="font-semibold text-base mb-1 text-white">
                What&apos;s on your mind today, Chirag?
              </p>
              <p className="text-xs max-w-sm text-zinc-400 leading-relaxed">
                I have access to your full workout history, progress metrics, preferences, and verified memories.
                Ask about progression, evaluate training experiments, or discuss your next session.
              </p>
            </div>

            {/* Conversation starters */}
            <div className="w-full max-w-sm space-y-2 mt-4">
              {[
                'How has my training volume been trending?',
                'What should I focus on in my next session?',
                'Are there any muscles I\'m neglecting?',
              ].map((prompt) => (
                <button
                  key={prompt}
                  className="btn-secondary w-full text-left text-sm"
                  onClick={() => {
                    setMessage(prompt);
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>

            {/* Previous conversations */}
            {conversations.length > 0 && (
              <div className="w-full mt-6">
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
                  Previous Conversations
                </p>
                <div className="space-y-2">
                  {conversations.slice(0, 5).map((c: { id: string; title: string; messages: Array<{ content: string }> }) => (
                    <button
                      key={c.id}
                      className="card-compact w-full text-left"
                      onClick={() => setConversationId(c.id)}
                    >
                      <p className="text-sm font-medium truncate">{c.title ?? 'Conversation'}</p>
                      {c.messages[0] && (
                        <p className="text-xs truncate" style={{ color: 'var(--color-text-tertiary)' }}>
                          {c.messages[0].content}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {messages.map((msg: { id: string; role: string; content: string; structuredData: string | null }) => (
              <div key={msg.id} className={`flex ${msg.role === 'USER' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                    msg.role === 'USER'
                      ? ''
                      : ''
                  }`}
                  style={{
                    background: msg.role === 'USER'
                      ? 'var(--color-accent)'
                      : 'var(--color-surface-2)',
                    color: msg.role === 'USER'
                      ? 'var(--color-text-inverse)'
                      : 'var(--color-text-primary)',
                    borderBottomRightRadius: msg.role === 'USER' ? '4px' : undefined,
                    borderBottomLeftRadius: msg.role !== 'USER' ? '4px' : undefined,
                  }}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                </div>
              </div>
            ))}

            {chatMutation.isPending && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--color-surface-2)' }}>
                  <Loader2 size={16} className="animate-spin" style={{ color: 'var(--color-text-tertiary)' }} />
                </div>
              </div>
            )}

            {chatMutation.isError && (
              <div className="p-3 rounded-lg" style={{ background: 'var(--color-error-muted)' }}>
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} style={{ color: 'var(--color-error)' }} />
                  <span className="text-sm" style={{ color: 'var(--color-error)' }}>
                    {chatMutation.error instanceof Error
                      ? chatMutation.error.message
                      : 'Failed to get response'}
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="px-4 py-3" style={{ borderTop: '1px solid var(--color-border-subtle)', background: 'var(--color-surface-0)' }}>
        <div className="flex items-end gap-2">
          <textarea
            className="textarea"
            style={{ minHeight: '44px', maxHeight: '120px', resize: 'none' }}
            rows={1}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask your coach..."
          />
          <button
            onClick={handleSend}
            disabled={!message.trim() || chatMutation.isPending}
            className="btn-primary px-3"
            style={{ minHeight: '44px' }}
            aria-label="Send message"
          >
            <Send size={18} />
          </button>
        </div>

        {conversationId && (
          <button
            onClick={() => setConversationId(undefined)}
            className="btn-ghost w-full mt-2 text-xs"
          >
            New Conversation
          </button>
        )}
      </div>
    </div>
  );
}
