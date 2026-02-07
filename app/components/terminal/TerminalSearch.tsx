'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SearchAddon } from '@xterm/addon-search';

interface TerminalSearchProps {
  searchAddon: SearchAddon | null;
  open: boolean;
  onClose: () => void;
}

export default function TerminalSearch({ searchAddon, open, onClose }: TerminalSearchProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  function handleSearch(value: string) {
    setQuery(value);
    if (searchAddon && value) {
      searchAddon.findNext(value, { regex: false, caseSensitive: false });
    }
  }

  function findNext() {
    if (searchAddon && query) {
      searchAddon.findNext(query, { regex: false, caseSensitive: false });
    }
  }

  function findPrevious() {
    if (searchAddon && query) {
      searchAddon.findPrevious(query, { regex: false, caseSensitive: false });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter') {
      if (e.shiftKey) findPrevious();
      else findNext();
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.15 }}
          className="absolute top-3 right-3 z-50 flex items-center gap-1 bg-void/95 backdrop-blur-2xl border border-white/10 rounded-lg px-3 py-1.5 shadow-lg"
        >
          <Search className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => handleSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search..."
            className="bg-transparent text-sm text-white placeholder-gray-600 outline-none w-48"
          />
          <button
            onClick={findPrevious}
            className="p-1 text-gray-500 hover:text-white transition-colors"
            title="Previous match"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={findNext}
            className="p-1 text-gray-500 hover:text-white transition-colors"
            title="Next match"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
