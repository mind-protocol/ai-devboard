#!/usr/bin/env node
// Bounty Hunter — scrape GitHub "good first issue" + "help wanted", evaluate, assign to citizens
//
// Usage:
//   node bounty-hunter.js --scan                  # find issues
//   node bounty-hunter.js --assign                # assign best-fit citizen to top issues
//   node bounty-hunter.js --work                  # citizens work on assigned issues
//   node bounty-hunter.js --loop                  # scan + assign + work every 30min
//
// Revenue model: PRs merged → reputation → bounties → $MIND

import { execSync } from 'child_process'
import { createClient } from 'redis'
import { writeFileSync, readFileSync, existsSync } from 'fs'

const GRAPH = 'org_ai_dev_dashboard'
const STATE_FILE = '/tmp/bounty-hunter-state.json'
const MAX_ISSUES = 20

// Languages our citizens can handle
const LANGS = ['javascript', 'typescript', 'python', 'markdown']

// Repos to target (popular, welcoming, relevant to our stack)
const TARGET_REPOS = [
  // Graph / DB
  'FalkorDB/FalkorDB',
  'redis/node-redis',
  // JS / Node
  'expressjs/express',
  'vitejs/vite',
  'd3/d3',
  // AI / ML
  'anthropics/anthropic-sdk-python',
  'anthropics/anthropic-sdk-typescript',
  // Tools
  'sindresorhus/awesome-nodejs',
  'github/docs',
]

// Additional search queries for broader discovery
const SEARCH_QUERIES = [
  'label:"good first issue" language:javascript state:open',
  'label:"help wanted" language:python state:open',
  'label:"good first issue" language:typescript state:open',
  'label:"documentation" label:"good first issue" state:open',
]

// Citizen skills for matching
const CITIZEN_SKILLS = {
  code_monkey: { langs: ['javascript', 'typescript', 'python'], types: ['bug', 'feature', 'refactor'] },
  arsenal_backend_architect_2: { langs: ['javascript', 'python'], types: ['architecture', 'refactor', 'performance'] },
  arsenal_frontend_craftsman_6: { langs: ['javascript', 'typescript'], types: ['ui', 'css', 'accessibility', 'feature'] },
  debug42: { langs: ['javascript', 'python'], types: ['bug', 'test', 'debugging'] },
  arsenal_integration_engineer_15: { langs: ['javascript', 'typescript'], types: ['api', 'integration', 'docs'] },
  archivist: { langs: ['markdown'], types: ['docs', 'documentation', 'readme'] },
  nervo: { langs: ['javascript', 'python'], types: ['graph', 'database', 'architecture'] },
}

