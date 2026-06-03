# Architectural Decisions

Each entry records: what was decided, what was rejected, and why.
Add new entries at the bottom with the next DEC-NNN number.

---

## DEC-001: DBus Helper as a Separate Node.js Process

**Decision:** Run `window-grid-dbus-helper.js` as a separate Node.js process alongside Electron,
not inside the Electron main process.  
**Reason:** `dbus-next` requires a long-lived event loop with blocking-style async methods
(`WaitForMoveRequest` returns a Promise that only resolves when a KWin request arrives).
Running this inside Electron's main process would block or compete with Electron's own event loop.
Keeping it separate makes it independently restartable without restarting the whole app.  
**Alternative rejected:** Worker threads inside Electron main process. More complex, less debuggable.

---

## DEC-002: HTTP POST for KWin → Electron Window Selection

**Decision:** When a KWin script selects a window, it calls `SelectWindow()` on the DBus helper,
which then HTTP POSTs the window data to Electron's HTTP server at `127.0.0.1:48745/kwin/window`.  
**Reason:** KWin's `callDBus` is one-shot per call. Having the DBus helper relay the data to
Electron via HTTP is simpler than Electron subscribing to DBus signals. HTTP POST is fire-and-
forget from the DBus helper's perspective — it doesn't block KWin.  
**Alternative rejected:** DBus signal from helper to Electron. Requires Electron to monitor the
DBus session bus, adding initialization complexity. HTTP is simpler and works immediately.

---

## DEC-003: qdbus6 CLI (not dbus-next) for Electron→KWin Calls

**Decision:** Electron's main process uses `qdbus6` CLI subprocesses to call DBus methods and
query KDE APIs, rather than using `dbus-next` directly.  
**Reason:** `qdbus6` is the standard KDE tooling, available on all KDE systems. Its `--literal`
output format reliably includes UUIDs and structured data. Using `dbus-next` in the main process
would add a second DBus library instance and complicate the architecture. The 5-second subprocess
timeout is acceptable for UI-triggered operations.  
**Alternative rejected:** dbus-next in Electron main. Would duplicate the DBus library already
used in the helper. Also, `qdbus6 --literal` output is much easier to parse for structured data
like desktop lists (UUID, name, index tuples) than raw dbus-next variants.

---

## DEC-004: Queue + Waiter Pattern for KWin Request Delivery

**Decision:** DBus helper maintains parallel arrays: `pendingRequests[]` from Electron and
`pendingWaiters[]` from KWin polling. `notifyWaiters()` matches them FIFO.  
**Reason:** No ordering guarantee between Electron queuing a request and KWin registering a
waiter. Both orderings must work:
- Request before waiter: `notifyWaiters()` finds no waiters; waiter picks it up on arrival via
  `if (pendingRequests.length > 0)` fast path
- Waiter before request: waiter sits waiting; `notifyWaiters()` delivers when request arrives  
**8s heartbeat:** Prevents KWin from hanging if the app restarts. KWin's callback re-arms
by recursively calling the wait function.  
**10s delivery timeout:** On `MoveCurrentDesktopToActivityAndDesktop` specifically. If no KWin
waiter shows up within 10s, the operation fails with an error returned to Electron/renderer.

---

## DEC-005: Combined KWin Script File

