# Window Grid KDE — CLAUDE.md

Primary memory for AI coding agents. **Read this entire file before writing a single line of code.**
Then read `docs/PROJECT_STATE.md` and `docs/BUGS.md` before starting any task.

---

## Session Start Protocol

Do these steps in order at the start of every session:

1. Read `CLAUDE.md` (this file) — architecture, invariants, gotchas
2. Read `docs/PROJECT_STATE.md` — current feature status, which components are working
3. Read `docs/BUGS.md` — active bugs, investigation state, do-not-touch list
4. Read `docs/DECISIONS.md` — why things are the way they are (prevents re-debating settled choices)
5. If working on a specific bug or feature, read the relevant section of `docs/DEBUG_LOG.md`
6. Check git status — understand what is uncommitted before touching anything

Only after reading those files: look at the code.

---

## Session End Protocol

At the end of every session that changes code or makes discoveries:

1. Update `docs/PROJECT_STATE.md` — change feature status, update "Last updated" date
2. Append to `docs/DEBUG_LOG.md` — record findings, test results, log output observed
3. Update `docs/BUGS.md` — close resolved bugs, add new bugs discovered
4. Update `docs/DECISIONS.md` — record any significant technical choice made this session
5. Update `docs/ROADMAP.md` — mark completed items, reprioritize if needed
6. Update `CLAUDE.md` — only if architecture, invariants, or key files changed

---

## Project in One Paragraph

An Electron + React desktop app for KDE Plasma 6 (Wayland) that moves windows across Activities
and Virtual Desktops via a graphical Activity × Desktop grid. KWin (the KDE window manager) runs
a custom JavaScript script that bridges to the app through a Node.js DBus service. The user
selects a window via KDE's right-click context menu, picks a target grid cell, and clicks an
action button. The app routes the command through four hops: React → Electron IPC → qdbus6 CLI
→ DBus helper queue → KWin script execution..

---

## Architecture

```
ELECTRON SIDE                          KWIN SIDE
─────────────────────────────────────  ─────────────────────────────────
App.tsx (React UI)
  │ window.kde.*
  ▼
preload/index.ts (contextBridge)
  │ ipcRenderer.invoke('kde:*')
  ▼
main/index.ts (ipcMain.handle)
  │ qdbus6 CLI subprocess
  ▼
DBus session bus ──────────────────────▶  KWin Script
  │                                        (workspace.stackingOrder,
  ▼                                         callDBus, etc.)
scripts/window-grid-dbus-helper.js
  (com.anthony.WindowGridKDE service)
  │
  │ also receives FROM KWin:
  │ HTTP POST → localhost:48745/kwin/window
  ▼
main/index.ts HTTP server
  │ ipcMain.send('kde:selectedWindowFromKwin')
  ▼
App.tsx (onSelectedWindowFromKwin callback)
```

**The DBus helper is the hub.** It holds two queues per operation:
- `pendingRequests[]` — requests queued from Electron
- `pendingWaiters[]` — KWin script's blocking polls waiting for work
- `notifyWaiters()` matches them in FIFO order
- 8-second heartbeat on all waiters (KWin re-arms recursively in callback)
- 10-second delivery timeout on MoveCurrentDesktopToActivityAndDesktop

---

## Key Files

| File | Purpose | Edit frequency |
|------|---------|----------------|
| `scripts/window-grid-kde-kwin-script.js` | **Deployed KWin script** — combined file, the one KWin actually runs | Often |
| `scripts/window-grid-current-desktop-kwin-script.js` | Source for Section 2 (bulk desktop move) only | Often |
| `scripts/window-grid-dbus-helper.js` | Node.js DBus service — queue/waiter bridge | Occasionally |
| `src/main/index.ts` | Electron main: IPC, qdbus6 calls, HTTP server | Occasionally |
| `src/preload/index.ts` | Context bridge: exposes `window.kde.*` to renderer | Rarely |
| `src/renderer/src/App.tsx` | React UI: grid, buttons, event log | Often |
| `src/renderer/src/types.d.ts` | TypeScript types for `window.kde` API | Rarely |
| `plasma/plasmoids/com.anthonymeszaros.desktoptext/` | **Source of truth** for the clickable KDE panel title widget | Often |
| `plasma/plasmoids/com.anthony.activitydesktopnamepager/` | **Source of truth** for the activity-aware desktop pager widget | Occasionally |
| `plasma/plasmoids/com.anthony.windowgridvirtualdesktoppager/` | **Source of truth** for the simple virtual desktop pager widget | Occasionally |
| `scripts/tools/deploy-plasmoids.sh` | Deploys repo plasmoid sources to `~/.local/share/plasma/plasmoids` | Rarely |
| `scripts/tools/deploy-kwin-script.sh` | Deploys combined KWin script to KWin | Never edit |
| `scripts/tools/setup.sh` | First-time setup | Never edit |

