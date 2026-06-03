# Debug Log

Append-only investigation record. Add new entries at the TOP.
Never delete entries — they are the project's empirical history.

## Entry format:
```
## YYYY-MM-DD — Short title

**Hypothesis / Question:** What were we trying to find out?
**Method:** What diagnostic was added or what was observed?
**Finding:** What did the data show?
**Conclusion / Action:** What did we decide or change as a result?
```

---

## 2026-06-03 — BUG-001 investigation: delivery timeout root cause

**Hypothesis / Question:** Why does `WaitForCurrentDesktopMoveRequest` in the DBus helper never
receive a waiter from KWin, causing every Move Current Desktop request to time out?

**Evidence from fresh run:**
- Electron IPC invoked: confirmed
- `MoveCurrentDesktopToActivityAndDesktop` arrives at DBus helper: confirmed
- Request enters `pendingCurrentDesktopMoveRequests[]`: confirmed (queue length logged as 1)
- After 10 seconds: helper logs `TIMEOUT: requestId=1 not delivered within 10s`
- KWin never consumed the queued request

**What this proves:**
- The entire Electron → DBus helper path is working correctly
- The bug is exclusively on the KWin side: KWin is not calling `WaitForCurrentDesktopMoveRequest`

**What is still unproven:**
1. Whether Section 2's top-level code executes at all in KWin (does `[SECTION 2] loaded at t=...` appear in journal?)
2. Whether `waitForCurrentDesktopMoveRequest()` is reached (does `[SECTION 2] init: starting polling loops` appear?)
3. Whether `callDBus` for `WaitForCurrentDesktopMoveRequest` is sent (does `[SECTION 2] WaitForCurrentDesktopMoveRequest: callDBus sent` appear?)
4. Whether the callback ever fires (does `[SECTION 2] WaitForCurrentDesktopMoveRequest: callback fired` appear?)
5. Whether the timing between Section 1 callDBus completing and Section 2 callDBus starting suggests serialization (H4)

**H1 (duplicate findDesktopById) RULED OUT for KWin context:**
- `node --check` throws `SyntaxError: Identifier 'findDesktopById' has already been declared`
  at the second definition (line 841 in the combined script)
- Investigation revealed this is a **false positive**: the project `package.json` declares
  `"type": "module"`, which causes Node.js to parse ALL `.js` files in the directory as ES modules.
  In ES module (strict) mode, duplicate `function` declarations ARE a SyntaxError.
- KWin's JS engine does NOT run KWin scripts as ES modules — it uses a plain sloppy-mode script
  context. In sloppy mode, duplicate `function` declarations are valid (last one wins, no error).
- Confirmed by: `node --check /tmp/test_exact_copy.js` (identical file, no package.json ancestor)
  exits 0 (no error).
- Section 2 also passes `node --check` in isolation.
- **H1 is not the cause.**

