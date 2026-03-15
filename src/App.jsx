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
  const [query, setQuery] = useState('MATCH (n)-[r]->(m) RETURN n, r, m')
  const [graphs, setGraphs] = useState([])
  const [status, setStatus] = useState('Ready')
  const [tickSpeed, setTickSpeed] = useState(0) // 0=paused, 1=x1, 2=x2, 3=x3
  const [streaming, setStreaming] = useState(false)
  const [citizens, setCitizens] = useState([])
  const [useL2, setUseL2] = useState(false)
  const [view, setView] = useState('nodes') // 'graph' | 'nodes'
  const [nodeList, setNodeList] = useState([])
  const [timeFilter, setTimeFilter] = useState(10) // minutes
  const [sortCol, setSortCol] = useState('energy') // default sort column
  const [sortDir, setSortDir] = useState(-1) // -1 = desc, 1 = asc
  const [typeFilter, setTypeFilter] = useState(new Set()) // empty = show all
  const [searchText, setSearchText] = useState('') // text search across fields
  const tickRef = useRef(null)
  const sseRef = useRef(null)
  const simRef = useRef(null) // hold D3 simulation for live updates

  useEffect(() => {
    fetch('/api/graphs').then(r => r.json()).then(setGraphs).catch(() => {})
    // Auto-load graph on mount
    runQuery()
  }, [])

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

  return (
    <div className="app">
      <div className="toolbar">
        <select value={graphName} onChange={e => setGraphName(e.target.value)}>
          {graphs.map(g => <option key={g} value={g}>{g}</option>)}
          {!graphs.includes(graphName) && <option value={graphName}>{graphName}</option>}
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
          onClick={() => setUseL2(!useL2)}>{useL2 ? 'L2' : 'L1'}</button>
        <div className="view-tabs">
          <button className={view === 'graph' ? 'active' : ''} onClick={() => setView('graph')}>Graph</button>
          <button className={view === 'nodes' ? 'active' : ''} onClick={() => { setView('nodes'); loadNodeList() }}>Nodes</button>
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
    </div>
  )
}

export default App
