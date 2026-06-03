#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

REPO_SCRIPT="$REPO_ROOT/scripts/window-grid-kde-kwin-script.js"
INSTALLED_DIR="$HOME/.local/share/kwin/scripts/testinglink/contents/code"
INSTALLED_SCRIPT="$INSTALLED_DIR/main.js"

mkdir -p "$INSTALLED_DIR"

echo "Deploying repo KWin script..."
cp "$REPO_SCRIPT" "$INSTALLED_SCRIPT"

echo "Restarting KWin script..."
qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript testinglink || true
qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "$HOME/.local/share/kwin/scripts/testinglink/metadata.json" testinglink || true

echo "Done. Repo script is now installed."
