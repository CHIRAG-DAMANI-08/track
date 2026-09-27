'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Brain, AlertTriangle, Sparkles } from 'lucide-react';

interface OptimisticMessage {
  id: string;
  role: 'USER' | 'COACH';
  content: string;
}

export default function CoachPage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [optimisticMessages, setOptimisticMessages] = useState<OptimisticMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: conversationsData } = useQuery({
    queryKey: ['coach-conversations'],
    queryFn: async () => {
      const res = await fetch('/api/coach');
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: conversationData } = useQuery({
    queryKey: ['coach-messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return null;
      const res = await fetch(`/api/coach?conversationId=${conversationId}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: !!conversationId,
    staleTime: 1000 * 60 * 5,
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
      setOptimisticMessages([]);
      queryClient.invalidateQueries({ queryKey: ['coach-messages', data.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['coach-conversations'] });
    },
    onError: () => {
      // Keep optimistic message so user can see what failed
    },
  });

  const messageCounterRef = useRef(0);

  const handleSend = (textToSend?: string) => {
    const text = textToSend ?? message;
    const trimmed = text.trim();
    if (!trimmed || chatMutation.isPending) return;

    // 1. Optimistically append message immediately
    messageCounterRef.current += 1;
    const tempId = `optimistic-${messageCounterRef.current}`;
    setOptimisticMessages((prev) => [
      ...prev,
      { id: tempId, role: 'USER', content: trimmed },
    ]);
    setMessage('');

    // 2. Fire mutation
    chatMutation.mutate(trimmed);
  };

  const serverMessages = conversationData?.conversation?.messages ?? [];
  const displayMessages = [...serverMessages, ...optimisticMessages];
  const conversations = conversationsData?.conversations ?? [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages.length, chatMutation.isPending]);

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
        {!conversationId && displayMessages.length === 0 ? (
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
                'Which muscle groups need more emphasis?',
                'Am I progressing on my compound lifts?',
                'Review my active training hypothesis',
              ].map((starter) => (
                <button
                  key={starter}
                  onClick={() => handleSend(starter)}
                  className="w-full text-left text-xs p-3 rounded-lg transition-colors hover:border-zinc-600 border border-white/5 bg-white/[0.02] text-zinc-300 hover:text-white"
                >
                  &ldquo;{starter}&rdquo;
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {displayMessages.map((msg, i) => (
              <div
                key={msg.id ?? i}
                className={`flex ${msg.role === 'USER' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                    msg.role === 'USER' ? 'text-right' : 'text-left'
                  }`}
                  style={{
                    background:
                      msg.role === 'USER'
                        ? 'var(--color-accent)'
                        : 'var(--color-surface-2)',
                    color:
                      msg.role === 'USER'
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
                <div className="flex items-center gap-2 rounded-2xl px-3.5 py-2.5 bg-zinc-800/90 border border-white/10 text-zinc-300 text-xs">
                  <Sparkles size={13} className="text-amber-400 animate-spin" />
                  <span>Coach is analyzing...</span>
                </div>
              </div>
            )}

            {chatMutation.isError && (
              <div className="p-3 rounded-lg" style={{ background: 'var(--color-error-muted)' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={14} style={{ color: 'var(--color-error)' }} />
                    <span className="text-sm" style={{ color: 'var(--color-error)' }}>
                      {chatMutation.error instanceof Error
                        ? chatMutation.error.message
                        : 'Failed to get response'}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      const last = optimisticMessages[optimisticMessages.length - 1];
                      if (last) chatMutation.mutate(last.content);
                    }}
                    className="text-xs text-amber-400 underline font-semibold"
                  >
                    Retry
                  </button>
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
            onClick={() => handleSend()}
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
            onClick={() => {
              setConversationId(undefined);
              setOptimisticMessages([]);
            }}
            className="btn-ghost w-full mt-2 text-xs"
          >
            New Conversation
          </button>
        )}
      </div>
    </div>
  );
}
