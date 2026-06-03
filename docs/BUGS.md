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
- Electron → DBus helper: ✅ (fresh run: request queued, queue length logged as 1)
- DBus helper queuing: ✅ (fresh run: `pendingCurrentDesktopMoveRequests` populated)
- KWin script loads: ✅ (startup logs visible)
- Section 1 (single window moves): ✅ (works independently)

#### Confirmed NOT Working
- KWin → DBus helper for `WaitForCurrentDesktopMoveRequest`: ✗ (fresh run: delivery timeout fires
  at 10s, no KWin waiter consumed the queued request)

#### Not Yet Confirmed
- Whether Section 2's top-level code executes at all (`[SECTION 2] loaded at t=` probe pending)
- Whether `waitForCurrentDesktopMoveRequest()` is reached (`[SECTION 2] init: starting polling loops` probe pending)
- Whether KWin's `callDBus` for `WaitForCurrentDesktopMoveRequest` reaches the helper (look for
  `[Window Grid DBus Helper] KWin waiting for next current desktop move request.` in terminal)
- Whether the callback ever fires (`[SECTION 2] WaitForCurrentDesktopMoveRequest: callback fired` probe pending)
- Whether callDBus calls are serialized (timestamps from probes will show H4)

#### Hypotheses (ranked by likelihood)

**H1 — Section 2 initialization failure (RULED OUT for KWin context):**
`node --check` threw `SyntaxError: Identifier 'findDesktopById' has already been declared` on the
combined script. Investigation showed this is a **false positive**: the project `package.json` has
`"type": "module"`, causing Node.js to parse `.js` files as ES modules (strict mode). In module
strict mode, duplicate `function` declarations ARE a SyntaxError. But KWin's JS engine runs the
file as a plain sloppy-mode script, where duplicate `function` declarations are allowed (last wins).
Confirmed: the same file passes `node --check` when placed outside the package.json scope.

**H2 — `const` parsing in combined file (LOW — no evidence):**
Section 2 uses `const SERVICE_NAME = '...'` at the top level. Sloppy-mode V8 handles top-level
`const` fine. No evidence this causes issues. Deprioritized unless probes show a ReferenceError.

**H3 — Race at 8s heartbeat (LOW — fast-path handles it):**
The DBus helper has a fast-path in `WaitForCurrentDesktopMoveRequest`: if a pending request exists
when KWin re-arms, it is delivered immediately (no 10s wait needed). The 10s timeout and 8s
heartbeat leave ~2s margin. This should work unless Section 2 never registers a waiter at all.

**H4 — callDBus serialization in KWin (PRIMARY HYPOTHESIS):**
Section 1 (`WaitForMoveRequest`), Section 2 (`WaitForCurrentDesktopMoveRequest`), and Section 2
(`WaitForRestoreLayoutRequest`) all call `callDBus` on the same DBus service simultaneously at
script startup. If KWin serializes `callDBus` calls to the same service, Section 2's calls queue
behind Section 1's 8s heartbeat call. Delivery would be delayed by 8+ seconds per cycle. Since
Section 2's callDBus is never in the helper when the user triggers a move (helper has no waiter),
the 10s delivery timeout fires before Section 2's callDBus arrives.
**To confirm:** timestamps on probe logs. If `[SECTION 2] WaitForCurrentDesktopMoveRequest:
callDBus sent` appears ~8s after `[SECTION 1] init complete`, H4 is confirmed.

#### Investigation Steps
- [x] Check for parse/runtime errors in Section 2 via `journalctl`
- [x] Add Section 2 init probes (`[SECTION 2] loaded`, `polling started`, `callDBus sent`, `callback fired`)
- [x] Confirm DBus helper is registered (`qdbus6 | grep anthony`)
- [x] Add timestamps to all probes to detect H4 (callDBus serialization)
- [x] Add probes to `waitForRestoreLayoutRequest()` (previously unlogged)
- [ ] **Run fresh session, check KWin journal for `[SECTION 2]` markers and their timestamps**
- [ ] **Check terminal output of `npm run dev` for `KWin waiting for next current desktop move request`**
- [ ] **If H4 confirmed:** fix by testing whether Section 1 and Section 2 callDBus calls can be
      isolated (e.g., by adding a small delay before Section 2's first callDBus, or by using a
      different service name for the combined script's polling calls)

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
