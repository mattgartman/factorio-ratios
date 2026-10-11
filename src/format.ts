import { beltByName, game } from './game'
import type { Settings, Step } from './solver'

export function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '∞'
  const abs = Math.abs(n)
  if (abs > 0 && abs < 0.01) return '<0.01'
  if (abs >= 1000) return Math.round(n).toLocaleString()
  const fixed = n.toFixed(abs >= 100 ? Math.min(digits, 1) : digits)
  // trim trailing zeros after the decimal point only ("30" stays "30", "2.50" -> "2.5")
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed
}

/** Rate (per second) formatted in the user's unit. */
export function rate(perSec: number, s: Settings): string {
  return s.unit === 'min' ? `${fmt(perSec * 60, 1)}/min` : `${fmt(perSec)}/s`
}

export function power(w: number): string {
  if (w >= 1e9) return `${fmt(w / 1e9)} GW`
  if (w >= 1e6) return `${fmt(w / 1e6)} MW`
  return `${fmt(w / 1e3, 0)} kW`
}

export function beltFor(s: Settings, override?: string) {
  return beltByName[override || s.belt] || game.belts[0]
}

/** How many full belts this flow fills. */
export function beltsNeeded(perSec: number, s: Settings, override?: string): number {
  return perSec / (beltFor(s, override).rate * s.beltStack)
}

export function isFluid(item: string): boolean {
  return game.items[item]?.kind === 'fluid'
}

/** Solid-item flows that ride on this step's belts (fluids go by pipe). */
function beltFlows(st: Step) {
  return [...st.inputs, ...st.outputs].filter((f) => !isFluid(f.item))
}

/** Fullest belt this group of machines needs, as a fraction of one belt (1 = 100%). */
export function beltLoad(st: Step, s: Settings, belt = st.belt): number {
  return beltFlows(st).reduce((m, f) => Math.max(m, beltsNeeded(f.rate, s, belt)), 0)
}

export function usesBelts(st: Step): boolean {
  return beltFlows(st).length > 0
}

/**
 * How many parallel rows (each with its own belt) the machines need so no belt is over 100%,
 * and how many machines go in each row.
 */
export function rowsFor(st: Step, s: Settings, belt = st.belt): { rows: number; perRow: number } {
  const rows = Math.max(1, Math.ceil(beltLoad(st, s, belt) - 1e-9))
  const machines = Math.ceil(st.count - 1e-6)
  return { rows, perRow: Math.ceil(machines / rows) }
}

/** Cheapest belt that keeps everything on a single row, or undefined if none does. */
export function smallestFittingBelt(st: Step, s: Settings): string | undefined {
  return game.belts.find((b) => beltLoad(st, s, b.name) <= 1 + 1e-9)?.name
}

/** "belt-tag", plus "over" when the flow needs more than one belt. */
export function beltTagClass(perSec: number, s: Settings, override?: string): string {
  return beltsNeeded(perSec, s, override) > 1 + 1e-9 ? 'belt-tag over' : 'belt-tag'
}
