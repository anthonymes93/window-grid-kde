#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

KWIN_SCRIPT_DIR="$HOME/.local/share/kwin/scripts/testinglink"
KWIN_CODE_DIR="$KWIN_SCRIPT_DIR/contents/code"

echo "Setting up Window Grid KDE..."

command -v node >/dev/null || { echo "ERROR: node is missing"; exit 1; }
command -v npm >/dev/null || { echo "ERROR: npm is missing"; exit 1; }
command -v qdbus6 >/dev/null || { echo "ERROR: qdbus6 is missing"; exit 1; }

mkdir -p "$KWIN_CODE_DIR"

cat > "$KWIN_SCRIPT_DIR/metadata.json" <<'META'
{
  "KPlugin": {
    "Name": "Window Grid KDE",
    "Description": "Workspace automation bridge for Window Grid KDE",
    "Icon": "preferences-system-windows",
    "Authors": [
      {
        "Name": "Anthony"
      }
    ],
    "Id": "testinglink",
    "Version": "1.0"
  },
  "X-Plasma-API": "javascript",
  "X-Plasma-MainScript": "contents/code/main.js",
  "KPackageStructure": "KWin/Script"
}
META

"$REPO_ROOT/scripts/tools/deploy-kwin-script.sh"

echo "Installing npm dependencies..."
cd "$REPO_ROOT"
npm install

echo "Setup complete."
echo "Run the app with: npm run dev"
