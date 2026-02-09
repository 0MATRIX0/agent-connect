'use client';

import { useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import NotificationDrawer from './NotificationDrawer';
import { ToastProvider } from '../ui/Toast';
import ErrorBoundary from '../ui/ErrorBoundary';

interface LayoutShellProps {
  children: React.ReactNode;
}

export default function LayoutShell({ children }: LayoutShellProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);

  const isTerminal = pathname.startsWith('/terminal/');

  const handleCountChange = useCallback((count: number) => {
    setNotificationCount(count);
  }, []);

  return (
    <ToastProvider>
      <ErrorBoundary>
        {/* Desktop sidebar */}
        <Sidebar
          onNotificationsClick={() => setDrawerOpen(true)}
          notificationCount={notificationCount}
        />

        {/* Main content area */}
        <main className={isTerminal ? 'md:ml-16' : 'md:ml-16 pb-20 md:pb-0 min-h-screen'}>
          {children}
        </main>

        {/* Mobile bottom nav */}
        <BottomNav
          onNotificationsClick={() => setDrawerOpen(true)}
          notificationCount={notificationCount}
        />

        {/* Notification drawer */}
        <NotificationDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onCountChange={handleCountChange}
        />
      </ErrorBoundary>
    </ToastProvider>
  );
}
