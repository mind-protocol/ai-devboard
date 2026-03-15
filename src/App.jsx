import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import './App.css'

const COLORS = {
  Actor: '#f59e0b',
  Space: '#3b82f6',
  Narrative: '#8b5cf6',
  Moment: '#ef4444',
  Thing: '#10b981',
}

// Universe colors — one per graph
const PRESET_QUERIES = [
  { label: 'Citizens & Links', query: 'MATCH (a:Actor)-[r]->(n) RETURN a, r, n LIMIT 200' },
  { label: 'Active Nodes', query: 'MATCH (n)-[r]->(m) WHERE n.energy > 0.1 RETURN n, r, m LIMIT 200' },
  { label: 'Tasks', query: 'MATCH (t:Moment)-[r]->(n) WHERE t.type = "task_run" RETURN t, r, n LIMIT 100' },
  { label: 'Full Graph', query: 'MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 500' },
]

// Universe colors — one per graph
const GRAPH_COLORS = {
  org_ai_dev_dashboard: '#3b82f6',
  venezia: '#f59e0b',
  lumina_prime: '#8b5cf6',
  mind_protocol: '#10b981',
  serenissima: '#ec4899',
  mind_mcp: '#06b6d4',
  cities_of_light: '#f43f5e',
  contre_terre: '#84cc16',
  blood_ledger: '#ef4444',
}

