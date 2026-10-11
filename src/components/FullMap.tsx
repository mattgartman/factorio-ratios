import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { beltColor, prettyName } from '../game'
import { beltFor, isFluid } from '../format'
import { planRow } from '../layout'
import type { Result, Settings, Step } from '../solver'
import { itemColor } from './FlowDiagram'
import { rowGeometry, SvgIcon, type Port } from './LayoutView'

const TILE_KEY = 'factorio-ratios-map-tile'
const MAX_COPIES = 12 // draw at most this many identical rows per step

interface Lane {
  key: string
  item: string
  fluid: boolean
  y1: number
  y2: number
  x: number
  final?: 'output' | 'surplus'
}

/**
 * Whole-factory map in main-bus style: a bus of belts/pipes down the left, every step's row of
 * machines to its right in build order. Feeders split off the bus into each row; each row's output
 * runs back onto the bus as a new lane for the steps below.
 */
export function FullMap({
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
  const [T, setT] = useState(() => {
    try {
      return Number(localStorage.getItem(TILE_KEY)) || 10
    } catch {
      return 10
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(TILE_KEY, String(T))
    } catch {
      /* ignore */
    }
  }, [T])

  const map = useMemo(() => buildMap(result, s, order, T), [result, s, order, T])

  // drag to pan
  const wrap = useRef<HTMLDivElement>(null)
  const pan = useRef<{ sx: number; sy: number; l: number; t: number } | null>(null)

  return (
    <div className="full-map">
      <div className="flow-toolbar">
        <span className="muted small">
          Main-bus layout: the bus runs down the left. Each row takes its inputs off the bus (<b>▸</b> splitter, dashed
          = underground under other lanes) and sends its output back onto the bus for the rows below. Drag to pan.
        </span>
        <span className="zoom-controls">
          <span className="muted small">Tile size</span>
          <input type="range" min={4} max={24} step={1} value={T} onChange={(e) => setT(+e.target.value)} />
        </span>
      </div>
      <div className="map-stats muted small">
        About {map.tilesW} × {map.tilesH} tiles · bus {map.busLanes} lane{map.busLanes === 1 ? '' : 's'} wide
        {map.truncated && ' · some steps need more rows than shown (marked ×N)'}
      </div>
      <div
        className="map-wrap"
        ref={wrap}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          const el = wrap.current!
          pan.current = { sx: e.clientX, sy: e.clientY, l: el.scrollLeft, t: el.scrollTop }
          el.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          const p = pan.current
          if (!p) return
          wrap.current!.scrollLeft = p.l - (e.clientX - p.sx)
          wrap.current!.scrollTop = p.t - (e.clientY - p.sy)
        }}
        onPointerUp={() => (pan.current = null)}
      >
        <svg width={map.width} height={map.height} className="blueprint">
          <defs>
            <pattern id={`mapgrid-${T}`} width={T} height={T} patternUnits="userSpaceOnUse">
              <path d={`M ${T} 0 L 0 0 0 ${T}`} fill="none" stroke="#ffffff10" strokeWidth={1} />
            </pattern>
          </defs>
          <rect width={map.width} height={map.height} fill={`url(#mapgrid-${T})`} />
          {map.parts}
          {map.labels.map((l) => (
            <g key={l.key} style={{ cursor: 'pointer' }} onClick={() => onSelect(l.id)}>
              <circle cx={l.x + 7} cy={l.y - 5} r={7} fill="#ffa200" />
              <text x={l.x + 7} y={l.y - 1.5} fontSize={10} fontWeight={700} textAnchor="middle" fill="#000">
                {stepNumber.get(l.id)}
              </text>
              <text x={l.x + 18} y={l.y - 1} fontSize={Math.max(10, T * 0.9)} fill="#cfe3f7" fontWeight={600}>
                {l.text}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}

function buildMap(result: Result, s: Settings, order: Step[], T: number) {
  const busBelt = beltFor(s)
  const busRate = busBelt.rate * s.beltStack
  const busColor = beltColor[busBelt.name] || '#e3b23c'
  const TOP = 3 * T
  const GAP = 3 * T

  // ---- place rows vertically ----
  interface Placed {
    st: Step
    copy: number
    copies: number
    y: number
    geom: ReturnType<typeof rowGeometry>
  }
  const placed: Placed[] = []
  let y = TOP
  let truncated = false
  for (const st of order) {
    const plan = planRow(st, s)
    const want = plan.kind === 'craft' || plan.kind === 'mine' ? plan.rows : 1
    const copies = Math.min(want, MAX_COPIES)
    if (want > copies) truncated = true
    const geom = rowGeometry(st, plan, T, true)
    for (let c = 0; c < copies; c++) {
      y += T * 1.4 // label line
      placed.push({ st, copy: c, copies: want, y, geom })
      y += geom.height + GAP
    }
  }
  const bottom = y + T

  // ---- bus lanes: one per item (several if it needs more than one belt) ----
  const lanesFor = new Map<string, number>()
  const flowOf = (item: string) =>
    result.steps.reduce((a, st) => a + st.outputs.filter((o) => o.item === item).reduce((b, o) => b + o.rate, 0), 0)
  const lanesOf = (item: string) => {
    if (!lanesFor.has(item))
      lanesFor.set(item, isFluid(item) ? 1 : Math.max(1, Math.ceil(flowOf(item) / busRate - 1e-9)))
    return lanesFor.get(item)!
  }
  const lanes = new Map<string, Lane>()
  const lane = (item: string, copy: number) => {
    const k = `${item}#${copy % lanesOf(item)}`
    if (!lanes.has(k)) lanes.set(k, { key: k, item, fluid: isFluid(item), y1: Infinity, y2: -Infinity, x: 0 })
    return lanes.get(k)!
  }

  interface Link {
    lane: Lane
    y: number
    rowX: number // filled in later (same for all rows)
    portX: number
    kind: Port['kind']
    dir: Port['dir']
    item: string
  }
  const links: Link[] = []
  for (const p of placed) {
    for (const port of p.geom.ports) {
      for (const item of port.items) {
        // only items that travel between steps go on the bus
        const l = lane(item, p.copy)
        const py = p.y + port.y
        l.y1 = Math.min(l.y1, py)
        l.y2 = Math.max(l.y2, py)
        links.push({ lane: l, y: py, rowX: 0, portX: port.x, kind: port.kind, dir: port.dir, item })
      }
    }
  }
  // final products and leftovers continue to the bottom of the map
  for (const t of result.targets)
    for (let c = 0; c < lanesOf(t.item); c++) {
      const l = lanes.get(`${t.item}#${c}`)
      if (l) {
        l.y2 = bottom
        l.final = 'output'
      }
    }
  for (const sp of result.surplus)
    for (let c = 0; c < lanesOf(sp.item); c++) {
      const l = lanes.get(`${sp.item}#${c}`)
      if (l && !l.final) {
        l.y2 = bottom
        l.final = 'surplus'
      }
    }

  // ---- assign bus columns, reusing a column once its lane has ended ----
  const sorted = [...lanes.values()].filter((l) => isFinite(l.y1)).sort((a, b) => a.y1 - b.y1)
  const colEnd: number[] = []
  for (const l of sorted) {
    let c = colEnd.findIndex((end) => end + 2 * T < l.y1)
    if (c === -1) {
      c = colEnd.length
      colEnd.push(0)
    }
    colEnd[c] = l.y2
    // leave a spare tile after every 4 lanes, like a real bus (room for undergrounds/splitters)
    l.x = 2 * T + (c + Math.floor(c / 4)) * T
  }
  const busCols = colEnd.length
  const busRight = 2 * T + (busCols + Math.floor(Math.max(0, busCols - 1) / 4)) * T
  const rowX = busRight + 3 * T

  const parts: ReactNode[] = []

  // bus lanes
  for (const l of sorted) {
    const x = l.x
    if (l.fluid) {
      parts.push(
        <line
          key={`lane-${l.key}`}
          x1={x + T / 2}
          x2={x + T / 2}
          y1={l.y1}
          y2={l.y2}
          stroke={itemColor(l.item)}
          strokeWidth={Math.max(2, T * 0.35)}
          strokeLinecap="round"
        />,
      )
    } else {
      parts.push(
        <rect
          key={`lane-${l.key}`}
          x={x + 1}
          y={l.y1 - T / 2}
          width={T - 2}
          height={l.y2 - l.y1 + T}
          fill={busColor}
          opacity={0.85}
          rx={2}
        />,
      )
      for (let yy = l.y1; yy < l.y2 - T; yy += T * 2) {
        parts.push(
          <path
            key={`chev-${l.key}-${yy}`}
            d={`M${x + T * 0.25},${yy} l${T * 0.25},${T * 0.25} l${T * 0.25},-${T * 0.25}`}
            fill="none"
            stroke="#0007"
            strokeWidth={Math.max(1, T * 0.1)}
          />,
        )
      }
    }
    for (let yy = l.y1 + T; yy < l.y2 - T; yy += T * 12) {
      parts.push(<SvgIcon key={`li-${l.key}-${yy}`} name={l.item} x={x + T * 0.1} y={yy} size={T * 0.8} />)
    }
    if (l.final) {
      parts.push(
        <g key={`end-${l.key}`}>
          <SvgIcon name={l.item} x={x - T * 0.25} y={l.y2 + T * 0.3} size={T * 1.5} />
          <title>
            {prettyName(l.item)} — {l.final === 'output' ? 'your output' : 'leftover'}
          </title>
        </g>,
      )
    }
  }

  // feeders and returns between bus and rows
  for (const k of links) {
    const lx = k.lane.x + T / 2
    const end = rowX + k.portX
    const color = k.kind === 'pipe' ? itemColor(k.item) : busColor
    const key = `link-${k.lane.key}-${k.y}-${k.dir}`
    if (k.kind === 'pipe') {
      parts.push(
        <g key={key}>
          <line
            x1={lx}
            x2={busRight}
            y1={k.y}
            y2={k.y}
            stroke={color}
            strokeWidth={Math.max(2, T * 0.3)}
            strokeDasharray={`${T * 0.5} ${T * 0.4}`}
          />
          <line x1={busRight} x2={end} y1={k.y} y2={k.y} stroke={color} strokeWidth={Math.max(2, T * 0.3)} />
        </g>,
      )
    } else {
      parts.push(
        <g key={key}>
          {/* underground under the other bus lanes */}
          <line
            x1={lx}
            x2={busRight}
            y1={k.y}
            y2={k.y}
            stroke={color}
            strokeWidth={Math.max(2, T * 0.45)}
            strokeDasharray={`${T * 0.5} ${T * 0.5}`}
            opacity={0.9}
          />
          <rect
            x={busRight}
            y={k.y - T / 2 + 1}
            width={end - busRight}
            height={T - 2}
            fill={color}
            opacity={0.85}
            rx={2}
          />
          {/* splitter / merge marker on the bus */}
          <rect x={k.lane.x - T * 0.15} y={k.y - T * 0.2} width={T * 1.3} height={T * 0.4} fill="#ffa200" rx={1} />
          <path
            d={
              k.dir === 'in'
                ? `M${busRight + T},${k.y - T * 0.25} l${T * 0.3},${T * 0.25} l-${T * 0.3},${T * 0.25}`
                : `M${busRight + T * 1.3},${k.y - T * 0.25} l-${T * 0.3},${T * 0.25} l${T * 0.3},${T * 0.25}`
            }
            fill="none"
            stroke="#000a"
            strokeWidth={Math.max(1, T * 0.12)}
          />
          <title>
            {prettyName(k.item)} {k.dir === 'in' ? 'from the bus into this row' : 'from this row onto the bus'}
          </title>
        </g>,
      )
    }
  }

  // the rows themselves
  const labels: { key: string; id: string; x: number; y: number; text: string }[] = []
  let maxW = 0
  for (const p of placed) {
    maxW = Math.max(maxW, p.geom.width)
    parts.push(
      <g key={`row-${p.st.id}-${p.copy}`} transform={`translate(${rowX},${p.y})`}>
        <rect
          x={0}
          y={-2}
          width={p.geom.width}
          height={p.geom.height + 4}
          fill="#1b3149"
          stroke="#3d6a96"
          strokeDasharray="4 3"
          rx={3}
        />
        {p.geom.parts}
      </g>,
    )
    labels.push({
      key: `lbl-${p.st.id}-${p.copy}`,
      id: p.st.id,
      x: rowX,
      y: p.y - 4,
      text:
        `${prettyName(p.st.item)}` +
        (p.copies > 1 ? `  — row ${p.copy + 1} of ${p.copies}` : '') +
        (p.copy === MAX_COPIES - 1 && p.copies > MAX_COPIES ? ` (+${p.copies - MAX_COPIES} more like this)` : ''),
    })
  }

  // bus header
  parts.push(
    <text key="bus-title" x={2 * T} y={T * 1.6} fontSize={Math.max(11, T)} fill="#9cc3ea" fontWeight={700}>
      MAIN BUS ↓
    </text>,
  )

  const width = rowX + maxW + 2 * T
  const height = bottom + 3 * T
  return {
    parts,
    labels,
    width,
    height,
    tilesW: Math.round(width / T),
    tilesH: Math.round(height / T),
    busLanes: busCols,
    truncated,
  }
}
