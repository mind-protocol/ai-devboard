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

function App() {
  const svgRef = useRef()
  const [graphName, setGraphName] = useState('org_ai_dev_dashboard')
  const [query, setQuery] = useState('MATCH (n)-[r]->(m) RETURN n, r, m')
  const [graphs, setGraphs] = useState([])
  const [status, setStatus] = useState('Ready')
  const [tickSpeed, setTickSpeed] = useState(0) // 0=paused, 1=x1, 2=x2, 3=x3
  const tickRef = useRef(null)

  useEffect(() => {
    fetch('/api/graphs').then(r => r.json()).then(setGraphs).catch(() => {})
  }, [])

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
      const res = await fetch('/api/tick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graph: graphName }),
      })
      const data = await res.json()
      setStatus(`Tick: ${data.decayed || 0} decayed, ${data.propagated || 0} propagated`)
      // Auto-refresh the graph
      runQuery()
    } catch (e) { setStatus(`Tick error: ${e.message}`) }
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
        <span className="status">{status}</span>
        <div className="legend">
          {Object.entries(COLORS).map(([k, v]) => <span key={k} style={{ color: v }}>● {k} </span>)}
        </div>
      </div>
      <svg ref={svgRef} width="100%" height="100%" />
    </div>
  )
}

export default App
