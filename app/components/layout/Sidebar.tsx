'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  FolderKanban,
  Terminal,
  Settings,
  Bell,
  Zap,
} from 'lucide-react';
import StatusDot from '../ui/StatusDot';

interface SidebarProps {
  onNotificationsClick: () => void;
  notificationCount?: number;
}

const navItems = [
  { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/projects', icon: FolderKanban, label: 'Projects' },
  { href: '/sessions', icon: Terminal, label: 'Sessions' },
  { href: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar({ onNotificationsClick, notificationCount = 0 }: SidebarProps) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  return (
    <motion.nav
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      animate={{ width: expanded ? 220 : 64 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="hidden md:flex flex-col h-screen fixed left-0 top-0 z-30 bg-void/80 backdrop-blur-2xl border-r border-white/10 overflow-hidden"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-white/5 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
          <Zap className="w-4 h-4 text-emerald-400" />
        </div>
        {expanded && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm font-semibold text-white whitespace-nowrap"
          >
            Agent Connect
          </motion.span>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 flex flex-col gap-1 py-3 px-2">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={`
                relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150
                ${active
                  ? 'bg-white/10 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
                }
              `}
            >
              {active && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-emerald-400 rounded-r" />
              )}
              <Icon className="w-5 h-5 flex-shrink-0" />
              {expanded && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-sm whitespace-nowrap"
                >
                  {label}
                </motion.span>
              )}
            </Link>
          );
        })}

        {/* Notifications button */}
        <button
          onClick={onNotificationsClick}
          className="relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 text-gray-400 hover:text-white hover:bg-white/5"
        >
          <div className="relative flex-shrink-0">
            <Bell className="w-5 h-5" />
            {notificationCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 rounded-full text-[10px] font-bold flex items-center justify-center text-white">
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            )}
          </div>
          {expanded && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm whitespace-nowrap"
            >
              Notifications
            </motion.span>
          )}
        </button>
      </div>

      {/* Bottom status */}
      <div className="px-3 py-4 border-t border-white/5 flex items-center gap-3">
        <StatusDot status="running" size="sm" />
        {expanded && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs text-gray-500 whitespace-nowrap"
          >
            Connected
          </motion.span>
        )}
      </div>
    </motion.nav>
  );
}
