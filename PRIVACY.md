# Privacy Policy

DevX New Tab does not collect, transmit, or share any user data with the developer or any third party. The extension makes no network requests of its own.

## What is read

- Open tab titles and URLs (via `chrome.tabs`) — to power search and frecency ranking.
- Bookmarks (via `chrome.bookmarks`) — only when you use the `@b` prefix.
- Recently closed sessions (via `chrome.sessions`) — only when you use the `@r` prefix.

## What is stored, and where

- **Quick links and notes** — stored in `chrome.storage.sync`, which Chrome syncs across devices where you are signed in to the same Google account. They are not visible to the developer.
- **Workspaces and frecency statistics** — stored in `chrome.storage.local`, which never leaves your device.
- **Window-to-workspace bindings** — stored in `chrome.storage.session` and cleared when Chrome closes.

## What is transmitted

Nothing by the extension itself.

When you use `Ctrl+Enter` to web-search, your active tab navigates directly to Google or Brave. Those services receive a request from your browser as they would for any normal search; the extension is not involved beyond setting the URL.

## Third parties

None.

## Changes

If this policy changes, the change will appear in the Git history of this repository.
