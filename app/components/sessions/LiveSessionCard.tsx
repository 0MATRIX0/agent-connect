'use client';

import { useState } from 'react';
import { MessageSquare, GitBranch, Plus, Square } from 'lucide-react';
import type { ActivityState } from '../../hooks/useSessionMonitor';

interface LiveSessionCardProps {
  name: string;
  lastLog: string;
  activity: ActivityState;
  activityLabel?: string;
  isSelected: boolean;
  duration: string;
  onClick: () => void;
  compact?: boolean;
  type?: 'terminal' | 'conversation';
  sessionId?: string;
  draggable?: boolean;
  branch?: string | null;
  status?: 'running' | 'stopped' | 'frozen';
  onAddSession?: () => void;
  onStopSession?: () => void;
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
  frozen: {
    border: 'border-cyan-500/30',
    glow: 'shadow-glow-cyan',
    indicator: 'bg-cyan-400',
    label: 'Frozen',
    pulse: '',
  },
};

export default function LiveSessionCard({
  name,
  lastLog,
  activity,
  activityLabel,
  isSelected,
  duration,
  onClick,
  compact = false,
  type = 'terminal',
  sessionId,
  draggable: isDraggable = false,
  branch,
  status,
  onAddSession,
  onStopSession,
}: LiveSessionCardProps) {
  const config = activityConfig[activity];
  const isConversation = type === 'conversation';
  // Use hook-provided label if available, otherwise fall back to generic config label
  const displayLabel = activityLabel || config.label;
  const isRunning = status === 'running';

  const [isDragging, setIsDragging] = useState(false);

  function handleDragStart(e: React.DragEvent) {
    if (!isDraggable || !sessionId) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('application/session-id', sessionId);
    e.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
  }

  function handleDragEnd() {
    setIsDragging(false);
  }

  if (compact) {
    return (
      <button
        onClick={onClick}
        draggable={isDraggable}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        className={`
          relative flex-shrink-0 px-3 py-2 rounded-xl transition-all duration-200
          bg-white/5 backdrop-blur-2xl border
          ${isSelected ? 'border-white/20 bg-white/10' : isConversation ? 'border-sky-500/20' : config.border}
          ${config.glow && !isSelected && !isConversation ? config.glow : ''}
          ${config.pulse}
          ${isDragging ? 'opacity-50' : ''}
          ${isDraggable ? 'cursor-grab active:cursor-grabbing' : ''}
        `}
      >
        {/* Activity indicator */}
        <div className="flex items-center gap-2 mb-0.5">
          {isConversation ? (
            <MessageSquare className="w-3 h-3 text-sky-400 flex-shrink-0" />
          ) : (
            <span className={`w-1.5 h-1.5 rounded-full ${config.indicator}`} />
          )}
          <span className="text-xs font-medium text-white truncate max-w-[100px]">{name}</span>
        </div>
        <p className="text-[10px] text-gray-500 font-mono truncate max-w-[120px]">{lastLog || displayLabel}</p>
      </button>
    );
  }

  const showActions = onAddSession || (isRunning && onStopSession);

  return (
    <div className="relative group">
      <button
        onClick={onClick}
        draggable={isDraggable}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        className={`
          relative w-full text-left p-3 rounded-xl transition-all duration-200
          bg-white/5 backdrop-blur-2xl border
          hover:bg-white/[0.08]
          ${isSelected ? 'border-white/20 bg-white/10' : isConversation ? 'border-sky-500/20' : config.border}
          ${config.glow && !isSelected && !isConversation ? config.glow : ''}
          ${config.pulse}
          ${isDragging ? 'opacity-50' : ''}
          ${isDraggable ? 'cursor-grab active:cursor-grabbing' : ''}
        `}
      >
        {/* Selected indicator bar */}
        {isSelected && (
          <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-8 rounded-full ${isConversation ? 'bg-sky-400' : 'bg-white'}`} />
        )}

        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            {isConversation ? (
              <MessageSquare className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
            ) : (
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${config.indicator}`} />
            )}
            <span className="text-sm font-medium text-white truncate">{name}</span>
            {branch && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 border border-white/10 flex-shrink-0">
                <GitBranch className="w-2.5 h-2.5 text-amber-400" />
                <span className="text-[9px] text-amber-400/80 font-mono truncate max-w-[100px]">{branch}</span>
              </span>
            )}
          </div>
          <span className="text-[10px] text-gray-600 font-mono flex-shrink-0">{duration}</span>
        </div>

        {/* Activity status / last log line */}
        <p className={`text-[11px] font-mono line-clamp-2 leading-relaxed pl-4 ${isConversation ? 'text-sky-400/60' : 'text-gray-500'}`}>
          {activityLabel || lastLog || config.label}
        </p>
      </button>

      {/* Hover action buttons */}
      {showActions && (
        <div className="absolute top-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10">
          {onAddSession && (
            <button
              onClick={(e) => { e.stopPropagation(); onAddSession(); }}
              className="p-1 rounded-md bg-white/10 backdrop-blur-sm text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/15 transition-all duration-150"
              aria-label="New session in this project"
              title="New session in this project"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
          {isRunning && onStopSession && (
            <button
              onClick={(e) => { e.stopPropagation(); onStopSession(); }}
              className="p-1 rounded-md bg-white/10 backdrop-blur-sm text-gray-400 hover:text-rose-400 hover:bg-rose-500/15 transition-all duration-150"
              aria-label="Stop session"
              title="Stop session"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
