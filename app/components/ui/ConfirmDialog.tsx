'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  loading?: boolean;
}

export default function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  // Focus the cancel button on open
  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const cancelBtn = dialogRef.current.querySelector<HTMLElement>('[data-cancel]');
    cancelBtn?.focus();
  }, [open]);

  const colors = variant === 'danger'
    ? { icon: 'text-rose-400', iconBg: 'bg-rose-500/10', btn: 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20', ring: 'border-rose-500/20' }
    : { icon: 'text-amber-400', iconBg: 'bg-amber-500/10', btn: 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20', ring: 'border-amber-500/20' };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onCancel}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
            aria-hidden="true"
          />

          {/* Dialog */}
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              ref={dialogRef}
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-title"
              aria-describedby="confirm-desc"
              className="pointer-events-auto w-full max-w-sm bg-void/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-5 space-y-4">
                {/* Icon + Title */}
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-9 h-9 rounded-xl ${colors.iconBg} flex items-center justify-center`}>
                    <AlertTriangle className={`w-4.5 h-4.5 ${colors.icon}`} />
                  </div>
                  <div className="min-w-0">
                    <h3 id="confirm-title" className="text-sm font-semibold text-white">
                      {title}
                    </h3>
                    <p id="confirm-desc" className="text-xs text-gray-400 mt-1 leading-relaxed">
                      {description}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    data-cancel
                    onClick={onCancel}
                    disabled={loading}
                    className="px-3.5 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
                  >
                    {cancelLabel}
                  </button>
                  <button
                    onClick={onConfirm}
                    disabled={loading}
                    className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50 ${colors.btn}`}
                  >
                    {loading ? 'Stopping...' : confirmLabel}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