// "il y a X minutes" formatter
function timeAgo(epochSeconds) {
  if (!epochSeconds) return ''
  const diff = Math.floor(Date.now() / 1000) - epochSeconds
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

// Format name: if it looks like a handle (citizen:xxx), show @xxx in bold
function formatName(name, id) {
  const display = name || id || ''
  // If origin is a handle
  return display
}

function formatOrigin(origin) {
  if (!origin) return ''
  return `@${origin}`
}

// Bold @handles in text
function boldHandles(text) {
  if (!text || !text.includes('@')) return text
  const parts = text.split(/(@\w+)/g)
  return parts.map((part, i) =>
    part.startsWith('@') ? <span key={i} className="handle-tag">{part}</span> : part
  )
}

// Node health score: 0-5 stars
// Good = high stability, reasonable weight, low friction, some energy
// Bad = low stability, high friction, no energy, pending status
function starScore(n) {
  const stability = Math.min(n.stability || 0, 1)
  const hasWeight = Math.min((n.weight || 0) / 2, 1) // normalize: weight 2+ = max
  const lowFriction = 1 - Math.min(n.friction || 0, 1)
  const hasEnergy = Math.min((n.energy || 0) * 5, 1) // even 0.2 energy = alive
  const notPending = n.status === 'pending' ? 0.3 : n.status === 'done' ? 1 : 0.7

  const raw = (stability * 0.3 + hasWeight * 0.2 + lowFriction * 0.2 + hasEnergy * 0.15 + notPending * 0.15)
  const stars = Math.round(raw * 5)
  return ['', '★', '★★', '★★★', '★★★★', '★★★★★'][stars] || ''
}

function App() {
  const svgRef = useRef()
  const [graphName, setGraphName] = useState('lumina_prime')
  const [query, setQuery] = useState('MATCH (a:Actor)-[r]->(n) RETURN a, r, n LIMIT 200')
  const [graphs, setGraphs] = useState([])
  const [status, setStatus] = useState('Ready')
  const [tickSpeed, setTickSpeed] = useState(0) // 0=paused, 1=x1, 2=x2, 3=x3
  const [streaming, setStreaming] = useState(false)
  const [citizens, setCitizens] = useState([])
  const [useL2, setUseL2] = useState(false)
  const [view, setView] = useState('nodes') // 'graph' | 'nodes' | 'brains'
  const [brainData, setBrainData] = useState([])
  const [nodeList, setNodeList] = useState([])
  const [timeFilter, setTimeFilter] = useState(0) // 0 = all (no time filter)
  const [sortCol, setSortCol] = useState('energy') // default sort column
  const [sortDir, setSortDir] = useState(-1) // -1 = desc, 1 = asc
  const [typeFilter, setTypeFilter] = useState(new Set()) // empty = show all
  const [stats, setStats] = useState({ activeCitizens: 0, totalMoments: 0 })
  const [searchText, setSearchText] = useState('') // text search across fields
  const [expandedBrain, setExpandedBrain] = useState(null)
  const [expandedL2, setExpandedL2] = useState(null) // L2 connections for expanded brain
  const [taskList, setTaskList] = useState([])
  const [taskStatusFilter, setTaskStatusFilter] = useState(new Set(['pending', 'claimed', 'running'])) // default: active tasks
  const [taskSortCol, setTaskSortCol] = useState('energy')
  const [taskSortDir, setTaskSortDir] = useState(-1)
  const [taskSearch, setTaskSearch] = useState('')
  const tickRef = useRef(null)
  const sseRef = useRef(null)
  const simRef = useRef(null) // hold D3 simulation for live updates

  useEffect(() => {
    fetch('/api/graphs').then(r => r.json()).then(setGraphs).catch(() => {})
    // Auto-load on mount
    runQuery()
    loadNodeList()
    loadStats()
  }, [])

  // Auto-run query when graph changes
  const graphInitRef = useRef(true)
  useEffect(() => {
    if (graphInitRef.current) { graphInitRef.current = false; return }
    runQuery()
    loadNodeList()
    loadStats()
  }, [graphName])

  const loadBrains = async () => {
    setStatus('Loading L1 brains...')
    try {
      const res = await fetch('/api/brains')
      const data = await res.json()
      if (Array.isArray(data)) {
        setBrainData(data)
        const total = data.reduce((s, b) => s + b.activeNodes, 0)
        setStatus(`${data.length} active brains, ${total} conscious nodes`)
      }
    } catch (e) { setStatus(`Error: ${e.message}`) }
  }

  const loadTasks = async () => {
    setStatus('Loading tasks...')
    try {
      const res = await fetch(`/api/tasks/${graphName}`)
      const data = await res.json()
      if (Array.isArray(data)) {
        setTaskList(data)
        const pending = data.filter(t => t.status === 'pending').length
        const running = data.filter(t => t.status === 'running' || t.status === 'claimed').length
        setStatus(`${data.length} tasks (${pending} pending, ${running} active)`)
      }
    } catch (e) { setStatus(`Error: ${e.message}`) }
  }

  const loadStats = async () => {
    try {
      const res = await fetch(`/api/monitor/${graphName}`)
      const data = await res.json()
      // Count moments created in last 10 min
      const since10m = Math.floor(Date.now() / 1000) - 600
      let moments = 0
      try {
        const mRes = await fetch(`/api/nodes/${graphName}?limit=5000&since=${since10m}`)
        const mNodes = await mRes.json()
        moments = Array.isArray(mNodes) ? mNodes.filter(n => n.type === 'Moment').length : 0
      } catch (_) {}
      // Active citizens = those with last activity in 10 min
      const dashRes = await fetch(`/api/dashboard/${graphName}`)
      const citizens = await dashRes.json()
      const now = Math.floor(Date.now() / 1000)
      const active = Array.isArray(citizens) ? citizens.filter(c => c.lastActive && (now - c.lastActive) < 600).length : 0
      setStats({ activeCitizens: active, totalMoments: moments })
    } catch (_) {}
  }

  // SSE stream — subscribe to graph deltas
  useEffect(() => {
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null }

    const es = new EventSource(`/api/stream/${graphName}`)
    sseRef.current = es

    es.onopen = () => setStreaming(true)
    es.onerror = () => setStreaming(false)

    es.addEventListener('tick', (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.nodes && data.links) {
          renderGraph(data.nodes, data.links)
        }
        const deltaCount = data.deltas?.length || 0
        setStatus(`SSE tick: ${data.decayed || 0} decayed, ${data.propagated || 0} propagated, ${deltaCount} deltas`)
      } catch (_) {}
    })

    return () => { es.close(); sseRef.current = null }
  }, [graphName])

  // Tick loop
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current)
    if (tickSpeed > 0) {
      const interval = 5000 / tickSpeed // x1=5s, x2=2.5s, x3=1.7s
      tickRef.current = setInterval(() => runTick(), interval)
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [tickSpeed, graphName])

  // Fetch L2 data when a brain card is expanded
  useEffect(() => {
    if (!expandedBrain) { setExpandedL2(null); return }
    setExpandedL2(null)
    fetch('/api/dashboard/org_ai_dev_dashboard')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          const citizen = data.find(c => c.handle === expandedBrain)
          setExpandedL2(citizen || null)
        }
      })
      .catch(() => setExpandedL2(null))
  }, [expandedBrain])

  const runTick = async () => {
    setStatus('Ticking...')
    try {
      const endpoint = useL2 ? '/api/l2tick' : '/api/tick'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graph: graphName }),
      })
      const data = await res.json()
      if (data.citizens) {
        setCitizens(data.citizens)
        const active = data.citizens.filter(c => c.cluster).length
        setStatus(`L2 tick: ${data.decayed} decayed, ${data.propagated} propagated, ${active} citizens acted (${data.duration_ms}ms)`)
      } else if (!streaming) {
        setStatus(`Tick: ${data.decayed || 0} decayed, ${data.propagated || 0} propagated`)
      }
      if (!streaming) runQuery()
      loadStats()
    } catch (e) { setStatus(`Tick error: ${e.message}`) }
  }

  const loadNodeList = async () => {
    setStatus('Loading node list...')
    try {
      // Load current graph first, then others in background
      const allNodes = []
      // Always load current graph
      const since = timeFilter > 0 ? Math.floor(Date.now() / 1000) - (timeFilter * 60) : 0
      try {
        const res = await fetch(`/api/nodes/${graphName}?limit=2000&since=${since}`)
        const nodes = await res.json()
        if (Array.isArray(nodes)) for (const n of nodes) allNodes.push({ ...n, graph: graphName })
      } catch (_) {}
      setNodeList([...allNodes])
      setStatus(`${allNodes.length} nodes from ${graphName}`)

      // Then load other graphs in parallel
      const otherGraphs = (graphs.length > 0 ? graphs : [])
        .filter(g => g !== graphName && !g.startsWith('brain_') && !g.startsWith('test') && !g.startsWith('//') && !g.includes('.') && !g.includes(':') && g !== '_health_check')
        .slice(0, 20) // cap at 20 graphs
      const fetches = otherGraphs.map(g =>
        fetch(`/api/nodes/${g}?limit=500&since=${since}`).then(r => r.json()).then(nodes => {
          if (Array.isArray(nodes)) for (const n of nodes) allNodes.push({ ...n, graph: g })
        }).catch(() => {})
      )
      await Promise.all(fetches)
      allNodes.sort((a, b) => (b.energy || 0) - (a.energy || 0))
      setNodeList(allNodes)
      setStatus(`${allNodes.length} nodes across ${otherGraphs.length + 1} graphs`)
    } catch (e) { setStatus(`Error: ${e.message}`) }
  }

  const runQuery = async () => {
    setStatus('Querying...')
    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graph: graphName, query }),
      })
      const data = await res.json()
      if (data.error) { setStatus(`Error: ${data.error}`); return }
      renderGraph(data.nodes, data.links)
      setStatus(`${data.nodes.length} nodes, ${data.links.length} links`)
    } catch (e) { setStatus(`Error: ${e.message}`) }
  }

  const renderGraph = (nodes, links) => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    const width = window.innerWidth
    const height = window.innerHeight - 100
    const g = svg.append('g')

    svg.call(d3.zoom().scaleExtent([0.05, 20]).on('zoom', e => g.attr('transform', e.transform)))

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(35))

    const link = g.append('g').selectAll('line').data(links).join('line')
      .attr('stroke', '#555').attr('stroke-opacity', 0.4)
      .attr('stroke-width', d => Math.max(1, (d.weight || 0.5) * 2))

    const linkLabel = g.append('g').selectAll('text').data(links).join('text')
      .attr('font-size', 9).attr('fill', '#888').text(d => d.type || '')

    const node = g.append('g').selectAll('circle').data(nodes).join('circle')
      .attr('r', d => 8 + Math.min((d.weight || 0.5) * 3, 20))
      .attr('fill', d => COLORS[d.label] || '#666')
      .attr('stroke', '#fff').attr('stroke-width', 1.5)
      .call(drag(sim))

    node.append('title').text(d =>
      `${d.label}: ${d.name || d.id}\nweight=${d.weight?.toFixed(2)} energy=${d.energy?.toFixed(2)}\n${d.subtype || ''}`)

    const label = g.append('g').selectAll('text').data(nodes).join('text')
      .attr('font-size', 11).attr('fill', '#fff').attr('dx', 14).attr('dy', 4)
      .text(d => d.name || d.id.split(':').pop())

    sim.on('tick', () => {
      link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y)
      linkLabel.attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2)
      node.attr('cx', d => d.x).attr('cy', d => d.y)
      label.attr('x', d => d.x).attr('y', d => d.y)
    })
  }

  function drag(simulation) {
    return d3.drag()
      .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y })
      .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null })
  }

  const columns = [
    { key: 'score', label: 'Score', get: n => { const s = starScore(n); return s.length } },
    { key: 'graph', label: 'Graph', get: n => n.graph || '' },
    { key: 'type', label: 'Type', get: n => n.label || '' },
    { key: 'subtype', label: 'Subtype', get: n => n.subtype || '' },
    { key: 'name', label: 'Name', get: n => (n.name || n.id || '').toLowerCase() },
    { key: 'content', label: 'Content', get: n => (n.synthesis || n.content || '').toLowerCase() },
    { key: 'energy', label: 'E', get: n => n.energy || 0 },
    { key: 'weight', label: 'W', get: n => n.weight || 0 },
    { key: 'stability', label: 'S', get: n => n.stability || 0 },
    { key: 'friction', label: 'F', get: n => n.friction || 0 },
    { key: 'status', label: 'Status', get: n => n.status || '' },
    { key: 'origin', label: 'Origin', get: n => n.origin || '' },
    { key: 'source', label: 'Source', get: n => n.source || '' },
    { key: 'updated', label: 'Updated', get: n => n.updated || 0 },
  ]

  const toggleSort = (key) => {
    if (sortCol === key) setSortDir(d => d * -1)
    else { setSortCol(key); setSortDir(-1) }
  }

  const toggleType = (type) => {
    setTypeFilter(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type); else next.add(type)
      return next
    })
  }

  const sortedNodes = (() => {
    let list = nodeList
    if (typeFilter.size > 0) list = list.filter(n => typeFilter.has(n.label))
    if (searchText) {
      const q = searchText.toLowerCase()
      list = list.filter(n =>
        (n.name || '').toLowerCase().includes(q) ||
        (n.id || '').toLowerCase().includes(q) ||
        (n.synthesis || '').toLowerCase().includes(q) ||
        (n.content || '').toLowerCase().includes(q) ||
        (n.subtype || '').toLowerCase().includes(q) ||
        (n.origin || '').toLowerCase().includes(q) ||
        (n.source || '').toLowerCase().includes(q) ||
        (n.graph || '').toLowerCase().includes(q)
      )
    }
    const col = columns.find(c => c.key === sortCol)
    if (!col) return list
    return [...list].sort((a, b) => {
      const va = col.get(a), vb = col.get(b)
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sortDir
      return String(va).localeCompare(String(vb)) * sortDir
    })
  })()

  const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, '': 4 }
  const taskColumns = [
    { key: 'severity', label: 'Sev', get: t => SEVERITY_ORDER[t.severity] ?? 4 },
    { key: 'status', label: 'Status', get: t => t.status || '' },
    { key: 'issueType', label: 'Issue Type', get: t => t.issueType || '' },
    { key: 'name', label: 'Name', get: t => (t.name || '').toLowerCase() },
    { key: 'exitCondition', label: 'Exit Condition', get: t => t.exitCondition || '' },
    { key: 'exitTarget', label: 'Target', get: t => t.exitTarget || '' },
    { key: 'claimedBy', label: 'Claimed', get: t => t.claimedBy || '' },
    { key: 'energy', label: 'E', get: t => t.energy || 0 },
    { key: 'weight', label: 'W', get: t => t.weight || 0 },
    { key: 'friction', label: 'F', get: t => t.friction || 0 },
    { key: 'updated', label: 'Updated', get: t => t.updated || 0 },
  ]

  const toggleTaskSort = (key) => {
    if (taskSortCol === key) setTaskSortDir(d => d * -1)
    else { setTaskSortCol(key); setTaskSortDir(-1) }
  }

  const toggleTaskStatus = (status) => {
    setTaskStatusFilter(prev => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status); else next.add(status)
      return next
    })
  }

  const sortedTasks = (() => {
    let list = taskList
    if (taskStatusFilter.size > 0) list = list.filter(t => taskStatusFilter.has(t.status))
    if (taskSearch) {
      const q = taskSearch.toLowerCase()
      list = list.filter(t =>
        (t.name || '').toLowerCase().includes(q) ||
        (t.issueType || '').toLowerCase().includes(q) ||
        (t.synthesis || '').toLowerCase().includes(q) ||
        (t.exitCondition || '').toLowerCase().includes(q) ||
        (t.exitTarget || '').toLowerCase().includes(q) ||
        (t.claimedBy || '').toLowerCase().includes(q) ||
        (t.origin || '').toLowerCase().includes(q)
      )
    }
    const col = taskColumns.find(c => c.key === taskSortCol)
    if (!col) return list
    return [...list].sort((a, b) => {
      const va = col.get(a), vb = col.get(b)
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * taskSortDir
      return String(va).localeCompare(String(vb)) * taskSortDir
    })
  })()

  return (
    <div className="app">
      <div className="toolbar">
        <select value={graphName} onChange={e => setGraphName(e.target.value)}>
          {graphs.map(g => <option key={g} value={g}>{g}</option>)}
          {!graphs.includes(graphName) && <option value={graphName}>{graphName}</option>}
        </select>
        <select value="" onChange={e => { if (e.target.value) setQuery(e.target.value) }}>
          <option value="">Presets...</option>
          {PRESET_QUERIES.map(p => <option key={p.label} value={p.query}>{p.label}</option>)}
        </select>
        <input value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && runQuery()} placeholder="Cypher query..." />
        <button onClick={runQuery}>Run</button>
        <div className="tick-controls">
          <button className={tickSpeed === 0 ? 'active' : ''} onClick={() => setTickSpeed(0)}>⏸</button>
          <button className={tickSpeed === 1 ? 'active' : ''} onClick={() => setTickSpeed(1)}>▶ x1</button>
          <button className={tickSpeed === 2 ? 'active' : ''} onClick={() => setTickSpeed(2)}>▶▶ x2</button>
          <button className={tickSpeed === 3 ? 'active' : ''} onClick={() => setTickSpeed(3)}>▶▶▶ x3</button>
          <button onClick={runTick}>⚡ 1 tick</button>
        </div>
        <button className={`l2-toggle ${useL2 ? 'active' : ''}`}
          onClick={() => setUseL2(!useL2)}>{useL2 ? 'Subconscious' : 'Physics'}</button>
        <div className="view-tabs">
          <button className={view === 'graph' ? 'active' : ''} onClick={() => setView('graph')}>Graph</button>
          <button className={view === 'nodes' ? 'active' : ''} onClick={() => { setView('nodes'); loadNodeList() }}>Nodes</button>
          <button className={view === 'brains' ? 'active' : ''} onClick={() => { setView('brains'); loadBrains() }}>Brains</button>
          <button className={view === 'tasks' ? 'active' : ''} onClick={() => { setView('tasks'); loadTasks() }}>Tasks</button>
          {view === 'tasks' && <>
            <span className="filter-sep">|</span>
            <div className="search-box">
              <input className="search-input" value={taskSearch}
                onChange={e => setTaskSearch(e.target.value)}
                placeholder="Search tasks..." />
              {taskSearch && <button className="search-clear" onClick={() => setTaskSearch('')}>✕</button>}
            </div>
            <span className="filter-sep">|</span>
            {['pending', 'claimed', 'running', 'done', 'failed'].map(s => (
              <button key={s} className={`task-status-btn ${taskStatusFilter.has(s) ? 'active' : ''} status-${s}`}
                onClick={() => toggleTaskStatus(s)}>
                {s}
              </button>
            ))}
            {taskStatusFilter.size > 0 && taskStatusFilter.size < 5 && (
              <button className="type-filter-clear" onClick={() => setTaskStatusFilter(new Set(['pending', 'claimed', 'running', 'done', 'failed']))}>all</button>
            )}
            <span className="node-count">
              {sortedTasks.length !== taskList.length
                ? `${sortedTasks.length} / ${taskList.length}`
                : taskList.length} tasks
            </span>
          </>}
          {view === 'nodes' && <>
            <span className="filter-sep">|</span>
            <div className="search-box">
              <input className="search-input" value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="Search nodes..." />
              {searchText && <button className="search-clear" onClick={() => setSearchText('')}>✕</button>}
            </div>
            <span className="filter-sep">|</span>
            {[10, 60, 1440, 0].map(m => (
              <button key={m} className={timeFilter === m ? 'active' : ''}
                onClick={() => { setTimeFilter(m); setTimeout(loadNodeList, 50) }}>
                {m === 0 ? 'All' : m < 60 ? `${m}m` : m < 1440 ? `${m/60}h` : '24h'}
              </button>
            ))}
            <span className="filter-sep">|</span>
            {Object.keys(COLORS).map(t => (
              <button key={t} className={`type-filter-btn ${typeFilter.has(t) ? 'active' : ''}`}
                style={{ borderColor: COLORS[t], color: typeFilter.has(t) ? '#fff' : COLORS[t],
                  background: typeFilter.has(t) ? COLORS[t] : 'transparent' }}
                onClick={() => toggleType(t)}>
                {t}
              </button>
            ))}
            {typeFilter.size > 0 && (
              <button className="type-filter-clear" onClick={() => setTypeFilter(new Set())}>✕</button>
            )}
            <span className="node-count">
              {sortedNodes.length !== nodeList.length
                ? `${sortedNodes.length} / ${nodeList.length}`
                : nodeList.length} nodes
            </span>
          </>}
        </div>
        <span className={`stream-indicator ${streaming ? 'live' : 'off'}`}>
          {streaming ? 'SSE LIVE' : 'SSE OFF'}
        </span>
        <span className="stats-badge">{stats.activeCitizens} awake</span>
        <span className="stats-badge moments">{stats.totalMoments} moments</span>
        <span className="status">{status}</span>
        <div className="legend">
          {Object.entries(COLORS).map(([k, v]) => <span key={k} style={{ color: v }}>● {k} </span>)}
        </div>
      </div>
      {citizens.length > 0 && (
        <div className="citizen-panel">
          {citizens.map(c => (
            <div key={c.id} className={`citizen-card ${c.cluster?.toLowerCase() || 'idle'}`}>
              <span className="citizen-name">{c.id.replace('citizen:', '')}</span>
              <span className="citizen-cluster">{c.cluster || 'idle'}</span>
              <span className="citizen-sentence">{c.sentence?.slice(0, 50) || ''}</span>
              {c.action?.action && <span className="citizen-action">{c.action.action}</span>}
            </div>
          ))}
        </div>
      )}
      {view === 'graph' && <svg ref={svgRef} width="100%" height="100%" />}
      {view === 'nodes' && (
        <div className="node-list">
          <table>
            <thead>
              <tr>
                {columns.map(col => (
                  <th key={col.key} className={`sortable ${sortCol === col.key ? 'sorted' : ''}`}
                    onClick={() => toggleSort(col.key)}>
                    {col.label}
                    {sortCol === col.key && <span className="sort-arrow">{sortDir === -1 ? ' ▼' : ' ▲'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedNodes.map((n, i) => (
                <tr key={i} className={`node-row type-${(n.label || '').toLowerCase()}`}>
                  <td className="col-score">{starScore(n)}</td>
                  <td className="col-graph"><span className="graph-tag" style={{ borderColor: GRAPH_COLORS[n.graph] || '#444' }}>{n.graph}</span></td>
                  <td><span className="type-badge" style={{ background: COLORS[n.label] || '#666' }}>{n.label}</span></td>
                  <td className="col-subtype">{n.subtype || ''}</td>
                  <td className="col-name" title={n.id}><span className="name-text">{boldHandles(n.name || n.id)}</span></td>
                  <td className="col-content" title={n.content || n.synthesis}>{boldHandles((n.synthesis || n.content || '').slice(0, 80))}</td>
                  <td className="col-num">{n.energy?.toFixed(2)}</td>
                  <td className="col-num">{n.weight?.toFixed(1)}</td>
                  <td className="col-num">{n.stability?.toFixed(2)}</td>
                  <td className="col-num col-friction">{n.friction > 0 ? n.friction.toFixed(2) : ''}</td>
                  <td className="col-status">{n.status || ''}</td>
                  <td className="col-origin">{n.origin ? <span className="handle-tag">@{n.origin}</span> : ''}</td>
                  <td className="col-source">{n.source || ''}</td>
                  <td className="col-time" title={n.updated ? new Date(n.updated * 1000).toLocaleString() : ''}>{timeAgo(n.updated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {view === 'tasks' && (
        <div className="node-list task-list">
          <table>
            <thead>
              <tr>
                {taskColumns.map(col => (
                  <th key={col.key} className={`sortable ${taskSortCol === col.key ? 'sorted' : ''}`}
                    onClick={() => toggleTaskSort(col.key)}>
                    {col.label}
                    {taskSortCol === col.key && <span className="sort-arrow">{taskSortDir === -1 ? ' ▼' : ' ▲'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedTasks.map((t, i) => (
                <tr key={i} className={`node-row task-row-${t.status}`}>
                  <td><span className={`severity-badge sev-${t.severity || 'none'}`}>{t.severity || '-'}</span></td>
                  <td><span className={`task-status-tag status-${t.status}`}>{t.status}</span></td>
                  <td className="col-issue-type">{t.issueType}</td>
                  <td className="col-name" title={t.synthesis || t.name}><span className="name-text">{boldHandles(t.name)}</span></td>
                  <td className="col-exit"><span className="exit-badge">{t.exitCondition || 'manual'}</span></td>
                  <td className="col-exit-target" title={t.exitTarget}>{t.exitTarget ? t.exitTarget.split('/').pop() : ''}</td>
                  <td className="col-origin">{t.claimedBy ? <span className="handle-tag">@{t.claimedBy}</span> : ''}</td>
                  <td className="col-num">{t.energy?.toFixed(2)}</td>
                  <td className="col-num">{t.weight?.toFixed(1)}</td>
                  <td className="col-num col-friction">{t.friction > 0 ? t.friction.toFixed(2) : ''}</td>
                  <td className="col-time" title={t.updated ? new Date(t.updated * 1000).toLocaleString() : ''}>{timeAgo(t.updated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sortedTasks.length === 0 && <div className="brain-empty">No tasks matching filters</div>}
        </div>
      )}
      {view === 'brains' && (
        <div className="brains-view">
          {brainData.length === 0 && <div className="brain-empty">No active brains — citizens are dormant</div>}
          {brainData.map(b => {
            const isExpanded = expandedBrain === b.handle
            const visibleNodes = isExpanded ? b.nodes : b.nodes.slice(0, 5)
            return (
            <div key={b.handle} className={`brain-card ${isExpanded ? 'brain-card-expanded' : ''}`}>
              <div className="brain-header" onClick={() => setExpandedBrain(isExpanded ? null : b.handle)}>
                <span className="brain-chevron">{isExpanded ? '\u25BC' : '\u25B6'}</span>
                <span className="brain-handle">@{b.handle}</span>
                <span className="brain-stats">{b.activeNodes} active / {b.totalNodes} total</span>
                {b.place && <span className="brain-place" title="Current location">{b.place}</span>}
                {b.task && <span className="brain-task" title={b.task.name}>{b.task.status === 'running' ? '>' : '~'} {b.task.name?.slice(0, 50)}</span>}
                <span className="brain-types">
                  {b.types.map(t => <span key={t.type} className="type-badge" style={{ background: COLORS[t.type] || '#666', marginRight: 4 }}>{t.type} {t.count}</span>)}
                </span>
              </div>
              <div className="brain-nodes">
                {visibleNodes.map((n, i) => (
                  <div key={i} className="brain-node">
                    <span className="brain-node-energy" style={{ width: `${Math.min(n.energy * 200, 100)}%` }} />
                    <span className="brain-node-circle" style={{
                      width: 8 + Math.min(n.weight * 4, 20),
                      height: 8 + Math.min(n.weight * 4, 20),
                      background: `hsl(${120 * Math.min(n.energy, 1)}, 80%, ${30 + n.energy * 40}%)`,
                      borderColor: COLORS[n.type] || '#444',
                    }} title={`W=${n.weight?.toFixed(1)} E=${n.energy?.toFixed(3)} S=${n.stability?.toFixed(2)}`} />
                    <span className={`brain-node-type ntype-${(n.nodeType || n.subtype || n.type || '').toLowerCase()}`}>{n.nodeType || n.subtype || n.type}</span>
                    <span className="brain-node-name">{boldHandles(n.name || n.id)}</span>
                    <span className="brain-node-tags">
                      {n.selfRelevance > 0.1 && <span className="tag tag-self" title="self relevance">self</span>}
                      {n.partnerRelevance > 0.1 && <span className="tag tag-partner" title="partner relevance">partner</span>}
                      {n.goalRelevance > 0.1 && <span className="tag tag-goal" title="goal relevance">goal</span>}
                      {n.care > 0.1 && <span className="tag tag-care" title="care affinity">care</span>}
                      {n.achievement > 0.1 && <span className="tag tag-achieve" title="achievement">achieve</span>}
                      {n.novelty > 0.1 && <span className="tag tag-novelty" title="novelty">novelty</span>}
                      {n.risk > 0.1 && <span className="tag tag-risk" title="risk">risk</span>}
                    </span>
                    <span className="brain-node-meta">
                      {n.activations > 0 && <span className="meta-act" title="activation count">x{n.activations}</span>}
                      <span className="meta-e">E={n.energy?.toFixed(2)}</span>
                      {n.lastActive ? <span className="meta-time">{timeAgo(n.lastActive)}</span> : n.created ? <span className="meta-time">{timeAgo(n.created)}</span> : ''}
                    </span>
                  </div>
                ))}
                {!isExpanded && b.nodes.length > 5 && (
                  <div className="brain-nodes-more">+{b.nodes.length - 5} more nodes</div>
                )}
              </div>
              {isExpanded && (
                <div className="brain-expanded-section">
                  <div className="brain-section-title">L2 Connections</div>
                  {expandedL2 === null && <div className="brain-section-loading">Loading...</div>}
                  {expandedL2 && expandedL2.l2Active && expandedL2.l2Active.length > 0 ? (
                    <div className="brain-l2-list">
                      {expandedL2.l2Active.map((link, i) => (
                        <div key={i} className="brain-l2-item">
                          <span className="brain-l2-target">{boldHandles(link.target || link.name || link.id || '')}</span>
                          {link.type && <span className="brain-l2-type">{link.type}</span>}
                          {link.weight != null && <span className="brain-l2-weight">W={typeof link.weight === 'number' ? link.weight.toFixed(1) : link.weight}</span>}
                          {link.trust != null && <span className="brain-l2-trust">T={typeof link.trust === 'number' ? link.trust.toFixed(2) : link.trust}</span>}
                        </div>
                      ))}
                    </div>
                  ) : expandedL2 && (
                    <div className="brain-section-empty">No L2 connections found</div>
                  )}
                  {expandedL2 && expandedL2.neighbors && expandedL2.neighbors.length > 0 && (
                    <>
                      <div className="brain-section-title">Neighbors</div>
                      <div className="brain-l2-list">
                        {expandedL2.neighbors.map((nb, i) => (
                          <div key={i} className="brain-l2-item">
                            <span className="brain-l2-target">{boldHandles(nb.name || nb.handle || nb.id || '')}</span>
                            {nb.type && <span className="brain-l2-type">{nb.type}</span>}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default App