---

## Plasma Widget Source of Truth

Custom KDE Plasma widgets are tracked in this repo under:

```
plasma/plasmoids/com.anthonymeszaros.desktoptext
plasma/plasmoids/com.anthony.activitydesktopnamepager
plasma/plasmoids/com.anthony.windowgridvirtualdesktoppager
```

The installed copies under `~/.local/share/plasma/plasmoids/...` are deployment targets only.
Do **not** make lasting source changes only in `~/.local/share/plasma/plasmoids`; Git will not
see them and they will not be saved to GitHub.

**Workflow for Plasma widget changes:**
1. Edit the repo copy in `plasma/plasmoids/...`
2. Run `npm run deploy:plasmoids`
3. Restart Plasma shell: `systemctl --user restart plasma-plasmashell.service`
4. Test the widget
5. Commit the repo changes

`npm run deploy:plasmoids` copies every repo plasmoid into
`~/.local/share/plasma/plasmoids/`. It does not commit anything.

The desktop title data shared by the app and widgets lives at:

```
~/.config/activity-desktop-names.json
```

This data file is user state, not source code.

---

## The KWin Script Is a Combined File

`scripts/window-grid-kde-kwin-script.js` has **two sections concatenated into one file**:

```
Section 1 (lines 1–~673)
  Purpose: single-window selection + individual window moves
  Style:   var declarations, ES5
  Constants: WINDOW_GRID_KDE_SERVICE, WINDOW_GRID_KDE_PATH, WINDOW_GRID_KDE_INTERFACE
  Polls:   WaitForMoveRequest
  Registers: right-click context menu (registerUserActionsMenu), Meta+P shortcut (registerShortcut → ToggleWindow)

Section 2 (lines ~674–end)
  Purpose: bulk desktop move + geometry restore
  Style:   const/let, ES6+, arrow functions
  Constants: SERVICE_NAME, OBJECT_PATH, INTERFACE_NAME
  Polls:   WaitForCurrentDesktopMoveRequest, WaitForRestoreLayoutRequest
  Functions: handleMoveCurrentDesktop, runRestoreLayout, waitForCurrentDesktopMoveRequest,
             waitForRestoreLayoutRequest, resolveWindowDesktops, windowBelongsToDesktop,
             isNormalUserWindow, windowBelongsToActivity, getId, getWorkspaceDesktops, etc.
```

**Hazards from the combined structure:**
- `findDesktopById` is defined in BOTH sections. Section 2's definition shadows Section 1's.
- If Section 2 fails to parse (JS error), Section 2's polling loops never start — but Section 1
  continues, which can make it look like the script is "running" when bulk moves are broken.
- `const` at top-level in Section 2 — works in Plasma 6 / KWin's V8 engine but worth knowing.

**Source management rule:**
When changing Section 2 logic, update BOTH:
1. `scripts/window-grid-current-desktop-kwin-script.js` (source of truth for Section 2)
2. The corresponding section in `scripts/window-grid-kde-kwin-script.js` (deployed copy)

Then always run `npm run deploy:kwin`.

---

## DBus Service Contract

```
Service:   com.anthony.WindowGridKDE
Path:      /WindowGridKDE
Interface: com.anthony.WindowGridKDE

Method                                    Caller      Args                           Returns
────────────────────────────────────────  ──────────  ─────────────────────────────  ────────────────────
SelectWindow                              KWin→HTTP   windowId,caption,class,desktopsCsv  void
MoveWindowToDesktop                       Electron    windowId,desktopId             void
MoveWindowToActivityAndDesktop            Electron    windowId,activityId,desktopId  string (requestId)
MoveWindowToActivityOnly                  Electron    windowId,activityId            void
MoveCurrentDesktopToActivityAndDesktop    Electron    targetActivityId,targetDesktopId  string (requestId)
Sleep                                     KWin        requestId,windowId,delayMs     [requestId,windowId]
WaitForMoveRequest                        KWin poll   (none)                         [windowId,activityId,desktopId,requestId]
WaitForCurrentDesktopMoveRequest          KWin poll   (none)                         [targetActivityId,targetDesktopId,requestId]
TriggerRestoreLayout                      Electron    (none)                         void
WaitForRestoreLayoutRequest               KWin poll   (none)                         requestId
ToggleWindow                              KWin        (none)                         void
```

