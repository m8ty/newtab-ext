export const DEFAULT_LINKS = [
  { id: 'chatgpt', name: 'ChatGpt', url: 'https://chatgpt.com', host: 'chatgpt.com', icon: 'chatgpt.png' },
  { id: 'perplexity', name: 'Perplexity', url: 'https://perplexity.ai', host: 'perplexity.ai', icon: 'perplexity.png' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai/new', host: 'claude.ai', icon: 'claude.png' },
];

export const loadLinks = async () => {
  const { quickLinks } = await chrome.storage.sync.get('quickLinks');
  return Array.isArray(quickLinks) && quickLinks.length ? quickLinks : DEFAULT_LINKS;
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
