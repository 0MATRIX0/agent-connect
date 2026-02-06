const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = process.env.AGENT_CONNECT_DATA_DIR || path.join(os.homedir(), '.agent-connect', 'data');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getProjects() {
  ensureDataDir();
  try {
    const data = fs.readFileSync(PROJECTS_FILE, 'utf-8');
    return JSON.parse(data);
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
  return project;
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

function getProject(id) {
  const projects = getProjects();
  return projects.find(p => p.id === id) || null;
}

module.exports = {
  getProjects,
  saveProjects,
  addProject,
  removeProject,
  getProject,
};
