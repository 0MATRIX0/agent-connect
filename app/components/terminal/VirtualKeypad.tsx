'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

interface Macro {
  id: string;
  label: string;
  command: string;
}

interface VirtualKeypadProps {
  onInput: (data: string) => void;
  visible: boolean;
}

const DEFAULT_MACROS: Macro[] = [
  { id: 'default-1', label: 'Dev', command: 'npm run dev' },
  { id: 'default-2', label: 'Status', command: 'git status' },
  { id: 'default-3', label: 'Clear', command: 'clear' },
  { id: 'default-4', label: 'Docker Up', command: 'docker-compose up' },
];

export default function VirtualKeypad({ onInput, visible }: VirtualKeypadProps) {
  const [ctrlActive, setCtrlActive] = useState(false);
  const [altActive, setAltActive] = useState(false);
  const [macros, setMacros] = useState<Macro[]>(DEFAULT_MACROS);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('terminal-macros');
      if (stored) setMacros(JSON.parse(stored));
    } catch {
      // use defaults
    }
  }, []);

  function haptic() {
    if (navigator.vibrate) navigator.vibrate(10);
  }

  function sendKey(key: string) {
    haptic();
    let data = key;
    if (ctrlActive) {
      // Ctrl+key: send control character
      const code = key.toUpperCase().charCodeAt(0) - 64;
      if (code > 0 && code < 32) {
        data = String.fromCharCode(code);
      }
      setCtrlActive(false);
    }
    if (altActive) {
      data = '\x1b' + key;
      setAltActive(false);
    }
    onInput(data);
  }

  const sendSpecial = useCallback((seq: string) => {
    haptic();
    onInput(seq);
  }, [onInput]);

  function sendMacro(command: string) {
    haptic();
    onInput(command + '\r');
  }

  // Prevent double-fire on touch devices
  function handleClick(handler: () => void) {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      handler();
    };
  }

  if (!visible) return null;

  return (
    <div className="flex-shrink-0 bg-void/95 backdrop-blur-xl border-t border-white/10 px-2 py-2 pb-safe">
      <div className="flex items-center gap-1 overflow-x-auto">
        {/* Modifier keys */}
        <button
          onTouchStart={() => sendSpecial('\x1b')}
          onClick={handleClick(() => sendSpecial('\x1b'))}
          aria-label="Escape"
          className="flex-shrink-0 px-2.5 py-1.5 rounded-md bg-white/5 border border-white/10 text-xs text-gray-400 active:bg-white/10"
        >
          ESC
        </button>
        <button
          onTouchStart={() => sendSpecial('\t')}
          onClick={handleClick(() => sendSpecial('\t'))}
          aria-label="Tab"
          className="flex-shrink-0 px-2.5 py-1.5 rounded-md bg-white/5 border border-white/10 text-xs text-gray-400 active:bg-white/10"
        >
          TAB
        </button>
        <button
          onTouchStart={() => { haptic(); setCtrlActive(!ctrlActive); }}
          onClick={handleClick(() => { haptic(); setCtrlActive(!ctrlActive); })}
          aria-label="Control"
          aria-pressed={ctrlActive}
          className={`flex-shrink-0 px-2.5 py-1.5 rounded-md border text-xs active:bg-white/10 ${
            ctrlActive ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-white/5 border-white/10 text-gray-400'
          }`}
        >
          CTRL
        </button>
        <button
          onTouchStart={() => { haptic(); setAltActive(!altActive); }}
          onClick={handleClick(() => { haptic(); setAltActive(!altActive); })}
          aria-label="Alt"
          aria-pressed={altActive}
          className={`flex-shrink-0 px-2.5 py-1.5 rounded-md border text-xs active:bg-white/10 ${
            altActive ? 'bg-blue-500/20 border-blue-500/30 text-blue-400' : 'bg-white/5 border-white/10 text-gray-400'
          }`}
        >
          ALT
        </button>

        {/* Separator */}
        <div className="w-px h-6 bg-white/10 mx-1 flex-shrink-0" />

        {/* Arrow keys */}
        <button
          onTouchStart={() => sendSpecial('\x1b[A')}
          onClick={handleClick(() => sendSpecial('\x1b[A'))}
          aria-label="Arrow up"
          className="flex-shrink-0 p-1.5 rounded-md bg-white/5 border border-white/10 text-gray-400 active:bg-white/10"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          onTouchStart={() => sendSpecial('\x1b[B')}
          onClick={handleClick(() => sendSpecial('\x1b[B'))}
          aria-label="Arrow down"
          className="flex-shrink-0 p-1.5 rounded-md bg-white/5 border border-white/10 text-gray-400 active:bg-white/10"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
        <button
          onTouchStart={() => sendSpecial('\x1b[D')}
          onClick={handleClick(() => sendSpecial('\x1b[D'))}
          aria-label="Arrow left"
          className="flex-shrink-0 p-1.5 rounded-md bg-white/5 border border-white/10 text-gray-400 active:bg-white/10"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onTouchStart={() => sendSpecial('\x1b[C')}
          onClick={handleClick(() => sendSpecial('\x1b[C'))}
          aria-label="Arrow right"
          className="flex-shrink-0 p-1.5 rounded-md bg-white/5 border border-white/10 text-gray-400 active:bg-white/10"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Separator */}
        <div className="w-px h-6 bg-white/10 mx-1 flex-shrink-0" />

        {/* Macros */}
        {macros.map(macro => (
          <button
            key={macro.id}
            onTouchStart={() => sendMacro(macro.command)}
            onClick={handleClick(() => sendMacro(macro.command))}
            aria-label={`Run ${macro.label}`}
            className="flex-shrink-0 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-gray-300 active:bg-emerald-500/20 active:text-emerald-400 active:border-emerald-500/30 whitespace-nowrap"
          >
            {macro.label}
          </button>
        ))}
      </div>
    </div>
  );
}