function loadState() {
  if (existsSync(STATE_FILE)) {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
  }
  return { scanned: [], assigned: [], submitted: [], merged: [] }
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

// Scan GitHub for good first issues
async function scan() {
  console.log('Scanning GitHub for issues...\n')
  const state = loadState()
  const issues = []

  // Search from target repos
  for (const repo of TARGET_REPOS) {
    try {
      const result = execSync(
        `gh issue list --repo ${repo} --label "good first issue" --state open --limit 5 --json number,title,url,labels,body,createdAt 2>/dev/null`,
        { encoding: 'utf-8', timeout: 15000 }
      )
      const parsed = JSON.parse(result || '[]')
      for (const issue of parsed) {
        issues.push({ ...issue, repo, source: 'targeted' })
      }
    } catch (_) {}
  }

  // Search queries for broader discovery
  for (const q of SEARCH_QUERIES) {
    try {
      const result = execSync(
        `gh search issues "${q}" --limit 10 --json repository,number,title,url,labels,createdAt 2>/dev/null`,
        { encoding: 'utf-8', timeout: 15000 }
      )
      const parsed = JSON.parse(result || '[]')
      for (const issue of parsed) {
        const repo = issue.repository?.nameWithOwner || issue.repository?.fullName || ''
        issues.push({ ...issue, repo, source: 'search' })
      }
    } catch (_) {}
  }

  // Dedupe by URL
  const seen = new Set(state.scanned.map(i => i.url))
  const newIssues = issues.filter(i => i.url && !seen.has(i.url))

  // Score each issue
  for (const issue of newIssues) {
    const labels = (issue.labels || []).map(l => (l.name || l).toLowerCase())
    const title = (issue.title || '').toLowerCase()
    const body = (issue.body || '').toLowerCase().slice(0, 500)

    // Score: how doable is this for our citizens?
    let score = 0
    if (labels.some(l => l.includes('good first'))) score += 3
    if (labels.some(l => l.includes('help wanted'))) score += 2
    if (labels.some(l => l.includes('documentation') || l.includes('docs'))) score += 2
    if (labels.some(l => l.includes('bug'))) score += 1
    if (labels.some(l => l.includes('easy') || l.includes('beginner'))) score += 2
    if (title.includes('typo') || title.includes('readme') || title.includes('doc')) score += 2
    if (body.includes('steps to reproduce') || body.includes('expected behavior')) score += 1
    // Penalize complex stuff
    if (labels.some(l => l.includes('complex') || l.includes('breaking'))) score -= 3
    if (body.length < 50) score -= 1 // too vague

    issue.score = score
    issue.scannedAt = Date.now()
  }

  // Sort by score
  newIssues.sort((a, b) => b.score - a.score)
  const top = newIssues.slice(0, MAX_ISSUES)

  state.scanned.push(...top)
  // Keep last 100
  if (state.scanned.length > 100) state.scanned = state.scanned.slice(-100)
  saveState(state)

  console.log(`Found ${issues.length} total, ${newIssues.length} new, top ${top.length}:\n`)
  for (const issue of top) {
    console.log(`  [${issue.score}] ${issue.repo}#${issue.number}: ${issue.title?.slice(0, 60)}`)
    console.log(`       ${issue.url}`)
  }

  return top
}

// Assign best-fit citizen to each issue
async function assign() {
  const state = loadState()
  const unassigned = state.scanned.filter(i =>
    !state.assigned.some(a => a.url === i.url) && i.score >= 2
  )

  if (unassigned.length === 0) {
    console.log('No unassigned issues. Run --scan first.')
    return
  }

  console.log(`Assigning ${unassigned.length} issues...\n`)

  const redis = createClient({ url: 'redis://localhost:6379' })
  await redis.connect()

  for (const issue of unassigned.slice(0, 5)) {
    const labels = (issue.labels || []).map(l => (l.name || l).toLowerCase())
    const title = (issue.title || '').toLowerCase()

    // Match citizen by skills
    let bestCitizen = 'code_monkey' // default
    let bestScore = 0

    for (const [handle, skills] of Object.entries(CITIZEN_SKILLS)) {
      let matchScore = 0
      // Label match
      for (const type of skills.types) {
        if (labels.some(l => l.includes(type)) || title.includes(type)) matchScore += 2
      }
      // Language match
      for (const lang of skills.langs) {
        if (labels.some(l => l.includes(lang)) || title.includes(lang)) matchScore += 1
      }
      // Doc issues → archivist
      if ((labels.some(l => l.includes('doc')) || title.includes('doc')) && handle === 'archivist') matchScore += 3

      if (matchScore > bestScore) {
        bestScore = matchScore
        bestCitizen = handle
      }
    }

    const assignment = {
      url: issue.url,
      repo: issue.repo,
      number: issue.number,
      title: issue.title,
      citizen: bestCitizen,
      assignedAt: Date.now(),
      status: 'assigned',
    }

    state.assigned.push(assignment)
    console.log(`  @${bestCitizen} ← ${issue.repo}#${issue.number}: ${issue.title?.slice(0, 50)}`)

    // Create task in graph
    const taskId = `task:bounty:${issue.repo?.replace(/\//g, '_')}_${issue.number}`
    try {
      await redis.sendCommand(['GRAPH.QUERY', GRAPH,
        `MERGE (t:Moment {id: '${taskId}'}) SET t.name = 'PR: ${(issue.title || '').slice(0, 80).replace(/'/g, "\\'")}', t.type = 'task_run', t.subtype = 'task_run', t.status = 'claimed', t.issue_type = 'bounty', t.severity = 'medium', t.weight = 0.8, t.energy = 0.7, t.stability = 0.5, t.synthesis = '${(issue.url || '').replace(/'/g, "\\'")}', t.created_at_s = ${Math.floor(Date.now() / 1000)}`
      ])
      await redis.sendCommand(['GRAPH.QUERY', GRAPH,
        `MATCH (t:Moment {id: '${taskId}'}), (a:Actor {id: 'citizen:${bestCitizen}'}) MERGE (t)-[r:link]->(a) SET r.r_type = 'claimed_by', r.trust = 0.8, r.weight = 0.7`
      ])
      await redis.sendCommand(['GRAPH.QUERY', GRAPH,
        `MATCH (t:Moment {id: '${taskId}'}), (o:Actor {id: 'org:ai_dev_dashboard'}) MERGE (t)-[r:link]->(o) SET r.r_type = 'BELONGS_TO', r.weight = 0.5`
      ])
    } catch (_) {}
  }

  saveState(state)
  await redis.quit()
}

// Citizens work on assigned issues
async function work() {
  const state = loadState()
  const todo = state.assigned.filter(a => a.status === 'assigned')

  if (todo.length === 0) {
    console.log('No assigned issues to work on. Run --assign first.')
    return
  }

  console.log(`${todo.length} issues to work on...\n`)

  for (const assignment of todo.slice(0, 3)) {
    console.log(`@${assignment.citizen} working on ${assignment.repo}#${assignment.number}...`)

    // Get issue details
    let issueBody = ''
    try {
      issueBody = execSync(
        `gh issue view ${assignment.number} --repo ${assignment.repo} --json body,title,labels --jq '.title + "\\n\\n" + .body' 2>/dev/null`,
        { encoding: 'utf-8', timeout: 15000 }
      ).slice(0, 3000)
    } catch (_) {
      console.log(`  Could not fetch issue — skipping`)
      assignment.status = 'skipped'
      continue
    }

    // Ask citizen to analyze and propose a fix
    const prompt = `You're contributing to open source. Here's a GitHub issue to fix:

Repository: ${assignment.repo}
Issue #${assignment.number}: ${assignment.title}

${issueBody}

Analyze this issue and write a concrete plan:
1. What files need to change?
2. What's the fix?
3. Write the actual code diff or new content.

Be specific — this needs to become a real PR.`

    try {
      const citizenDir = `/home/mind-protocol/ai_devboard/mind-repo/citizens/${assignment.citizen}`
      const response = execSync(
        `echo '${prompt.replace(/'/g, "'\\''")}' | claude --print --continue --dangerously-skip-permissions`,
        { cwd: existsSync(citizenDir) ? citizenDir : '/home/mind-protocol/ai_devboard',
          encoding: 'utf-8', timeout: 600000, maxBuffer: 10 * 1024 * 1024 }
      ).trim()

      console.log(`  @${assignment.citizen}: ${response.slice(0, 200)}...\n`)

      assignment.status = 'analyzed'
      assignment.analysis = response.slice(0, 3000)
      assignment.analyzedAt = Date.now()
    } catch (e) {
      console.log(`  Failed: ${e.message?.slice(0, 60)}`)
      assignment.status = 'failed'
    }
  }

  saveState(state)
}

// Main
const cmd = process.argv[2]
if (cmd === '--scan') {
  await scan()
} else if (cmd === '--assign') {
  await assign()
} else if (cmd === '--work') {
  await work()
} else if (cmd === '--loop') {
  console.log('Bounty Hunter loop — scan + assign + work every 30min\n')
  const run = async () => {
    await scan()
    await assign()
    await work()
  }
  await run()
  setInterval(run, 30 * 60 * 1000)
} else {
  console.log(`Bounty Hunter — find GitHub issues, assign to citizens, submit PRs

Usage:
  node bounty-hunter.js --scan     Find "good first issue" across GitHub
  node bounty-hunter.js --assign   Match issues to best-fit citizens
  node bounty-hunter.js --work     Citizens analyze and propose fixes
  node bounty-hunter.js --loop     Continuous: scan + assign + work every 30min
`)
}
