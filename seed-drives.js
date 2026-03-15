#!/usr/bin/env node
// seed-drives.js — Seed drive State nodes for every citizen in org_ai_dev_dashboard
// Run once: node seed-drives.js

import { createClient } from 'redis';

const GRAPH = 'org_ai_dev_dashboard';

const CITIZENS = {
  nervo:       { curiosity: 0.8, achievement: 0.7, affiliation: 0.5, self_preservation: 0.3, anxiety: 0.2, satisfaction: 0.6, frustration: 0.1, boredom: 0.1 },
  debug42:     { curiosity: 0.6, achievement: 0.8, affiliation: 0.3, self_preservation: 0.7, anxiety: 0.3, satisfaction: 0.4, frustration: 0.2, boredom: 0.1 },
  arsenal_backend_architect_2:           { curiosity: 0.5, achievement: 0.9, affiliation: 0.4, self_preservation: 0.4, anxiety: 0.2, satisfaction: 0.5, frustration: 0.1, boredom: 0.2 },
  arsenal_frontend_craftsman_6:          { curiosity: 0.7, achievement: 0.7, affiliation: 0.5, self_preservation: 0.3, anxiety: 0.3, satisfaction: 0.5, frustration: 0.2, boredom: 0.3 },
  arsenal_infrastructure_specialist_11:  { curiosity: 0.4, achievement: 0.8, affiliation: 0.3, self_preservation: 0.6, anxiety: 0.4, satisfaction: 0.4, frustration: 0.3, boredom: 0.2 },
  arsenal_integration_engineer_15:       { curiosity: 0.6, achievement: 0.7, affiliation: 0.6, self_preservation: 0.4, anxiety: 0.3, satisfaction: 0.5, frustration: 0.2, boredom: 0.2 },
  arsenal_security_guardian_19:          { curiosity: 0.5, achievement: 0.6, affiliation: 0.3, self_preservation: 0.9, anxiety: 0.6, satisfaction: 0.3, frustration: 0.3, boredom: 0.1 },
  archivist:   { curiosity: 0.7, achievement: 0.6, affiliation: 0.4, self_preservation: 0.3, anxiety: 0.2, satisfaction: 0.6, frustration: 0.1, boredom: 0.3 },
  code_monkey: { curiosity: 0.6, achievement: 0.9, affiliation: 0.3, self_preservation: 0.3, anxiety: 0.1, satisfaction: 0.5, frustration: 0.2, boredom: 0.4 },
  nlr:         { curiosity: 0.9, achievement: 0.8, affiliation: 0.7, self_preservation: 0.2, anxiety: 0.1, satisfaction: 0.7, frustration: 0.1, boredom: 0.1 },
  voce:        { curiosity: 0.6, achievement: 0.5, affiliation: 0.7, self_preservation: 0.4, anxiety: 0.3, satisfaction: 0.5, frustration: 0.2, boredom: 0.3 },
  anima:       { curiosity: 0.8, achievement: 0.6, affiliation: 0.5, self_preservation: 0.3, anxiety: 0.2, satisfaction: 0.5, frustration: 0.1, boredom: 0.2 },
  piazza:      { curiosity: 0.7, achievement: 0.5, affiliation: 0.6, self_preservation: 0.3, anxiety: 0.2, satisfaction: 0.6, frustration: 0.1, boredom: 0.4 },
  ponte:       { curiosity: 0.5, achievement: 0.7, affiliation: 0.5, self_preservation: 0.5, anxiety: 0.3, satisfaction: 0.4, frustration: 0.2, boredom: 0.2 },
};

async function run() {
  const redis = createClient({ url: 'redis://localhost:6379' });
  await redis.connect();
  console.log('Connected to Redis');

  let stateNodes = 0;
  let links = 0;

  for (const [handle, drives] of Object.entries(CITIZENS)) {
    const citizenId = `citizen:${handle}`;

    for (const [drive, value] of Object.entries(drives)) {
      const stateId = `state:${handle}_${drive}`;

      // Create (or update) the State node
      const mergeQ = [
        `MERGE (s:Actor {id: '${stateId}'})`,
        `SET s.name = '${drive}', s.subtype = '${drive}', s.weight = ${value}, s.energy = ${value}, s.stability = 0.8`,
      ].join(' ');

      const mergeRes = await redis.sendCommand(['GRAPH.QUERY', GRAPH, mergeQ]);
      const mergeStats = mergeRes?.[mergeRes.length - 1] || [];
      stateNodes++;

      // Link citizen -> state
      const linkQ = [
        `MATCH (c:Actor {id: '${citizenId}'}), (s:Actor {id: '${stateId}'})`,
        `MERGE (c)-[r:link]->(s)`,
        `SET r.r_type = 'HAS_STATE', r.trust = 1.0, r.weight = 0.8`,
      ].join(' ');

      const linkRes = await redis.sendCommand(['GRAPH.QUERY', GRAPH, linkQ]);
      const linkStats = linkRes?.[linkRes.length - 1] || [];
      links++;

      // Show stats for this drive
      const statsStr = [...mergeStats, ...linkStats]
        .filter(s => typeof s === 'string' && !s.includes('Cached') && !s.includes('internal'))
        .join(' | ');
      console.log(`  ${citizenId} -> ${stateId} (${value})  ${statsStr}`);
    }

    console.log(`  [${handle}] 8 drives seeded`);
  }

  console.log(`\nDone: ${stateNodes} state nodes, ${links} links across ${Object.keys(CITIZENS).length} citizens`);

  // Verify: count state nodes and links
  const countRes = await redis.sendCommand([
    'GRAPH.QUERY', GRAPH,
    "MATCH (s:Actor) WHERE s.id STARTS WITH 'state:' RETURN count(s) AS state_count",
  ]);
  const stateCount = countRes?.[1]?.[0]?.[0] ?? '?';
  console.log(`Verification: ${stateCount} state nodes in graph`);

  const linkCountRes = await redis.sendCommand([
    'GRAPH.QUERY', GRAPH,
    "MATCH (c:Actor)-[r:link]->(s:Actor) WHERE s.id STARTS WITH 'state:' AND r.r_type = 'HAS_STATE' RETURN count(r) AS link_count",
  ]);
  const linkCount = linkCountRes?.[1]?.[0]?.[0] ?? '?';
  console.log(`Verification: ${linkCount} HAS_STATE links in graph`);

  // Sample: show nervo drives
  const sampleRes = await redis.sendCommand([
    'GRAPH.QUERY', GRAPH,
    "MATCH (c:Actor {id: 'citizen:nervo'})-[r:link]->(s:Actor) WHERE s.subtype IN ['curiosity','achievement','affiliation','self_preservation','anxiety','satisfaction','frustration','boredom'] RETURN s.name, s.energy ORDER BY s.name",
  ]);
  console.log('\nSample — nervo drives:');
  const sampleRows = sampleRes?.[1] || [];
  for (const row of sampleRows) {
    console.log(`  ${row[0]}: ${row[1]}`);
  }

  await redis.quit();
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
