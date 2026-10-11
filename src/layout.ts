// Turns a solved step into a buildable row of machines: which belts run along it, what's on each
// lane, which inserters to use, where poles and pipes go. Schematic, but tile-accurate in size.

import { game } from './game'
import { beltFor, isFluid, rowsFor } from './format'
import type { Settings, Step } from './solver'

export interface Lane {
  item: string
  rate: number // per second, for one row
}
export interface BeltPlan {
  dir: 'in' | 'out'
  lanes: [Lane | null, Lane | null] // same item in both lanes = full belt of it
  inserter: string // inserter entity used for this belt
  insertersPerMachine: number
}
export interface PipePlan {
  item: string
  dir: 'in' | 'out'
  rate: number
}

export interface RowPlan {
  kind: 'craft' | 'mine' | 'pumpjack' | 'pump' | 'raw'
  entity: string // machine / drill / pump name
  w: number
  h: number
  rows: number
  perRow: number
  /** belts above the machines, nearest first */
  top: BeltPlan[]
  /** belts below the machines, nearest first */
  bottom: BeltPlan[]
  pipesTop: PipePlan[]
  pipesBottom: PipePlan[]
  poles: boolean
  belt: string
  notes: string[]
}

// Rough belt→machine throughput per inserter (items/s) with no stack bonus research.
const INSERTERS: { name: string; rate: number }[] = [
  { name: 'inserter', rate: 0.83 },
  { name: 'fast-inserter', rate: 2.31 },
  { name: 'bulk-inserter', rate: 4.6 },
]
const LONG = { name: 'long-handed-inserter', rate: 1.2 }

function pickInserter(perMachine: number, long: boolean): { name: string; count: number } {
  if (long) return { name: LONG.name, count: Math.max(1, Math.ceil(perMachine / LONG.rate - 1e-9)) }
  const one = INSERTERS.find((i) => perMachine <= i.rate)
  if (one) return { name: one.name, count: 1 }
  const best = INSERTERS[INSERTERS.length - 1]
  return { name: best.name, count: Math.ceil(perMachine / best.rate - 1e-9) }
}

/** Pack item flows into belt lanes: anything over half a belt gets a whole belt, the rest share. */
function packLanes(flows: Lane[], beltRate: number): [Lane | null, Lane | null][] {
  const laneCap = beltRate / 2
  const full = flows.filter((f) => f.rate > laneCap + 1e-9)
  const half = flows.filter((f) => f.rate <= laneCap + 1e-9).sort((a, b) => b.rate - a.rate)
  const belts: [Lane | null, Lane | null][] = full.map((f) => [f, f])
  for (let i = 0; i < half.length; i += 2) belts.push([half[i], half[i + 1] ?? null])
  return belts
}

function size(name: string): [number, number] {
  return game.machines[name]?.size || game.drills[name]?.size || [3, 3]
}