SelectWindow is the exception — KWin calls it then the helper HTTP POSTs to Electron (not the
other direction). All other methods are Electron→helper→KWin.

---

## Change Workflow

### For any KWin script change:
```bash
# 1. Edit the script (Section 1 or 2 as needed)
#    If Section 2: edit both source file AND combined file

# 2. Deploy to KWin (copies file + unloads/reloads with correct path + starts)
npm run deploy:kwin

# 3. Confirm script started — look for these lines within ~2s:
#    [SECTION 1] init complete, calling waitForMoveRequests at t=...
#    [SECTION 2] loaded at t=...
#    [SECTION 2] WaitForCurrentDesktopMoveRequest: callDBus sent at t=...
journalctl -f | grep "Window Grid KDE"

# 4. Trigger the operation from the UI

# 5. Read logs to verify behavior
```

### For Electron/React changes:
```bash
# Edit the file
# The dev server hot-reloads automatically (no redeploy needed)
# For main process changes, restart with Ctrl+C then npm run dev
```

### For Plasma widget changes:
```bash
# Edit files under plasma/plasmoids/... in this repo
npm run deploy:plasmoids
systemctl --user restart plasma-plasmashell.service
```

Do not edit only the installed widget copy in `~/.local/share/plasma/plasmoids/...` unless
you immediately copy the change back into `plasma/plasmoids/...`.

### For DBus helper changes:
```bash
# Ctrl+C the running process
node scripts/window-grid-dbus-helper.js
# Or restart the full dev environment:
npm run dev
```

---

## Test Loop (end-to-end verification)

For a complete test of any window-movement feature:

1. Ensure DBus helper is running: `qdbus6 | grep anthony`
2. Ensure KWin script is loaded: `qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded testinglink`
3. Open KWin log stream: `journalctl -f | grep "Window Grid KDE"`
4. Open the app (`npm run dev`)
5. Right-click a window → "Open in Window Grid KDE" (to select it)
6. Click a target grid cell
7. Click the action button
8. Observe: logs, window positions, event log in UI

---

## Critical Invariants — Never Revert These

These were hard-won fixes. Do NOT revert them:

1. **`resolveWindowDesktops(window)`** — handles QML list-like `window.desktops`. Never replace
   with `Array.isArray(window.desktops)` alone — it returns `false` in Plasma 6.

2. **`windowBelongsToDesktop` uses `resolveWindowDesktops`** — the `Array.isArray && length > 0`
   guard must stay, then fall through to `resolveWindowDesktops`. Never remove the QML fallback.

3. **`window.desktop` (singular) is `undefined` for normal Plasma 6 windows** — do not rely on it.

4. **`workspace.currentDesktop` must be extracted as:**
   ```js
   const currentDesktop = workspace.currentDesktop;
   const currentDesktopId = currentDesktop && currentDesktop.id ? String(currentDesktop.id) : "";
   ```
   Not `getId(workspace.currentDesktop)` — that produces the wrong value in the installed script.

5. **Auto-restore delay is 800ms** — reduced from 2000ms. If window positions glitch after a
   bulk move, increase this value. KWin placement events need time to settle before restore runs.

6. **`runRestoreLayout()` is shared** between the auto-restore Sleep callback and the manual
   `TriggerRestoreLayout` path. Do not inline it in either path.

7. **Section 2 `const` declarations** at module level — these are valid in Plasma 6 KWin's JS
   engine. Do not convert to `var` unless a specific engine compatibility issue is found.

8. **Watchdog timers in all three polling functions** — `waitForMoveRequests`,
   `waitForCurrentDesktopMoveRequest`, `waitForRestoreLayoutRequest` each have a `setTimeout(fn, 15000)`
   watchdog. When the helper disconnects, KWin's `callDBus` silently drops callbacks, killing the
   polling loops permanently. The watchdog detects this and re-arms the loop after 15s. Do NOT
   remove these watchdogs. The `setTimeout` is wrapped in try-catch for graceful degradation.

