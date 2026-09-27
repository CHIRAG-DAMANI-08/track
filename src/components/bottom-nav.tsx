'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, TrendingUp, MessageSquareText, MoreHorizontal, Plus } from 'lucide-react';
import { useState } from 'react';
import { ImportSheet } from '@/components/import-sheet';

const navItems = [
  { href: '/', icon: Home, label: 'Today' },
  { href: '/progress', icon: TrendingUp, label: 'Progress' },
  { href: '#action', icon: Plus, label: '', isAction: true },
  { href: '/coach', icon: MessageSquareText, label: 'Coach' },
  { href: '/more', icon: MoreHorizontal, label: 'More' },
];

export function BottomNav() {
  const pathname = usePathname();
  const [importOpen, setImportOpen] = useState(false);

  return (
    <>
      <nav className="bottom-nav" role="navigation" aria-label="Main navigation">
        {navItems.map((item) => {
          if (item.isAction) {
            return (
              <button
                key="action"
                className="nav-action"
                onClick={() => setImportOpen(true)}
                aria-label="Import workout"
              >
                <Plus size={24} strokeWidth={2.5} />
              </button>
            );
          }

          const isActive = item.href === '/'
            ? pathname === '/'
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              className={`nav-item ${isActive ? 'active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <item.icon size={22} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  );
}
