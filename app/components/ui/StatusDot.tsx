'use client';

interface StatusDotProps {
  status: 'running' | 'stopped' | 'error' | 'connecting';
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3 h-3',
};

const colorMap = {
  running: 'bg-emerald-500 shadow-glow-emerald',
  stopped: 'bg-gray-500',
  error: 'bg-rose-500 shadow-glow-rose',
  connecting: 'bg-amber-500 shadow-glow-amber',
};

const pulseStatuses = new Set(['running', 'connecting']);

export default function StatusDot({ status, size = 'md' }: StatusDotProps) {
  return (
    <span className="relative inline-flex">
      <span
        className={`
          ${sizeMap[size]} rounded-full ${colorMap[status]}
          ${pulseStatuses.has(status) ? 'animate-glow-pulse' : ''}
        `}
      />
    </span>
  );
}
