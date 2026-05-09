import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Fzf } from 'fzf';

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
  chrome.tabs.query({ currentWindow: true }, (tabs) => {
    const existing = tabs.find(t => t.url && hostnameOf(t.url).endsWith(matchHost));
    if (existing) chrome.tabs.update(existing.id, { active: true });
    else chrome.tabs.create({ url: openUrl });
  });
};

const NewTab = () => {
  const inputRef = useRef(null);
  const [input, setInput] = useState('');
  const [tabs, setTabs] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filteredTabs, setFilteredTabs] = useState([]);
  const [bookmarkResults, setBookmarkResults] = useState([]);
  const [isBookmarkSearch, setIsBookmarkSearch] = useState(false);

  const searchBookmarks = async (query) => {
    chrome.bookmarks.search({ query: query }, (results) => {
      setBookmarkResults(results);
      setFilteredTabs([]); // Clear tab results when showing bookmarks
      setIsBookmarkSearch(true);
    });
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setInput(value);

    if (value.startsWith('@b ')) {
      const bookmarkQuery = value.substring(3); // Extract the query after "@b "
      searchBookmarks(bookmarkQuery);
      setIsBookmarkSearch(true);
    } else {
      setIsBookmarkSearch(false);
      setBookmarkResults([]); // Clear bookmark results if not a bookmark search
    }
  };

  useEffect(() => {
    // Delay focus shift to allow Chrome to first focus the address bar
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 200);
  }, []);


  useEffect(() => {
    // Load initial tabs
    chrome.tabs.query({ currentWindow: true }).then(setTabs);
  }, []);

  const handleSearch = async (searchEngine) => {
    if (!input.trim()) return;

    const searchUrls = {
      google: `https://www.google.com/search?q=${encodeURIComponent(input)}`,
      brave: `https://search.brave.com/search?q=${encodeURIComponent(input)}`
    };

    const url = searchUrls[searchEngine];
    if (url) {
      // Get current tab
      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      // Update current tab's URL
      chrome.tabs.update(currentTab.id, { url });
      setInput('');
    }
  };

  useEffect(() => {
    const handleKeyPress = (e) => {
      // Focus input when "/" is pressed, unless we're already in an input/textarea
      if (e.key === '/' &&
        document.activeElement.tagName !== 'INPUT' &&
        document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }

      if (document.activeElement !== inputRef.current) return;

      const activeList = isBookmarkSearch ? bookmarkResults : filteredTabs;

      if (e.key === 'Escape') {
        setInput('');
        inputRef.current.blur();
      } else if (e.key === 'ArrowDown' || (e.ctrlKey && (e.key === 'j' || e.key === 'J'))) {
        e.preventDefault();
        setSelectedIndex(prev => prev < activeList.length - 1 ? prev + 1 : prev);
      } else if (e.key === 'ArrowUp' || (e.ctrlKey && (e.key === 'k' || e.key === 'K'))) {
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : 0);
      } else if (e.key === 'Enter') {
        if (e.ctrlKey && e.shiftKey) {
          handleSearch('brave');
        } else if (e.ctrlKey) {
          handleSearch('google');
        } else if (!isBookmarkSearch && filteredTabs.length > 0) {
          chrome.tabs.update(filteredTabs[selectedIndex].item.id, { active: true });
        } else if (isBookmarkSearch && bookmarkResults.length > 0) {
          openInCurrentTab(bookmarkResults[selectedIndex].url);
        } else {
          handleSearch('google');
        }
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [filteredTabs, bookmarkResults, selectedIndex, input, isBookmarkSearch]);

  // Update filtered results when input changes
  useEffect(() => {
    if (!input || isBookmarkSearch) {
      setFilteredTabs([]);
      setSelectedIndex(0);
      return;
    }

    const fzf = new Fzf(tabs, {
      selector: (item) => `${item.title} ${item.url}`,
      tiebreakers: [(a, b) => b.item.title.length - a.item.title.length]
    });

    const results = fzf.find(input);
    setFilteredTabs(results);
    setSelectedIndex(0);
  }, [input, tabs, isBookmarkSearch]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '48px 20px',
      backgroundColor: '#000000',
      justifyContent: 'center'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '600px',
      }}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          // onChange={(e) => setInput(e.target.value)}
          onChange={handleInputChange}
          placeholder='Search tabs (Focus with /) or web (Ctrl+Enter for Google, Ctrl+Shift+Enter for Brave)'
          style={{
            width: '100%',
            padding: '12px 20px',
            fontSize: '16px',
            border: '1px solid #ddd',
            borderRadius: '24px',
            outline: 'none',
            boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
            marginBottom: '12px',
            backgroundColor: isBookmarkSearch ? 'white' : '#eef3e0',
            color: isBookmarkSearch ? 'black' : 'black'
          }}
          autoFocus
        />
        {isBookmarkSearch && bookmarkResults.length > 0 && (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            overflow: 'hidden'
          }}>
            {bookmarkResults.map((bookmark, index) => (
              <div
                key={bookmark.id}
                style={{
                  padding: '12px 16px',
                  cursor: 'pointer',
                  backgroundColor: index === selectedIndex ? '#f0f0f0' : '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}
                onClick={() => openInCurrentTab(bookmark.url)}
              >
                <img
                  src={faviconUrl(bookmark.url)}
                  style={{
                    width: 16,
                    height: 16,
                    flexShrink: 0
                  }}
                  alt=""
                />
                <div style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    marginBottom: '2px'
                  }}>
                    {bookmark.title}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: '#666',
                  }}>
                    {bookmark.url}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!isBookmarkSearch && filteredTabs.length > 0 && (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            overflow: 'hidden'
          }}>
            {filteredTabs.map((result, index) => (
              <div
                key={result.item.id}
                style={{
                  padding: '12px 16px',
                  cursor: 'pointer',
                  backgroundColor: index === selectedIndex ? '#f0f0f0' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}
                onClick={() => {
                  chrome.tabs.update(result.item.id, { active: true });
                }}
              >
                <img
                  src={result.item.favIconUrl || faviconUrl(result.item.url)}
                  style={{
                    width: 16,
                    height: 16,
                    flexShrink: 0
                  }}
                  alt=""
                />
                <div style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    marginBottom: '2px'
                  }}>
                    {result.item.title}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: '#666',
                  }}>
                    {result.item.url}
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

      }}
      >

        <div
          onClick={() => focusOrOpen('chatgpt.com', 'https://chatgpt.com')}>

          <img src="chatgpt.png" style={{
            width: '32px',
            height: '32px'
          }} />
          <span style={{ color: 'white' }}>
            ChatGpt
          </span>

        </div>

        <div
          onClick={() => focusOrOpen('perplexity.ai', 'https://perplexity.ai')}>

          <img src="perplexity.png" style={{
            width: '32px',
            height: '32px'
          }} />
          <span style={{ color: 'white' }}>

            Perplexity
          </span>

        </div>

        <div
          onClick={() => focusOrOpen('claude.ai', 'https://claude.ai/new')}>

          <img src="claude.png" style={{
            width: '32px',
            height: '32px'
          }} />
          <span style={{ color: 'white' }}>
            Claude
          </span>

        </div>
      </div>

    </div>
  );
};

const rootElement = document.getElementById('root');
const root = createRoot(rootElement);
root.render(<NewTab />);
