# Bugs

Active bugs have investigation checklists. Resolved bugs have root cause + fix summaries.
When fixing a bug: move it from ACTIVE to RESOLVED, fill in the fix, and append to DEBUG_LOG.md.

---

## ACTIVE BUGS

No active bugs.

---

## RESOLVED BUGS

### BUG-001: Move Current Desktop — Request Delivery Timeout

**Status:** Fixed  
**Root cause 1 — polling loop death on helper disconnect:**
When the DBus helper disconnects (crash, restart, `npm run dev` restart), KWin's `callDBus`
does NOT invoke the JavaScript callback on disconnect errors. It silently drops the callback.
All three polling loops (`WaitForMoveRequest`, `WaitForCurrentDesktopMoveRequest`,
`WaitForRestoreLayoutRequest`) stopped permanently at disconnect and never recovered.
Any subsequent helper restart had no waiters registered by KWin.

**Root cause 2 — deploy script used wrong loadScript path:**
`deploy-kwin-script.sh` called:
`qdbus6 … loadScript "/.local/share/kwin/scripts/testinglink/contents/code/main.js" testinglink`
The path `/.local/share/…` is root-relative (does not exist). KWin registered the plugin name
but did not execute the script file. `isScriptLoaded` returned `true` (name registered) but the
JS context was not running. The polling loops never restarted on deploy.

**Fix 1 — watchdog timers in all three polling functions:**
Added a `setTimeout(fn, 15000)` watchdog in `waitForMoveRequests`, `waitForCurrentDesktopMoveRequest`,
and `waitForRestoreLayoutRequest`. If the callDBus callback has not fired within 15 seconds
(normal heartbeat is 8s), the watchdog re-arms the polling function. This makes all three loops
resilient to helper disconnects. The `setTimeout` call is wrapped in try-catch so it degrades
gracefully if unavailable in the KWin engine version. Both files updated:
`scripts/window-grid-kde-kwin-script.js` and `scripts/window-grid-current-desktop-kwin-script.js`

**Fix 2 — corrected deploy:kwin in package.json:**
Updated the `deploy:kwin` npm script to append the correct `loadScript` call after the shell
script runs:
```
qdbus6 … loadScript "$HOME/.local/share/kwin/scripts/testinglink/contents/code/main.js" testinglink
qdbus6 … start
```
This ensures `npm run deploy:kwin` properly restarts the KWin script context on every deploy.

**Evidence of fix:**
- Before: delivery timeout after 10s on every click
- After: `MoveCurrentDesktopToActivityAndDesktop` returns requestId in 0.103s
- Logs confirm: `Matching windows found: 10`, each window moved with `activityMoveSucceeded=true`
- H4 (callDBus serialization) ruled out: timestamps show all three callDBus calls sent at identical millisecond (`t=1780480708246`)

---

### BUG-002: Move + Switch button causes blank white screen

**Status:** Fixed  
**Root cause:** `handleMoveAndSwitch` (App.tsx line 283) referenced `sourceActivity` in a
`setEventLog` state-updater callback. `sourceActivity` is a local variable in a completely
different function (`handleMoveCurrentDesktop`, line 429) and is not in scope in
`handleMoveAndSwitch`. When the state-updater ran, JavaScript threw
`ReferenceError: sourceActivity is not defined`. React caught this during its render cycle and,
with no error boundary wrapping the app, unmounted the entire component tree — blank white screen.

**Fix 1:** Replaced `sourceActivity` with `currentActivity` (the correct component-scope
variable computed at line 521 from `activities` and `currentActivityId`).

**Fix 2:** Added `ErrorBoundary` class component in `main.tsx` wrapping `<App />`. Future
unhandled render errors now show an error message with the stack trace instead of a blank screen.

**Note:** This bug was listed as a pre-existing TS error in CLAUDE.md ("Cannot find name
'sourceActivity'"). The TS error correctly identified the bug but it was marked do-not-fix.
Fixing it now because it caused a user-visible crash.

---

### BUG-R01: All windows rejected by desktop filter (windowBelongsToDesktop always false)

**Status:** Fixed  
**Root cause:** `window.desktops` in Plasma 6 is a QML list-like object, not a JS Array.
`Array.isArray(window.desktops)` returns `false`. The original code fell through to
`getId(window.desktop)` which returns `''` because `window.desktop` (singular) is `undefined`
for normal windows. The filter always returned `false`.  
**Fix:** Added `resolveWindowDesktops(window)` that handles the QML list-like object by
iterating with `for (let i = 0; i < window.desktops.length; i++)`. Also added `&& window.desktops.length > 0`
guard so an empty desktops list falls through to `window.desktop` singular as last resort.  
**Files:** `scripts/window-grid-kde-kwin-script.js` (Section 2), `scripts/window-grid-current-desktop-kwin-script.js`  
**Key invariant established:** Never use `Array.isArray(window.desktops)` alone for Plasma 6.

---

### BUG-R02: Window geometry drifts 1–2 seconds after bulk move

**Status:** Fixed  
**Root cause:** After `moveWindowToActivityAndDesktop()`, KWin and/or the application respond
to the activity/desktop change by adjusting window geometry (snapping to half-screen, tiling,
maximizing). The geometry read immediately after the move call does not reflect the final state.  
**Fix:** Capture `window.frameGeometry` into `lastBulkMoveLayout[]` before the move, then
restore it via `callDBus Sleep 2000ms` callback. The 2-second delay puts the restore after all
compositor placement events have settled.  
**Files:** `scripts/window-grid-kde-kwin-script.js` (Section 2)

---

### BUG-R03: Retry loops caused visible window bouncing

**Status:** Resolved by design decision  
**Symptom:** With immediate + 150ms + 400ms + 900ms + 1500ms retries, windows visibly bounced
multiple positions during ~30% of moves.  
**Root cause:** Each retry overwrote KWin's in-progress placement, fighting the compositor.
The windows would snap to restored position, then KWin would move them again, then the next
retry would restore again.  
**Fix:** Single 2s delayed restore. By 2s, all compositor events have settled. No retries needed.  
**See:** `docs/DECISIONS.md#DEC-007`, `docs/DEBUG_LOG.md` 2026-06-03 entries.

---

### BUG-R04: currentDesktopId mismatch between source and installed script

**Status:** Fixed  
**Root cause:** Source script used `getId(workspace.currentDesktop)` which in that context
produced a string representation of the desktop object, not the UUID. The installed script
used `currentDesktop.id` which correctly extracted the UUID. These produced different strings.  
**Fix:** Standardized in installed script to:
```js
const currentDesktop = workspace.currentDesktop;
const currentDesktopId = currentDesktop && currentDesktop.id ? String(currentDesktop.id) : "";
```
**Files:** `scripts/window-grid-kde-kwin-script.js` (Section 2), `scripts/window-grid-current-desktop-kwin-script.js`