9. **`deploy:kwin` must do exactly ONE unload/load/start cycle with the correct absolute path.**
   - `loadScript` requires `$HOME/.local/share/...` — the root-relative path `/.local/share/...`
     registers the plugin name without executing the JS file.
   - Running TWO unload/load cycles (e.g., shell script cycle + our cycle) breaks KWin's
     callback dispatch: `callDBus` callbacks are silently dropped after the second load,
     so all polling loops stop immediately after startup despite `print()` working fine.
   - The `deploy:kwin` npm script bypasses `deploy-kwin-script.sh`'s qdbus6 commands and
     does the copy + single correct cycle inline. Do not change the npm script to call the
     shell script for qdbus6 operations.

---

## KWin Scripting Gotchas

- **`window.desktops`** is a QML list object, NOT a JS Array. `Array.isArray` returns `false`.
  Use `resolveWindowDesktops()` which iterates by numeric index.
- **`window.desktop` (singular)** is `undefined` for normal windows in Plasma 6 Wayland.
  Only `window.desktops` (plural) is valid.
- **`window.activities`** may be cosmetic — KDE backend silently resets it. Section 1 uses
  6 strategies for assignment and verifies at 500ms + 2000ms post-move.
- **`callDBus` is async** — always re-arm polling by recursively calling the waiter function
  inside the callback. The callback fires when the DBus method returns (could be 8s heartbeat
  or a real result).
- **`isNormalUserWindow(window)`** — checks `window.normalWindow && !desktopWindow && !dock && !skipTaskbar`.
  This is the correct filter for user application windows.
- **KWin log prefix** — all `log()` calls in KWin script appear as `Window Grid KDE: <message>`
  in journald. The `log()` function prepends this prefix.

---

## Known Pre-existing Issues (Do Not Fix Unless Assigned)

These exist in the codebase and should be ignored unless the specific task is to fix them:

1. **`App.tsx:17`** — `Cannot find namespace 'JSX'` (TypeScript error on `JSX.Element` return type)
2. **`moveStartTime` in `handleMoveCurrentDesktop`** — defined with `Date.now()` and used in
   `[MOVE START]` log, but the `[MOVE FINISH]` log that computed duration was removed. The variable
   is still used for `[MOVE START]` so it is not unused.

---

## Reading KWin Logs

```bash
# Stream all project logs
journalctl -f | grep "Window Grid KDE"

# Stream with timestamps
journalctl -f -o short-precise | grep "Window Grid KDE"

# Look for errors specifically
journalctl -f | grep -E "Window Grid KDE.*ERROR|js:.*error|kwin_scripting"

# Check recent logs (last 100 lines)
journalctl -n 100 | grep "Window Grid KDE"
```

**Current log markers** (what to look for when testing bulk move):
```
[MOVE START] t=... | requestId=...           ← handleMoveCurrentDesktop entered
Matching windows found: N                     ← filter result (must be > 0 for windows to move)
[AUTO RESTORE SCHEDULED]                      ← Sleep(2000) dispatched
[AUTO RESTORE START]                          ← 2s later, restore begins
[AUTO RESTORE COMPLETE]                       ← restore loop finished
[LAYOUT RESTORE] ... ERROR: ...              ← only appears on error
```

**If "Matching windows found: 0"** — the window filter rejected everything. Likely cause:
`currentDesktopId` does not match `window.desktops` UUIDs. Check desktop ID extraction.

---

## Development Commands (quick reference)

```bash
npm run dev           # Start everything (DBus helper + Electron dev, in parallel)
npm run dbus-helper   # DBus helper only
npm run deploy:kwin   # Deploy KWin script + reload in KWin
npm run deploy:plasmoids # Deploy tracked Plasma widget sources
npm run build         # TypeScript check + production build
npm run setup         # First-time setup
```

Full command reference with KDE inspection commands: `docs/COMMANDS.md`

---

## Documentation Rules

Update the appropriate file whenever the corresponding thing changes.
**Do not wait until the end of a session** — update as you go.

| What changed | Update these files |
|---|---|
| Architecture, key files, invariants | `CLAUDE.md` |
| Feature started working or broke | `docs/PROJECT_STATE.md` |
| Bug found | `docs/BUGS.md` (add to ACTIVE BUGS) |
| Bug fixed | `docs/BUGS.md` (move to RESOLVED), `docs/DEBUG_LOG.md` |
| Diagnostic finding during investigation | `docs/DEBUG_LOG.md` (append, newest first) |
| Technical choice made | `docs/DECISIONS.md` |
| New task identified or completed | `docs/ROADMAP.md` |
| New script or command discovered | `docs/COMMANDS.md` |

**The repository is the source of truth. Not chat history.**
