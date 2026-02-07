'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface FloatingToolbarProps {
  children: React.ReactNode;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  autoHide?: boolean;
  autoHideDelay?: number;
  visible?: boolean;
}

const positionStyles = {
  'top-right': 'top-4 right-4',
  'top-left': 'top-4 left-4',
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
};

export default function FloatingToolbar({
  children,
  position = 'top-right',
  autoHide = true,
  autoHideDelay = 3000,
  visible = true,
}: FloatingToolbarProps) {
  const [show, setShow] = useState(true);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (!autoHide || hovered) return;
    const timer = setTimeout(() => setShow(false), autoHideDelay);
    return () => clearTimeout(timer);
  }, [autoHide, autoHideDelay, hovered, show]);

  function handleMouseMove() {
    if (!show) setShow(true);
  }

  return (
    <div
      className={`fixed ${positionStyles[position]} z-40`}
      onMouseEnter={() => { setHovered(true); setShow(true); }}
      onMouseLeave={() => setHovered(false)}
      onMouseMove={handleMouseMove}
      onTouchStart={() => { setShow(true); setHovered(true); }}
      onTouchEnd={() => setHovered(false)}
    >
      <AnimatePresence>
        {visible && show && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-1 bg-white/5 backdrop-blur-2xl border border-white/10 rounded-full px-2 py-1.5 shadow-lg"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
