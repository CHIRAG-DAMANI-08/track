'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Send, Brain, AlertTriangle, Sparkles, ChevronLeft,
  MessageSquareText, Plus, Trash2, Mic, Square, Play, X
} from 'lucide-react';

interface ConversationSummary {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messages: Array<{ content: string; role: string; createdAt: string; structuredData?: string | null }>;
  _count?: { messages: number };
}

interface ChatMessage {
  id: string;
  role: 'USER' | 'COACH';
  content: string;
  structuredData?: string | null;
  createdAt: string;
}

interface OptimisticMessage {
  id: string;
  role: 'USER' | 'COACH';
  content: string;
  isVoice?: boolean;
  audioUrl?: string;
  duration?: number;
  isTranscribing?: boolean;
}

function formatDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Voice Memo Mini Player ─────────────────────────────────────────
function VoicePlayer({ audioUrl, duration }: { audioUrl?: string; duration?: number }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioUrl) return;
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
      audioRef.current = null;
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  };

  const formattedDuration = duration ? formatDuration(duration) : '0:00';
  const formattedCurrent = formatDuration(Math.floor(currentTime));

  return (
    <div className="coach-voice-player">
      {audioUrl ? (
        <button
          type="button"
          onClick={togglePlay}
          className="coach-voice-play-btn"
          aria-label={isPlaying ? 'Pause voice note' : 'Play voice note'}
        >
          {isPlaying ? <Square size={11} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
        </button>
      ) : (
        <span className="coach-voice-icon-pill">
          <Mic size={13} />
        </span>
      )}
      <div className="coach-voice-track">
        <div className="coach-voice-waves">
          <span className="coach-wave-bar" style={{ height: '7px' }} />
          <span className="coach-wave-bar" style={{ height: '14px' }} />
          <span className="coach-wave-bar" style={{ height: '18px' }} />
          <span className="coach-wave-bar" style={{ height: '10px' }} />
          <span className="coach-wave-bar" style={{ height: '15px' }} />
          <span className="coach-wave-bar" style={{ height: '8px' }} />
          <span className="coach-wave-bar" style={{ height: '16px' }} />
          <span className="coach-wave-bar" style={{ height: '11px' }} />
        </div>
        <span className="coach-voice-time">
          {isPlaying ? formattedCurrent : formattedDuration}
        </span>
      </div>
    </div>
  );
}

// ── Helper to detect voice metadata ────────────────────────────────
function getVoiceMeta(msg: ChatMessage | OptimisticMessage, audioUrlMap?: Map<string, string>) {
  if ('isVoice' in msg && msg.isVoice) {
    const opt = msg as OptimisticMessage;
    const audioUrl = opt.audioUrl || (audioUrlMap?.get(opt.id));
    return {
      isVoice: true,
      duration: opt.duration,
      audioUrl,
      isTranscribing: opt.isTranscribing,
    };
  }
  if ('structuredData' in msg && msg.structuredData) {
    try {
      const data = JSON.parse(msg.structuredData);
      if (data?.isVoice) {
        const audioUrl = audioUrlMap?.get(msg.id) || audioUrlMap?.get(msg.content);
        return {
          isVoice: true,
          duration: data.duration as number | undefined,
          audioUrl,
          isTranscribing: false,
        };
      }
    } catch {}
  }
  return null;
}

