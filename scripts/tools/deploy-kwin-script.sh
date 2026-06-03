#!/usr/bin/env bash
set -e

REPO_SCRIPT="$HOME/Projects/window-grid-kde/scripts/window-grid-kde-kwin-script.js"
INSTALLED_SCRIPT="$HOME/.local/share/kwin/scripts/testinglink/contents/code/main.js"

echo "Deploying repo KWin script..."
cp "$REPO_SCRIPT" "$INSTALLED_SCRIPT"

echo "Restarting KWin script..."
qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript testinglink || true
qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "$HOME/.local/share/kwin/scripts/testinglink/metadata.json" testinglink || true

echo "Done. Repo script is now installed."
