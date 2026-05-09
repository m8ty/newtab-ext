import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULT_LINKS, loadLinks, saveLinks } from './storage';

const hostnameOf = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
};

const Options = () => {
  const [links, setLinks] = useState([]);
  const [status, setStatus] = useState('');

  useEffect(() => { loadLinks().then(setLinks); }, []);

  const update = (i, field, value) =>
    setLinks(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));

  const move = (i, dir) => setLinks(prev => {
    const j = i + dir;
    if (j < 0 || j >= prev.length) return prev;
    const next = [...prev];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const remove = (i) => setLinks(prev => prev.filter((_, idx) => idx !== i));

  const add = () => setLinks(prev => [...prev, {
    id: crypto.randomUUID(),
    name: '',
    url: '',
    host: '',
    icon: '',
  }]);

  const reset = () => { setLinks(DEFAULT_LINKS); setStatus('Reset (not yet saved)'); };

  const save = async () => {
    const cleaned = links
      .filter(l => l.name?.trim() && l.url?.trim())
      .map(l => ({ ...l, host: l.host?.trim() || hostnameOf(l.url) }));
    await saveLinks(cleaned);
    setLinks(cleaned);
    setStatus('Saved');
    setTimeout(() => setStatus(''), 2000);
  };

  const inputStyle = {
    padding: '6px 8px',
    fontSize: 13,
    border: '1px solid #ccc',
    borderRadius: 4,
    minWidth: 0,
  };

  const btn = (extra = {}) => ({
    padding: '6px 12px',
    fontSize: 13,
    border: '1px solid #ccc',
    borderRadius: 4,
    background: '#fff',
    cursor: 'pointer',
    ...extra,
  });

  return (
    <div style={{
      fontFamily: 'system-ui, -apple-system, sans-serif',
      maxWidth: 880,
      margin: '40px auto',
      padding: 20,
      color: '#222',
    }}>
      <h1 style={{ marginBottom: 4 }}>Quick Links</h1>
      <p style={{ color: '#666', marginTop: 0, fontSize: 14 }}>
        Customize the links shown below the search bar. The match host is checked against open tabs to focus an existing one before opening a new tab.
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.2fr 2.2fr 1.4fr 1.4fr auto auto auto',
        gap: 8,
        alignItems: 'center',
        fontSize: 12,
        color: '#888',
        marginBottom: 4,
      }}>
        <span>Name</span><span>URL</span><span>Match host</span><span>Icon (optional)</span>
        <span></span><span></span><span></span>
      </div>

      {links.map((l, i) => (
        <div key={l.id || i} style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 2.2fr 1.4fr 1.4fr auto auto auto',
          gap: 8,
          alignItems: 'center',
          marginBottom: 6,
        }}>
          <input style={inputStyle} placeholder="ChatGPT" value={l.name} onChange={e => update(i, 'name', e.target.value)} />
          <input style={inputStyle} placeholder="https://chatgpt.com" value={l.url} onChange={e => update(i, 'url', e.target.value)} />
          <input style={inputStyle} placeholder={hostnameOf(l.url) || 'chatgpt.com'} value={l.host} onChange={e => update(i, 'host', e.target.value)} />
          <input style={inputStyle} placeholder="chatgpt.png or URL" value={l.icon} onChange={e => update(i, 'icon', e.target.value)} />
          <button style={btn()} onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
          <button style={btn()} onClick={() => move(i, 1)} disabled={i === links.length - 1}>↓</button>
          <button style={btn({ color: '#a00' })} onClick={() => remove(i)}>×</button>
        </div>
      ))}

      <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button style={btn()} onClick={add}>+ Add link</button>
        <button style={btn({ background: '#222', color: '#fff', borderColor: '#222' })} onClick={save}>Save</button>
        <button style={btn()} onClick={reset}>Reset to defaults</button>
        {status && <span style={{ color: status === 'Saved' ? '#080' : '#888', fontSize: 13 }}>{status}</span>}
      </div>

      <p style={{ color: '#888', fontSize: 12, marginTop: 32 }}>
        Tip: leave Icon blank to use the site's favicon automatically.
      </p>
    </div>
  );
};

createRoot(document.getElementById('root')).render(<Options />);
