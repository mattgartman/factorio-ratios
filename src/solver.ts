import {
  game,
  moduleByName,
  recipesByProduct,
  resourceByProduct,
  surfaceOk,
  type Amount,
  type Effect,
  type Machine,
  type Planet,
  type Recipe,
} from './game'

export const RAW = '@raw'
export const MINE = '@mine'
export const PUMP = '@pump'

export interface RowOverride {
  machine?: string
  module?: string // module name, or 'none' (fills every slot)
  modules?: string[] // per-slot choice; wins over `module` when set
  beacons?: number
  beaconModule?: string
  belt?: string
}

export interface Target {
  item: string
  rate: number // per settings.unit
}

export interface Settings {
  planet: string
  unit: 'min' | 'sec'
  belt: string
  beltStack: number
  machines: string[] // enabled crafting machines
  drill: string // preferred mining drill
  module: string // default crafter module or 'none'
  drillModule: string
  beacons: number
  beaconModule: string
  miningProd: number // research bonus, percent
  recipeFor: Record<string, string> // item -> recipe name | RAW | MINE | PUMP
  rows: Record<string, RowOverride> // step id -> overrides
  targets: Target[]
}

/** Recipes the planet's recipe list prefers when nothing else is chosen. */
const PLANET_PREFS: Record<string, Record<string, string>> = {
  '*': {
    'heavy-oil': 'advanced-oil-processing',
    'light-oil': 'advanced-oil-processing',
  },
  vulcanus: {
    water: 'steam-condensation',
    steam: 'acid-neutralisation',
    'heavy-oil': 'simple-coal-liquefaction',
    'light-oil': 'heavy-oil-cracking',
    'petroleum-gas': 'light-oil-cracking',
    'iron-plate': 'casting-iron',
    'copper-plate': 'casting-copper',
    'steel-plate': 'casting-steel',
    'molten-iron': 'molten-iron-from-lava',
    'molten-copper': 'molten-copper-from-lava',
    'iron-gear-wheel': 'casting-iron-gear-wheel',
    'iron-stick': 'casting-iron-stick',
    pipe: 'casting-pipe',
    'copper-cable': 'casting-copper-cable',
    'low-density-structure': 'casting-low-density-structure',
    concrete: 'concrete-from-molten-iron',
  },
  aquilo: {
    water: 'ice-melting',
    ammonia: 'ammoniacal-solution-separation',
    'solid-fuel': 'solid-fuel-from-ammonia',
    'rocket-fuel': 'ammonia-rocket-fuel',
  },
  'space-platform': {
    'iron-ore': 'metallic-asteroid-crushing',
    'copper-ore': 'metallic-asteroid-crushing',
    carbon: 'carbonic-asteroid-crushing',
    ice: 'oxide-asteroid-crushing',
    water: 'ice-melting',
  },
  gleba: {
    'plastic-bar': 'bioplastic',
  },
}

export function planetOf(s: Settings): Planet {
  return game.planets.find((p) => p.name === s.planet) || game.planets[0]
}

/** Every machine that could physically run this recipe on this planet. */
export function machineCandidates(r: Recipe, planet: Planet): Machine[] {
  const cats = [r.cat, ...(r.extraCats || [])]
  return Object.values(game.machines).filter(
    (m) => m.cats.some((c) => cats.includes(c)) && surfaceOk(m.surf, planet.props),
  )
}

export function recipeUsable(r: Recipe, planet: Planet): boolean {
  return surfaceOk(r.surf, planet.props) && machineCandidates(r, planet).length > 0
}

/** Every way to get an item: recipes, mining, pumping, or "bring it in on a belt". */
export function sourceOptions(item: string, s: Settings): string[] {
  const planet = planetOf(s)
  const opts: string[] = []
  const recipes = (recipesByProduct[item] || []).filter((r) => recipeUsable(r, planet))
  const scored = recipes.map((r) => [r, recipeScore(r, item)] as const).sort((a, b) => b[1] - a[1])
  opts.push(...scored.map(([r]) => r.name))
  if (resourceByProduct[item]) opts.push(MINE)
  if (game.offshore.fluids.includes(item)) opts.push(PUMP)
  opts.push(RAW)
  return opts
}

