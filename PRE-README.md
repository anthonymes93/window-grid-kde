# Window Grid KDE - PRE-README

## Status

Window Grid KDE is currently in active development.

The core architecture has been proven:

Electron → DBus Helper → KWin Script

The project can successfully move windows between KDE Activities and Virtual Desktops on KDE Plasma 6 Wayland.

This document exists to explain the current state of the project before a production-ready README is created.

---

# Current Goals

Window Grid KDE aims to become a workspace automation platform for KDE Plasma.

Long-term goals include:

* Move windows between Activities
* Move windows between Virtual Desktops
* Move groups of windows
* Save workspace layouts
* Restore workspace layouts
* Workspace snapshots
* Voice commands
* Remote control
* Workspace automation rules

---

# Current Architecture

Electron UI
↓
DBus Helper Service
↓
KWin JavaScript Script
↓
KDE Plasma

Important files:

scripts/window-grid-kde-kwin-script.js

scripts/window-grid-dbus-helper.js

src/main/index.ts

src/renderer/src/App.tsx

---

# Current Working Features

## Move Selected Window

Working.

Move a selected window to:

* Any Activity
* Any Virtual Desktop

---

## Activity/Desktop Routing

Working.

The project can successfully route windows across Activities and Virtual Desktops using KDE APIs.

---

## Layout Restore

Working.

Window geometry is captured before bulk moves and restored afterward.

Stored:

* X
* Y
* Width
* Height

---

## Restore Layout Button

Working.

Can manually restore the most recently captured layout.

---

# Known Active Bug

BUG-001

Move Current Desktop

Status:

Under investigation.

Observed behavior:

* Electron sends request
* DBus Helper receives request
* Request enters queue
* Request times out
* KWin never consumes the request

Current investigation focuses on the KWin polling loop responsible for bulk desktop moves.

See:

docs/BUGS.md

docs/DEBUG_LOG.md

---

# Repository Structure

CLAUDE.md

Project instructions for future Claude Code sessions.

docs/

Project memory system.

Includes:

* PROJECT_STATE.md
* BUGS.md
* DEBUG_LOG.md
* DECISIONS.md
* ROADMAP.md
* COMMANDS.md

scripts/

KWin scripts, DBus helper, deployment utilities.

src/

Electron application source.

---

# Important Development Rule

Do not edit:

~/.local/share/kwin/scripts/testinglink/contents/code/main.js

This file is a deployed artifact.

Instead edit:

scripts/window-grid-kde-kwin-script.js

Then redeploy.

The repository copy is the source of truth.

---

# Project Maturity

Current phase:

Prototype / Architecture Validation

Completed:

* Electron integration
* DBus integration
* KWin integration
* Activity movement
* Desktop movement
* Layout restore system
* Claude project memory system

Not yet completed:

* Portable installation
* One-command setup
* Workspace snapshots
* Voice control
* Remote control
* Production packaging

---

# Recovery

If this machine is lost:

1. Clone repository
2. Review CLAUDE.md
3. Review docs/
4. Continue development from documented project state

The repository is intended to become the complete source of project knowledge.
