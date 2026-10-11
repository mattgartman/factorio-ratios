import raw from './data/game.json'

export type IconLayer = { s: string; w: number; sh?: [number, number]; t?: string }
export type Icon = string | IconLayer[] | null | undefined

export interface Item {
  name: string
  kind: 'item' | 'fluid'
  sub: string
  order: string
  icon: Icon
  stack?: number
}
export interface Amount {
  name: string
  amount: number
  ignore?: number
}
export interface SurfaceCond {
  p: string
  min?: number
  max?: number
}
export interface Recipe {
  name: string
  cat: string
  extraCats?: string[]
  time: number
  in: Amount[]
  out: Amount[]
  main?: string
  prod: boolean
  speed: boolean
  maxProd: number
  icon?: Icon
  sub?: string
  order: string
  surf?: SurfaceCond[]
  barrel: boolean
}
export type Effect = Partial<Record<'speed' | 'productivity' | 'consumption' | 'pollution' | 'quality', number>>
export interface Machine {
  name: string
  cats: string[]
  speed: number
  slots: number
  allowed: string[]
  base?: Effect
  power: number
  electric: boolean
  fuel?: boolean
  surf?: SurfaceCond[]
  size: [number, number]
  icon: Icon
}
export interface Resource {
  name: string
  cat: string
  time: number
  out: Amount[]
  fluid?: { name: string; amount: number }
  infinite: boolean
  icon: Icon
}
export interface Belt {
  name: string
  rate: number
  icon: Icon
}
export interface Module {
  name: string
  cat: string
  tier: number
  effect: Effect
  icon: Icon
}
export interface Beacon {
  name: string
  eff: number
  profile: number[]
  slots: number
  allowed: string[]
  power: number
  icon: Icon
}
export interface Planet {
  name: string
  order: string
  props: Record<string, number>
  icon: Icon
  resources: string[]
  fluids: string[]
}

interface GameData {
  groups: { name: string; order: string; icon: Icon }[]
  subgroups: Record<string, { group: string; order: string }>
  items: Record<string, Item>
  recipes: Record<string, Recipe>
  machines: Record<string, Machine>
  drills: Record<string, Machine>
  resources: Record<string, Resource>
  offshore: { name: string; rate: number; icon: Icon; fluids: string[] }
  belts: Belt[]
  modules: Module[]
  beacons: Beacon[]
  planets: Planet[]
}

export const game = raw as unknown as GameData

export const moduleByName = Object.fromEntries(game.modules.map((m) => [m.name, m]))
export const beltByName = Object.fromEntries(game.belts.map((b) => [b.name, b]))

/** "electronic-circuit" -> "Electronic circuit" */
export function prettyName(name: string): string {
  const special: Record<string, string> = {
    'assembling-machine-1': 'Assembler 1',
    'assembling-machine-2': 'Assembler 2',
    'assembling-machine-3': 'Assembler 3',
    'transport-belt': 'Yellow belt',
    'fast-transport-belt': 'Red belt',
    'express-transport-belt': 'Blue belt',
    'turbo-transport-belt': 'Green belt',
    'space-platform': 'Space platform',
    'electromagnetic-plant': 'EM plant',
  }
  if (special[name]) return special[name]
  const s = name.replace(/-/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export const beltColor: Record<string, string> = {
  'transport-belt': '#e3b23c',
  'fast-transport-belt': '#e0533b',
  'express-transport-belt': '#3ba3e0',
  'turbo-transport-belt': '#7ac943',
}

// ---- recipes indexed by product ----
export const recipesByProduct: Record<string, Recipe[]> = {}
for (const r of Object.values(game.recipes)) {
  for (const o of r.out) (recipesByProduct[o.name] ||= []).push(r)
}
export const resourceByProduct: Record<string, (typeof game.resources)[string]> = {}
for (const r of Object.values(game.resources)) {
  for (const o of r.out) if (!resourceByProduct[o.name]) resourceByProduct[o.name] = r
}

export function surfaceOk(conds: SurfaceCond[] | undefined, props: Record<string, number>): boolean {
  if (!conds) return true
  return conds.every((c) => {
    const v = props[c.p] ?? 0
    return (c.min === undefined || v >= c.min) && (c.max === undefined || v <= c.max)
  })
}

/** Groups/subgroups ordered like the in-game crafting menu, only containing producible items. */
export function itemsByGroup() {
  const producible = new Set<string>([
    ...Object.keys(recipesByProduct),
    ...Object.keys(resourceByProduct),
    ...game.offshore.fluids,
  ])
  const groups = [...game.groups].sort((a, b) => a.order.localeCompare(b.order))
  return groups
    .map((g) => {
      const subs = Object.entries(game.subgroups)
        .filter(([, s]) => s.group === g.name)
        .sort((a, b) => a[1].order.localeCompare(b[1].order))
        .map(([name]) =>
          Object.values(game.items)
            .filter((i) => i.sub === name && producible.has(i.name))
            .sort((a, b) => a.order.localeCompare(b.order)),
        )
        .filter((list) => list.length)
      return { group: g, subs }
    })
    .filter((g) => g.subs.length)
}