export function planRow(st: Step, s: Settings): RowPlan {
  const belt = beltFor(s, st.belt)
  const beltRate = belt.rate * s.beltStack
  const { rows, perRow } = rowsFor(st, s)
  const machines = Math.max(1, perRow)
  const per = (rate: number) => rate / rows // per row
  const notes: string[] = []

  const base = {
    rows,
    perRow: machines,
    top: [] as BeltPlan[],
    bottom: [] as BeltPlan[],
    pipesTop: [] as PipePlan[],
    pipesBottom: [] as PipePlan[],
    poles: false,
    belt: belt.name,
    notes,
  }

  if (st.kind === 'raw') {
    const fluid = isFluid(st.item)
    return {
      ...base,
      kind: 'raw',
      entity: st.item,
      w: 1,
      h: 1,
      perRow: 0,
      bottom: fluid
        ? []
        : packLanes([{ item: st.item, rate: per(st.outputs[0].rate) }], beltRate).map((lanes) => ({
            dir: 'out' as const,
            lanes,
            inserter: '',
            insertersPerMachine: 0,
          })),
      pipesBottom: fluid ? [{ item: st.item, dir: 'out', rate: st.outputs[0].rate }] : [],
    }
  }

  if (st.kind === 'pump') {
    return {
      ...base,
      kind: 'pump',
      entity: game.offshore.name,
      w: 1,
      h: 2,
      rows: 1,
      perRow: Math.ceil(st.count - 1e-6),
      pipesBottom: [{ item: st.item, dir: 'out', rate: st.outputs[0].rate }],
    }
  }

  const entity = st.machine?.name || 'assembling-machine-1'
  const [w, h] = size(entity)

  if (st.kind === 'mine') {
    const out = st.outputs.find((o) => o.item === st.item)!
    if (isFluid(st.item)) {
      return {
        ...base,
        kind: 'pumpjack',
        entity,
        w,
        h,
        rows: 1,
        perRow: Math.ceil(st.count - 1e-6),
        poles: true,
        pipesBottom: [{ item: st.item, dir: 'out', rate: out.rate }],
      }
    }
    const fluidIn = st.inputs.find((i) => isFluid(i.item))
    if (fluidIn) notes.push(`Pipe ${fluidIn.item.replace(/-/g, ' ')} to the drills`)
    return {
      ...base,
      kind: 'mine',
      entity,
      w,
      h,
      poles: !!st.machine?.electric,
      // drills on both sides of one belt
      bottom: [
        {
          dir: 'out',
          lanes: [
            { item: st.item, rate: per(out.rate) },
            { item: st.item, rate: per(out.rate) },
          ],
          inserter: '',
          insertersPerMachine: 0,
        },
      ],
      pipesTop: fluidIn ? [{ item: fluidIn.item, dir: 'in', rate: fluidIn.rate }] : [],
    }
  }

  // ---- crafting row ----
  const solidIn = st.inputs.filter((f) => !isFluid(f.item)).map((f) => ({ item: f.item, rate: per(f.rate) }))
  const solidOut = st.outputs.filter((f) => !isFluid(f.item)).map((f) => ({ item: f.item, rate: per(f.rate) }))
  const fluidIn = st.inputs.filter((f) => isFluid(f.item))
  const fluidOut = st.outputs.filter((f) => isFluid(f.item))

  const inBelts = packLanes(solidIn, beltRate)
  const outBelts = packLanes(solidOut, beltRate)

  const makeBelt = (dir: 'in' | 'out', lanes: [Lane | null, Lane | null], index: number): BeltPlan => {
    const items = lanes[0] && lanes[1] && lanes[0].item === lanes[1].item ? [lanes[0]] : lanes.filter(Boolean)
    const perMachine = (items as Lane[]).reduce((a, l) => a + l.rate, 0) / machines
    const ins = pickInserter(perMachine, index === 1)
    return { dir, lanes, inserter: ins.name, insertersPerMachine: ins.count }
  }

  // Inputs on top (up to two belts: inserter + long-handed). Outputs below, nearest the machine.
  const top = inBelts.slice(0, 2).map((l, i) => makeBelt('in', l, i))
  const bottomIn = inBelts.slice(2)
  const bottom = [...outBelts.map((l, i) => makeBelt('out', l, i)), ...bottomIn.map((l) => makeBelt('in', l, 1))]
  if (bottom.length > 2 || bottomIn.length > 1) {
    notes.push('More belts than inserters can reach — consider direct insertion or splitting this step')
  }

  // Fluids travel as underground pipes: inputs along the top, outputs along the bottom.
  // If one side has none, the other side's extras move over so pipes stay spread out.
  const pipesTop: PipePlan[] = fluidIn.map((f) => ({ item: f.item, dir: 'in' as const, rate: f.rate }))
  const pipesBottom: PipePlan[] = fluidOut.map((f) => ({ item: f.item, dir: 'out' as const, rate: f.rate }))
  if (!pipesBottom.length && pipesTop.length > 1) pipesBottom.push(pipesTop.pop()!)
  if (!pipesTop.length && pipesBottom.length > 1) pipesTop.push(pipesBottom.pop()!)
  if (fluidIn.length + fluidOut.length > 0) {
    notes.push('Pipe positions are schematic — rotate machines so their pipe connections line up')
  }
  if (st.machine?.fuel) notes.push('Burner machines: put fuel (coal) on the free lane of an input belt')

  return {
    ...base,
    kind: 'craft',
    entity,
    w,
    h,
    top,
    bottom,
    pipesTop,
    pipesBottom,
    poles: !!st.machine?.electric,
  }
}
