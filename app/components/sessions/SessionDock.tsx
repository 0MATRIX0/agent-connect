'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import LiveSessionCard from './LiveSessionCard';
import type { SessionWithActivity } from '../../hooks/useSessionMonitor';

interface SessionDockProps {
  sessions: SessionWithActivity[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreateSession?: () => void;
}

export default function SessionDock({ sessions, activeId, onSelect, onCreateSession }: SessionDockProps) {
  const activeSessions = sessions.filter(s => s.status === 'running');
  const archivedSessions = sessions.filter(s => s.status === 'stopped');

  const [collapsedSection, setCollapsedSection] = useState<'active' | 'archived' | null>(null);
  const [mobileTab, setMobileTab] = useState<'active' | 'archived'>('active');

  function toggleSection(section: 'active' | 'archived') {
    setCollapsedSection(prev => prev === section ? null : section);
  }

  const activeCollapsed = collapsedSection === 'active';
  const archivedCollapsed = collapsedSection === 'archived';

  return (
    <>
      {/* Desktop: vertical dock with collapsible sections */}
      <aside className="hidden md:flex flex-col w-72 h-full border-r border-white/5 bg-void/50">
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/5 flex-shrink-0 flex items-center justify-between">
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            Sessions
          </h2>
          {onCreateSession && (
            <button
              onClick={onCreateSession}
              className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Create session"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Active section */}
        <div className={`flex flex-col ${activeCollapsed ? 'flex-shrink-0' : 'flex-1 min-h-0'}`}>
          <button
            onClick={() => toggleSection('active')}
            className="flex items-center gap-2 px-4 py-2 text-left hover:bg-white/5 transition-colors flex-shrink-0"
          >
            {activeCollapsed
              ? <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
            }
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Active</span>
            <span className="text-xs font-medium text-emerald-400">({activeSessions.length})</span>
          </button>
          {!activeCollapsed && (
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1.5">
              {activeSessions.map(session => (
                <LiveSessionCard
                  key={session.id}
                  name={session.projectName}
                  lastLog={session.lastLog}
                  activity={session.activity}
                  isSelected={session.id === activeId}
                  duration={session.duration}
                  onClick={() => onSelect(session.id)}
                />
              ))}
              {activeSessions.length === 0 && (
                <p className="text-xs text-gray-600 px-2 py-3 text-center">No active sessions</p>
              )}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-white/5 flex-shrink-0" />

        {/* Archived section */}
        <div className={`flex flex-col ${archivedCollapsed ? 'flex-shrink-0' : 'flex-1 min-h-0'}`}>
          <button
            onClick={() => toggleSection('archived')}
            className="flex items-center gap-2 px-4 py-2 text-left hover:bg-white/5 transition-colors flex-shrink-0"
          >
            {archivedCollapsed
              ? <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
            }
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Archived</span>
            <span className="text-xs font-medium text-gray-500">({archivedSessions.length})</span>
          </button>
          {!archivedCollapsed && (
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1.5">
              {archivedSessions.map(session => (
                <LiveSessionCard
                  key={session.id}
                  name={session.projectName}
                  lastLog={session.lastLog}
                  activity={session.activity}
                  isSelected={session.id === activeId}
                  duration={session.duration}
                  onClick={() => onSelect(session.id)}
                />
              ))}
              {archivedSessions.length === 0 && (
                <p className="text-xs text-gray-600 px-2 py-3 text-center">No archived sessions</p>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Mobile: tab-based layout */}
      <div className="md:hidden flex-shrink-0 border-b border-white/5 bg-void/50">
        <div className="px-3 py-2">
          {/* Tab buttons + create button */}
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => setMobileTab('active')}
              className={`text-[10px] font-medium uppercase tracking-wider px-2.5 py-1 rounded-md transition-colors ${
                mobileTab === 'active'
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Active ({activeSessions.length})
            </button>
            <button
              onClick={() => setMobileTab('archived')}
              className={`text-[10px] font-medium uppercase tracking-wider px-2.5 py-1 rounded-md transition-colors ${
                mobileTab === 'archived'
                  ? 'bg-white/10 text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Archived ({archivedSessions.length})
            </button>
            {onCreateSession && (
              <button
                onClick={onCreateSession}
                className="ml-auto p-1 rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Create session"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Scrollable strip */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {(mobileTab === 'active' ? activeSessions : archivedSessions).map(session => (
              <LiveSessionCard
                key={session.id}
                name={session.projectName}
                lastLog={session.lastLog}
                activity={session.activity}
                isSelected={session.id === activeId}
                duration={session.duration}
                onClick={() => onSelect(session.id)}
                compact
              />
            ))}
            {mobileTab === 'active' && activeSessions.length === 0 && (
              <p className="text-xs text-gray-600 py-2">No active sessions</p>
            )}
            {mobileTab === 'archived' && archivedSessions.length === 0 && (
              <p className="text-xs text-gray-600 py-2">No archived sessions</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
