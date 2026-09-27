'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { ClipboardPaste, X, Loader2, AlertTriangle, FileText } from 'lucide-react';

interface ImportSheetProps {
  open: boolean;
  onClose: () => void;
}

export function ImportSheet({ open, onClose }: ImportSheetProps) {
  const router = useRouter();
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const parseMutation = useMutation({
    mutationFn: async (rawText: string) => {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'parse', rawText }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to parse');
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.isDuplicate) {
        if (!confirm('This workout appears to have been imported before. Import anyway?')) {
          return;
        }
      }
      // Navigate to review page with state
      const params = new URLSearchParams({
        importId: data.rawImportId,
        data: JSON.stringify(data.workout),
        warnings: JSON.stringify(data.warnings ?? []),
      });
      onClose();
      setText('');
      router.push(`/review?${params.toString()}`);
    },
  });

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      if (clipText) {
        setText(clipText);
        if (textareaRef.current) {
          textareaRef.current.focus();
        }
      }
    } catch {
      // Permission denied or not available
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }
  }, []);

  const handleParse = () => {
    if (text.trim()) {
      parseMutation.mutate(text.trim());
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="sheet-overlay"
        onClick={onClose}
        role="presentation"
      />

      {/* Sheet */}
      <div
        className="sheet-content"
        role="dialog"
        aria-modal="true"
        aria-label="Import workout"
      >
        <div className="sheet-handle" />

        <div className="px-4 pb-2">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Import Hevy Workout</h2>
            <button
              onClick={onClose}
              className="btn-ghost p-2"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          {/* Quick Actions */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={handlePasteFromClipboard}
              className="btn-secondary flex-1"
            >
              <ClipboardPaste size={18} />
              Paste from Clipboard
            </button>
          </div>

          {/* Text Area */}
          <textarea
            ref={textareaRef}
            className="textarea mb-4"
            placeholder="Paste your Hevy workout text here...&#10;&#10;Example:&#10;Bench Press (Barbell)&#10;100 kg x 8&#10;100 kg x 8&#10;100 kg x 6"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
          />

          {/* Error */}
          {parseMutation.isError && (
            <div className="flex items-center gap-2 p-3 rounded-lg mb-4"
              style={{ background: 'var(--color-error-muted)' }}>
              <AlertTriangle size={16} style={{ color: 'var(--color-error)' }} />
              <span className="text-sm" style={{ color: 'var(--color-error)' }}>
                {parseMutation.error instanceof Error
                  ? parseMutation.error.message
                  : 'Failed to parse workout'}
              </span>
            </div>
          )}

          {/* Parse Button */}
          <button
            onClick={handleParse}
            disabled={!text.trim() || parseMutation.isPending}
            className="btn-primary w-full mb-4"
          >
            {parseMutation.isPending ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Parsing...
              </>
            ) : (
              <>
                <FileText size={18} />
                Parse Workout
              </>
            )}
          </button>

          {/* Recent Imports Link */}
          <button
            onClick={() => {
              onClose();
              router.push('/more/imports');
            }}
            className="btn-ghost w-full text-center"
          >
            View Recent Imports
          </button>
        </div>
      </div>
    </>
  );
}
