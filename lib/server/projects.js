const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const worktree = require('./worktree');

const DATA_DIR = process.env.AGENT_CONNECT_DATA_DIR || path.join(os.homedir(), '.agent-connect', 'data');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function enrichProject(project) {
  return { ...project, isGitRepo: worktree.isGitRepo(project.path) };
}

function getProjects() {
  ensureDataDir();
  try {
    const data = fs.readFileSync(PROJECTS_FILE, 'utf-8');
    return JSON.parse(data).map(enrichProject);
  } catch {
    return [];
  }
}

function saveProjects(projects) {
  ensureDataDir();
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2));
}

function addProject(name, projectPath) {
  if (!name || !projectPath) {
    throw new Error('Name and path are required');
  }

  const resolvedPath = path.resolve(projectPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Path does not exist: ${resolvedPath}`);
  }

  const stat = fs.statSync(resolvedPath);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${resolvedPath}`);
  }

  const projects = getProjects();
  const existing = projects.find(p => p.path === resolvedPath);
  if (existing) {
    throw new Error(`Project already exists at this path: ${existing.name}`);
  }

  const project = {
    id: uuidv4(),
    name,
    path: resolvedPath,
    createdAt: new Date().toISOString(),
  };

  projects.push(project);
  saveProjects(projects);
  return enrichProject(project);
}

function removeProject(id) {
  const projects = getProjects();
  const index = projects.findIndex(p => p.id === id);
  if (index === -1) {
    throw new Error('Project not found');
  }
  const removed = projects.splice(index, 1)[0];
  saveProjects(projects);
  return removed;
}

function updateProject(id, { name, path: projectPath } = {}) {
  const projects = getProjects();
  const index = projects.findIndex(p => p.id === id);
  if (index === -1) {
    throw new Error('Project not found');
  }

  if (name !== undefined) {
    if (!name || typeof name !== 'string') {
      throw new Error('Name must be a non-empty string');
    }
    projects[index].name = name.trim();
  }

  if (projectPath !== undefined) {
    if (!projectPath || typeof projectPath !== 'string') {
      throw new Error('Path must be a non-empty string');
    }
    const resolvedPath = path.resolve(projectPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Path does not exist: ${resolvedPath}`);
    }
    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${resolvedPath}`);
    }
    const duplicate = projects.find(p => p.path === resolvedPath && p.id !== id);
    if (duplicate) {
      throw new Error(`Another project already exists at this path: ${duplicate.name}`);
    }
    projects[index].path = resolvedPath;
  }

  saveProjects(projects);
  return enrichProject(projects[index]);
}

function getProject(id) {
  ensureDataDir();
  try {
    const data = fs.readFileSync(PROJECTS_FILE, 'utf-8');
    const projects = JSON.parse(data);
    const project = projects.find(p => p.id === id);
    return project ? enrichProject(project) : null;
  } catch {
    return null;
  }
}

function reorderProjects(orderedIds) {
  if (!Array.isArray(orderedIds)) {
    throw new Error('orderedIds must be an array');
  }

  const projects = getProjects();

  if (orderedIds.length !== projects.length) {
    throw new Error('orderedIds length must match the number of projects');
  }

  const projectMap = new Map(projects.map(p => [p.id, p]));

  for (const id of orderedIds) {
    if (!projectMap.has(id)) {
      throw new Error(`Project not found: ${id}`);
    }
  }

  const reordered = orderedIds.map(id => projectMap.get(id));
  saveProjects(reordered);
  return reordered;
}

module.exports = {
  getProjects,
  saveProjects,
  addProject,
  removeProject,
  updateProject,
  getProject,
  reorderProjects,
};
