# DevX New Tab

A keyboard-first replacement for Chrome's new tab page. Fuzzy-search open tabs, bookmarks, and recently closed tabs; save windows as named workspaces; attach notes to URLs.

No accounts, no telemetry, no network calls.

## Features

- **Tab search** — type to fuzzy-search open tabs across all windows. Empty input shows your most-used tabs ranked by frecency.
- **`@b <query>`** — search bookmarks.
- **`@r <query>`** — list and restore recently closed tabs.
- **`@s`** — list saved workspaces. `@s save <name>` saves the current window's tab set; restoring a workspace opens it as a new window. The window remembers which workspace it came from, so updates go to the right place.
- **`@n`** — list and search notes. Highlight any result and press `Ctrl+E` to attach a short note. Notes appear inline under matching tabs/bookmarks.
- **Quick links** — customizable shortcuts shown below the search bar. Clicking focuses an existing tab if one matches.
- **Web search** — `Ctrl+Enter` for Google, `Ctrl+Shift+Enter` for Brave.
- **`/`** anywhere on the page — focuses the search input.

## Install (from source)

```sh
npm install
npm run build
```

Then in Chrome:
1. Open `chrome://extensions`
2. Enable Developer mode
3. Load unpacked → select the `dist/` folder

## Develop

```sh
npm run dev
```

Webpack rebuilds on save. Reload the extension in `chrome://extensions` after each rebuild.

## Storage

| Data | Where | Synced |
|---|---|---|
| Quick links | `chrome.storage.sync` | yes |
| Notes | `chrome.storage.sync` | yes |
| Workspaces | `chrome.storage.local` | no |
| Frecency stats | `chrome.storage.local` | no |
| Window→workspace bindings | `chrome.storage.session` | cleared on Chrome exit |

See [PRIVACY.md](./PRIVACY.md).

## Permissions

| Permission | Why |
|---|---|
| `tabs` | Read tab titles/URLs for search; switch focus between tabs. |
| `bookmarks` | `@b` bookmark search. |
| `favicon` | Display each result's favicon. |
| `storage` | Persist quick links, notes, workspaces, frecency. |
| `sessions` | `@r` recently closed tabs. |

## License

MIT — see [LICENSE](./LICENSE).
