export const DEFAULT_LINKS = [];

export const loadLinks = async () => {
  const { quickLinks } = await chrome.storage.sync.get('quickLinks');
  return Array.isArray(quickLinks) ? quickLinks : DEFAULT_LINKS;
};

export const saveLinks = (links) => chrome.storage.sync.set({ quickLinks: links });

export const loadFrecency = async () => {
  const { frecency = {} } = await chrome.storage.local.get('frecency');
  return frecency;
};

export const frecencyScore = (url, frecency) => {
  const e = frecency[url];
  if (!e) return 0;
  const hoursAgo = (Date.now() - e.lastAccessed) / 3600000;
  return e.count * Math.exp(-hoursAgo / 48);
};

export const loadWorkspaces = async () => {
  const { workspaces = [] } = await chrome.storage.local.get('workspaces');
  return workspaces;
};

export const saveWorkspaces = (workspaces) =>
  chrome.storage.local.set({ workspaces });

export const upsertWorkspace = async (workspace) => {
  const list = await loadWorkspaces();
  const idx = list.findIndex(w => w.id === workspace.id || w.name === workspace.name);
  if (idx >= 0) list[idx] = { ...list[idx], ...workspace };
  else list.push(workspace);
  await saveWorkspaces(list);
  return list;
};

export const deleteWorkspace = async (id) => {
  const list = (await loadWorkspaces()).filter(w => w.id !== id);
  await saveWorkspaces(list);
  return list;
};

export const loadNotes = async () => {
  const { notes = {} } = await chrome.storage.sync.get('notes');
  return notes;
};

export const setNote = async (url, text) => {
  const { notes = {} } = await chrome.storage.sync.get('notes');
  const trimmed = (text || '').trim();
  if (trimmed) notes[url] = trimmed;
  else delete notes[url];
  await chrome.storage.sync.set({ notes });
  return notes;
};

export const getWindowBinding = async (windowId) => {
  if (windowId == null) return null;
  const { windowWorkspaces = {} } = await chrome.storage.session.get('windowWorkspaces');
  return windowWorkspaces[windowId] || null;
};

export const setWindowBinding = async (windowId, workspaceId) => {
  if (windowId == null) return;
  const { windowWorkspaces = {} } = await chrome.storage.session.get('windowWorkspaces');
  windowWorkspaces[windowId] = workspaceId;
  await chrome.storage.session.set({ windowWorkspaces });
};
