#!/usr/bin/env bash
# Install or update KlikDesign on macOS from the latest GitHub release:
#
#   curl -fsSL https://raw.githubusercontent.com/ashafizullah/klikdesign/main/install.sh | bash
#
# Env: KLIKDESIGN_VERSION=x.y.z installs that release instead of the latest.
set -euo pipefail

REPO="ashafizullah/klikdesign"
APP_NAME="KlikDesign.app"
DEST="/Applications"

say() { printf '==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = Darwin ] || die "this installer is for macOS; on Windows download the setup .exe from https://github.com/$REPO/releases/latest"

# Keep in sync with bundle.macOS.minimumSystemVersion in src-tauri/tauri.conf.json.
min="11.0"
os="$(sw_vers -productVersion)"
if [ "$(printf '%s\n%s\n' "$min" "$os" | sort -V | head -1)" != "$min" ]; then
  die "KlikDesign needs macOS $min or later (this Mac runs $os)"
fi

if [ -n "${KLIKDESIGN_VERSION:-}" ]; then
  api="https://api.github.com/repos/$REPO/releases/tags/v${KLIKDESIGN_VERSION#v}"
else
  api="https://api.github.com/repos/$REPO/releases/latest"
fi
say "finding the release"
release="$(curl -fsSL "$api")" || die "release not found (${KLIKDESIGN_VERSION:-latest})"
url="$(printf '%s' "$release" | grep -o '"browser_download_url": *"[^"]*_universal\.dmg"' | head -1 | sed 's/.*"\(https[^"]*\)"/\1/')"
[ -n "$url" ] || die "no universal DMG found in $api"

tmp="$(mktemp -d)"
mnt="$tmp/mnt"
cleanup() {
  hdiutil detach -quiet "$mnt" 2>/dev/null || true
  rm -rf "$tmp"
}
trap cleanup EXIT

say "downloading $(basename "$url")"
curl -fL --progress-bar -o "$tmp/KlikDesign.dmg" "$url"

mkdir -p "$mnt"
hdiutil attach -nobrowse -readonly -quiet -mountpoint "$mnt" "$tmp/KlikDesign.dmg"
[ -d "$mnt/$APP_NAME" ] || die "$APP_NAME not found in the DMG"

if pgrep -xq KlikDesign; then
  say "quitting the running KlikDesign"
  osascript -e 'quit app "KlikDesign"' 2>/dev/null || pkill -x KlikDesign || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do pgrep -xq KlikDesign || break; sleep 0.5; done
fi

# /Applications is writable for admin users; fall back to sudo for the rest.
sudo=""
[ -w "$DEST" ] || sudo="sudo"
say "installing to $DEST/$APP_NAME"
$sudo rm -rf "$DEST/$APP_NAME"
$sudo ditto "$mnt/$APP_NAME" "$DEST/$APP_NAME"
# Belt and braces: nothing above sets the quarantine flag, but a proxy or MDM tool might.
$sudo xattr -dr com.apple.quarantine "$DEST/$APP_NAME" 2>/dev/null || true


say "done, opening KlikDesign"
open "$DEST/$APP_NAME"
