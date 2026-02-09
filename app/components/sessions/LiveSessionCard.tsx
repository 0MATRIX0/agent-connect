'use client';

import type { ActivityState } from '../../hooks/useSessionMonitor';

interface LiveSessionCardProps {
  name: string;
  lastLog: string;
  activity: ActivityState;
  isSelected: boolean;
  duration: string;
  onClick: () => void;
  compact?: boolean;
}

const activityConfig: Record<ActivityState, {
  border: string;
  glow: string;
  indicator: string;
  label: string;
  pulse: string;
}> = {
  active: {
    border: 'border-emerald-500/30',
    glow: 'shadow-glow-emerald',
    indicator: 'bg-emerald-400',
    label: 'Active',
    pulse: 'animate-pulse-slow',
  },
  idle: {
    border: 'border-white/5',
    glow: '',
    indicator: 'bg-gray-500',
    label: 'Idle',
    pulse: '',
  },
  waiting: {
    border: 'border-purple-500/30',
    glow: 'shadow-glow-purple',
    indicator: 'bg-purple-400',
    label: 'Waiting',
    pulse: 'animate-pulse-fast',
  },
  completed: {
    border: 'border-white/10',
    glow: '',
    indicator: 'bg-white',
    label: 'Completed',
    pulse: '',
  },
};

export default function LiveSessionCard({
  name,
  lastLog,
  activity,
  isSelected,
  duration,
  onClick,
  compact = false,
}: LiveSessionCardProps) {
  const config = activityConfig[activity];

  if (compact) {
    return (
      <button
        onClick={onClick}
        className={`
          relative flex-shrink-0 px-3 py-2 rounded-xl transition-all duration-200
          bg-white/5 backdrop-blur-2xl border
          ${isSelected ? 'border-white/20 bg-white/10' : config.border}
          ${config.glow && !isSelected ? config.glow : ''}
          ${config.pulse}
        `}
      >
        {/* Activity indicator dot */}
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`w-1.5 h-1.5 rounded-full ${config.indicator}`} />
          <span className="text-xs font-medium text-white truncate max-w-[100px]">{name}</span>
        </div>
        <p className="text-[10px] text-gray-500 font-mono truncate max-w-[120px]">{lastLog || config.label}</p>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`
        relative w-full text-left p-3 rounded-xl transition-all duration-200
        bg-white/5 backdrop-blur-2xl border
        hover:bg-white/[0.08]
        ${isSelected ? 'border-white/20 bg-white/10' : config.border}
        ${config.glow && !isSelected ? config.glow : ''}
        ${config.pulse}
      `}
    >
      {/* Selected indicator bar */}
      {isSelected && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-8 bg-white rounded-full" />
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${config.indicator}`} />
          <span className="text-sm font-medium text-white truncate">{name}</span>
        </div>
        <span className="text-[10px] text-gray-600 font-mono flex-shrink-0">{duration}</span>
      </div>

      {/* Last log line */}
      <p className="text-[11px] text-gray-500 font-mono line-clamp-2 leading-relaxed pl-4">
        {lastLog || config.label}
      </p>
    </button>
  );
}