function recipeScore(r: Recipe, item: string): number {
  let s = 0
  if (r.name === item) s += 100
  if (r.out.length === 1) s += 40
  if (r.main === item) s += 20
  if (r.barrel) s -= 200
  if (r.out.length > 3) s -= 80 // e.g. scrap recycling
  if (r.in.some((i) => i.name === item)) s -= 30 // catalytic / self-feeding loops
  return s
}

export function defaultSource(item: string, s: Settings): string {
  const planet = planetOf(s)
  const opts = sourceOptions(item, s)
  const pref = PLANET_PREFS[planet.name]?.[item] ?? PLANET_PREFS['*'][item]
  if (pref && opts.includes(pref)) return pref
  const res = resourceByProduct[item]
  if (res && planet.resources.includes(res.name)) return MINE
  if (planet.fluids.includes(item)) return PUMP
  // Never default to barrel juggling or loops that eat their own product (asteroid reprocessing, kovarex…)
  const recipe = opts.find((o) => {
    const r = game.recipes[o]
    return r && !r.barrel && !r.in.some((i) => i.name === item)
  })
  if (recipe) return recipe
  if (res) return MINE
  return RAW
}

export function sourceFor(item: string, s: Settings): string {
  const chosen = s.recipeFor[item]
  if (chosen && sourceOptions(item, s).includes(chosen)) return chosen
  return defaultSource(item, s)
}

// ---------------------------------------------------------------------------

export interface Flow {
  item: string
  rate: number // per second
}

export interface Step {
  id: string
  kind: 'recipe' | 'mine' | 'pump' | 'raw'
  item: string // the item this step was built for
  recipe?: Recipe
  machine?: Machine
  machineOptions: Machine[]
  notUnlocked?: boolean
  moduleList: string[] // one entry per filled slot
  moduleChoice: string // module name, 'none', or 'mixed'
  slots: string[] // per slot: module name or 'none'
  moduleOptions: string[]
  beacons: number
  beaconModule: string
  speed: number // effective crafting speed
  productivity: number
  speedBonus: number
  consumptionBonus: number
  count: number // exact machines
  baseCount: number // machines needed for the same output with no modules/beacons
  inputs: Flow[]
  outputs: Flow[]
  power: number // watts
  depth: number // column in the production line: 0 = first, higher = closer to final product
  belt?: string // belt override for this step's output
  notes: string[]
}

export interface Result {
  steps: Step[]
  surplus: Flow[]
  targets: Flow[]
  power: number
  buildings: { name: string; count: number }[]
  moduleTotals: { name: string; count: number }[]
}

const EPS = 1e-9

function addEffect(a: Effect, b: Effect | undefined, mul = 1) {
  if (!b) return
  for (const [k, v] of Object.entries(b) as [keyof Effect, number][]) a[k] = (a[k] || 0) + v * mul
}

const moduleEffectKey: Record<string, string> = {
  speed: 'speed',
  productivity: 'productivity',
  efficiency: 'consumption',
  quality: 'quality',
}

function moduleAllowed(mod: string, m: Machine, r: Recipe | undefined): boolean {
  const def = moduleByName[mod]
  if (!def) return false
  const key = moduleEffectKey[def.cat] || def.cat
  if (!m.allowed.includes(key)) return false
  if (key === 'productivity' && r && !r.prod) return false
  if (key === 'speed' && r && !r.speed) return false
  return true
}

interface Built {
  step: Step
  perRun: Amount[] // outputs per run incl. productivity
  inputsPerRun: Amount[]
  runsPerMachine: number // runs / s / machine
  baseMachinesPerUnit?: number // machines per (main item / s) with no modules or beacons
}

