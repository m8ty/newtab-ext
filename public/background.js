const KEY = 'frecency';
const MAX_ENTRIES = 500;

const isTrackable = (url) => /^https?:/.test(url || '');

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!isTrackable(tab.url)) return;
    const { [KEY]: data = {} } = await chrome.storage.local.get(KEY);
    const entry = data[tab.url] || { count: 0, lastAccessed: 0 };
    entry.count += 1;
    entry.lastAccessed = Date.now();
    data[tab.url] = entry;
    const urls = Object.keys(data);
    if (urls.length > MAX_ENTRIES) {
      urls.sort((a, b) => data[a].lastAccessed - data[b].lastAccessed);
      for (let i = 0; i < urls.length - MAX_ENTRIES; i++) delete data[urls[i]];
    }
    await chrome.storage.local.set({ [KEY]: data });
  } catch {}
});
