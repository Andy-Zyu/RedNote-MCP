#!/bin/bash
set -e

echo "======================================="
echo "  RedNote MCP - Browser Manager"
echo "======================================="

# ─── Start Xvfb (Virtual Display) ─────────────
echo "[1/4] Starting Xvfb on display :99..."

# Clean up stale lock files (from previous container runs / restarts)
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99

# Fix Chromium crash restore dialog: patch all profiles for clean exit
# When Docker kills Chromium, it leaves exit_type: "Crashed" in Preferences.
# Patching this prevents the "Restore pages?" dialog from blocking Playwright.
PROFILES_DIR="/root/.mcp/rednote/profiles"
if [ -d "$PROFILES_DIR" ]; then
    find "$PROFILES_DIR" -path "*/Default/Preferences" -type f | while read pref; do
        # Use Python for reliable JSON patching (sed regex varies across platforms)
        python3 -c "
import json, sys
try:
    with open('$pref', 'r') as f:
        d = json.load(f)
    if 'profile' in d:
        d['profile']['exit_type'] = 'Normal'
        d['profile']['exited_cleanly'] = True
    with open('$pref', 'w') as f:
        json.dump(d, f)
    print(f'  patched: $pref')
except Exception as e:
    print(f'  skip: {e}')
" 2>/dev/null
    done
    # Clean stale lock files
    find "$PROFILES_DIR" -name "SingletonLock" -delete 2>/dev/null
    find "$PROFILES_DIR" -name "browser.launch.lock" -delete 2>/dev/null
    find "$PROFILES_DIR" -name "browser.wsEndpoint" -delete 2>/dev/null
    echo "  ✓ Cleaned stale locks and crash markers"
fi

# Kill any orphan Chromium processes left from previous container runs
pkill -9 -f "chrom" 2>/dev/null || true

Xvfb :99 -screen 0 1280x800x24 -ac +extension GLX +render -noreset &
XVFB_PID=$!
export DISPLAY=:99

# Wait for Xvfb to be ready
sleep 1
if ! kill -0 $XVFB_PID 2>/dev/null; then
    echo "ERROR: Xvfb failed to start!"
    exit 1
fi
echo "  ✓ Xvfb started (PID: $XVFB_PID)"

# ─── Start Fluxbox (Window Manager) ───────────
echo "[2/4] Starting Fluxbox window manager..."
fluxbox -display :99 &>/dev/null &
sleep 0.5
echo "  ✓ Fluxbox started"

# ─── Start VNC + noVNC (Optional) ─────────────
ENABLE_VNC="${ENABLE_VNC:-true}"
if [ "$ENABLE_VNC" = "true" ]; then
    echo "[3/4] Starting VNC + noVNC..."

    # Start x11vnc (VNC server)
    x11vnc -display :99 -nopw -listen 0.0.0.0 -forever -shared -rfbport 5900 &>/dev/null &
    sleep 0.5

    # Start noVNC (Web-based VNC client)
    NOVNC_PORT="${NOVNC_PORT:-6080}"
    websockify --web=/usr/share/novnc/ ${NOVNC_PORT} localhost:5900 &>/dev/null &
    echo "  ✓ noVNC available at http://localhost:${NOVNC_PORT}/vnc.html"
else
    echo "[3/4] VNC disabled (ENABLE_VNC=false)"
fi

# ─── Start Browser Manager ────────────────────
MATRIX_PORT="${MATRIX_PORT:-3001}"
echo "[4/4] Starting Browser Manager on port ${MATRIX_PORT}..."
echo ""
echo "  📡 Matrix API:  http://localhost:${MATRIX_PORT}"
echo "  🔌 WebSocket:   ws://localhost:${MATRIX_PORT}/ws"
if [ "$ENABLE_VNC" = "true" ]; then
    echo "  🖥  noVNC:       http://localhost:${NOVNC_PORT}/vnc.html"
fi
echo ""
echo "======================================="
echo "  Ready! Browsers are persistent."
echo "  MCP Server can safely restart."
echo "======================================="
echo ""

# Start the Matrix server (browser manager) as the main process
exec node dist/cli.js matrix --port ${MATRIX_PORT}
