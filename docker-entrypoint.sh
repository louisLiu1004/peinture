#!/bin/sh
set -e

echo "================================================"
echo "Peinture AI - Starting Services"
echo "================================================"

# Start the backend proxy server in background
echo "[Entrypoint] Starting backend proxy server..."
cd /app/server
node index.js &
PROXY_PID=$!

# Wait a moment for proxy to start
sleep 1

# Check if proxy is running
if kill -0 $PROXY_PID 2>/dev/null; then
    echo "[Entrypoint] Backend proxy server started (PID: $PROXY_PID)"
else
    echo "[Entrypoint] ERROR: Backend proxy server failed to start"
    exit 1
fi

# Start nginx in foreground
echo "[Entrypoint] Starting Nginx..."
exec nginx -g 'daemon off;'
