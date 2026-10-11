import { useEffect, useState, type ReactNode } from 'react'
import { beltColor, prettyName } from '../game'
import { fmt, rate } from '../format'
import { planRow, type BeltPlan, type PipePlan, type RowPlan } from '../layout'
import type { Result, Settings, Step } from '../solver'
import { itemColor } from './FlowDiagram'
import { FullMap } from './FullMap'
import { iconOf, NamedIcon } from './Icon'

const BASE = import.meta.env.BASE_URL
const TILE_KEY = 'factorio-ratios-tile'
const MODE_KEY = 'factorio-ratios-layout-mode'

function src(name: string): string | null {
  const icon = iconOf(name)
  if (!icon) return null
  return BASE + (typeof icon === 'string' ? icon : icon[0].s)
}

/** Square icon from a mipmapped strip, drawn inside an SVG. */
export function SvgIcon({
  name,
  x,
  y,
  size,
  opacity,
}: {
  name: string
  x: number
  y: number
  size: number
  opacity?: number
}) {
  const href = src(name)
  if (!href) return null
  return (
    <svg x={x} y={y} width={size} height={size} viewBox="0 0 1 1" opacity={opacity} overflow="hidden">
      <image href={href} x={0} y={0} height={1} width={1} preserveAspectRatio="xMinYMid slice" />
    </svg>
  )
}