**Instrumentation added (this session):**
All probes output millisecond timestamps via `Date.now()` to allow timing analysis:
- `[SECTION 1] init complete, calling waitForMoveRequests at t=<ms>` (before Section 1's initial callDBus)
- `[SECTION 2] loaded at t=<ms>` (first line of Section 2 top-level execution)
- `[SECTION 2] init: starting polling loops at t=<ms>` (just before first callDBus calls)
- `[SECTION 2] WaitForCurrentDesktopMoveRequest: callDBus sent at t=<ms>` (at each callDBus)
- `[SECTION 2] WaitForCurrentDesktopMoveRequest: callback fired at t=<ms> activityId= desktopId= requestId=` (at each callback)
- `[SECTION 2] WaitForRestoreLayoutRequest: callDBus sent at t=<ms>` (new — previously unlogged)
- `[SECTION 2] WaitForRestoreLayoutRequest: callback fired at t=<ms>` (new — previously unlogged)

**Diagnostic to run next:**
Stream KWin logs during a fresh `npm run dev`, wait 30 seconds, then trigger Move Current Desktop:
```bash
journalctl -f | grep "Window Grid KDE"
```
Also check terminal output of `npm run dev` for DBus helper line:
```
[Window Grid DBus Helper] KWin waiting for next current desktop move request.
```
If this helper line NEVER appears, KWin's `WaitForCurrentDesktopMoveRequest` callDBus is either
not being sent or not reaching the helper.

**How to interpret the timestamps (H4 test):**
- If `[SECTION 2] WaitForCurrentDesktopMoveRequest: callDBus sent` appears at a time close to
  `[SECTION 1] init complete` (within ~1s), callDBus calls are NOT serialized → H4 is wrong
- If `[SECTION 2] WaitForCurrentDesktopMoveRequest: callDBus sent` appears ~8s AFTER
  `[SECTION 1] init complete` (or after the first `WaitForMoveRequest` callback), callDBus calls
  to the same service ARE serialized → H4 is the cause

---

## 2026-06-03 — Diagnostic cleanup after geometry restore confirmed working

**Hypothesis:** The 2-second auto-restore is sufficient; no additional retries needed.  
**Method:** Added `[POST RESTORE +1S]` and `[POST RESTORE +3S]` checkpoints that read
`entry.window.frameGeometry` at those intervals after auto-restore completes.  
**Finding:** Both checkpoints showed geometry matching `savedGeo` for all tested windows
including previously-drifting Vivaldi and VS Code. Windows settled correctly within 1 second
of auto-restore running.  
**Conclusion:** Removed all heavy diagnostic logging. Kept only: `[MOVE START]`, `Matching windows
found`, `[AUTO RESTORE SCHEDULED/START/COMPLETE]`, and error logs.

---

## 2026-06-03 — Window state at restore time (maximizeMode investigation)

**Hypothesis:** KWin converts drifting windows to maximized or tiled state during the
activity/desktop move, causing `frameGeometry` to reflect maximized/tiled bounds.  
**Method:** Added `[STATE SAVE]` (before move) and `[STATE RESTORE]` (before geometry apply)
logging `fullScreen`, `maximizeMode`, `quickTileMode`, `minimized`, `keepAbove`, `keepBelow`.  
**Finding:** Diagnostics were removed before the log output was analyzed (geometry restore was
already confirmed working at that point). The maximizing hypothesis remains plausible given
drift values (see geometry measurement entry below), but was not conclusively verified.  
**Status:** Unresolved but deprioritized — the 2s auto-restore corrects whatever KWin does.

---

## 2026-06-03 — Monitor output comparison (screen/DPI investigation)

**Hypothesis:** Window drift caused by window moving to a different monitor during the
activity/desktop transition, causing geometry coordinates to be interpreted differently.  
**Method:** Added `[MONITOR SAVE]` and `[MONITOR RESTORE]` logging `output.name`,
`window.screen`, `output.devicePixelRatio`, `frameGeometry`, `bufferGeometry`.  
**Finding:** Output name is IDENTICAL at save and restore time for drifting windows.
Vivaldi and VS Code both show the same `output` before and after the move.  
**Conclusion:** Monitor change is NOT the cause of drift. DPI/scaling is not the cause.
The drift is from window state changes (geometry is modified by KWin/app after move).

---

## 2026-06-03 — Geometry drift measurement

**Observation:**
```
Vivaldi:  savedGeo=4336,36,1134,1044  vs  restore frameGeo=3840,0,1632,1080
VS Code:  savedGeo=3886,37,1737,954   vs  restore frameGeo=5472,0,400,1080
```
**Interpretation:**
- Vivaldi: x=3840 (screen left edge), y=0 (top of screen), width=1632 — KWin tiled it left half
- VS Code: x=5472 (far right), y=0, width=400 — KWin tiled or snapped it to a corner
- Both have `y=0` — consistent with top-edge snapping / maximize
- Normal floating windows have `y > 0` (below panel/titlebar space)
**Conclusion:** KWin is snapping/tiling these windows during the activity move. The 2s restore
overrides this back to saved geometry and that works correctly.

---

## 2026-06-03 — resolveWindowDesktops fix verification

**Hypothesis:** `windowBelongsToDesktop` returning false for all windows is caused by
`window.desktops` being a non-Array QML object.  
**Diagnostic log output:**
```
[FILTER-DESKTOP] typeof window.desktop=undefined | window.desktop=undefined | window.desktops=KWin::VirtualDesktop(...)
```
**Root cause confirmed:**
- `Array.isArray(window.desktops)` returns `false` (QML list is not a JS Array)
- `getId(window.desktop)` returns `''` because `window.desktop` is `undefined`
- Filter short-circuits via the Array branch returning `false` via `.some()` on empty result
**Fix:** Added `resolveWindowDesktops(window)` that checks `typeof window.desktops.length === 'number'`
and iterates by numeric index. After fix: `windowDesktopResolvedIds` showed correct UUIDs
matching `currentDesktopId` and matching window count became correct.

---

## 2026-06-03 — Filter returning 0 matches for all real windows

**Initial symptom:** `[FILTER]` logs showed `windowBelongsToDesktop=false` for EVERY window
except Window Grid KDE app itself.  
**Windows tested:** Firefox, VS Code, Konsole, Vivaldi, Kate, Chrome — all rejected  
**Exception:** Window Grid KDE app showed `desktops=all` → matched via `window.onAllDesktops` path  
**Pattern observed:** All real windows showed `windowDesktopIds=` (empty string)  
**Root cause:** `window.desktops` is a non-Array QML list — see entry above.

---

## Prior sessions (reconstructed from code state)

### Activity assignment strategies (Section 1)
Six strategies were implemented because the KDE activity API is inconsistent:
1. Direct `window.activities = [targetId]` — works for fresh/unmodified windows
2. Two-phase `[current, target]` → `[target]` — helps when backend has existing state
3. `window.activityList = [targetId]` — alternate property name
4. `window.setOnActivities([targetId])` — function API if available
5. `window.setOnActivity(id, true/false)` — incremental add/remove API
6. `workspace.sendWindowToActivity(window, targetId)` — workspace-level fallback

After assignment: verify at 500ms and 2000ms by reading back `window.activities`.
The `verifyActivityAssignment()` function diagnoses: onAllActivities (backend reset),
onTarget only (success), onBoth (partial), onCurrent only (failure), unexpected state.

### Desktop assignment (Section 1)
`window.desktops = [targetDesktop]` works in Plasma 6. The desktop object must come from
`workspace.desktops` iteration by ID, not constructed from a string. `window.onAllDesktops = false`
must be cleared first if the window is on all desktops.

### Desktop ID extraction (workspace vs window level)
`workspace.currentDesktop` returns a desktop object. `workspace.currentDesktop.id` is the UUID.
Must be extracted as: `currentDesktop && currentDesktop.id ? String(currentDesktop.id) : ""`
Using `getId(workspace.currentDesktop)` directly works differently in the combined script
context and produces wrong results — this was a source of filter failures.
