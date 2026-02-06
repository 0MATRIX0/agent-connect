'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

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
    } catch (err) {
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
    } catch (err) {
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
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">Projects</h1>

      {/* Add Project Form */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Add Project</h2>
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 flex-1"
          />
          <input
            type="text"
            placeholder="/home/user/projects/my-project"
            value={projectPath}
            onChange={(e) => setProjectPath(e.target.value)}
            required
            className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 flex-[2]"
          />
          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 px-6 py-2 rounded-lg font-medium transition-colors whitespace-nowrap"
          >
            {submitting ? 'Adding...' : 'Add Project'}
          </button>
        </form>

        {error && (
          <p className="mt-3 text-sm text-red-400 bg-red-900/30 rounded px-3 py-2">
            {error}
          </p>
        )}
      </div>

      {/* Project List */}
      {loading ? (
        <p className="text-gray-400">Loading projects...</p>
      ) : projects.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400">
          <p className="text-lg mb-2">No projects yet</p>
          <p className="text-sm">Add a project above to get started with Claude Code sessions.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <div key={project.id} className="bg-gray-800 rounded-lg p-4 flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-white truncate">{project.name}</h3>
                <p className="text-sm text-gray-400 truncate font-mono">{project.path}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Added {new Date(project.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => handleLaunchSession(project)}
                  disabled={launching === project.id}
                  className="bg-green-600 hover:bg-green-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  {launching === project.id ? 'Launching...' : 'Launch Session'}
                </button>
                <button
                  onClick={() => handleDelete(project.id)}
                  className="bg-gray-700 hover:bg-red-600 px-3 py-2 rounded-lg text-sm transition-colors"
                  title="Remove project"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
