# Commands Reference

---

## Development Workflow

### Start everything
```bash
npm run dev
```
Starts DBus helper (`[HELPER]` prefix) and Electron dev server (`[APP]` prefix) in parallel.
Hot-reload is active for renderer changes. Main process changes require restart.
KWin script must already be deployed — run `npm run deploy:kwin` first if in doubt.

### Start DBus helper only
```bash
npm run dbus-helper
# equivalent:
node scripts/window-grid-dbus-helper.js
```

### Kill and restart DBus helper (if stale)
```bash
pkill -f window-grid-dbus-helper
node scripts/window-grid-dbus-helper.js
```
Or just `Ctrl+C` and `npm run dev` again if using the full dev command.

### Start Electron app only
```bash
env -u ELECTRON_RUN_AS_NODE electron-vite dev
```

---

## KWin Script

### Deploy KWin script (do this after every KWin script change)
```bash
npm run deploy:kwin
# equivalent:
./scripts/tools/deploy-kwin-script.sh
```
This copies `scripts/window-grid-kde-kwin-script.js` to
`~/.local/share/kwin/scripts/testinglink/contents/code/main.js`,
then unloads and reloads the script in the running KWin process.

**You must run this after every KWin script change. The dev server does NOT auto-deploy KWin scripts.**

### Workspace Back shortcut fallback
The KWin script registers Workspace Back as `Meta+F`. If automatic assignment does not stick,
bind this command manually in KDE System Settings → Shortcuts → Custom Shortcuts:

```bash
qdbus6 com.anthony.WindowGridKDE /WindowGridKDE \
  com.anthony.WindowGridKDE.TriggerWorkspaceBack
```

---

## Plasma Widgets

### Source of truth
Custom Plasma widget source is tracked in this repo:
```bash
plasma/plasmoids/com.anthonymeszaros.desktoptext
plasma/plasmoids/com.anthony.activitydesktopnamepager
plasma/plasmoids/com.anthony.windowgridvirtualdesktoppager
```

Installed copies live here and should be treated as deployment output:
```bash
~/.local/share/plasma/plasmoids/com.anthonymeszaros.desktoptext
~/.local/share/plasma/plasmoids/com.anthony.activitydesktopnamepager
~/.local/share/plasma/plasmoids/com.anthony.windowgridvirtualdesktoppager
```

Do not make lasting changes only in `~/.local/share/plasma/plasmoids/...`; Git will not see them.

### Deploy Plasma widgets
```bash
npm run deploy:plasmoids
```

Copies all repo plasmoids from `plasma/plasmoids/` to `~/.local/share/plasma/plasmoids/`.

### Reload Plasma shell after widget deploy
```bash
systemctl --user restart plasma-plasmashell.service
```

### Widget title data file
```bash
cat ~/.config/activity-desktop-names.json
```

The app and widgets share custom desktop titles through this file. It is user state and should
not be committed.

### First-time setup
```bash
npm run setup
# or: ./scripts/tools/setup.sh
```
Creates KWin plugin dir, writes `metadata.json`, runs `deploy:kwin`, and `npm install`.

### Check if KWin script is currently loaded
```bash
qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded testinglink
```
Returns `true` or `false`.

### Manually unload KWin script
```bash
qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript testinglink
```

### Manually load KWin script (after unload)
```bash
# Note: path starts with / not $HOME — KWin resolves relative to user home
qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript \
  "/.local/share/kwin/scripts/testinglink/contents/code/main.js" testinglink
```

---

## Reading KWin Logs

### Stream all project logs
```bash
journalctl -f | grep "Window Grid KDE"
```

### Stream with timestamps
```bash
journalctl -f -o short-precise | grep "Window Grid KDE"
```

### Filter for errors only
```bash
journalctl -f | grep -iE "Window Grid KDE.*error|kwin_scripting.*error"
```

### Check for JS errors in KWin at script load time
```bash
# Reload script and watch for parse/runtime errors
npm run deploy:kwin & journalctl -f | grep -iE "kwin|Window Grid KDE" | head -50
```

### Check last N lines of logs
```bash
journalctl -n 200 | grep "Window Grid KDE"
```

**Expected log pattern for a successful bulk move:**
```
Window Grid KDE: [MOVE START] t=... | requestId=...
Window Grid KDE: Matching windows found: N
Window Grid KDE: [AUTO RESTORE SCHEDULED]
... (2 seconds pass) ...
Window Grid KDE: [AUTO RESTORE START]
Window Grid KDE: [AUTO RESTORE COMPLETE]
```

---

## DBus Inspection