export function LayoutView({
  result,
  s,
  order,
  stepNumber,
  onSelect,
}: {
  result: Result
  s: Settings
  order: Step[]
  stepNumber: Map<string, number>
  onSelect: (id: string) => void
}) {
  const [tile, setTile] = useState(() => {
    try {
      return Number(localStorage.getItem(TILE_KEY)) || 20
    } catch {
      return 20
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(TILE_KEY, String(tile))
    } catch {
      /* ignore */
    }
  }, [tile])

  const producers = (item: string, self: Step) =>
    result.steps.filter((x) => x !== self && x.outputs.some((o) => o.item === item))
  const consumers = (item: string, self: Step) =>
    result.steps.filter((x) => x !== self && x.inputs.some((i) => i.item === item))
  const stepLinks = (list: Step[]) =>
    list.map((x) => (
      <button key={x.id} className="step-chip" onClick={() => onSelect(x.id)} title={`Step ${stepNumber.get(x.id)}`}>
        {stepNumber.get(x.id)}
      </button>
    ))

  const [mode, setMode] = useState<'rows' | 'map'>(() => {
    try {
      return localStorage.getItem(MODE_KEY) === 'map' ? 'map' : 'rows'
    } catch {
      return 'rows'
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, mode)
    } catch {
      /* ignore */
    }
  }, [mode])

  const modeSwitch = (
    <div className="unit-toggle layout-mode">
      <button className={'btn small' + (mode === 'rows' ? ' active' : '')} onClick={() => setMode('rows')}>
        Each row
      </button>
      <button className={'btn small' + (mode === 'map' ? ' active' : '')} onClick={() => setMode('map')}>
        Full map (how it all connects)
      </button>
    </div>
  )

  if (mode === 'map')
    return (
      <div className="layout-view">
        {modeSwitch}
        <FullMap result={result} s={s} order={order} stepNumber={stepNumber} onSelect={onSelect} />
      </div>
    )

  return (
    <div className="layout-view">
      {modeSwitch}
      <div className="flow-toolbar">
        <span className="muted small">
          One row of machines per step, drawn to scale (1 square = 1 tile). Belts run left → right. Build each row, then
          belt its output to the steps shown.
        </span>
        <span className="zoom-controls">
          <span className="muted small">Tile size</span>
          <input type="range" min={8} max={32} step={1} value={tile} onChange={(e) => setTile(+e.target.value)} />
        </span>
      </div>
      <div className="layout-legend">
        <span>
          <span className="lg-swatch belt" /> belt (arrows = direction, icons = what's on each lane)
        </span>
        <span>
          <span className="lg-swatch pipe" /> underground pipe
        </span>
        <span>
          <NamedIcon name="fast-inserter" size={16} /> inserter (▼▲ = which way it moves items)
        </span>
        <span>
          <NamedIcon name="medium-electric-pole" size={16} /> power pole
        </span>
      </div>

      {order.map((st) => {
        const plan = planRow(st, s)
        return (
          <div key={st.id} className={'bp-block' + (plan.rows > 1 ? ' stacked' : '')}>
            <div className="bp-head">
              <button className="node-num" onClick={() => onSelect(st.id)} title="Show in build guide">
                {stepNumber.get(st.id)}
              </button>
              <NamedIcon name={st.item} size={28} />
              <div className="bp-title">
                <b>{prettyName(st.item)}</b>
                <span className="muted small"> {headline(st, plan)}</span>
              </div>
              {plan.rows > 1 && <span className="tag bad">× {plan.rows} identical rows — each with its own belts</span>}
            </div>
            <div className="bp-scroll">
              <Blueprint st={st} plan={plan} tile={tile} />
            </div>
            <div className="bp-belts">
              {[...plan.top].reverse().map((b, i) => (
                <BeltLine key={'t' + i} b={b} s={s} label={plan.top.length - i === 2 ? 'Top belt (far)' : 'Top belt'} />
              ))}
              {plan.pipesTop.map((p, i) => (
                <PipeLine key={'pt' + i} p={p} s={s} rows={plan.rows} label="Top pipe" />
              ))}
              {plan.pipesBottom.map((p, i) => (
                <PipeLine key={'pb' + i} p={p} s={s} rows={plan.rows} label="Bottom pipe" />
              ))}
              {plan.bottom.map((b, i) => (
                <BeltLine
                  key={'b' + i}
                  b={b}
                  s={s}
                  label={plan.kind === 'mine' ? 'Middle belt' : i === 0 ? 'Bottom belt' : 'Bottom belt (far)'}
                />
              ))}
              <div className="bp-links">
                {st.inputs.some((i) => producers(i.item, st).length) && (
                  <span>
                    Inputs from step {stepLinks([...new Set(st.inputs.flatMap((i) => producers(i.item, st)))])}
                  </span>
                )}
                {st.outputs.some((o) => consumers(o.item, st).length) && (
                  <span>
                    Output to step {stepLinks([...new Set(st.outputs.flatMap((o) => consumers(o.item, st)))])}
                  </span>
                )}
                {result.targets.some((t) => t.item === st.item) && <span className="tag good">your output</span>}
              </div>
              {plan.notes.map((n) => (
                <div key={n} className="warn small">
                  ⚠ {n}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function headline(st: Step, plan: RowPlan): string {
  const name = prettyName(plan.entity)
  switch (plan.kind) {
    case 'raw':
      return '— brought in from outside this build'
    case 'pump':
      return `— ${plan.perRow} × ${name}`
    case 'pumpjack':
      return `— ${plan.perRow} × ${name} on the oil field`
    case 'mine':
      return `— ${plan.perRow} × ${name} per belt, half each side${plan.rows > 1 ? ` (${Math.ceil(st.count - 1e-6)} total)` : ''}`
    default:
      return `— ${plan.perRow} × ${name} per row${plan.rows > 1 ? ` (${Math.ceil(st.count - 1e-6)} total)` : ''}`
  }
}

function LaneIcons({ b }: { b: BeltPlan }) {
  const [a, c] = b.lanes
  if (a && c && a.item === c.item) return <NamedIcon name={a.item} size={18} />
  return (
    <>
      {a && <NamedIcon name={a.item} size={18} />}
      <span className="muted">|</span>
      {c ? <NamedIcon name={c.item} size={18} /> : <span className="muted small">empty</span>}
    </>
  )
}

function BeltLine({ b, s, label }: { b: BeltPlan; s: Settings; label: string }) {
  const [a, c] = b.lanes
  const full = a && c && a.item === c.item
  const items = full ? [a!] : ([a, c].filter(Boolean) as { item: string; rate: number }[])
  return (
    <div className="bp-belt-line">
      <span className="bp-label">{label}</span>
      <span className="bp-dir">{b.dir === 'in' ? 'in →' : 'out →'}</span>
      <LaneIcons b={b} />
      <span className="muted small">
        {items.map((l) => `${prettyName(l.item)} ${rate(l.rate, s)}`).join(' · ')}
        {full ? ' (both lanes)' : items.length === 2 ? ' (one per lane)' : ' (one lane)'}
      </span>
      {b.inserter && (
        <span className="bp-ins">
          <NamedIcon name={b.inserter} size={18} />
          {b.insertersPerMachine > 1 ? `×${b.insertersPerMachine}` : ''} per machine
        </span>
      )}
    </div>
  )
}

function PipeLine({ p, s, rows, label }: { p: PipePlan; s: Settings; rows: number; label: string }) {
  return (
    <div className="bp-belt-line">
      <span className="bp-label">{label}</span>
      <span className="bp-dir">{p.dir === 'in' ? 'in →' : 'out →'}</span>
      <NamedIcon name={p.item} size={18} />
      <span className="muted small">
        {prettyName(p.item)} {rate(p.rate / rows, s)}
        {rows > 1 ? ' per row' : ''}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------

type Band =
  | { kind: 'belt'; plan: BeltPlan }
  | { kind: 'ins'; side: 'top' | 'bottom'; belts: BeltPlan[]; pipes: PipePlan[]; poles: boolean }
  | { kind: 'machines'; h: number; facing?: 'down' | 'up' }
  | { kind: 'pipe'; pipe: PipePlan }
  | { kind: 'water' }

const LEFT = 3
const RIGHT = 3

export interface Port {
  y: number // centre line of the belt/pipe, local coords
  x: number // left end of the belt/pipe
  kind: 'belt' | 'pipe'
  dir: 'in' | 'out'
  items: string[]
}

/**
 * Draw one row of machines in local coordinates, and report where its belts/pipes start so the
 * full map can connect them. `outLeft` flips output belts to run back toward a bus on the left.
 */
export function rowGeometry(
  st: Step,
  plan: RowPlan,
  T: number,
  outLeft = false,
): { parts: ReactNode[]; width: number; height: number; ports: Port[] } {
  const { w, h } = plan
  const ports: Port[] = []
  const laneItems = (b: BeltPlan) => [...new Set(b.lanes.filter(Boolean).map((l) => l!.item))]
  const bands: Band[] = []
  let count = plan.perRow
  let pitch = w // tiles between machine starts
  let rowLen = 0

  switch (plan.kind) {
    case 'raw':
      bands.push(...plan.bottom.map((b): Band => ({ kind: 'belt', plan: b })))
      bands.push(...plan.pipesBottom.map((p): Band => ({ kind: 'pipe', pipe: p })))
      rowLen = 6
      count = 0
      break
    case 'pump':
      bands.push({ kind: 'water' }, { kind: 'machines', h })
      bands.push(...plan.pipesBottom.map((p): Band => ({ kind: 'pipe', pipe: p })))
      pitch = 2
      rowLen = count * pitch
      break
    case 'pumpjack':
      bands.push({ kind: 'machines', h })
      bands.push({ kind: 'ins', side: 'bottom', belts: [], pipes: [], poles: plan.poles })
      bands.push(...plan.pipesBottom.map((p): Band => ({ kind: 'pipe', pipe: p })))
      pitch = w + 1
      rowLen = count * pitch
      break
    case 'mine': {
      const perSide = Math.ceil(count / 2)
      bands.push(...plan.pipesTop.map((p): Band => ({ kind: 'pipe', pipe: p })))
      bands.push({ kind: 'machines', h, facing: 'down' })
      bands.push({ kind: 'belt', plan: plan.bottom[0] })
      bands.push({ kind: 'machines', h, facing: 'up' })
      rowLen = perSide * w
      count = perSide
      break
    }
    default: {
      // first pipe on each side runs through the inserter row; any more get their own row further out
      for (const p of plan.pipesTop.slice(1).reverse()) bands.push({ kind: 'pipe', pipe: p })
      for (let i = plan.top.length - 1; i >= 0; i--) bands.push({ kind: 'belt', plan: plan.top[i] })
      if (plan.top.length || plan.pipesTop.length)
        bands.push({ kind: 'ins', side: 'top', belts: plan.top, pipes: plan.pipesTop.slice(0, 1), poles: false })
      bands.push({ kind: 'machines', h })
      if (plan.bottom.length || plan.pipesBottom.length || plan.poles)
        bands.push({
          kind: 'ins',
          side: 'bottom',
          belts: plan.bottom,
          pipes: plan.pipesBottom.slice(0, 1),
          poles: plan.poles,
        })
      for (const b of plan.bottom) bands.push({ kind: 'belt', plan: b })
      for (const p of plan.pipesBottom.slice(1)) bands.push({ kind: 'pipe', pipe: p })
      rowLen = count * w
    }
  }

  const width = (LEFT + rowLen + RIGHT) * T
  let y = 0
  const parts: ReactNode[] = []
  const x0 = LEFT * T

  bands.forEach((band, bi) => {
    const top = y
    if (band.kind === 'belt') {
      parts.push(
        <BeltBand
          key={bi}
          plan={band.plan}
          y={top}
          T={T}
          x1={T}
          x2={width - T}
          beltName={plan.belt}
          reverse={outLeft && band.plan.dir === 'out'}
        />,
      )
      ports.push({ y: top + T / 2, x: T, kind: 'belt', dir: band.plan.dir, items: laneItems(band.plan) })
      y += T
    } else if (band.kind === 'pipe') {
      parts.push(<PipeBand key={bi} pipe={band.pipe} y={top} T={T} x1={T} x2={width - T} solid />)
      ports.push({ y: top + T / 2, x: T, kind: 'pipe', dir: band.pipe.dir, items: [band.pipe.item] })
      y += T
    } else if (band.kind === 'water') {
      parts.push(
        <rect key={bi} x={x0 - T} y={top} width={rowLen * T + 2 * T} height={T} fill="#2a5d8a" opacity={0.7} />,
      )
      y += T
    } else if (band.kind === 'ins') {
      for (const p of band.pipes) {
        parts.push(<PipeBand key={`${bi}-${p.item}`} pipe={p} y={top} T={T} x1={T} x2={width - T} />)
        ports.push({ y: top + T / 2, x: T, kind: 'pipe', dir: p.dir, items: [p.item] })
      }
      for (let i = 0; i < count; i++) {
        const mx = x0 + i * pitch * T
        // a pole on every other machine, in its left-most column
        const pole = band.poles && i % 2 === 0
        // columns from the middle outwards: c, c+1, c-1, c+2, …
        const c = Math.floor(w / 2)
        const cols: number[] = []
        for (let d = 0; cols.length < w; d++) {
          for (const col of d === 0 ? [c] : [c + d, c - d])
            if (col >= 0 && col < w && !cols.includes(col)) cols.push(col)
        }
        const free = cols.filter((col) => !(pole && col === 0))
        let n = 0
        band.belts.forEach((b, bi2) => {
          const down = band.side === 'top' ? b.dir === 'in' : b.dir === 'out'
          for (let k = 0; k < b.insertersPerMachine && n < free.length; k++, n++) {
            parts.push(
              <Inserter
                key={`${bi}-${i}-${bi2}-${k}`}
                name={b.inserter}
                x={mx + free[n] * T}
                y={top}
                T={T}
                down={down}
              />,
            )
          }
        })
        if (pole) {
          parts.push(
            <SvgIcon
              key={`${bi}-pole-${i}`}
              name="medium-electric-pole"
              x={mx + T * 0.1}
              y={top + T * 0.1}
              size={T * 0.8}
            />,
          )
        }
      }
      y += T
    } else {
      for (let i = 0; i < count; i++) {
        const mx = x0 + i * pitch * T
        parts.push(
          <Machine
            key={`${bi}-${i}`}
            st={st}
            name={plan.entity}
            x={mx}
            y={top}
            w={w}
            h={band.h}
            T={T}
            facing={band.facing}
          />,
        )
      }
      y += band.h * T
    }
  })

  return { parts, width, height: y, ports }
}

function Blueprint({ st, plan, tile: T }: { st: Step; plan: RowPlan; tile: number }) {
  const { parts, width, height } = rowGeometry(st, plan, T)
  return (
    <svg className="blueprint" width={width} height={height + 2} viewBox={`0 -1 ${width} ${height + 2}`}>
      <defs>
        <pattern id={`grid-${T}`} width={T} height={T} patternUnits="userSpaceOnUse">
          <path d={`M ${T} 0 L 0 0 0 ${T}`} fill="none" stroke="#ffffff14" strokeWidth={1} />
        </pattern>
      </defs>
      <rect x={0} y={-1} width={width} height={height + 2} fill={`url(#grid-${T})`} />
      {parts}
    </svg>
  )
}

function Machine({
  st,
  name,
  x,
  y,
  w,
  h,
  T,
  facing,
}: {
  st: Step
  name: string
  x: number
  y: number
  w: number
  h: number
  T: number
  facing?: 'down' | 'up'
}) {
  const icon = Math.min(w, h) * T * 0.62
  const mods = st.moduleList
  const modSize = Math.min(T * 0.6, (w * T - 6) / Math.max(1, mods.length))
  return (
    <g>
      <rect
        x={x + 1.5}
        y={y + 1.5}
        width={w * T - 3}
        height={h * T - 3}
        rx={3}
        fill="#2c4a6e"
        stroke="#9cc3ea"
        strokeWidth={1.2}
      />
      <SvgIcon
        name={name}
        x={x + (w * T - icon) / 2}
        y={y + (h * T - icon) / 2 - (mods.length ? T * 0.2 : 0)}
        size={icon}
      />
      {st.kind === 'recipe' && T >= 14 && <SvgIcon name={st.item} x={x + 3} y={y + 3} size={T * 0.55} />}
      {T >= 12 &&
        mods.map((m, i) => (
          <SvgIcon key={i} name={m} x={x + 3 + i * modSize} y={y + h * T - modSize - 3} size={modSize} />
        ))}
      {facing && (
        <path
          d={
            facing === 'down'
              ? `M${x + (w * T) / 2 - T * 0.3},${y + h * T - T * 0.45} l${T * 0.3},${T * 0.35} l${T * 0.3},-${T * 0.35}`
              : `M${x + (w * T) / 2 - T * 0.3},${y + T * 0.45} l${T * 0.3},-${T * 0.35} l${T * 0.3},${T * 0.35}`
          }
          fill="none"
          stroke="#ffcf6e"
          strokeWidth={2}
        />
      )}
      <title>{prettyName(name)}</title>
    </g>
  )
}

function Inserter({ name, x, y, T, down }: { name: string; x: number; y: number; T: number; down: boolean }) {
  return (
    <g>
      <rect x={x + 1} y={y + 1} width={T - 2} height={T - 2} rx={2} fill="#1d3550" stroke="#5f86ad" strokeWidth={0.8} />
      <SvgIcon name={name} x={x + T * 0.12} y={y + T * 0.05} size={T * 0.7} />
      <text x={x + T * 0.82} y={y + T * 0.95} fontSize={T * 0.42} fill="#ffcf6e" textAnchor="middle" fontWeight={700}>
        {down ? '▼' : '▲'}
      </text>
      <title>{prettyName(name)}</title>
    </g>
  )
}

function BeltBand({
  plan,
  y,
  T,
  x1,
  x2,
  beltName,
  reverse,
}: {
  plan: BeltPlan
  y: number
  T: number
  x1: number
  x2: number
  beltName: string
  reverse?: boolean
}) {
  const color = beltColor[beltName] || '#e3b23c'
  const [a, b] = plan.lanes
  const chevrons: ReactNode[] = []
  for (let x = x1 + T * 0.3; x < x2 - T * 0.5; x += T) {
    chevrons.push(
      <path
        key={x}
        d={
          reverse
            ? `M${x + T * 0.25},${y + T * 0.25} l-${T * 0.25},${T * 0.25} l${T * 0.25},${T * 0.25}`
            : `M${x},${y + T * 0.25} l${T * 0.25},${T * 0.25} l-${T * 0.25},${T * 0.25}`
        }
        fill="none"
        stroke="#0008"
        strokeWidth={Math.max(1, T * 0.08)}
      />,
    )
  }
  const icons: ReactNode[] = []
  const step = T * 4
  for (let x = x1 + T * 1.5; x < x2 - T; x += step) {
    if (a) icons.push(<SvgIcon key={`a${x}`} name={a.item} x={x} y={y + 1} size={T / 2 - 1} />)
    if (b) icons.push(<SvgIcon key={`b${x}`} name={b.item} x={x} y={y + T / 2} size={T / 2 - 1} />)
  }
  return (
    <g>
      <rect x={x1} y={y + 1} width={x2 - x1} height={T - 2} fill={color} opacity={0.85} rx={2} />
      <line x1={x1} x2={x2} y1={y + T / 2} y2={y + T / 2} stroke="#0006" strokeWidth={1} />
      {chevrons}
      {icons}
      <title>
        {plan.dir === 'in' ? 'Input' : 'Output'} belt:{' '}
        {[a, b]
          .filter(Boolean)
          .map((l) => prettyName(l!.item))
          .join(' / ')}
      </title>
    </g>
  )
}

function PipeBand({
  pipe,
  y,
  T,
  x1,
  x2,
  solid,
}: {
  pipe: PipePlan
  y: number
  T: number
  x1: number
  x2: number
  solid?: boolean
}) {
  const color = itemColor(pipe.item)
  return (
    <g>
      <line
        x1={x1}
        x2={x2}
        y1={y + T / 2}
        y2={y + T / 2}
        stroke={color}
        strokeWidth={Math.max(2, T * 0.28)}
        strokeDasharray={solid ? undefined : `${T * 0.6} ${T * 0.4}`}
        strokeLinecap="round"
        opacity={0.9}
      />
      <SvgIcon name={pipe.item} x={x1} y={y + T * 0.1} size={T * 0.8} />
      <title>
        {pipe.dir === 'in' ? 'Input' : 'Output'} pipe: {prettyName(pipe.item)} ({fmt(pipe.rate)}/s total)
      </title>
    </g>
  )
}