**Decision:** Deploy one `main.js` combining single-window (Section 1) and bulk-desktop (Section 2)
code, rather than two separate KWin plugins.  
**Reason:** KWin loads one script per plugin. Both sections need the same KWin `workspace` context
and the same DBus connection. Having them in one file is the only way to guarantee they share
the same KWin process context.  
**Known tradeoff:** Section 1 uses ES5/`var`; Section 2 uses ES6+/`const`. `findDesktopById`
is defined twice (Section 2's definition wins). If Section 2 fails to parse, its polling loops
don't start, but Section 1 continues — making it look like the script is working when bulk moves
are silently broken.  
**Source management:** `scripts/window-grid-current-desktop-kwin-script.js` is the authoritative
source for Section 2 logic. Changes to Section 2 must be mirrored into the combined file.

---

## DEC-006: Six Activity Assignment Strategies

**Decision:** Section 1 tries up to 6 different approaches for activity assignment, stopping at
first success. All 6 use the same read-back verification.  
**Reason:** The KDE/KWin scripting API for activity assignment is inconsistent across KDE
versions and window states. Strategy 1 (`window.activities = [id]`) works initially but the
backend may silently reset it. The 6 strategies cover known API variants across KDE versions.  
**Strategies:** (1) direct assignment, (2) two-phase [current,target]→[target], (3) activityList
property, (4) setOnActivities() function, (5) setOnActivity() incremental, (6) workspace.sendWindowToActivity()  
**Verification:** After assignment, read back `window.activities` at 500ms and 2000ms to confirm
the backend accepted the change.

---

## DEC-007: Auto-Restore at 2 Seconds, No Retries

**Decision:** After a bulk desktop move, restore saved `frameGeometry` values exactly once, with
a 2-second delay. No immediate restore, no retry schedule.  
**Reason:** Testing showed:
- Immediate restore: overridden by KWin placement within ~200ms
- Retry loops (0ms + 150ms + 400ms + 900ms + 1500ms): caused visible window bouncing (~30% of moves)
- Single restore at 2s: correct result in 100% of tested cases on target hardware
- Post-restore checks (`[POST RESTORE +1S]` and `[POST RESTORE +3S]`) confirmed geometry stays correct  
**Tradeoff:** ~30% of moves show a brief visual glitch during the 2s wait. Accepted as cosmetic.  
**See also:** `docs/DEBUG_LOG.md` entries from 2026-06-03 for the full measurement data.

---

## DEC-008: Geometry Restore Skips Maximized and Fullscreen Windows

**Decision:** At save time, windows with `maximizeMode !== 0` or `fullScreen === true` (or
`fullscreen === true` for alternate property name) are excluded from `lastBulkMoveLayout` and
therefore from restore.  
**Reason:** Applying a specific `frameGeometry` to a maximized window would unmaximize it, which
is unexpected and potentially jarring. KWin controls maximized window geometry. We should not fight it.  
**Note:** After a bulk move, some previously-normal windows get maximized/tiled by KWin. Those
would have been saved in `lastBulkMoveLayout` at their pre-move geometry (since they were normal
at save time) and WILL be restored. The exclusion only applies to windows that were already
maximized before the move.

---

## DEC-009: No Rollback Policy

**Decision:** All development is forward-only. No git resets, no feature removal, no reverting
to earlier states to "fix" problems.  
**Reason:** The project has accumulated significant platform-specific knowledge in the form of
working code (especially `resolveWindowDesktops`, the 6-strategy activity assignment, and the
Plasma 6 API workarounds). Reverting risks losing this knowledge and re-introducing bugs that
took time to diagnose.

---

## DEC-010: Restore Last Layout Button Kept After Auto-Restore Added

**Decision:** The manual "Restore Last Layout" UI button remains after automatic 2s restore was
implemented.  
**Reason:** Auto-restore is a single fire at t+2s. If the user's system is slower, or if they
want to re-apply the saved layout after any subsequent window repositioning, the button provides
a reliable fallback. Both paths call the same `runRestoreLayout()` function — no code duplication.

---

## DEC-011: `runRestoreLayout()` as Shared Function

**Decision:** Extract the restore loop into `runRestoreLayout()` called by both the auto-restore
Sleep callback and the `waitForRestoreLayoutRequest` callback (manual button path).  
**Reason:** DRY. Before this, the loop was inlined in `waitForRestoreLayoutRequest` and
duplicating it in the Sleep callback would have created two places to maintain. The function
closes over `lastBulkMoveLayout` correctly since it reads the module-level variable at call time.
