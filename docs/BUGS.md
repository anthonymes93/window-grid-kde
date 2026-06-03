# Bugs

Active bugs have investigation checklists. Resolved bugs have root cause + fix summaries.
When fixing a bug: move it from ACTIVE to RESOLVED, fill in the fix, and append to DEBUG_LOG.md.

---

## ACTIVE BUGS

### BUG-001: Move Current Desktop — Request Delivery Timeout

**Status:** Active — feature non-functional  
**Severity:** High  
**Component:** DBus delivery, Section 2 of KWin script  
**Introduced:** Unknown — present at time of memory system creation (2026-06-03)

#### Symptoms
1. User clicks "Move Current Desktop" in the UI
2. Electron calls `qdbus6 ... MoveCurrentDesktopToActivityAndDesktop <activityId> <desktopId>`
3. DBus helper `MoveCurrentDesktopToActivityAndDesktop()` is called — confirmed by helper logs
4. Request enters `pendingCurrentDesktopMoveRequests[]` — confirmed by helper logs
5. KWin script is running — confirmed (startup logs appear, Section 1 works)
6. After 10 seconds: delivery timeout fires in DBus helper, error returned to Electron
7. No windows are moved; event log shows timeout error

#### Confirmed Working
- Electron → DBus helper: ✅ (`TriggerRestoreLayout called` log appears)
- DBus helper queuing: ✅ (request enters queue)
- KWin script loads: ✅ (startup logs visible)
- Section 1 (single window moves): ✅ (works independently)

#### Not Yet Confirmed
- Whether KWin's `waitForCurrentDesktopMoveRequest()` actually calls `callDBus` successfully
- Whether any JS errors occur in Section 2 at script load time
- Whether Section 2's polling loop registers a waiter in `pendingCurrentDesktopMoveWaiters`

#### Hypotheses (ranked by likelihood)

**H1 — Section 2 initialization failure:**
A JS error in the combined script prevents Section 2 from starting. `findDesktopById` is
defined twice (in Section 1 and Section 2). In some JS environments, function hoisting of two
`function findDesktopById` declarations causes a parse error, not just shadowing. If Section 2
fails to initialize, `waitForCurrentDesktopMoveRequest()` is never called, so no waiter is
registered in the DBus helper. Section 1 continues working, which masks the failure.

**H2 — `const` parsing in combined file:**
Section 2 uses `const SERVICE_NAME = '...'` at module level. If KWin's JS engine encounters
a problem with top-level `const` in a very large file (Section 2 starts ~line 674), the
definitions might not be accessible. The `callDBus(SERVICE_NAME, ...)` call would then fail
with a ReferenceError.

**H3 — Race at 8s heartbeat:**
KWin's `WaitForCurrentDesktopMoveRequest` callDBus resolves after 8s heartbeat timeout.
Between the heartbeat resolving and the recursive `waitForCurrentDesktopMoveRequest()` call
re-registering, there is a ~0ms gap. If the move request arrives in this gap, `notifyWaiters()`
finds no waiters. The new `WaitForCurrentDesktopMoveRequest` call SHOULD pick it up via the
`if (pendingCurrentDesktopMoveRequests.length > 0)` fast path — but only if the new callDBus
call reaches the helper before the 10s delivery timeout on the original request. Given the
10s timeout and 8s heartbeat, there should be ~2s margin. This should work in theory.

**H4 — callDBus concurrency in KWin:**
Both polling loops in the combined script call `callDBus` on the same interface simultaneously
(Section 1 polls `WaitForMoveRequest`, Section 2 polls `WaitForCurrentDesktopMoveRequest`).
If KWin serializes callDBus calls on the same service/interface, Section 2's call might queue
behind Section 1's, effectively never registering its waiter during the 10s delivery window.

#### Investigation Steps (do these first)
- [ ] Run `journalctl -n 100 | grep -iE "Window Grid KDE|kwin_scripting|js.*error"` immediately
  after deploying the script to check for parse or runtime errors in Section 2
- [ ] Add `log('Section 2 polling started')` at the very top of `waitForCurrentDesktopMoveRequest()`
  and `log('callDBus WaitForCurrentDesktopMoveRequest called')` immediately before the callDBus
  call — redeploy and check if these appear
- [ ] Check `qdbus6 | grep anthony` while app is running to confirm helper is registered
- [ ] Test H1: Rename one `findDesktopById` to `findDesktopByIdBulk` in Section 2 and redeploy

#### Key Files
- `scripts/window-grid-kde-kwin-script.js:674+` — Section 2 start, `waitForCurrentDesktopMoveRequest`
- `scripts/window-grid-dbus-helper.js` — `MoveCurrentDesktopToActivityAndDesktop`, `WaitForCurrentDesktopMoveRequest`
- `src/main/index.ts:560–588` — `moveCurrentDesktopToActivityAndDesktop`

---

## RESOLVED BUGS

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
