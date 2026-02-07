'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyBlockProps {
  value: string;
  label: string;
  variant?: 'code' | 'key';
}

export default function CopyBlock({ value, label, variant = 'code' }: CopyBlockProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-1.5">
      <span className="text-xs text-gray-400 uppercase tracking-wider">{label}</span>
      <div
        onClick={handleCopy}
        className={`
          flex items-center justify-between gap-3 rounded-lg px-4 py-3 cursor-pointer
          border border-dashed transition-colors duration-300 font-mono
          ${copied ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-white/10 bg-white/[0.03] hover:border-white/20'}
          ${variant === 'key' ? 'text-xs' : 'text-sm'}
        `}
      >
        <code className={`break-all ${variant === 'key' ? 'text-amber-400' : 'text-emerald-400'}`}>
          {value}
        </code>
        <span className="flex-shrink-0 text-gray-400">
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
        </span>
      </div>
    </div>
  );
}
