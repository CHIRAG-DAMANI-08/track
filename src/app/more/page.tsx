'use client';

import { useRouter } from 'next/navigation';
import {
  Brain, FlaskConical, User, FileText, Dumbbell, Download, ChevronRight
} from 'lucide-react';

const menuItems = [
  { href: '/more/profile', icon: User, label: 'Your Profile', description: 'Goals, preferences & constraints' },
  { href: '/more/memory', icon: Brain, label: "What I've Learned About You", description: 'Verified memories, patterns & preferences' },
  { href: '/more/experiments', icon: FlaskConical, label: 'Experiments', description: 'Training experiments & outcomes' },
  { href: '/more/exercises', icon: Dumbbell, label: 'Exercise Library', description: 'All tracked exercises & muscle mappings' },
  { href: '/more/imports', icon: FileText, label: 'Raw Imports', description: 'Original workout text imports' },
];

export default function MorePage() {
  const router = useRouter();

  return (
    <div className="page-content">
      <div className="pt-2 mb-2">
        <h1 className="text-2xl font-bold">More</h1>
      </div>

      <div className="space-y-1">
        {menuItems.map((item) => (
          <button
            key={item.href}
            onClick={() => router.push(item.href)}
            className="flex items-center gap-3 w-full p-4 rounded-xl text-left transition-colors"
            style={{ background: 'transparent' }}
            onMouseOver={(e) => (e.currentTarget.style.background = 'var(--color-surface-1)')}
            onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--color-surface-2)' }}
            >
              <item.icon size={18} style={{ color: 'var(--color-accent)' }} />
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">{item.label}</p>
              <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {item.description}
              </p>
            </div>
            <ChevronRight size={16} style={{ color: 'var(--color-text-tertiary)' }} />
          </button>
        ))}
      </div>

      {/* Install Help */}
      <div className="card mt-4">
        <div className="flex items-center gap-2 mb-2">
          <Download size={16} style={{ color: 'var(--color-text-secondary)' }} />
          <span className="text-sm font-medium">Install App</span>
        </div>
        <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          On iOS: tap Share → Add to Home Screen.{'\n'}
          On Android: tap the menu → Install app.
        </p>
      </div>
    </div>
  );
}
