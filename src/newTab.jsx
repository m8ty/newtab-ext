import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Fzf } from 'fzf';

const NewTab = () => {
  const inputRef = useRef(null);
  const [input, setInput] = useState('');
  const [tabs, setTabs] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filteredTabs, setFilteredTabs] = useState([]);
  const [isCtrlKey, setIsCtrlKey] = useState(false);
  const [bookmarkResults, setBookmarkResults] = useState([]); // New state for bookmark results
  const [isBookmarkSearch, setIsBookmarkSearch] = useState(false); // Track if it's a bookmark search

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
        e.preventDefault(); // Prevent "/" from being typed in the input
        inputRef.current?.focus();
      }

      if (document.activeElement === inputRef.current) {
        if (e.key === 'Escape') {
          setInput('');
          inputRef.current.blur();
        } else if (e.key === 'Enter') {
          if (e.ctrlKey && e.shiftKey) {
            // Ctrl+Shift+Enter for Brave search
            handleSearch('brave');
          } else if (e.ctrlKey) {
            // Ctrl+Enter for Google search
            handleSearch('google');
          } else if (filteredTabs.length > 0) {
            // Regular Enter for selecting tab
            const selectedTab = filteredTabs[selectedIndex];
            chrome.tabs.update(selectedTab.item.id, { active: true });
          } else if (isBookmarkSearch && bookmarkResults.length > 0) {  //Handle selecting a bookmark
            const selectedBookmark = bookmarkResults[selectedIndex];
            chrome.tabs.update({ url: selectedBookmark.url }); //Open bookmark in current tab
          }
          else {
            // If no tabs match, default to Google search
            handleSearch('google');
          }
        }
      }
      else if (e.key === 'ArrowDown' || (isCtrlKey && e.key === 'J')) {
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < filteredTabs.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowUp' || (isCtrlKey && e.key === 'K')) {
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : 0);
      }
    }

    document.addEventListener('keydown', handleKeyPress);
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [filteredTabs, selectedIndex, input, isBookmarkSearch]);

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

  //   const [isCtrlKey, setIsCtrlKey] = useState(false);

  useEffect(() => {
    const handleKeyup = (e) => {
      if (e.key === 'Control') {
        e.preventDefault();
        setIsCtrlKey(true);

        setTimeout(() => setIsCtrlKey(false), 1000);

      }
    }

    const handleKeydown = (e) => {
      if (e.key === 'Control') {
        e.preventDefault();
        setIsCtrlKey(true);
      }
    }

    window.addEventListener('keyup', handleKeyup);
    // window.addEventListener('keydown', );
  })

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
                onClick={() => {
                  chrome.tabs.update({ url: bookmark.url }); //Open bookmark in current tab
                }}
              >
                <img
                  src={'chrome://favicon/size/16@2x/' + bookmark.url}
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
                  src={result.item.favIconUrl || 'chrome://favicon/size/16@2x'}
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
          onClick={() => {
            chrome.tabs.query({ currentWindow: true }, (tabs) => {
              const chatGptTab = tabs.find(tab => tab.url.includes('https://www.chatgpt.com'));
              if (chatGptTab) {
                chrome.tabs.update(chatGptTab.id, { active: true });
              } else {
                chrome.tabs.create({ url: 'https://chatgpt.com' });
              }
            });
          }}>

          <img src="chatgpt.png" style={{
            width: '32px',
            height: '32px'
          }} />
          <span style={{ color: 'white' }}>
            ChatGpt
          </span>

        </div>

        <div
          onClick={() => {
            chrome.tabs.query({ currentWindow: true }, (tabs) => {
              const perplexityTab = tabs.find(tab => tab.url.includes('https://www.perplexity.ai'));
              if (perplexityTab) {
                chrome.tabs.update(perplexityTab.id, { active: true });
              } else {
                chrome.tabs.create({ url: 'https://perplexity.ai' });
              }
            });
          }}>

          <img src="perplexity.png" style={{
            width: '32px',
            height: '32px'
          }} />
          <span style={{ color: 'white' }}>

            Perplexity
          </span>

        </div>
      </div>

    </div>
  );
};

const rootElement = document.getElementById('root');
const root = createRoot(rootElement);
root.render(<NewTab />);
