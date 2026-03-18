// src/server/sse-stream.js
// SSE Stream helpers — extracted from inline logic in server.js
// @see docs/feedback/IMPLEMENTATION_Feedback.md
// @see docs/feedback/ALGORITHM_Feedback.md (SSE Stream Pipeline)

/**
 * Create an SSE stream manager for a graph.
 *
 * Tracks connected clients, event IDs, and a replay buffer.
 * Implements Last-Event-ID reconnection per ALGORITHM Step 1.
 *
 * @param {Object} opts
 * @param {number} [opts.bufferSize=200] - Max events retained for replay
 * @param {number} [opts.heartbeatMs=15000] - Heartbeat interval in ms
 * @returns {SSEStreamManager}
 */
export function createSSEStream({ bufferSize = 200, heartbeatMs = 15000 } = {}) {
  let eventCounter = 0
  // Map<graphName, Set<Response>>
  const clients = new Map()
  // Replay buffer: circular array of { id, event, data, graph }
  const replayBuffer = []

  function addClient(graph, res) {
    if (!clients.has(graph)) clients.set(graph, new Set())
    clients.get(graph).add(res)

    // Heartbeat keep-alive
    const hb = setInterval(() => {
      try { res.write(': heartbeat\n\n') } catch (_) { /* connection dead */ }
    }, heartbeatMs)

    res.on('close', () => {
      clearInterval(hb)
      const set = clients.get(graph)
      if (set) {
        set.delete(res)
        if (set.size === 0) clients.delete(graph)
      }
    })
  }

  function emit(graph, event, data) {
    const set = clients.get(graph)
    if (!set || set.size === 0) return 0
    eventCounter++
    const entry = { id: eventCounter, event, data, graph }
    const payload = `id: ${eventCounter}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`

    // Buffer for replay
    replayBuffer.push(entry)
    if (replayBuffer.length > bufferSize) replayBuffer.shift()

    let sent = 0
    for (const res of set) {
      try {
        res.write(payload)
        sent++
      } catch (_) { /* dead connection, will be cleaned on close */ }
    }
    return sent
  }

  function clientCount(graph) {
    const set = clients.get(graph)
    return set ? set.size : 0
  }

  return { addClient, emit, replayFromId, clientCount }

  /**
   * Replay missed events to a reconnecting client.
   * Per ALGORITHM Step 1: if Last-Event-ID is present, replay events
   * from buffer where event.id > lastEventId.
   *
   * @param {Response} res - The SSE response to write to
   * @param {string} graph - Graph name filter
   * @param {number|string} lastEventId - The Last-Event-ID header value
   * @returns {number} Count of replayed events
   */
  function replayFromId(res, graph, lastEventId) {
    const id = parseInt(lastEventId, 10)
    if (isNaN(id)) return 0

    let replayed = 0
    for (const entry of replayBuffer) {
      if (entry.graph === graph && entry.id > id) {
        const payload = `id: ${entry.id}\nevent: ${entry.event}\ndata: ${JSON.stringify(entry.data)}\n\n`
        try {
          res.write(payload)
          replayed++
        } catch (_) { break }
      }
    }
    return replayed
  }
}

/**
 * Emit a delta set to all SSE clients for a graph.
 *
 * Convenience wrapper — takes a stream manager and emits a "delta" event
 * with the filtered node set from a tick cycle.
 *
 * @param {SSEStreamManager} stream - Stream manager from createSSEStream()
 * @param {string} graph - Graph name
 * @param {Object} deltaSet - { nodes: Object[], links: Object[], tick: number }
 * @returns {number} Number of clients that received the event
 */
export function emitDelta(stream, graph, deltaSet) {
  return stream.emit(graph, 'delta', deltaSet)
}

/**
 * Replay missed events to a reconnecting client.
 *
 * Delegates to the stream manager's replay buffer. Call this when a client
 * connects with a Last-Event-ID header.
 *
 * @param {SSEStreamManager} stream - Stream manager from createSSEStream()
 * @param {Response} res - Express response
 * @param {string} graph - Graph name
 * @param {string|number} lastEventId - Last-Event-ID from client
 * @returns {number} Number of replayed events
 */
export function replayFromId(stream, res, graph, lastEventId) {
  return stream.replayFromId(res, graph, lastEventId)
}