/** Build the (unscaled) step description for a source of an item. */
function buildStep(item: string, src: string, s: Settings, planet: Planet): Built {
  const ov = s.rows[stepId(item, src)] || {}
  const base: Step = {
    id: stepId(item, src),
    kind: 'raw',
    item,
    machineOptions: [],
    moduleList: [],
    moduleChoice: 'none',
    slots: [],
    moduleOptions: [],
    beacons: 0,
    beaconModule: s.beaconModule,
    speed: 0,
    productivity: 0,
    speedBonus: 0,
    consumptionBonus: 0,
    count: 0,
    baseCount: 0,
    inputs: [],
    outputs: [],
    power: 0,
    depth: 0,
    belt: ov.belt,
    notes: [],
  }

  if (src === RAW) {
    return { step: base, perRun: [{ name: item, amount: 1 }], inputsPerRun: [], runsPerMachine: 0 }
  }

  if (src === PUMP) {
    base.kind = 'pump'
    return {
      step: { ...base, speed: 1 },
      perRun: [{ name: item, amount: game.offshore.rate }],
      inputsPerRun: [],
      runsPerMachine: 1,
    }
  }

  let recipe: Recipe | undefined
  let options: Machine[]
  let time: number
  let outs: Amount[]
  let ins: Amount[]
  let maxProd = 3

  if (src === MINE) {
    const res = resourceByProduct[item]
    base.kind = 'mine'
    options = Object.values(game.drills).filter((d) => d.cats.includes(res.cat) && surfaceOk(d.surf, planet.props))
    time = res.time
    outs = res.out
    ins = res.fluid ? [{ name: res.fluid.name, amount: res.fluid.amount }] : []
    if (res.infinite) base.notes.push('Assumes 100% yield per pumpjack')
  } else {
    recipe = game.recipes[src]
    base.kind = 'recipe'
    base.recipe = recipe
    options = machineCandidates(recipe, planet)
    time = recipe.time
    outs = recipe.out
    ins = recipe.in
    maxProd = recipe.maxProd
  }

  // pick machine
  // fastest first; machines that need fuel (biochamber, stone furnace…) only when nothing else fits
  const rank = (m: Machine) =>
    m.speed * (1 + (m.base?.productivity || 0)) * 100 + m.slots - (m.fuel && options.length > 1 ? 1000 : 0)
  const sorted = [...options].sort((a, b) => rank(b) - rank(a))
  let machine: Machine | undefined = sorted.find((m) => m.name === ov.machine)
  if (!machine) {
    machine =
      base.kind === 'mine'
        ? sorted.find((m) => m.name === s.drill) || sorted.find((m) => m.name !== 'burner-mining-drill') || sorted[0]
        : sorted.find((m) => s.machines.includes(m.name))
  }
  if (!machine) {
    machine = sorted[0]
    base.notUnlocked = true
  }
  base.machine = machine
  base.machineOptions = sorted
  if (!machine) {
    base.notes.push('No machine can make this here')
    return { step: base, perRun: outs, inputsPerRun: ins, runsPerMachine: 0 }
  }

  // modules
  const isDrill = base.kind === 'mine'
  const modOptions = game.modules.filter((m) => moduleAllowed(m.name, machine!, recipe)).map((m) => m.name)
  const wanted = ov.module ?? (isDrill ? s.drillModule : s.module)
  const slots: string[] = Array.from({ length: machine.slots }, (_, i) => {
    const m = ov.modules ? (ov.modules[i] ?? 'none') : wanted
    return modOptions.includes(m) ? m : 'none'
  })
  base.moduleOptions = modOptions
  base.slots = slots
  base.moduleChoice = slots.length && slots.every((m) => m === slots[0]) ? slots[0] : slots.length ? 'mixed' : 'none'
  base.moduleList = slots.filter((m) => m !== 'none')

  const effect: Effect = {}
  addEffect(effect, machine.base)
  for (const m of base.moduleList) addEffect(effect, moduleByName[m].effect)

  // beacons (only for machines that accept speed from beacons)
  const beacon = game.beacons[0]
  const beacons = machine.slots ? (ov.beacons ?? s.beacons) : 0
  const bMod = ov.beaconModule ?? s.beaconModule
  if (beacon && beacons > 0 && moduleByName[bMod] && moduleAllowed(bMod, machine, recipe)) {
    const mul =
      beacon.eff * beacon.slots * (beacon.profile[beacons - 1] ?? beacon.profile[beacon.profile.length - 1]) * beacons
    addEffect(effect, moduleByName[bMod].effect, mul)
    base.beacons = beacons
    base.beaconModule = bMod
  }

  if (isDrill) effect.productivity = (effect.productivity || 0) + s.miningProd / 100
  const speedBonus = Math.max(-0.8, effect.speed || 0)
  const prodAllowed = isDrill || recipe?.prod
  const productivity = prodAllowed ? Math.min(maxProd, Math.max(0, effect.productivity || 0)) : 0
  const consumption = Math.max(-0.8, effect.consumption || 0)

  base.speedBonus = speedBonus
  base.productivity = productivity
  base.consumptionBonus = consumption
  base.speed = machine.speed * (1 + speedBonus)

  const perRun = outs.map((o) => {
    const extra = Math.max(0, o.amount - (o.ignore || 0)) * productivity
    return { name: o.name, amount: o.amount + extra }
  })

  // Same machine with empty slots and no beacons, for the "saves N machines" comparison.
  const plainSpeed = machine.speed * (1 + Math.max(-0.8, machine.base?.speed || 0))
  const plainProd = prodAllowed
    ? Math.min(maxProd, Math.max(0, (machine.base?.productivity || 0) + (isDrill ? s.miningProd / 100 : 0)))
    : 0
  const plainPerRun = outs
    .filter((o) => o.name === item)
    .reduce((a, o) => a + o.amount + Math.max(0, o.amount - (o.ignore || 0)) * plainProd, 0)

  return {
    step: { ...base, power: machine.electric ? machine.power * (1 + consumption) : 0 },
    perRun,
    inputsPerRun: ins,
    runsPerMachine: base.speed / time,
    baseMachinesPerUnit: plainPerRun > 0 ? time / (plainSpeed * plainPerRun) : undefined,
  }
}