### Check if DBus helper service is registered
```bash
qdbus6 | grep anthony
# Should output: com.anthony.WindowGridKDE
```

### List all methods on the service
```bash
qdbus6 --literal com.anthony.WindowGridKDE /WindowGridKDE
```
Expected output includes all 10 methods. If this fails, the DBus helper is not running.

### Full introspect (shows signatures)
```bash
qdbus6 --literal com.anthony.WindowGridKDE /WindowGridKDE org.freedesktop.DBus.Introspectable.Introspect
```

### Call methods directly for debugging
```bash
# Trigger Workspace Back manually
qdbus6 com.anthony.WindowGridKDE /WindowGridKDE \
  com.anthony.WindowGridKDE.TriggerWorkspaceBack

# Read Workspace Back current/previous state
qdbus6 com.anthony.WindowGridKDE /WindowGridKDE \
  com.anthony.WindowGridKDE.GetWorkspaceBackState

# Trigger layout restore manually
qdbus6 com.anthony.WindowGridKDE /WindowGridKDE \
  com.anthony.WindowGridKDE.TriggerRestoreLayout

# Test Sleep utility (returns after 500ms)
qdbus6 com.anthony.WindowGridKDE /WindowGridKDE \
  com.anthony.WindowGridKDE.Sleep "test-req-1" "" "500"

# Move current desktop to activity+desktop
qdbus6 com.anthony.WindowGridKDE /WindowGridKDE \
  com.anthony.WindowGridKDE.MoveCurrentDesktopToActivityAndDesktop \
  "<activity-uuid>" "<desktop-uuid>"
```

### Monitor all DBus session messages
```bash
dbus-monitor --session
```

---

## KDE API Inspection

### List virtual desktops (with IDs)
```bash
qdbus6 --literal org.kde.KWin /VirtualDesktopManager desktops
```

### Create a virtual desktop at the end
```bash
qdbus6 org.kde.KWin /VirtualDesktopManager \
  org.kde.KWin.VirtualDesktopManager.createDesktop <current-desktop-count> ""
```

### Remove a virtual desktop by ID
```bash
qdbus6 org.kde.KWin /VirtualDesktopManager \
  org.kde.KWin.VirtualDesktopManager.removeDesktop <desktop-id>
```

### Get current desktop number
```bash
qdbus6 org.kde.KWin /KWin currentDesktop
```

### List activities with full info
```bash
qdbus6 --literal org.kde.ActivityManager /ActivityManager/Activities \
  ListActivitiesWithInformation
```

### Get current activity ID
```bash
qdbus6 org.kde.ActivityManager /ActivityManager/Activities CurrentActivity
```

### Get active window ID
```bash
qdbus6 org.kde.KWin /KWin activeWindow
```

### Get window info by ID (shows caption, class, desktops, etc.)
```bash
qdbus6 --literal org.kde.KWin /KWin getWindowInfo <window-id>
```

### Switch to desktop by number
```bash
qdbus6 org.kde.KWin /KWin org.kde.KWin.setCurrentDesktop 2
```

### Switch to activity
```bash
qdbus6 org.kde.ActivityManager /ActivityManager/Activities \
  SetCurrentActivity "<activity-uuid>"
```

---

## Build & Quality

```bash
npm run build    # TypeScript check + production build (fails on type errors)
npm run lint     # ESLint on .ts/.tsx files
npm run deploy:plasmoids # Copy repo Plasma widget sources into KDE's installed plasmoid dir
npm install      # Install/update dependencies
```

---

## Paths Reference

| Resource | Path |
|----------|------|
| KWin script (installed, running) | `~/.local/share/kwin/scripts/testinglink/contents/code/main.js` |
| KWin plugin metadata | `~/.local/share/kwin/scripts/testinglink/metadata.json` |
| KWin script source (combined) | `scripts/window-grid-kde-kwin-script.js` |
| KWin script source (Section 2 only) | `scripts/window-grid-current-desktop-kwin-script.js` |
| Plasma widget source root | `plasma/plasmoids/` |
| Desktop Text widget source | `plasma/plasmoids/com.anthonymeszaros.desktoptext/` |
| Activity Desktop Pager widget source | `plasma/plasmoids/com.anthony.activitydesktopnamepager/` |
| Virtual Desktop Pager widget source | `plasma/plasmoids/com.anthony.windowgridvirtualdesktoppager/` |
| Installed Plasma widget root | `~/.local/share/plasma/plasmoids/` |
| Shared desktop title data | `~/.config/activity-desktop-names.json` |
| DBus helper | `scripts/window-grid-dbus-helper.js` |
| Electron HTTP bridge | `http://127.0.0.1:48745/kwin/window` |
