# Project State

**Last updated:** 2026-06-03
**Update this date** whenever you change feature status or platform notes.

---

## Current Focus

Diagnosing and fixing BUG-001: Move Current Desktop delivery timeout.
See `docs/BUGS.md#BUG-001` for full investigation state and hypotheses.

---

## Feature Status

| Feature | Status | Notes |
|---------|--------|-------|
| Move Selected Window | ✅ Working | Via KDE right-click → "Open in Window Grid KDE" |
| Move + Switch Activity | ✅ Working | Moves window then navigates to target activity/desktop |
| Activity Only move | ✅ Working | Moves to activity, no desktop change |
| Move Current Desktop (bulk) | ❌ Broken | Delivery timeout — BUG-001 |
| Auto Restore Layout | ✅ Working | 2s delayed geometry restore after bulk move |
| Restore Last Layout button | ✅ Working | Manual re-trigger of `runRestoreLayout()` |
| KWin right-click context menu | ✅ Working | "Open in Window Grid KDE" on any window |
| Activity/Desktop grid UI | ✅ Working | Loads activities and desktops from KDE |
| Current Activity display | ✅ Working | Refresh button, updates on activity switch |
| Virtual Desktop listing | ✅ Working | Refresh button |
| KWin script deploy | ✅ Working | `npm run deploy:kwin` copies + reloads |

---

## Architecture Layers

### Electron Main Process (`src/main/index.ts`)
- HTTP bridge: `127.0.0.1:48745` receives window selections from KWin
- IPC handlers: all `kde:*` channels (getVirtualDesktops, moveWindowToDesktop, etc.)
- Uses `qdbus6` CLI subprocess for all KDE API access
- Parses `qdbus6 --literal` output for desktop/activity/window data
- Registers `window-grid-kde://` custom URL protocol

### DBus Helper (`scripts/window-grid-dbus-helper.js`)
- Standalone Node.js, started with app via `npm run dev`
- DBus service: `com.anthony.WindowGridKDE` at `/WindowGridKDE`
- Queue/waiter pattern: `pendingRequests[]` + `pendingWaiters[]` per operation type
- Heartbeat timeout: 8s on all waiters
- Delivery timeout: 10s on `MoveCurrentDesktopToActivityAndDesktop`

### KWin Script (`scripts/window-grid-kde-kwin-script.js`)
- **Combined file, two sections**
- Deployed to `~/.local/share/kwin/scripts/testinglink/contents/code/main.js`
- Runs inside KWin — direct access to `workspace`, `window` QML objects
- **Section 1**: single-window moves, right-click menu, 6-strategy activity assignment,
  polls `WaitForMoveRequest`
- **Section 2**: bulk desktop moves, geometry save/restore, polls
  `WaitForCurrentDesktopMoveRequest` and `WaitForRestoreLayoutRequest`

### React Renderer (`src/renderer/src/App.tsx`)
- Activity × Desktop grid (CSS Grid, dynamic column count)
- Buttons: Move Active Window, Move + Switch, Activity Only, Move Current Desktop, Restore Last Layout
- Event log panel: operation history for debugging
- Receives window selections from KWin via `kde:selectedWindowFromKwin` IPC event
- Pre-existing TS errors on lines 17 and 283 — do not fix unless assigned

---

## Known Platform Quirks — Plasma 6 Wayland

These are confirmed platform behaviors. The code already handles them correctly.
**Do not "fix" code that accounts for these — the workarounds are intentional.**

| Quirk | Impact | Code that handles it |
|-------|--------|---------------------|
| `window.desktops` is QML list, not JS Array | `Array.isArray` returns false | `resolveWindowDesktops()` in Section 2 |
| `window.desktop` (singular) is `undefined` | Cannot use as fallback | `windowBelongsToDesktop` |
| Activity assignment may silently reset | Assignment appears to work but doesn't stick | 6 strategies + verify at 500ms/2000ms |
| Geometry changes after bulk move | Windows snap/tile after activity transition | Auto-restore at t+2s |
| `workspace.currentDesktop` is an object | Cannot compare directly to a string UUID | Extract as `currentDesktop.id` |
| `window.frameGeometry` is read-only after maximize/tile | Setting it is ignored | Skip restore for maximized windows |

---

## Source File Sync Requirements

```
scripts/window-grid-kde-kwin-script.js    ← DEPLOYED (what KWin actually runs)
  ├── Section 1: no separate source; lives only here
  └── Section 2: mirrored from ↓

scripts/window-grid-current-desktop-kwin-script.js    ← Section 2 source
```

**Workflow for Section 2 changes:**
1. Edit `scripts/window-grid-current-desktop-kwin-script.js`
2. Apply identical changes to the Section 2 portion of `scripts/window-grid-kde-kwin-script.js`
3. Run `npm run deploy:kwin`
4. Verify in KWin logs

**Workflow for Section 1 changes:**
1. Edit `scripts/window-grid-kde-kwin-script.js` directly (no separate source)
2. Run `npm run deploy:kwin`
3. Verify in KWin logs

---

## Data Flows

### Bulk Move + Geometry Restore
```
handleMoveCurrentDesktop()
  ├── Capture frameGeometry → lastBulkMoveLayout[]
  ├── Call moveWindowToActivityAndDesktop() per matched window
  ├── callDBus Sleep 2000 → logs [AUTO RESTORE SCHEDULED]
  └── 2s later: [AUTO RESTORE START] → runRestoreLayout() → [AUTO RESTORE COMPLETE]

runRestoreLayout()
  └── For each entry: entry.window.frameGeometry = { x, y, width, height }

TriggerRestoreLayout (manual button path)
  → DBus helper notifies waitForRestoreLayoutRequest waiter
  → KWin callback calls runRestoreLayout()
```

### Single Window Selection
```
User right-clicks → KDE context menu → "Open in Window Grid KDE"
  → KWin: sendWindowToWindowGridKde(window)
  → KWin: callDBus SelectWindow(windowId, caption, resourceClass, desktopIds)
  → DBus helper: receives SelectWindow → HTTP POST to 127.0.0.1:48745/kwin/window
  → Electron HTTP handler: ipcMain.send('kde:selectedWindowFromKwin', windowInfo)
  → App.tsx: onSelectedWindowFromKwin callback → sets activeWindow state
```

### IPC Channel Naming Convention
All IPC channels use `kde:camelCase` format:
- `kde:getVirtualDesktops`, `kde:getActivities`, `kde:getCurrentActivity`
- `kde:getCurrentDesktopNumber`, `kde:switchToDesktopNumber`
- `kde:getActiveWindow`, `kde:moveWindowToDesktop`
- `kde:moveWindowToActivityAndDesktop`, `kde:moveCurrentDesktopToActivityAndDesktop`
- `kde:switchToActivity`, `kde:moveWindowToActivityOnly`
- `kde:restoreLastLayout`
- `kde:selectedWindowFromKwin` (event, not invoke)
