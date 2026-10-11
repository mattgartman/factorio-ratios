#!/usr/bin/env node
// Builds src/data/game.json and public/icons/** from a local Factorio install.
//
// Usage:
//   node scripts/extract-data.mjs            # runs `factorio --dump-data` itself (vanilla Space Age mods only)
//   node scripts/extract-data.mjs <dump.json> # use an existing data-raw-dump.json
//
// Env overrides: FACTORIO_APP (default /Applications/factorio.app), FACTORIO_WRITE_DIR.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const app = process.env.FACTORIO_APP || '/Applications/factorio.app'
const dataDir = path.join(app, 'Contents/data')
const writeDir = process.env.FACTORIO_WRITE_DIR || path.join(os.homedir(), 'Library/Application Support/factorio')

function dumpData() {
  const modDir = fs.mkdtempSync(path.join(os.tmpdir(), 'factorio-ratios-mods-'))
  const mods = ['base', 'elevated-rails', 'quality', 'space-age'].map((name) => ({ name, enabled: true }))
  fs.writeFileSync(path.join(modDir, 'mod-list.json'), JSON.stringify({ mods }))
  console.log('Running factorio --dump-data ...')
  execFileSync(path.join(app, 'Contents/MacOS/factorio'), ['--dump-data', '--mod-directory', modDir], { stdio: 'inherit' })
  return path.join(writeDir, 'script-output/data-raw-dump.json')
}

const dumpPath = process.argv[2] || dumpData()
const raw = JSON.parse(fs.readFileSync(dumpPath, 'utf8'))

// ---------- helpers ----------
const iconOut = path.join(root, 'public/icons')
fs.rmSync(iconOut, { recursive: true, force: true })
const copied = new Set()

function iconFile(p) {
  // "__space-age__/graphics/icons/foo.png" -> "icons/space-age/graphics/icons/foo.png"
  const m = /^__([^_][^/]*?)__\/(.*)$/.exec(p)
  if (!m) return null
  const [, mod, rest] = m
  const src = path.join(dataDir, mod, rest)
  const rel = `icons/${mod}/${rest}`
  if (!copied.has(rel)) {
    if (!fs.existsSync(src)) return null
    fs.mkdirSync(path.dirname(path.join(root, 'public', rel)), { recursive: true })
    fs.copyFileSync(src, path.join(root, 'public', rel))
    copied.add(rel)
  }
  return rel
}

// Icon = single path string, or array of layers {s, size, scale, shift}
function icon(proto) {
  if (!proto) return null
  if (proto.icon) return iconFile(proto.icon)
  if (proto.icons?.length) {
    const layers = proto.icons
      .map((l) => {
        const s = iconFile(l.icon)
        if (!s) return null
        const size = l.icon_size || 64
        const out = { s, w: size * (l.scale ?? 32 / size) }
        if (l.shift) out.sh = Array.isArray(l.shift) ? l.shift : [l.shift.x, l.shift.y]
        if (l.tint) out.t = rgba(l.tint)
        return out
      })
      .filter(Boolean)
    if (!layers.length) return null
    return layers.length === 1 ? layers[0].s : layers
  }
  return null
}

