'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  FolderKanban,
  Terminal,
  Bell,
  Settings,
  Plus,
} from 'lucide-react';

interface BottomNavProps {
  onNotificationsClick: () => void;
  notificationCount?: number;
}

const tabs = [
  { href: '/projects', icon: FolderKanban, label: 'Projects' },
  { href: '/sessions', icon: Terminal, label: 'Sessions' },
  // Center FAB placeholder
  { href: '#fab', icon: Plus, label: 'New' },
  { href: '#notifications', icon: Bell, label: 'Activity' },
  { href: '/settings', icon: Settings, label: 'Settings' },
];

export default function BottomNav({ onNotificationsClick, notificationCount = 0 }: BottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  function isActive(href: string) {
    if (href.startsWith('#')) return false;
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  function handleTabClick(href: string) {
    if (href === '#notifications') {
      onNotificationsClick();
    } else if (href === '#fab') {
      router.push('/projects');
    }
  }

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-void/90 backdrop-blur-2xl border-t border-white/10 pb-safe">
      <div className="flex items-center justify-around px-2 h-16">
        {tabs.map(({ href, icon: Icon, label }) => {
          const active = isActive(href);
          const isFab = href === '#fab';
          const isNotif = href === '#notifications';

          if (isFab) {
            return (
              <button
                key={href}
                onClick={() => handleTabClick(href)}
                className="relative -mt-5 w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center shadow-glow-emerald transition-transform active:scale-95"
              >
                <Plus className="w-6 h-6 text-white" />
              </button>
            );
          }

          const Wrapper = href.startsWith('#') ? 'button' : Link;
          const props = href.startsWith('#')
            ? { onClick: () => handleTabClick(href) }
            : { href };

          return (
            <Wrapper
              key={href}
              {...(props as any)}
              className={`
                flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors relative
                ${active ? 'text-white' : 'text-gray-500'}
              `}
            >
              <div className="relative">
                <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 1.5} />
                {isNotif && notificationCount > 0 && (
                  <span className="absolute -top-1 -right-2 min-w-[16px] h-4 bg-rose-500 rounded-full text-[10px] font-bold flex items-center justify-center text-white px-1">
                    {notificationCount > 9 ? '9+' : notificationCount}
                  </span>
                )}
              </div>
              <span className="text-[10px]">{label}</span>
            </Wrapper>
          );
        })}
      </div>
    </nav>
  );
}
