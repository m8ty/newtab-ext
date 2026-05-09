import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Fzf } from 'fzf';
import {
  loadLinks,
  loadFrecency,
  frecencyScore,
  loadWorkspaces,
  upsertWorkspace,
  deleteWorkspace,
  loadNotes,
  setNote,
  getWindowBinding,
  setWindowBinding,
} from './storage';

const faviconUrl = (pageUrl) => {
  const url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', '32');
  return url.toString();
};

const openInCurrentTab = async (url) => {
  const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (currentTab) chrome.tabs.update(currentTab.id, { url });
};

const goToOrOpen = (url) => {
  chrome.tabs.query({}, (tabs) => {
    const existing = tabs.find(t => t.url === url);
    if (existing) {
      chrome.tabs.update(existing.id, { active: true });
      if (existing.windowId != null) chrome.windows.update(existing.windowId, { focused: true });
    } else {
      openInCurrentTab(url);
    }
  });
};

const normalizeUrl = (url) => {
  if (!url) return '';
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`;
};

const hostnameOf = (url) => {
  try { return new URL(normalizeUrl(url)).hostname.toLowerCase(); } catch { return ''; }
};

const normalizeHost = (host) => (host || '').toLowerCase().trim().replace(/^www\./, '').replace(/^\./, '');

const hostMatches = (tabUrl, target) => {
  const tabHost = hostnameOf(tabUrl).replace(/^www\./, '');
  const t = normalizeHost(target);
  if (!tabHost || !t) return false;
  return tabHost === t || tabHost.endsWith('.' + t);
};

const focusOrOpen = (matchHost, openUrl) => {
  const target = normalizeHost(matchHost) || hostnameOf(openUrl);
  const fullUrl = normalizeUrl(openUrl);
  if (!target) { openInCurrentTab(fullUrl); return; }
  chrome.tabs.query({}, (tabs) => {
    const existing = tabs.find(t => hostMatches(t.url, target));
    if (existing) {
      chrome.tabs.update(existing.id, { active: true });
      if (existing.windowId != null) chrome.windows.update(existing.windowId, { focused: true });
    } else {
      openInCurrentTab(fullUrl);
    }
  });
};

const isShowable = (tab) => /^https?:/.test(tab?.url || '');

const panelRowStyle = (highlighted) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 10px',
  borderRadius: 6,
  fontSize: 13,
  cursor: 'pointer',
  background: highlighted ? 'rgba(0,170,119,0.08)' : 'transparent',
});

const Panel = ({ title, empty, items, renderItem }) => (
  <div style={{
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10,
    padding: 12,
  }}>
    <div style={{
      color: '#888',
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 8,
    }}>{title}</div>
    {items.length === 0 ? (
      <div style={{ color: '#555', fontSize: 12, fontStyle: 'italic' }}>{empty}</div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map(renderItem)}
      </div>
    )}
  </div>
);

const formatRelTime = (ts) => {
  if (!ts) return 'never';
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const NewTab = () => {
  const inputRef = useRef(null);
  const noteRef = useRef(null);
  const editingNoteRef = useRef(null);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('tabs'); // 'tabs' | 'bookmarks' | 'recent' | 'workspaces' | 'notes'
  const [tabs, setTabs] = useState([]);
  const [frecency, setFrecency] = useState({});
  const [bookmarkResults, setBookmarkResults] = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filteredTabs, setFilteredTabs] = useState([]);
  const [quickLinks, setQuickLinks] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [workspaces, setWorkspaces] = useState([]);
  const [notes, setNotes] = useState({});
  const [editingNote, setEditingNote] = useState(null);
  const [currentWindowId, setCurrentWindowId] = useState(null);
  const [boundWorkspaceId, setBoundWorkspaceId] = useState(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 200);
  }, []);

  useEffect(() => {
    editingNoteRef.current = editingNote;
    if (editingNote && noteRef.current) {
      noteRef.current.focus();
      const len = noteRef.current.value.length;
      noteRef.current.setSelectionRange(len, len);
    }
  }, [editingNote]);

  useEffect(() => {
    chrome.tabs.query({ currentWindow: true }).then(setTabs);
    loadFrecency().then(setFrecency);
    loadLinks().then(setQuickLinks);
    loadWorkspaces().then(setWorkspaces);
    loadNotes().then(setNotes);
    chrome.sessions.getRecentlyClosed({ maxResults: 25 }, (sessions) => {
      const tabsOnly = (sessions || [])
        .map(s => s.tab)
        .filter(Boolean)
        .filter(t => isShowable(t));
      setRecentSessions(tabsOnly);
    });
    chrome.windows.getCurrent().then(async (w) => {
      setCurrentWindowId(w.id);
      setBoundWorkspaceId(await getWindowBinding(w.id));
    });
  }, []);

  const searchBookmarks = (query) => {
    chrome.bookmarks.search({ query }, (results) => {
      setBookmarkResults((results || []).filter(r => r.url));
    });
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setInput(value);

    if (value.startsWith('@b ')) {
      setMode('bookmarks');
      searchBookmarks(value.slice(3));
    } else if (value === '@r' || value.startsWith('@r ')) {
      setMode('recent');
    } else if (value === '@s' || value.startsWith('@s ')) {
      setMode('workspaces');
    } else if (value === '@n' || value.startsWith('@n ')) {
      setMode('notes');
    } else {
      setMode('tabs');
    }
  };

  const saveCurrentWorkspace = async (name) => {
    const winTabs = await chrome.tabs.query({ currentWindow: true });
    const tabData = winTabs.filter(isShowable).map(t => ({ url: t.url, title: t.title }));
    if (!tabData.length) return;
    let target = null;
    if (name) target = workspaces.find(w => w.name === name);
    else if (boundWorkspaceId) target = workspaces.find(w => w.id === boundWorkspaceId);
    if (!name && !target) return;
    const entry = {
      id: target?.id || crypto.randomUUID(),
      name: name || target?.name,
      tabs: tabData,
      createdAt: target?.createdAt || Date.now(),
      updatedAt: Date.now(),
      lastUsed: target?.lastUsed || 0,
    };
    const list = await upsertWorkspace(entry);
    setWorkspaces(list);
    if (currentWindowId != null) {
      await setWindowBinding(currentWindowId, entry.id);
      setBoundWorkspaceId(entry.id);
    }
    setInput('');
    setMode('tabs');
    setShowDropdown(false);
  };

  const restoreWorkspace = async (workspace) => {
    if (!workspace.tabs?.length) return;
    const newWindow = await chrome.windows.create({ url: workspace.tabs.map(t => t.url) });
    if (newWindow?.id != null) {
      await setWindowBinding(newWindow.id, workspace.id);
    }
    const list = await upsertWorkspace({ ...workspace, lastUsed: Date.now() });
    setWorkspaces(list);
  };

  const removeWorkspace = async (id) => {
    const list = await deleteWorkspace(id);
    setWorkspaces(list);
  };

  const persistNote = async (url, text) => {
    const updated = await setNote(url, text);
    setNotes(updated);
  };

  const handleSearch = async (searchEngine) => {
    if (!input.trim()) return;
    const searchUrls = {
      google: `https://www.google.com/search?q=${encodeURIComponent(input)}`,
      brave: `https://search.brave.com/search?q=${encodeURIComponent(input)}`,
    };
    const url = searchUrls[searchEngine];
    if (!url) return;
    await openInCurrentTab(url);
    setInput('');
  };

  // Compute fzf-filtered tab results
  useEffect(() => {
    if (mode !== 'tabs' || !input.trim()) { setFilteredTabs([]); return; }
    const fzf = new Fzf(tabs.filter(isShowable), {
      selector: (item) => `${item.title} ${item.url}`,
      tiebreakers: [(a, b) => a.item.title.length - b.item.title.length],
    });
    setFilteredTabs(fzf.find(input));
  }, [input, tabs, mode]);

  // Frecency-sorted default tab list (shown when input is empty)
  const frecencyDefaults = useMemo(() => {
    const rank = (t) => {
      const f = frecencyScore(t.url, frecency);
      if (f > 0) return f;
      if (t.lastAccessed) {
        const hoursAgo = (Date.now() - t.lastAccessed) / 3600000;
        return Math.exp(-hoursAgo / 48) * 0.001;
      }
      return 0;
    };
    return tabs
      .filter(isShowable)
      .filter(t => !t.active)
      .sort((a, b) => rank(b) - rank(a))
      .slice(0, 8);
  }, [tabs, frecency]);

  // Filter recent sessions by query (after `@r `)
  const recentFiltered = useMemo(() => {
    if (mode !== 'recent') return [];
    const q = input.startsWith('@r ') ? input.slice(3).trim() : '';
    if (!q) return recentSessions;
    const fzf = new Fzf(recentSessions, {
      selector: (item) => `${item.title || ''} ${item.url || ''}`,
    });
    return fzf.find(q).map(r => r.item);
  }, [input, mode, recentSessions]);

  // Filter notes via fzf when there's a query
  const notesFiltered = useMemo(() => {
    if (mode !== 'notes') return [];
    const entries = Object.entries(notes).map(([url, text]) => ({ url, text }));
    const q = input.startsWith('@n ') ? input.slice(3).trim() : '';
    if (!q) return entries;
    const fzf = new Fzf(entries, {
      selector: (item) => `${item.text} ${item.url}`,
    });
    return fzf.find(q).map(r => r.item);
  }, [input, mode, notes]);

  // Filter workspaces via fzf when there's a query (other than `save <name>`)
  const workspacesFiltered = useMemo(() => {
    if (mode !== 'workspaces') return [];
    const q = input.startsWith('@s ') ? input.slice(3).trim() : '';
    const sorted = [...workspaces].sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
    if (!q || q.startsWith('save ')) return sorted;
    const fzf = new Fzf(sorted, { selector: (w) => w.name });
    return fzf.find(q).map(r => r.item);
  }, [input, mode, workspaces]);

  // Unified items list for the dropdown — same shape regardless of mode
  const items = useMemo(() => {
    if (mode === 'bookmarks') {
      return bookmarkResults.map(b => ({
        key: 'b-' + b.id,
        title: b.title || b.url,
        subtitle: b.url,
        url: b.url,
        note: notes[b.url],
        icon: faviconUrl(b.url),
        onSelect: () => goToOrOpen(b.url),
      }));
    }
    if (mode === 'recent') {
      return recentFiltered.map(r => ({
        key: 'r-' + r.sessionId,
        title: r.title || r.url,
        subtitle: r.url,
        url: r.url,
        note: notes[r.url],
        icon: r.favIconUrl || faviconUrl(r.url),
        onSelect: () => {
          chrome.tabs.query({}, (tabs) => {
            const existing = tabs.find(t => t.url === r.url);
            if (existing) {
              chrome.tabs.update(existing.id, { active: true });
              if (existing.windowId != null) chrome.windows.update(existing.windowId, { focused: true });
            } else {
              chrome.sessions.restore(r.sessionId);
            }
          });
        },
      }));
    }
    if (mode === 'workspaces') {
      const q = input.startsWith('@s ') ? input.slice(3).trim() : '';
      const result = [];
      const isSaveCmd = q === 'save' || q.startsWith('save ');
      if (isSaveCmd) {
        const name = q.startsWith('save ') ? q.slice(5).trim() : '';
        const tabCount = tabs.filter(isShowable).length;
        const bound = workspaces.find(w => w.id === boundWorkspaceId);
        const existingByName = name ? workspaces.find(w => w.name === name) : null;
        const target = existingByName || (!name ? bound : null);
        if (name || target) {
          result.push({
            key: 'save-action',
            title: target
              ? `Update workspace "${target.name}"`
              : `Save current window as "${name}"`,
            subtitle: `${tabCount} tabs · Enter to save`,
            icon: faviconUrl('https://example.com'),
            onSelect: () => saveCurrentWorkspace(name),
          });
        } else {
          result.push({
            key: 'save-hint',
            title: 'Type a name to save',
            subtitle: 'e.g. "@s save research" — or just "@s save" to update the current window',
            icon: faviconUrl('https://example.com'),
            onSelect: () => {},
          });
        }
      }
      result.push(...workspacesFiltered.map(w => ({
        key: 'w-' + w.id,
        title: w.id === boundWorkspaceId ? `${w.name} · current window` : w.name,
        subtitle: `${w.tabs.length} tabs · last used ${formatRelTime(w.lastUsed)}`,
        icon: w.tabs[0]?.url ? faviconUrl(w.tabs[0].url) : faviconUrl('https://example.com'),
        workspaceId: w.id,
        onSelect: () => restoreWorkspace(w),
      })));
      if (result.length === 0) {
        result.push({
          key: 'ws-hint',
          title: 'No workspaces yet',
          subtitle: 'Type "@s save <name>" to save the current window as a workspace',
          icon: faviconUrl('https://example.com'),
          onSelect: () => {},
        });
      }
      return result;
    }
    if (mode === 'notes') {
      const result = notesFiltered.map(n => ({
        key: 'n-' + n.url,
        title: n.text,
        subtitle: n.url,
        url: n.url,
        note: n.text,
        icon: faviconUrl(n.url),
        onSelect: () => goToOrOpen(n.url),
      }));
      if (result.length === 0) {
        result.push({
          key: 'notes-hint',
          title: Object.keys(notes).length === 0 ? 'No notes yet' : 'No matching notes',
          subtitle: 'Highlight any tab/bookmark/recent result and press Ctrl+E to add a note',
          icon: faviconUrl('https://example.com'),
          onSelect: () => {},
        });
      }
      return result;
    }
    if (input.trim()) {
      return filteredTabs.map(r => ({
        key: 't-' + r.item.id,
        title: r.item.title,
        subtitle: r.item.url,
        url: r.item.url,
        note: notes[r.item.url],
        icon: r.item.favIconUrl || faviconUrl(r.item.url),
        onSelect: () => chrome.tabs.update(r.item.id, { active: true }),
      }));
    }
    return frecencyDefaults.map(t => ({
      key: 't-' + t.id,
      title: t.title,
      subtitle: t.url,
      url: t.url,
      note: notes[t.url],
      icon: t.favIconUrl || faviconUrl(t.url),
      onSelect: () => chrome.tabs.update(t.id, { active: true }),
    }));
  }, [mode, input, tabs, bookmarkResults, recentFiltered, filteredTabs, frecencyDefaults, workspaces, workspacesFiltered, notes, notesFiltered, boundWorkspaceId]);

  // Reset selection when items change
  useEffect(() => { setSelectedIndex(0); }, [items.length, mode]);

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (editingNoteRef.current) return;
      if (e.key === '/' &&
        document.activeElement.tagName !== 'INPUT' &&
        document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setShowDropdown(true);
        inputRef.current?.focus();
        return;
      }

      if (document.activeElement === inputRef.current && !showDropdown && e.key.length === 1) {
        setShowDropdown(true);
      }

      if (document.activeElement !== inputRef.current) return;

      if (e.key === 'Escape') {
        setInput('');
        setMode('tabs');
        setShowDropdown(false);
        inputRef.current.blur();
      } else if (e.key === 'ArrowDown' || (e.ctrlKey && (e.key === 'j' || e.key === 'J'))) {
        e.preventDefault();
        setSelectedIndex(prev => prev < items.length - 1 ? prev + 1 : prev);
      } else if (e.key === 'ArrowUp' || (e.ctrlKey && (e.key === 'k' || e.key === 'K'))) {
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : 0);
      } else if (e.ctrlKey && (e.key === 'e' || e.key === 'E')) {
        const it = items[selectedIndex];
        if (it?.url) {
          e.preventDefault();
          setEditingNote({ url: it.url, title: it.title || it.url, text: notes[it.url] || '' });
        }
      } else if (e.ctrlKey && (e.key === 'Backspace' || e.key === 'Delete')) {
        const it = items[selectedIndex];
        if (it?.workspaceId) {
          e.preventDefault();
          removeWorkspace(it.workspaceId);
        }
      } else if (e.key === 'Enter') {
        if (e.ctrlKey && e.shiftKey) handleSearch('brave');
        else if (e.ctrlKey) handleSearch('google');
        else if (items.length > 0) items[selectedIndex]?.onSelect();
        else handleSearch('google');
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [items, selectedIndex, input, showDropdown, editingNote, notes]);

  const inputBg = mode === 'tabs' ? '#eef3e0' : 'white';

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '48px 20px',
      backgroundColor: '#000000',
      justifyContent: 'center',
    }}>
      <div style={{ width: '100%', maxWidth: '600px' }}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={handleInputChange}
          placeholder="Search · @b bookmarks · @r recent · @s workspaces · @n notes · Ctrl+E note"
          onMouseDown={() => setShowDropdown(true)}
          onBlur={() => setShowDropdown(false)}
          style={{
            width: '100%',
            padding: '12px 20px',
            fontSize: '16px',
            border: '1px solid #ddd',
            borderRadius: '24px',
            outline: 'none',
            boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
            marginBottom: '12px',
            backgroundColor: inputBg,
            color: 'black',
          }}
        />

        {editingNote && (
          <div style={{
            backgroundColor: 'white',
            borderRadius: 12,
            padding: 12,
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          }}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Note for: <strong>{editingNote.title}</strong>
            </div>
            <textarea
              ref={noteRef}
              value={editingNote.text}
              onChange={(e) => setEditingNote({ ...editingNote, text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  e.nativeEvent?.stopImmediatePropagation?.();
                  setEditingNote(null);
                  inputRef.current?.focus();
                } else if (e.key === 'Enter' && e.shiftKey) {
                  e.preventDefault();
                  e.stopPropagation();
                  e.nativeEvent?.stopImmediatePropagation?.();
                  const ta = noteRef.current;
                  const start = ta.selectionStart;
                  const end = ta.selectionEnd;
                  const next = editingNote.text.slice(0, start) + '\n' + editingNote.text.slice(end);
                  setEditingNote({ ...editingNote, text: next });
                  requestAnimationFrame(() => {
                    if (noteRef.current) noteRef.current.setSelectionRange(start + 1, start + 1);
                  });
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  e.nativeEvent?.stopImmediatePropagation?.();
                  persistNote(editingNote.url, editingNote.text);
                  setEditingNote(null);
                  inputRef.current?.focus();
                }
              }}
              placeholder="Add a note for this tab"
              style={{
                width: '100%',
                minHeight: 60,
                border: '1px solid #ddd',
                borderRadius: 6,
                padding: 8,
                fontSize: 14,
                outline: 'none',
                resize: 'vertical',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
            <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>
              Enter to save · Shift+Enter for newline · Esc to cancel · empty saves clears
            </div>
          </div>
        )}

        {!editingNote && showDropdown && items.length > 0 && (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            overflow: 'hidden',
          }}>
            {items.map((it, index) => (
              <div
                key={it.key}
                style={{
                  padding: '12px 16px',
                  cursor: 'pointer',
                  backgroundColor: index === selectedIndex ? '#f0f0f0' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={it.onSelect}
              >
                <img
                  src={it.icon}
                  style={{ width: 16, height: 16, flexShrink: 0 }}
                  alt=""
                />
                <div style={{
                  overflow: 'hidden',
                  minWidth: 0,
                  flex: 1,
                }}>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    marginBottom: '2px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {it.title}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: '#666',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {it.subtitle}
                  </div>
                  {it.note && mode !== 'notes' && (
                    <div style={{
                      fontSize: '11px',
                      color: '#0a7',
                      marginTop: 3,
                      fontStyle: 'italic',
                      borderLeft: '2px solid #0a7',
                      paddingLeft: 6,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {it.note}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        justifyContent: 'center',
        marginTop: 24,
        flexWrap: 'wrap',
      }}>
        {quickLinks.map((link) => (
          <div
            key={link.id || link.url}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => focusOrOpen(link.host || hostnameOf(link.url), link.url)}
            style={{
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: 8,
            }}
          >
            <img
              src={link.icon || faviconUrl(link.url)}
              style={{ width: 32, height: 32 }}
              alt=""
            />
            <span style={{ color: 'white', fontSize: 13 }}>{link.name}</span>
          </div>
        ))}
        {quickLinks.length === 0 && (
          <button
            onMouseDown={(e) => e.preventDefault()}
            tabIndex={-1}
            onClick={() => chrome.runtime.openOptionsPage()}
            style={{
              background: 'transparent',
              color: '#888',
              border: '1px dashed #444',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            + Add quick links
          </button>
        )}
      </div>

      <div style={{
        width: '100%',
        maxWidth: 600,
        marginTop: 32,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 16,
      }}>
        <Panel
          title="Workspaces"
          empty='Type "@s save name" to save the current window'
          items={[...workspaces].sort((a, b) => (b.lastUsed || b.updatedAt) - (a.lastUsed || a.updatedAt)).slice(0, 5)}
          renderItem={(w) => (
            <div
              key={w.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => restoreWorkspace(w)}
              style={panelRowStyle(w.id === boundWorkspaceId)}
              title={w.tabs.map(t => t.title).join('\n')}
            >
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                <span style={{ color: '#eee' }}>{w.name}</span>
                {w.id === boundWorkspaceId && (
                  <span style={{ color: '#0a7', fontSize: 10, marginLeft: 6 }}>● current</span>
                )}
              </div>
              <span style={{ color: '#666', fontSize: 11, flexShrink: 0 }}>{w.tabs.length}</span>
            </div>
          )}
        />
        <Panel
          title="Notes"
          empty='Highlight a result and press Ctrl+E to add a note'
          items={Object.entries(notes).slice(0, 5)}
          renderItem={([url, text]) => (
            <div
              key={url}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => goToOrOpen(url)}
              style={panelRowStyle(false)}
              title={url + '\n' + text}
            >
              <img src={faviconUrl(url)} style={{ width: 12, height: 12, flexShrink: 0, opacity: 0.8 }} alt="" />
              <span style={{
                color: '#ddd',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
                minWidth: 0,
              }}>{text}</span>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingNote({ url, title: url, text });
                }}
                title="Edit note"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#666',
                  cursor: 'pointer',
                  padding: '0 4px',
                  fontSize: 13,
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >
                ✎
              </button>
            </div>
          )}
        />
      </div>

      <button
        onMouseDown={(e) => e.preventDefault()}
        tabIndex={-1}
        onClick={() => chrome.runtime.openOptionsPage()}
        title="Settings"
        aria-label="Settings"
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          width: 48,
          height: 48,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '50%',
          color: '#bbb',
          fontSize: 26,
          lineHeight: 1,
          cursor: 'pointer',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ⚙
      </button>
    </div>
  );
};

const rootElement = document.getElementById('root');
const root = createRoot(rootElement);
root.render(<NewTab />);