export default function CoachPage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [showHistory, setShowHistory] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState<OptimisticMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingDurationRef = useRef(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isCancelledRef = useRef(false);
  const audioUrlMapRef = useRef<Map<string, string>>(new Map());

  // Check for MediaRecorder support
  useEffect(() => {
    setVoiceSupported(typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  // Track scroll position — only auto-scroll when user is near bottom
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const threshold = 80;
    setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < threshold);
  }, []);

  // Scroll to bottom helper
  const scrollToBottom = useCallback((force = false) => {
    if (force || isAtBottom) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      });
    }
  }, [isAtBottom]);

  // Fetch all conversations
  const { data: conversationsData } = useQuery({
    queryKey: ['coach-conversations'],
    queryFn: async () => {
      const res = await fetch('/api/coach');
      if (!res.ok) throw new Error('Failed');
      return res.json() as Promise<{ conversations: ConversationSummary[] }>;
    },
    staleTime: 1000 * 60 * 2,
  });

  // Fetch messages for current conversation
  const { data: conversationData } = useQuery({
    queryKey: ['coach-messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return null;
      const res = await fetch(`/api/coach?conversationId=${conversationId}`);
      if (!res.ok) throw new Error('Failed');
      return res.json() as Promise<{ conversation: { id: string; messages: ChatMessage[] } | null }>;
    },
    enabled: !!conversationId,
    staleTime: 1000 * 60 * 2,
  });

  // Text chat mutation
  const chatMutation = useMutation({
    mutationFn: async (msg: string) => {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, message: msg }),
      });
      const data = await res.json();

      if (data.conversationId && !conversationId) {
        setConversationId(data.conversationId);
      }

      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to get response');
      }

      return data;
    },
    onSuccess: (data) => {
      setConversationId(data.conversationId);
      setOptimisticMessages([]);
      queryClient.invalidateQueries({ queryKey: ['coach-messages', data.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['coach-conversations'] });
    },
  });

  // Voice message mutation
  const voiceMutation = useMutation({
    mutationFn: async ({ blob, duration, tempId }: { blob: Blob; duration: number; tempId: string }) => {
      const formData = new FormData();
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
      formData.append('audio', blob, `voice.${ext}`);
      formData.append('duration', String(duration));
      if (conversationId) {
        formData.append('conversationId', conversationId);
      }

      const res = await fetch('/api/coach', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (data.conversationId && !conversationId) {
        setConversationId(data.conversationId);
      }

      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to process voice message');
      }

      return { ...data, tempId };
    },
    onSuccess: (data) => {
      setConversationId(data.conversationId);
      if (data.userMessage && data.tempId) {
        const localAudioUrl = audioUrlMapRef.current.get(data.tempId);
        if (localAudioUrl) {
          audioUrlMapRef.current.set(data.userMessage, localAudioUrl);
        }
      }
      setOptimisticMessages([]);
      queryClient.invalidateQueries({ queryKey: ['coach-messages', data.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['coach-conversations'] });
    },
    onError: (_err, vars) => {
      if (vars.tempId) {
        setOptimisticMessages((prev) =>
          prev.map((m) =>
            m.id === vars.tempId
              ? { ...m, isTranscribing: false, content: 'Voice message could not be transcribed.' }
              : m
          )
        );
      }
    },
  });

  // Delete conversation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/coach?conversationId=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      return res.json();
    },
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['coach-conversations'] });
      if (conversationId === deletedId) {
        setConversationId(undefined);
        setOptimisticMessages([]);
      }
    },
  });

  const messageCounterRef = useRef(0);

  // ── Voice Recording Handlers ─────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      isCancelledRef.current = false;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        // Stop audio tracks
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }

        const duration = recordingDurationRef.current;
        setRecordingDuration(0);
        recordingDurationRef.current = 0;

        if (isCancelledRef.current) {
          audioChunksRef.current = [];
          return;
        }

        const chunks = audioChunksRef.current;
        if (chunks.length === 0) return;

        const audioBlob = new Blob(chunks, { type: mimeType });
        audioChunksRef.current = [];

        // Create local playable audio URL for immediate playback in current session
        const audioUrl = URL.createObjectURL(audioBlob);

        messageCounterRef.current += 1;
        const tempId = `optimistic-${messageCounterRef.current}`;
        audioUrlMapRef.current.set(tempId, audioUrl);

        // Immediately insert voice message bubble into the conversation
        setOptimisticMessages((prev) => [
          ...prev,
          {
            id: tempId,
            role: 'USER',
            content: '',
            isVoice: true,
            audioUrl,
            duration: Math.max(duration, 1),
            isTranscribing: true,
          },
        ]);

        // Upload voice message to server (transcribed with Gemini 2.5 Flash free tier)
        voiceMutation.mutate({
          blob: audioBlob,
          duration: Math.max(duration, 1),
          tempId,
        });
      };

      mediaRecorderRef.current = recorder;
      recorder.start(500);
      setIsRecording(true);
      setRecordingDuration(0);
      recordingDurationRef.current = 0;

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => {
          const next = prev + 1;
          recordingDurationRef.current = next;
          return next;
        });
      }, 1000);
    } catch (err) {
      console.error('Microphone access denied:', err);
      alert('Could not access microphone. Please enable microphone permissions in your browser.');
    }
  }, [voiceMutation]);

  const sendRecording = useCallback(() => {
    isCancelledRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  const cancelRecording = useCallback(() => {
    isCancelledRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isCancelledRef.current = true;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

  // ── Send text handler ────────────────────────────────────────────
  const handleSend = (textToSend?: string) => {
    const text = textToSend ?? message;
    const trimmed = text.trim();
    if (!trimmed || chatMutation.isPending || voiceMutation.isPending) return;

    messageCounterRef.current += 1;
    const tempId = `optimistic-${messageCounterRef.current}`;
    setOptimisticMessages((prev) => [
      ...prev,
      { id: tempId, role: 'USER', content: trimmed },
    ]);
    setMessage('');

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    chatMutation.mutate(trimmed);
  };

  const startNewConversation = () => {
    setConversationId(undefined);
    setOptimisticMessages([]);
    setShowHistory(false);
    chatMutation.reset();
    voiceMutation.reset();
  };

  const openConversation = (id: string) => {
    setConversationId(id);
    setOptimisticMessages([]);
    setShowHistory(false);
    chatMutation.reset();
    voiceMutation.reset();
  };

  const serverMessages: ChatMessage[] = conversationData?.conversation?.messages ?? [];
  const displayMessages = [...serverMessages, ...optimisticMessages];
  const conversations: ConversationSummary[] = conversationsData?.conversations ?? [];

  const isPending = chatMutation.isPending || voiceMutation.isPending;
  const currentError = chatMutation.error || voiceMutation.error;

  // Auto-scroll when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [displayMessages.length, isPending, scrollToBottom]);

  // Force scroll when opening a conversation
  useEffect(() => {
    if (conversationId) {
      scrollToBottom(true);
    }
  }, [conversationId, scrollToBottom]);

  // Auto-resize textarea
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  };

  // ── History view ─────────────────────────────────────────────────
  if (showHistory) {
    return (
      <div className="coach-shell">
        <div className="coach-header">
          <button onClick={() => setShowHistory(false)} className="coach-back-btn">
            <ChevronLeft size={20} />
          </button>
          <h1 className="coach-title">Conversations</h1>
          <button onClick={startNewConversation} className="coach-new-btn" aria-label="New conversation">
            <Plus size={20} />
          </button>
        </div>

        <div className="coach-history-list">
          {conversations.length === 0 ? (
            <div className="coach-empty-history">
              <MessageSquareText size={32} style={{ opacity: 0.2 }} />
              <p>No conversations yet</p>
            </div>
          ) : (
            conversations.map((conv) => {
              const lastMsg = conv.messages[0];
              const msgCount = conv._count?.messages ?? conv.messages.length;
              return (
                <div
                  key={conv.id}
                  className={`coach-history-item ${conv.id === conversationId ? 'active' : ''}`}
                >
                  <button
                    className="coach-history-content"
                    onClick={() => openConversation(conv.id)}
                  >
                    <span className="coach-history-title">
                      {conv.title || 'Untitled'}
                    </span>
                    <span className="coach-history-meta">
                      {formatTime(conv.updatedAt)}
                      {msgCount > 0 && ` · ${msgCount} msg${msgCount !== 1 ? 's' : ''}`}
                    </span>
                    {lastMsg && (
                      <span className="coach-history-preview">
                        {lastMsg.structuredData && lastMsg.structuredData.includes('"isVoice":true')
                          ? '🎙️ Voice note'
                          : `${lastMsg.content.slice(0, 80)}${lastMsg.content.length > 80 ? '…' : ''}`}
                      </span>
                    )}
                  </button>
                  <button
                    className="coach-history-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMutation.mutate(conv.id);
                    }}
                    aria-label="Delete conversation"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // ── Main chat view ───────────────────────────────────────────────
  return (
    <div className="coach-shell">
      {/* Header */}
      <div className="coach-header">
        <button
          onClick={() => setShowHistory(true)}
          className="coach-back-btn"
          aria-label="View conversations"
        >
          <MessageSquareText size={18} />
          {conversations.length > 0 && (
            <span className="coach-badge">{conversations.length}</span>
          )}
        </button>
        <div className="coach-header-center">
          <Brain size={18} style={{ color: 'var(--color-accent)' }} />
          <h1 className="coach-title">Coach</h1>
        </div>
        <button onClick={startNewConversation} className="coach-new-btn" aria-label="New conversation">
          <Plus size={20} />
        </button>
      </div>

      {/* Messages Area */}
      <div
        className="coach-messages"
        ref={scrollContainerRef}
        onScroll={handleScroll}
      >
        {displayMessages.length === 0 ? (
          <div className="coach-welcome">
            <Brain size={36} style={{ color: 'var(--color-text-tertiary)', opacity: 0.25 }} />
            <div>
              <p className="coach-welcome-title">
                What&apos;s on your mind, Chirag?
              </p>
              <p className="coach-welcome-subtitle">
                I have access to your full workout history, progress metrics, and training memories. You can type or send a voice message.
              </p>
            </div>

            <div className="coach-starters">
              {[
                'How has my training volume been trending?',
                'Which muscle groups need more emphasis?',
                'Am I progressing on my compound lifts?',
                'Review my active training hypothesis',
              ].map((starter) => (
                <button
                  key={starter}
                  onClick={() => handleSend(starter)}
                  className="coach-starter-btn"
                >
                  &ldquo;{starter}&rdquo;
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {displayMessages.map((msg, i) => {
              const voiceMeta = getVoiceMeta(msg, audioUrlMapRef.current);
              return (
                <div
                  key={msg.id ?? i}
                  className={`coach-bubble-row ${msg.role === 'USER' ? 'user' : 'coach'}`}
                >
                  <div className={`coach-bubble ${msg.role === 'USER' ? 'user' : 'coach'}`}>
                    {voiceMeta ? (
                      <div className="coach-voice-bubble-content">
                        <div className="coach-voice-header">
                          <Mic size={12} />
                          <span>Voice Note {voiceMeta.duration ? `(${formatDuration(voiceMeta.duration)})` : ''}</span>
                        </div>
                        <VoicePlayer audioUrl={voiceMeta.audioUrl} duration={voiceMeta.duration} />
                      </div>
                    ) : (
                      <p className="coach-bubble-text">{msg.content}</p>
                    )}
                  </div>
                </div>
              );
            })}

            {isPending && (
              <div className="coach-bubble-row coach">
                <div className="coach-typing">
                  <Sparkles size={13} className="coach-typing-icon" />
                  <span>Coach is listening &amp; analyzing...</span>
                </div>
              </div>
            )}

            {currentError && (
              <div className="coach-error-bar">
                <div className="coach-error-content">
                  <AlertTriangle size={14} />
                  <span>
                    {currentError instanceof Error ? currentError.message : 'Failed to get response'}
                  </span>
                </div>
                <button
                  onClick={() => {
                    const last = optimisticMessages[optimisticMessages.length - 1];
                    chatMutation.reset();
                    voiceMutation.reset();
                    if (last && last.content) {
                      chatMutation.mutate(last.content);
                    }
                  }}
                  className="coach-retry-btn"
                >
                  Dismiss
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Pinned Bottom Input Area */}
      <div className="coach-input-bar">
        {isRecording ? (
          /* Active Voice Recording UI */
          <div className="coach-recording-active-row">
            <button
              type="button"
              onClick={cancelRecording}
              className="coach-recording-cancel-btn"
              title="Discard voice note"
              aria-label="Discard voice note"
            >
              <X size={16} />
            </button>

            <div className="coach-recording-mid">
              <span className="coach-recording-dot" />
              <span className="coach-recording-time">{formatDuration(recordingDuration)}</span>
              <div className="coach-wave-animation">
                <span className="coach-wave-anim-bar" />
                <span className="coach-wave-anim-bar" />
                <span className="coach-wave-anim-bar" />
                <span className="coach-wave-anim-bar" />
                <span className="coach-wave-anim-bar" />
              </div>
              <span className="coach-recording-label">Recording voice note...</span>
            </div>

            <button
              type="button"
              onClick={sendRecording}
              className="coach-recording-send-btn"
              title="Send voice note"
              aria-label="Send voice note"
            >
              <Send size={16} />
            </button>
          </div>
        ) : (
          /* Normal Text / Mic Row */
          <div className="coach-input-row">
            <textarea
              ref={textareaRef}
              className="coach-textarea"
              rows={1}
              value={message}
              onChange={handleTextareaChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={isPending ? 'Coach is responding...' : 'Ask your coach or send a voice note...'}
              disabled={isPending}
            />

            {message.trim() ? (
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={isPending}
                className="coach-send-btn"
                aria-label="Send message"
              >
                <Send size={18} />
              </button>
            ) : voiceSupported ? (
              <button
                type="button"
                onClick={startRecording}
                disabled={isPending}
                className="coach-mic-btn"
                aria-label="Record voice message"
                title="Send voice note"
              >
                <Mic size={20} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!message.trim() || isPending}
                className="coach-send-btn"
                aria-label="Send message"
              >
                <Send size={18} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
