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
          } else {
            // If no tabs match, default to Google search
            handleSearch('google');
          }
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex(prev => 
            prev < filteredTabs.length - 1 ? prev + 1 : prev
          );
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex(prev => prev > 0 ? prev - 1 : 0);
        }
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [filteredTabs, selectedIndex, input]);

  // Update filtered results when input changes
  useEffect(() => {
    if (!input) {
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
  }, [input, tabs]);

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
      backgroundColor: '#f5f5f5'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '600px',
      }}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='Search tabs or web (Ctrl+Enter for Google, Ctrl+Shift+Enter for Brave)'
          style={{
            width: '100%',
            padding: '12px 20px',
            fontSize: '16px',
            border: '1px solid #ddd',
            borderRadius: '24px',
            outline: 'none',
            boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
            marginBottom: '12px'
          }}
          autoFocus
        />
        
        {filteredTabs.length > 0 && (
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
    </div>
  );
};

const rootElement = document.getElementById('root');
const root = createRoot(rootElement);
root.render(<NewTab />);
