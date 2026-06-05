#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE_DIR="$REPO_ROOT/plasma/plasmoids"
TARGET_DIR="$HOME/.local/share/plasma/plasmoids"

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "No plasmoid source directory found: $SOURCE_DIR" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"

for plasmoid in "$SOURCE_DIR"/*; do
  [[ -d "$plasmoid" ]] || continue
  id="$(basename "$plasmoid")"
  echo "Deploying plasmoid: $id"
  rm -rf "$TARGET_DIR/$id"
  cp -a "$plasmoid" "$TARGET_DIR/$id"
done

echo "Plasmoids deployed. Restart Plasma shell to reload QML:"
echo "  systemctl --user restart plasma-plasmashell.service"
