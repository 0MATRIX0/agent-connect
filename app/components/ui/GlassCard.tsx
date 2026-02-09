'use client';

import { KeyboardEvent } from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export default function GlassCard({ children, className = '', hover = false, onClick }: GlassCardProps) {
  function handleKeyDown(e: KeyboardEvent) {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  }

  return (
    <div
      onClick={onClick}
      onKeyDown={onClick ? handleKeyDown : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`
        bg-white/5 backdrop-blur-2xl border border-white/10 rounded-xl
        ${hover ? 'transition-all duration-200 hover:bg-white/[0.08] hover:border-white/[0.15] hover:scale-[1.01] cursor-pointer' : ''}
        ${onClick ? 'cursor-pointer focus-visible:ring-1 focus-visible:ring-white/20 focus-visible:outline-none' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
