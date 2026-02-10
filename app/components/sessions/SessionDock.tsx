'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, FolderOpen, Plus } from 'lucide-react';
import LiveSessionCard from './LiveSessionCard';
import type { SessionWithActivity } from '../../hooks/useSessionMonitor';

interface SessionDockProps {
  sessions: SessionWithActivity[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreateSession?: () => void;
  onAddSessionToProject?: (projectId: string) => void;
  onStopSession?: (sessionId: string) => void;
}

interface ProjectGroup {
  projectId: string;
  projectName: string;
  sessions: SessionWithActivity[];
}

function groupByProject(sessions: SessionWithActivity[]): ProjectGroup[] {
  const map = new Map<string, ProjectGroup>();
  for (const s of sessions) {
    const key = s.projectId;
    if (!map.has(key)) {
      map.set(key, { projectId: key, projectName: s.projectName, sessions: [] });
    }
    map.get(key)!.sessions.push(s);
  }
  return Array.from(map.values());
}

function renderSessionCards(
  sessions: SessionWithActivity[],
  activeId: string | null,
  onSelect: (id: string) => void,
  onAddSessionToProject?: (projectId: string) => void,
  onStopSession?: (sessionId: string) => void,
) {
  return sessions.map(session => (
    <LiveSessionCard
      key={session.id}
      name={session.projectName}
      lastLog={session.lastLog}
      activity={session.activity}
      activityLabel={session.activityLabel}
      isSelected={session.id === activeId}
      duration={session.duration}
      onClick={() => onSelect(session.id)}
      type={session.type}
      sessionId={session.id}
      draggable={session.status === 'running' && session.type !== 'conversation'}
      branch={session.branch}
      status={session.status}
      onAddSession={onAddSessionToProject ? () => onAddSessionToProject(session.projectId) : undefined}
      onStopSession={onStopSession ? () => onStopSession(session.id) : undefined}
    />
  ));
}

export default function SessionDock({ sessions, activeId, onSelect, onCreateSession, onAddSessionToProject, onStopSession }: SessionDockProps) {
  const activeSessions = sessions.filter(s => s.status === 'running');
  const frozenSessions = sessions.filter(s => s.status === 'frozen');
  const archivedSessions = sessions.filter(s => s.status === 'stopped');

  const activeGroups = groupByProject(activeSessions);
  const frozenGroups = groupByProject(frozenSessions);
  const archivedGroups = groupByProject(archivedSessions);

  const [collapsedSection, setCollapsedSection] = useState<'active' | 'frozen' | 'archived' | null>(null);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [mobileTab, setMobileTab] = useState<'active' | 'frozen' | 'archived'>('active');

  function toggleSection(section: 'active' | 'frozen' | 'archived') {
    setCollapsedSection(prev => prev === section ? null : section);
  }

  function toggleProject(projectId: string) {
    setCollapsedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  }

  const activeCollapsed = collapsedSection === 'active';
  const frozenCollapsed = collapsedSection === 'frozen';
  const archivedCollapsed = collapsedSection === 'archived';

  function renderGroupedSessions(groups: ProjectGroup[]) {
    return groups.map(group => {
      // Single session in project — render card directly (no redundant header)
      if (group.sessions.length === 1) {
        return renderSessionCards(group.sessions, activeId, onSelect, onAddSessionToProject, onStopSession);
      }

      // Multiple sessions — show collapsible project header
      const isCollapsed = collapsedProjects.has(group.projectId);
      return (
        <div key={group.projectId}>
          <button
            onClick={() => toggleProject(group.projectId)}
            className="flex items-center gap-1.5 w-full px-2 py-1.5 text-left hover:bg-white/5 rounded-lg transition-colors group/proj"
          >
            {isCollapsed
              ? <ChevronRight className="w-3 h-3 text-gray-600" />
              : <ChevronDown className="w-3 h-3 text-gray-600" />
            }
            <FolderOpen className="w-3 h-3 text-gray-500" />
            <span className="text-[11px] font-medium text-gray-400 truncate flex-1">{group.projectName}</span>
            <span className="text-[10px] text-gray-600">{group.sessions.length}</span>
          </button>
          {!isCollapsed && (
            <div className="pl-3 space-y-1.5">
              {renderSessionCards(group.sessions, activeId, onSelect, onAddSessionToProject, onStopSession)}
            </div>
          )}
        </div>
      );
    });
  }

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
              {renderGroupedSessions(activeGroups)}
              {activeSessions.length === 0 && (
                <p className="text-xs text-gray-600 px-2 py-3 text-center">No active sessions</p>
              )}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-white/5 flex-shrink-0" />

        {/* Frozen section */}
        {frozenSessions.length > 0 && (
          <>
            <div className={`flex flex-col ${frozenCollapsed ? 'flex-shrink-0' : 'flex-1 min-h-0'}`}>
              <button
                onClick={() => toggleSection('frozen')}
                className="flex items-center gap-2 px-4 py-2 text-left hover:bg-white/5 transition-colors flex-shrink-0"
              >
                {frozenCollapsed
                  ? <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                  : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                }
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Frozen</span>
                <span className="text-xs font-medium text-cyan-400">({frozenSessions.length})</span>
              </button>
              {!frozenCollapsed && (
                <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1.5">
                  {renderGroupedSessions(frozenGroups)}
                </div>
              )}
            </div>
            <div className="border-t border-white/5 flex-shrink-0" />
          </>
        )}

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
              {renderGroupedSessions(archivedGroups)}
              {archivedSessions.length === 0 && (
                <p className="text-xs text-gray-600 px-2 py-3 text-center">No archived sessions</p>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Mobile: tab-based layout (flat, no grouping) */}
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
            {frozenSessions.length > 0 && (
              <button
                onClick={() => setMobileTab('frozen')}
                className={`text-[10px] font-medium uppercase tracking-wider px-2.5 py-1 rounded-md transition-colors ${
                  mobileTab === 'frozen'
                    ? 'bg-cyan-500/10 text-cyan-400'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Frozen ({frozenSessions.length})
              </button>
            )}
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
            {(mobileTab === 'active' ? activeSessions : mobileTab === 'frozen' ? frozenSessions : archivedSessions).map(session => (
              <LiveSessionCard
                key={session.id}
                name={session.projectName}
                lastLog={session.lastLog}
                activity={session.activity}
                isSelected={session.id === activeId}
                duration={session.duration}
                onClick={() => onSelect(session.id)}
                type={session.type}
                sessionId={session.id}
                draggable={session.status === 'running' && session.type !== 'conversation'}
                branch={session.branch}
                compact
              />
            ))}
            {mobileTab === 'active' && activeSessions.length === 0 && (
              <p className="text-xs text-gray-600 py-2">No active sessions</p>
            )}
            {mobileTab === 'frozen' && frozenSessions.length === 0 && (
              <p className="text-xs text-gray-600 py-2">No frozen sessions</p>
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
