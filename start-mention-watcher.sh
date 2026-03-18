#!/bin/bash
# Auto-restart mention-watcher on crash
cd /home/mind-protocol/ai_devboard

while true; do
    echo "[$(date)] Starting mention-watcher..."
    node mention-watcher.js 2>&1 | tee -a mention-watcher.log
    EXIT_CODE=$?
    echo "[$(date)] mention-watcher exited with code $EXIT_CODE. Restarting in 5s..."
    sleep 5
done
