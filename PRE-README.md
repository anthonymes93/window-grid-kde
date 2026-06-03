
# Window Grid KDE - PRE-README

## Current Status

Window Grid KDE is an active KDE Plasma 6 workspace automation project.

The core architecture has been proven:

Electron → DBus Helper → KWin Script

The project is not yet production-ready but is far beyond the proof-of-concept stage.

---

# Critical Architecture

Window Grid KDE depends on a KWin script running inside KDE.

This is not optional.

Without the KWin script:

* Move Window will not work
* Activity switching will not work
* Desktop switching will not work
* Layout restoration will not work

---

# Source of Truth

The KWin script source code is stored in GitHub at:

scripts/window-grid-kde-kwin-script.js

This file MUST remain in the repository.

If this file is lost, a significant portion of the project is lost.

---

# Runtime Deployment

KDE does not execute the repository file directly.

The repository script must be deployed to KDE's script location:

~/.local/share/kwin/scripts/testinglink/contents/code/main.js

At runtime, KDE executes:

main.js

not

scripts/window-grid-kde-kwin-script.js

---

# Development Workflow

Edit:

scripts/window-grid-kde-kwin-script.js

Commit:

scripts/window-grid-kde-kwin-script.js

Push:

scripts/window-grid-kde-kwin-script.js

Deploy:

scripts/window-grid-kde-kwin-script.js
↓
~/.local/share/kwin/scripts/testinglink/contents/code/main.js

Restart KWin Script

Test

---

# Why There Are Two Copies

Repository Copy:

scripts/window-grid-kde-kwin-script.js

Purpose:

* GitHub backup
* Version control
* Source code editing
* Claude project memory

Runtime Copy:

~/.local/share/kwin/scripts/testinglink/contents/code/main.js

Purpose:

* Executed by KDE
* Required for application functionality

The runtime copy is generated from the repository copy.

---

# Disaster Recovery

If a machine is lost:

1. Clone repository
2. Run setup
3. Deploy KWin script
4. Recreate runtime main.js
5. Continue development

The repository should contain everything required to recreate the deployed KWin script.

---

# Long-Term Goal

Eventually a fresh machine should require only:

git clone
npm install
npm run setup

The setup process should automatically:

* Install dependencies
* Deploy the KWin script
* Create main.js
* Register the script with KDE
* Start required services

This goal has not yet been fully achieved.

---

# Current Focus

BUG-001

Move Current Desktop

Current behavior:

Electron → DBus Helper → Queue

works

KWin consumption of the queue

broken

See docs/BUGS.md for the current investigation.








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
