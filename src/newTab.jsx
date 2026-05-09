import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Fzf } from 'fzf';
import { loadLinks, loadFrecency, frecencyScore } from './storage';

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

const hostnameOf = (url) => {
  try { return new URL(url).hostname; } catch { return ''; }
};

const focusOrOpen = (matchHost, openUrl) => {
  if (!matchHost) { chrome.tabs.create({ url: openUrl }); return; }
  chrome.tabs.query({ currentWindow: true }, (tabs) => {
    const existing = tabs.find(t => t.url && hostnameOf(t.url).endsWith(matchHost));
    if (existing) chrome.tabs.update(existing.id, { active: true });
    else chrome.tabs.create({ url: openUrl });
  });
};

const isShowable = (tab) => /^https?:/.test(tab?.url || '');

const NewTab = () => {
  const inputRef = useRef(null);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('tabs'); // 'tabs' | 'bookmarks' | 'recent'
  const [tabs, setTabs] = useState([]);
  const [frecency, setFrecency] = useState({});
  const [bookmarkResults, setBookmarkResults] = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filteredTabs, setFilteredTabs] = useState([]);
  const [quickLinks, setQuickLinks] = useState([]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 200);
  }, []);

  useEffect(() => {
    chrome.tabs.query({ currentWindow: true }).then(setTabs);
    loadFrecency().then(setFrecency);
    loadLinks().then(setQuickLinks);
    chrome.sessions.getRecentlyClosed({ maxResults: 25 }, (sessions) => {
      const tabsOnly = (sessions || [])
        .map(s => s.tab)
        .filter(Boolean)
        .filter(t => isShowable(t));
      setRecentSessions(tabsOnly);
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
    } else {
      setMode('tabs');
    }
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

  // Unified items list for the dropdown — same shape regardless of mode
  const items = useMemo(() => {
    if (mode === 'bookmarks') {
      return bookmarkResults.map(b => ({
        key: 'b-' + b.id,
        title: b.title || b.url,
        subtitle: b.url,
        icon: faviconUrl(b.url),
        onSelect: () => openInCurrentTab(b.url),
      }));
    }
    if (mode === 'recent') {
      return recentFiltered.map(r => ({
        key: 'r-' + r.sessionId,
        title: r.title || r.url,
        subtitle: r.url,
        icon: r.favIconUrl || faviconUrl(r.url),
        onSelect: () => chrome.sessions.restore(r.sessionId),
      }));
    }
    if (input.trim()) {
      return filteredTabs.map(r => ({
        key: 't-' + r.item.id,
        title: r.item.title,
        subtitle: r.item.url,
        icon: r.item.favIconUrl || faviconUrl(r.item.url),
        onSelect: () => chrome.tabs.update(r.item.id, { active: true }),
      }));
    }
    return frecencyDefaults.map(t => ({
      key: 't-' + t.id,
      title: t.title,
      subtitle: t.url,
      icon: t.favIconUrl || faviconUrl(t.url),
      onSelect: () => chrome.tabs.update(t.id, { active: true }),
    }));
  }, [mode, input, bookmarkResults, recentFiltered, filteredTabs, frecencyDefaults]);

  // Reset selection when items change
  useEffect(() => { setSelectedIndex(0); }, [items.length, mode]);

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === '/' &&
        document.activeElement.tagName !== 'INPUT' &&
        document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }

      if (document.activeElement !== inputRef.current) return;

      if (e.key === 'Escape') {
        setInput('');
        setMode('tabs');
        inputRef.current.blur();
      } else if (e.key === 'ArrowDown' || (e.ctrlKey && (e.key === 'j' || e.key === 'J'))) {
        e.preventDefault();
        setSelectedIndex(prev => prev < items.length - 1 ? prev + 1 : prev);
      } else if (e.key === 'ArrowUp' || (e.ctrlKey && (e.key === 'k' || e.key === 'K'))) {
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : 0);
      } else if (e.key === 'Enter') {
        if (e.ctrlKey && e.shiftKey) handleSearch('brave');
        else if (e.ctrlKey) handleSearch('google');
        else if (items.length > 0) items[selectedIndex]?.onSelect();
        else handleSearch('google');
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [items, selectedIndex, input]);

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
          placeholder="Search tabs · @b bookmarks · @r recently closed · Ctrl+Enter web · / to focus"
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
          autoFocus
        />

        {items.length > 0 && (
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
                onClick={it.onSelect}
              >
                <img
                  src={it.icon}
                  style={{ width: 16, height: 16, flexShrink: 0 }}
                  alt=""
                />
                <div style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                  flex: 1,
                }}>
                  <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '2px' }}>
                    {it.title}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    {it.subtitle}
                  </div>
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
      </div>
    </div>
  );
};

const rootElement = document.getElementById('root');
const root = createRoot(rootElement);
root.render(<NewTab />);
