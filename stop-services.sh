#!/bin/bash
pkill -f "node server.js" 2>/dev/null
pkill -f "node watcher.js" 2>/dev/null
pkill -f "node mention-watcher.js" 2>/dev/null
pkill -f "vite" 2>/dev/null
echo "All DevBoard services stopped"