function rgba(t) {
  let [r, g, b, a] = Array.isArray(t) ? t : [t.r ?? 0, t.g ?? 0, t.b ?? 0, t.a ?? 1]
  if (r > 1 || g > 1 || b > 1) [r, g, b] = [r / 255, g / 255, b / 255]
  a = a ?? 1
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${Math.min(1, a > 1 ? a / 255 : a)})`
}

function watts(str) {
  if (!str) return 0
  const m = /^([\d.]+)\s*([kMGT]?)W$/.exec(str)
  if (!m) return 0
  return parseFloat(m[1]) * { '': 1, k: 1e3, M: 1e6, G: 1e9, T: 1e12 }[m[2]]
}

function size(proto) {
  const b = proto.collision_box || proto.selection_box
  if (!b) return [1, 1]
  const box = Array.isArray(b[0]) ? b : [[b.left_top.x, b.left_top.y], [b.right_bottom.x, b.right_bottom.y]]
  return [Math.ceil(box[1][0] - box[0][0]), Math.ceil(box[1][1] - box[0][1])]
}

const ALL_EFFECTS = ['consumption', 'speed', 'productivity', 'pollution', 'quality']
const allowed = (p) => (p.allowed_effects === undefined ? ALL_EFFECTS : typeof p.allowed_effects === 'string' ? [p.allowed_effects] : arr(p.allowed_effects))
const surfaceConds = (p) =>
  arr(p.surface_conditions).length ? p.surface_conditions.map((c) => ({ p: c.property, min: c.min, max: c.max })) : undefined

// Lua empty tables are dumped as {} rather than []
const arr = (x) => (Array.isArray(x) ? x : [])

const isHidden = (p) => p.hidden || p.parameter || /^parameter-/.test(p.name)

// ---------- item groups ----------
const groups = Object.values(raw['item-group'])
  .filter((g) => !isHidden(g))
  .map((g) => ({ name: g.name, order: g.order || '', icon: icon(g) }))
const subgroups = {}
for (const s of Object.values(raw['item-subgroup'])) subgroups[s.name] = { group: s.group, order: s.order || '' }

// ---------- items + fluids ----------
const itemTypes = Object.keys(raw).filter((t) => {
  const first = Object.values(raw[t])[0]
  return first && 'stack_size' in first
})
const items = {}
for (const t of itemTypes) {
  for (const it of Object.values(raw[t])) {
    if (isHidden(it) || items[it.name]) continue
    items[it.name] = { name: it.name, kind: 'item', sub: it.subgroup || 'other', order: it.order || '', icon: icon(it), stack: it.stack_size }
  }
}
for (const f of Object.values(raw.fluid)) {
  if (isHidden(f)) continue
  items[f.name] = { name: f.name, kind: 'fluid', sub: f.subgroup || 'fluid', order: f.order || '', icon: icon(f) }
}

// ---------- recipes ----------
function expected(r) {
  const base = r.amount ?? ((r.amount_min ?? 0) + (r.amount_max ?? 0)) / 2
  return base * (r.probability ?? 1) + (r.extra_count_fraction ?? 0)
}
const recipes = {}
for (const r of Object.values(raw.recipe)) {
  if (isHidden(r)) continue
  const cat = r.category || 'crafting'
  if (cat === 'recycling') continue
  const results = arr(r.results).filter((x) => items[x.name])
  if (!results.length) continue
  const ing = arr(r.ingredients).filter((x) => items[x.name])
  recipes[r.name] = {
    name: r.name,
    cat,
    extraCats: r.additional_categories,
    time: r.energy_required ?? 0.5,
    in: ing.map((x) => ({ name: x.name, amount: x.amount })),
    out: results.map((x) => {
      const o = { name: x.name, amount: expected(x) }
      const ign = x.ignored_by_productivity ?? 0
      if (ign) o.ignore = ign
      return o
    }),
    main: r.main_product,
    prod: !!r.allow_productivity,
    speed: r.allow_speed !== false,
    maxProd: r.maximum_productivity ?? 3,
    icon: r.icon || r.icons ? icon(r) : undefined,
    sub: r.subgroup,
    order: r.order || '',
    surf: surfaceConds(r),
    barrel: /barrel/.test(r.subgroup || '') || /-barrel$/.test(r.name),
  }
}

// ---------- crafting machines ----------
const machines = {}
for (const t of ['assembling-machine', 'furnace', 'rocket-silo']) {
  for (const m of Object.values(raw[t] || {})) {
    if (isHidden(m) || !m.crafting_categories) continue
    if (m.name === 'recycler') continue
    machines[m.name] = {
      name: m.name,
      cats: m.crafting_categories,
      speed: m.crafting_speed,
      slots: m.module_slots || 0,
      allowed: allowed(m),
      base: m.effect_receiver?.base_effect,
      power: watts(m.energy_usage),
      electric: m.energy_source?.type === 'electric',
      fuel: m.energy_source?.type === 'burner',
      surf: surfaceConds(m),
      size: size(m),
      icon: icon(m) || icon(raw.item[m.name]),
    }
  }
}

// ---------- mining ----------
const drills = {}
for (const m of Object.values(raw['mining-drill'])) {
  if (isHidden(m)) continue
  drills[m.name] = {
    name: m.name,
    cats: m.resource_categories,
    speed: m.mining_speed,
    slots: m.module_slots || 0,
    allowed: allowed(m),
    base: m.effect_receiver?.base_effect,
    power: watts(m.energy_usage),
    electric: m.energy_source?.type === 'electric',
    surf: surfaceConds(m),
    size: size(m),
    icon: icon(m) || icon(raw.item[m.name]),
  }
}

const resources = {}
for (const r of Object.values(raw.resource)) {
  const mn = r.minable
  if (!mn) continue
  const results = mn.results
    ? mn.results.map((x) => ({ name: x.name, amount: expected(x) }))
    : [{ name: mn.result, amount: mn.count ?? 1 }]
  resources[r.name] = {
    name: r.name,
    cat: r.category || 'basic-solid',
    time: mn.mining_time,
    out: results,
    fluid: mn.required_fluid ? { name: mn.required_fluid, amount: (mn.fluid_amount || 0) / 10 } : undefined,
    infinite: !!r.infinite,
    icon: icon(r),
  }
}

// Fluids an offshore pump can pull (from tiles)
const pump = Object.values(raw['offshore-pump'])[0]
const offshore = {
  name: pump.name,
  rate: pump.pumping_speed * 60,
  icon: icon(pump) || icon(raw.item[pump.name]),
  fluids: [...new Set(Object.values(raw.tile).filter((t) => t.fluid).map((t) => t.fluid))],
}

// ---------- belts, modules, beacons ----------
const belts = Object.values(raw['transport-belt'])
  .filter((b) => !isHidden(b))
  .map((b) => ({ name: b.name, rate: b.speed * 480, icon: icon(b) || icon(raw.item[b.name]) }))
  .sort((a, b) => a.rate - b.rate)

const modules = Object.values(raw.module)
  .filter((m) => !isHidden(m))
  .map((m) => ({ name: m.name, cat: m.category, tier: m.tier, effect: m.effect, icon: icon(m) }))
  .sort((a, b) => (a.cat + a.tier).localeCompare(b.cat + b.tier))

const beacons = Object.values(raw.beacon)
  .filter((b) => !isHidden(b))
  .map((b) => ({
    name: b.name,
    eff: b.distribution_effectivity,
    profile: b.profile || [1],
    slots: b.module_slots,
    allowed: allowed(b),
    power: watts(b.energy_usage),
    icon: icon(b) || icon(raw.item[b.name]),
  }))

// ---------- planets ----------
const propDefaults = {}
for (const p of Object.values(raw['surface-property'])) propDefaults[p.name] = p.default_value
const planets = [
  ...Object.values(raw.planet).map((p) => {
    const auto = p.map_gen_settings?.autoplace_settings || {}
    const tiles = Object.keys(auto.tile?.settings || {})
    return {
      name: p.name,
      order: p.order || '',
      props: { ...propDefaults, ...p.surface_properties },
      icon: icon(p),
      resources: Object.keys(auto.entity?.settings || {}).filter((k) => resources[k]),
      fluids: [...new Set(tiles.map((t) => raw.tile[t]?.fluid).filter(Boolean))],
    }
  }),
  ...Object.values(raw.surface || {}).map((s) => ({
    name: s.name,
    order: 'z',
    props: { ...propDefaults, ...s.surface_properties },
    icon: icon(s),
    resources: [],
    fluids: [],
  })),
].filter((p) => p.icon)

const out = { groups, subgroups, items, recipes, machines, drills, resources, offshore, belts, modules, beacons, planets }
fs.mkdirSync(path.join(root, 'src/data'), { recursive: true })
fs.writeFileSync(path.join(root, 'src/data/game.json'), JSON.stringify(out))
console.log(
  `Wrote ${Object.keys(items).length} items, ${Object.keys(recipes).length} recipes, ${Object.keys(machines).length} machines, ${copied.size} icons`,
)
