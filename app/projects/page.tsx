'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Trash2, FolderOpen } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import IconButton from '../components/ui/IconButton';

interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: string;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [projectPath, setProjectPath] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [launching, setLaunching] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      setProjects(Array.isArray(data) ? data : []);
    } catch {
      setError('Failed to load projects');
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, path: projectPath }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to add project');
        return;
      }

      setName('');
      setProjectPath('');
      fetchProjects();
    } catch {
      setError('Failed to add project');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to remove this project?')) return;

    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchProjects();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to delete project');
      }
    } catch {
      setError('Failed to delete project');
    }
  }

  async function handleLaunchSession(project: Project) {
    setLaunching(project.id);
    setError('');

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to launch session');
        return;
      }

      router.push(`/terminal/${data.id}`);
    } catch {
      setError('Failed to launch session');
    } finally {
      setLaunching(null);
    }
  }

  return (
    <main className="px-4 sm:px-6 lg:px-8 py-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-white">Manage Projects</h1>

      {/* Add Project Form */}
      <GlassCard className="p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 text-white">Add Project</h2>
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="glass-input flex-1"
          />
          <input
            type="text"
            placeholder="/home/user/projects/my-project"
            value={projectPath}
            onChange={(e) => setProjectPath(e.target.value)}
            required
            className="glass-input flex-[2]"
          />
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2 rounded-lg font-medium transition-all whitespace-nowrap bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            {submitting ? 'Adding...' : 'Add Project'}
          </button>
        </form>

        {error && (
          <p className="mt-3 text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </GlassCard>

      {/* Project List */}
      {loading ? (
        <p className="text-gray-500">Loading projects...</p>
      ) : projects.length === 0 ? (
        <GlassCard className="p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3">
            <FolderOpen className="w-6 h-6 text-gray-500" />
          </div>
          <p className="text-gray-400 mb-1">No projects yet</p>
          <p className="text-gray-600 text-sm">Add a project above to get started with Claude Code sessions.</p>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <GlassCard key={project.id} hover className="p-4 flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-white truncate">{project.name}</h3>
                <p className="text-sm text-gray-500 truncate font-mono">{project.path}</p>
                <p className="text-xs text-gray-600 mt-1">
                  Added {new Date(project.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0 items-center">
                <button
                  onClick={() => handleLaunchSession(project)}
                  disabled={launching === project.id}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5" />
                  {launching === project.id ? 'Launching...' : 'Launch'}
                </button>
                <IconButton
                  icon={Trash2}
                  label="Delete project"
                  variant="danger"
                  onClick={() => handleDelete(project.id)}
                />
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </main>
  );
}
