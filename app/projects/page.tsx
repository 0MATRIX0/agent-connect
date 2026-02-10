'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Reorder, useDragControls } from 'framer-motion';
import { Play, Trash2, FolderOpen, Pencil, Check, X, GripVertical } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import IconButton from '../components/ui/IconButton';

interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: string;
}

function ProjectCard({
  project,
  editingId,
  editName,
  editPath,
  setEditName,
  setEditPath,
  updating,
  launching,
  onLaunch,
  onEdit,
  onCancelEdit,
  onUpdate,
  onDelete,
}: {
  project: Project;
  editingId: string | null;
  editName: string;
  editPath: string;
  setEditName: (v: string) => void;
  setEditPath: (v: string) => void;
  updating: boolean;
  launching: string | null;
  onLaunch: (p: Project) => void;
  onEdit: (p: Project) => void;
  onCancelEdit: () => void;
  onUpdate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const dragControls = useDragControls();
  const isEditing = editingId === project.id;

  return (
    <Reorder.Item
      value={project}
      dragListener={false}
      dragControls={dragControls}
      className="list-none"
    >
      <GlassCard hover className="p-4">
        {isEditing ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Project name"
                className="glass-input flex-1"
                autoFocus
              />
              <input
                type="text"
                value={editPath}
                onChange={(e) => setEditPath(e.target.value)}
                placeholder="Project path"
                className="glass-input flex-[2]"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={onCancelEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all bg-white/5 text-gray-400 hover:bg-white/10"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
              <button
                onClick={() => onUpdate(project.id)}
                disabled={updating || !editName.trim() || !editPath.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                {updating ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="cursor-grab active:cursor-grabbing touch-none text-gray-600 hover:text-gray-400 transition-colors flex-shrink-0"
            >
              <GripVertical className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-white truncate">{project.name}</h3>
              <p className="text-sm text-gray-500 truncate font-mono">{project.path}</p>
              <p className="text-xs text-gray-600 mt-1">
                Added {new Date(project.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0 items-center">
              <button
                onClick={() => onLaunch(project)}
                disabled={launching === project.id}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" />
                {launching === project.id ? 'Launching...' : 'Launch'}
              </button>
              <IconButton
                icon={Pencil}
                label="Edit project"
                onClick={() => onEdit(project)}
              />
              <IconButton
                icon={Trash2}
                label="Delete project"
                variant="danger"
                onClick={() => onDelete(project.id)}
              />
            </div>
          </div>
        )}
      </GlassCard>
    </Reorder.Item>
  );
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPath, setEditPath] = useState('');
  const [updating, setUpdating] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  async function saveOrder(reordered: Project[]) {
    try {
      await fetch('/api/projects/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: reordered.map(p => p.id) }),
      });
    } catch {
      // Silently fail — order is already updated in UI
    }
  }

  function handleReorder(newOrder: Project[]) {
    setProjects(newOrder);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveOrder(newOrder), 300);
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

      router.push(`/sessions?new=${data.id}`);
    } catch {
      setError('Failed to launch session');
    } finally {
      setLaunching(null);
    }
  }

  function startEditing(project: Project) {
    setEditingId(project.id);
    setEditName(project.name);
    setEditPath(project.path);
    setError('');
  }

  function cancelEditing() {
    setEditingId(null);
    setEditName('');
    setEditPath('');
    setError('');
  }

  async function handleUpdate(id: string) {
    setError('');
    setUpdating(true);

    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, path: editPath }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to update project');
        return;
      }

      setEditingId(null);
      fetchProjects();
    } catch {
      setError('Failed to update project');
    } finally {
      setUpdating(false);
    }
  }

  return (
    <main className="px-4 sm:px-6 lg:px-8 py-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-white">Manage Projects</h1>

      {/* Add Project Form */}
      <GlassCard className="p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 text-white">Add Project</h2>
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3">
          <label htmlFor="project-name" className="sr-only">Project name</label>
          <input
            id="project-name"
            type="text"
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="glass-input flex-1"
          />
          <label htmlFor="project-path" className="sr-only">Project path</label>
          <input
            id="project-path"
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
        <Reorder.Group
          axis="y"
          values={projects}
          onReorder={handleReorder}
          className="space-y-3"
        >
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              editingId={editingId}
              editName={editName}
              editPath={editPath}
              setEditName={setEditName}
              setEditPath={setEditPath}
              updating={updating}
              launching={launching}
              onLaunch={handleLaunchSession}
              onEdit={startEditing}
              onCancelEdit={cancelEditing}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </Reorder.Group>
      )}
    </main>
  );
}