export function stepId(item: string, src: string): string {
  if (src === RAW) return `raw:${item}`
  if (src === MINE) return `mine:${item}`
  if (src === PUMP) return `pump:${item}`
  return src // recipe name
}

export function solve(s: Settings): Result {
  const planet = planetOf(s)
  const perSec = s.unit === 'min' ? 1 / 60 : 1
  const demand = new Map<string, number>()
  const supply = new Map<string, number>()
  const runs = new Map<string, number>()
  const built = new Map<string, Built>()
  const srcOf = new Map<string, string>() // item -> chosen source

  const targets = s.targets.filter((t) => game.items[t.item] && t.rate > 0)
  for (const t of targets) demand.set(t.item, (demand.get(t.item) || 0) + t.rate * perSec)

  const getBuilt = (item: string): Built => {
    let src = srcOf.get(item)
    if (!src) {
      src = sourceFor(item, s)
      srcOf.set(item, src)
    }
    const id = stepId(item, src)
    let b = built.get(id)
    if (!b) {
      b = buildStep(item, src, s, planet)
      // a recipe that doesn't net-produce the item (catalyst loops) can't satisfy it
      const net = netPerRun(b, item)
      if (net <= EPS && src !== RAW) {
        srcOf.set(item, RAW)
        return getBuilt(item)
      }
      built.set(id, b)
    }
    return b
  }

  // Order items so consumers are handled before their ingredients (reverse post-order DFS).
  // Loops through *other* items (asteroid reprocessing chains etc.) are cut by treating the
  // looped item as raw input, unless the player explicitly picked that recipe.
  const order: string[] = []
  const seen = new Set<string>()
  const stack = new Set<string>()
  const visit = (item: string) => {
    if (seen.has(item)) return
    seen.add(item)
    stack.add(item)
    const b = getBuilt(item)
    for (const i of b.inputsPerRun) {
      if (i.name !== item && stack.has(i.name) && !s.recipeFor[i.name]) srcOf.set(i.name, RAW)
      visit(i.name)
    }
    stack.delete(item)
    order.push(item)
  }
  for (const t of targets) visit(t.item)
  order.reverse()

  for (let pass = 0; pass < 40; pass++) {
    let changed = false
    for (const item of order) {
      const deficit = (demand.get(item) || 0) - (supply.get(item) || 0)
      if (deficit <= 1e-7) continue
      const b = getBuilt(item)
      const net = netPerRun(b, item)
      const n = deficit / net
      runs.set(b.step.id, (runs.get(b.step.id) || 0) + n)
      for (const o of b.perRun) supply.set(o.name, (supply.get(o.name) || 0) + o.amount * n)
      for (const i of b.inputsPerRun) {
        demand.set(i.name, (demand.get(i.name) || 0) + i.amount * n)
        if (!seen.has(i.name)) {
          visit(i.name)
          order.push(i.name)
        }
      }
      changed = true
    }
    if (!changed) break
  }

  // Materialise steps
  const steps: Step[] = []
  for (const [id, n] of runs) {
    const b = built.get(id)!
    const st: Step = { ...b.step }
    st.outputs = b.perRun.map((o) => ({ item: o.name, rate: o.amount * n }))
    st.inputs = b.inputsPerRun.map((i) => ({ item: i.name, rate: i.amount * n }))
    st.count = b.runsPerMachine ? n / b.runsPerMachine : 0
    const mainOut = st.outputs.filter((o) => o.item === st.item).reduce((a, o) => a + o.rate, 0)
    st.baseCount = b.baseMachinesPerUnit ? mainOut * b.baseMachinesPerUnit : st.count
    st.power = b.step.power * Math.ceil(st.count - 1e-6)
    if (st.kind === 'raw') st.outputs = [{ item: st.item, rate: n }]
    steps.push(st)
  }

  // Depth: place each step as late as possible, i.e. right before the step it feeds.
  // height = longest chain of consumers to the final output; depth counts left-to-right.
  const consumers = new Map<string, Step[]>()
  for (const st of steps)
    consumers.set(
      st.id,
      steps.filter((c) => c !== st && c.inputs.some((i) => st.outputs.some((o) => o.item === i.item))),
    )
  const heightMemo = new Map<string, number>()
  const height = (st: Step, stack: Set<string>): number => {
    if (heightMemo.has(st.id)) return heightMemo.get(st.id)!
    if (stack.has(st.id)) return 0
    stack.add(st.id)
    let h = 0
    for (const c of consumers.get(st.id)!) h = Math.max(h, height(c, stack) + 1)
    stack.delete(st.id)
    heightMemo.set(st.id, h)
    return h
  }
  const maxHeight = steps.reduce((m, st) => Math.max(m, height(st, new Set())), 0)
  for (const st of steps) st.depth = maxHeight - height(st, new Set())
  steps.sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id))

  const surplus: Flow[] = []
  for (const [item, sup] of supply) {
    const extra = sup - (demand.get(item) || 0)
    if (extra > 1e-6) surplus.push({ item, rate: extra })
  }

  const bmap = new Map<string, number>()
  const mmap = new Map<string, number>()
  for (const st of steps) {
    if (st.kind === 'raw') continue
    const name = st.kind === 'pump' ? game.offshore.name : st.machine?.name
    if (!name) continue
    const c = Math.ceil(st.count - 1e-6)
    bmap.set(name, (bmap.get(name) || 0) + c)
    for (const m of st.moduleList) mmap.set(m, (mmap.get(m) || 0) + c)
  }

  return {
    steps,
    surplus,
    targets: targets.map((t) => ({ item: t.item, rate: t.rate * perSec })),
    power: steps.reduce((a, st) => a + st.power, 0),
    buildings: [...bmap].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    moduleTotals: [...mmap].map(([name, count]) => ({ name, count })),
  }
}

function netPerRun(b: Built, item: string): number {
  const out = b.perRun.filter((o) => o.name === item).reduce((a, o) => a + o.amount, 0)
  const inn = b.inputsPerRun.filter((o) => o.name === item).reduce((a, o) => a + o.amount, 0)
  return out - inn
}
