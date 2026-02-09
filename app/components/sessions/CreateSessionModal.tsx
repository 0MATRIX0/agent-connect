'use client';

import { useState, useEffect } from 'react';
import { Play, Plus, ChevronDown } from 'lucide-react';
import Drawer from '../ui/Drawer';

interface Project {
  id: string;
  name: string;
  path: string;
}

interface CreateSessionModalProps {
  open: boolean;
  onClose: () => void;
  onSessionCreated: (sessionId: string) => void;
}

export default function CreateSessionModal({ open, onClose, onSessionCreated }: CreateSessionModalProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState('');

  // Inline add project form
  const [showAddProject, setShowAddProject] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPath, setNewPath] = useState('');
  const [addingProject, setAddingProject] = useState(false);

  useEffect(() => {
    if (open) {
      fetchProjects();
      setError('');
      setSelectedProjectId('');
      setShowAddProject(false);
      setNewName('');
      setNewPath('');
    }
  }, [open]);

  async function fetchProjects() {
    setLoadingProjects(true);
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setProjects(Array.isArray(data) ? data : []);
    } catch {
      setError('Failed to load projects');
    } finally {
      setLoadingProjects(false);
    }
  }

  async function handleAddProject(e: React.FormEvent) {
    e.preventDefault();
    setAddingProject(true);
    setError('');

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, path: newPath }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to add project');
        return;
      }

      setNewName('');
      setNewPath('');
      setShowAddProject(false);
      await fetchProjects();
      setSelectedProjectId(data.id);
    } catch {
      setError('Failed to add project');
    } finally {
      setAddingProject(false);
    }
  }

  async function handleLaunch() {
    if (!selectedProjectId) return;
    setLaunching(true);
    setError('');

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: selectedProjectId }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to launch session');
        return;
      }

      onSessionCreated(data.id);
      onClose();
    } catch {
      setError('Failed to launch session');
    } finally {
      setLaunching(false);
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Create Session" side="right">
      <div className="p-5 space-y-5">
        {/* Project selector */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Project</label>
          {loadingProjects ? (
            <p className="text-sm text-gray-500">Loading projects...</p>
          ) : (
            <div className="relative">
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full appearance-none bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 pr-8 text-sm text-white focus:outline-none focus:border-white/20 transition-colors"
              >
                <option value="" className="bg-void text-gray-400">Select a project...</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id} className="bg-void text-white">
                    {p.name} — {p.path}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            </div>
          )}
        </div>

        {/* Add Project toggle */}
        {!showAddProject ? (
          <button
            onClick={() => setShowAddProject(true)}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Project
          </button>
        ) : (
          <form onSubmit={handleAddProject} className="space-y-3 p-3 rounded-lg border border-white/10 bg-white/[0.03]">
            <h3 className="text-sm font-medium text-gray-300">New Project</h3>
            <div>
              <label htmlFor="new-project-name" className="sr-only">Project name</label>
              <input
                id="new-project-name"
                type="text"
                placeholder="Project name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/20 transition-colors"
              />
            </div>
            <div>
              <label htmlFor="new-project-path" className="sr-only">Project path</label>
              <input
                id="new-project-path"
                type="text"
                placeholder="/home/user/projects/my-project"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/20 transition-colors font-mono"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={addingProject}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
              >
                {addingProject ? 'Adding...' : 'Add'}
              </button>
              <button
                type="button"
                onClick={() => { setShowAddProject(false); setNewName(''); setNewPath(''); }}
                className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Error */}
        {error && (
          <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {/* Launch button */}
        <button
          onClick={handleLaunch}
          disabled={!selectedProjectId || launching}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Play className="w-4 h-4" />
          {launching ? 'Launching...' : 'Launch Session'}
        </button>
      </div>
    </Drawer>
  );
}
