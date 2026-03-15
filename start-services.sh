#!/bin/bash
# Start all DevBoard services
cd /home/mind-protocol/ai_devboard

echo "Starting DevBoard services..."

# Kill any existing
pkill -f "node server.js" 2>/dev/null
pkill -f "node watcher.js" 2>/dev/null
pkill -f "node mention-watcher.js" 2>/dev/null

sleep 1

# Start API server
node server.js > /tmp/devboard-server.log 2>&1 &
echo "  API server: PID $! (port 3001)"

# Start file watcher
node watcher.js > /tmp/devboard-watcher.log 2>&1 &
echo "  File watcher: PID $! (graph updates)"

# Start mention watcher
node mention-watcher.js > /tmp/devboard-mentions.log 2>&1 &
echo "  Mention watcher: PID $! (citizen dispatch)"

# Start Vite dev server
npx vite --port 3000 > /tmp/devboard-vite.log 2>&1 &
echo "  Vite frontend: PID $! (port 3000)"

echo ""
echo "All services started. Logs in /tmp/devboard-*.log"
echo "  Server:   tail -f /tmp/devboard-server.log"
echo "  Watcher:  tail -f /tmp/devboard-watcher.log"
echo "  Mentions: tail -f /tmp/devboard-mentions.log"
echo "  Vite:     tail -f /tmp/devboard-vite.log"

# Start swarm driver
node swarm.js --interval 60 > /tmp/devboard-swarm.log 2>&1 &
echo "  Swarm driver: PID $! (task dispatch every 60s)"
