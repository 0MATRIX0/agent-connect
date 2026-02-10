'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  separator?: boolean;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Clamp position to viewport
  const clampedPos = useRef({ x, y });
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let cx = x;
    let cy = y;
    if (cx + rect.width > vw - 8) cx = vw - rect.width - 8;
    if (cy + rect.height > vh - 8) cy = vh - rect.height - 8;
    if (cx < 8) cx = 8;
    if (cy < 8) cy = 8;
    clampedPos.current = { x: cx, y: cy };
    menuRef.current.style.left = `${cx}px`;
    menuRef.current.style.top = `${cy}px`;
  }, [x, y]);

  // Close on outside click, escape, scroll, blur
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function handleDismiss() {
      onClose();
    }

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('blur', handleDismiss);

    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('blur', handleDismiss);
    };
  }, [onClose]);

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.12 }}
      className="fixed z-[100] min-w-[180px] py-1.5 bg-white/5 backdrop-blur-2xl border border-white/10 rounded-xl shadow-2xl"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) => (
        <div key={i}>
          {item.separator && (
            <div className="my-1 border-t border-white/10" />
          )}
          <button
            onClick={() => {
              if (!item.disabled) {
                item.onClick();
                onClose();
              }
            }}
            disabled={item.disabled}
            className={`
              w-full flex items-center gap-3 px-3 py-1.5 text-sm transition-colors
              ${item.disabled
                ? 'text-gray-600 cursor-not-allowed'
                : 'text-gray-300 hover:bg-white/10 hover:text-white cursor-default'
              }
            `}
          >
            {item.icon && <item.icon className="w-4 h-4 shrink-0" />}
            <span className="flex-1 text-left">{item.label}</span>
            {item.shortcut && (
              <span className="text-xs text-gray-500 ml-4">{item.shortcut}</span>
            )}
          </button>
        </div>
      ))}
    </motion.div>
  );
}
