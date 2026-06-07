# Roadmap

Items are ordered roughly by priority. Update this file when items are completed or reprioritized.

---

## Next Up

### Live testing of new drag/drop and Workspace Back features
New features need end-to-end testing:
- Workspace Back: `Meta+F`, UI button, DBus fallback; confirm current/previous state updates correctly
- + Desktop button: creates at end, UI refreshes
- Drag onto occupied cell: cells shift, windows move in KWin, grid compacts, empty trailing desktops removed
- Drag onto empty cell: simple move, no shift
- Drag same→same cell: becomes a cell-select (no move)
- Trailing desktops with windows in another activity must NOT be deleted

### Improve window position after bulk move
Currently, ~30% of moves show a brief visual glitch before the 800ms auto-restore fires.
Options:
- Tune the delay further
- Add a second restore pass at 2s as insurance
- Listen for KWin compositor events to restore exactly when geometry settles (if KWin exposes this)

---

## Planned

### KWin script split: single-window vs bulk-desktop
Maintain two separate KWin script plugins instead of one combined file:
1. `window-grid-kde-selector` — context menu, single window moves
2. `window-grid-kde-bulk` — bulk desktop moves, geometry restore
Pros: cleaner code, separate deployment, easier debugging
Cons: KWin loads scripts independently; ensure DBus service is shared or both connect

### Persist last window selection across app restarts
Currently `selectedWindow` in Electron main is in-memory only. If Electron restarts, the window
selection is lost. Could persist to a local JSON file or use Electron's `app.getPath('userData')`.

### Auto-start DBus helper with app
Currently the DBus helper must be started manually or via `npm run dev`. For production use,
the DBus helper should auto-start with the Electron app (child_process.spawn in main process).

### Activity/Desktop profile saving
Allow users to save a named "layout profile" (which activity, which desktop, which windows) and
restore it on demand. Builds on top of the existing restore-layout infrastructure.

### System tray integration
Run minimized in the system tray. Show current activity/desktop in tray icon.
Activate on hotkey or tray click.

### Configurable auto-restore delay
Allow the user to set the 2-second auto-restore delay in app preferences. Some systems (slower
hardware, more windows) may need longer delays for reliable geometry restoration.

### Move Current Desktop: switch after move
After bulk-moving the current desktop's windows to a target, optionally switch to that target
activity/desktop (like "Move + Switch" does for single windows).

---

## Completed

- ✅ Move Current Desktop (bulk) — BUG-001 fixed (watchdog timers + deploy path fix)
- ✅ KWin right-click context menu "Open in Window Grid KDE"
- ✅ Single window move to desktop (MoveWindowToDesktop)
- ✅ Single window move to activity and desktop (MoveWindowToActivityAndDesktop)
- ✅ Single window activity-only move
- ✅ Move + Switch (move window then navigate to target)
- ✅ Activity and desktop listing from KDE
- ✅ Fix `window.desktops` QML list-like handling (resolveWindowDesktops)
- ✅ Fix desktop membership detection for Plasma 6
- ✅ Geometry capture before bulk move
- ✅ Auto-restore geometry 2 seconds after bulk move
- ✅ Manual "Restore Last Layout" button
- ✅ `runRestoreLayout()` shared between auto and manual restore paths
- ✅ KWin script hot-reload deploy script
- ✅ Repo-tracked Plasma widget source and deploy script
- ✅ Project memory system (CLAUDE.md + docs/)
