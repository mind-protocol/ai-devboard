// src/shared/blood-ledger/renderer.js
// Blood Ledger — visual transform generation from salience entries
// @see docs/feedback/IMPLEMENTATION_Feedback.md (Boundary: Blood Ledger)
// @see docs/feedback/ALGORITHM_Feedback.md (VisualTransform data structure)
//
// The Blood Ledger is a pluggable rendering cartridge. This is the default
// strategy — produces VisualTransform objects for 2D graph rendering.
// Swap for Map, Chronicle, or VR strategies as needed.

import { VISIBILITY_THRESHOLD } from '../server/salience.js'

/**
 * Convert a salience entry into a VisualTransform for client rendering.
 *
 * VisualTransform schema (from ALGORITHM_Feedback.md):
 *   node_id:     string   — target graph node
 *   opacity:     float    — 0.0 (invisible) to 1.0 (fully visible)
 *   scale:       float    — size multiplier based on salience
 *   pulse_rate:  float    — animation speed based on energy
 *   color_shift: float    — hue/saturation shift based on friction
 *   alert_level: string   — "none" | "low" | "medium" | "high"
 *
 * @param {SalienceEntry} entry - { node_id, weight, energy, focus, salience, visible }
 * @param {Object} [nodeData={}] - Optional raw node data with friction, stability, etc.
 * @returns {VisualTransform}
 */
export function renderTransform(entry, nodeData = {}) {
  if (!entry.visible) {
    return {
      node_id: entry.node_id,
      opacity: 0.0,
      scale: 0.1,
      pulse_rate: 0.0,
      color_shift: 0.0,
      alert_level: 'none',
    }
  }

  // Normalize salience to 0-1 range for visual mapping
  // Cap at 10.0 to prevent extreme outliers from dominating
  const normalizedSalience = Math.min(entry.salience / 1.0, 1.0)

  // Opacity: scales with salience, minimum 0.2 for visible nodes
  const opacity = Math.min(0.2 + normalizedSalience * 0.8, 1.0)

  // Scale: 0.5x to 2.0x based on salience
  const scale = 0.5 + normalizedSalience * 1.5

  // Pulse rate: driven by energy — high energy = fast pulse
  const energy = Math.max(entry.energy || 0, 0)
  const pulse_rate = Math.min(energy * 2.0, 3.0)

  // Color shift and alert level: driven by friction
  const friction = Math.max(nodeData.friction || 0, 0)
  const color_shift = Math.min(friction * 1.5, 1.0)
  const alert_level = frictionToAlert(friction)

  return {
    node_id: entry.node_id,
    opacity,
    scale,
    pulse_rate,
    color_shift,
    alert_level,
  }
}

/**
 * Map friction value to alert level.
 *
 * Friction thresholds (from PATTERNS_Feedback.md):
 *   0.0 - 0.2  → "none"   — normal operation
 *   0.2 - 0.5  → "low"    — minor tension, worth noting
 *   0.5 - 0.8  → "medium" — significant friction, needs attention
 *   0.8+       → "high"   — critical friction, immediate alert
 *
 * @param {number} friction - Friction value (0.0+)
 * @returns {"none"|"low"|"medium"|"high"}
 */
export function frictionToAlert(friction) {
  if (friction >= 0.8) return 'high'
  if (friction >= 0.5) return 'medium'
  if (friction >= 0.2) return 'low'
  return 'none'
}

/**
 * Convert energy level to a visual representation hint.
 *
 * Used by client renderers to pick glow/pulse/color intensity.
 * Returns an object with normalized visual dimensions.
 *
 * @param {number} energy - Node energy (0.0+)
 * @param {Object} [opts={}]
 * @param {number} [opts.maxEnergy=2.0] - Energy ceiling for normalization
 * @returns {{ intensity: number, glow: number, pulse: number, label: string }}
 */
export function energyToVisual(energy, { maxEnergy = 2.0 } = {}) {
  const clamped = Math.max(Math.min(energy, maxEnergy), 0)
  const normalized = clamped / maxEnergy

  // Intensity: linear mapping
  const intensity = normalized

  // Glow: exponential — only noticeable at higher energy
  const glow = Math.pow(normalized, 1.5)

  // Pulse: threshold-based — no pulse below 30% energy
  const pulse = normalized > 0.3 ? (normalized - 0.3) / 0.7 : 0

  // Human-readable label
  let label = 'dormant'
  if (normalized > 0.8) label = 'surging'
  else if (normalized > 0.5) label = 'active'
  else if (normalized > 0.2) label = 'warm'
  else if (normalized > 0.05) label = 'faint'

  return { intensity, glow, pulse, label }
}
