import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { prettyName } from '../game'
import { beltFor, beltsNeeded, fmt, isFluid, rate, beltTagClass } from '../format'
import type { Result, RowOverride, Settings, Step } from '../solver'
import { Icon, NamedIcon } from './Icon'
import { BeltControls, fixAllBelts, overflowing } from './BeltControls'
import { ModuleEditor, ModuleSavings, SlotStrip } from './ModuleEditor'

const POS_KEY = 'factorio-ratios-positions'
const ZOOM_KEY = 'factorio-ratios-zoom'
const ZOOM_MIN = 0.3
const ZOOM_MAX = 1.5
type Offsets = Record<string, { x: number; y: number }>
function loadOffsets(): Offsets {
  try {
    return JSON.parse(localStorage.getItem(POS_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

interface Node {
  id: string
  col: number
  step?: Step
  target?: { item: string; rate: number }
}
interface Edge {
  from: string
  to: string
  item: string
  rate: number
  belt?: string
}

/** Stable, distinct-ish colour per item so you can follow one item's lines by eye. */
const FIXED_COLORS: Record<string, string> = {
  'iron-ore': '#7aa6d6',
  'iron-plate': '#a9c4e0',
  'copper-ore': '#e0884a',
  'copper-plate': '#f0a070',
  'copper-cable': '#f2b56b',
  coal: '#9a9a9a',
  stone: '#c9b48a',
  water: '#4aa3ff',
  'petroleum-gas': '#c58be6',
  'heavy-oil': '#e05a3b',
  'light-oil': '#e6c84a',
  lubricant: '#6fd66f',
  'sulfuric-acid': '#d8e04a',
  'electronic-circuit': '#6bd16b',
  'advanced-circuit': '#e05555',
  'processing-unit': '#5a7fe0',
  'steel-plate': '#d0d0d0',
  'molten-iron': '#ff8a3d',
  'molten-copper': '#ff6a3d',
  lava: '#ff4a1a',
}
export function itemColor(item: string): string {
  if (FIXED_COLORS[item]) return FIXED_COLORS[item]
  let h = 0
  for (const c of item) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return `hsl(${h % 360}, 65%, 62%)`
}

const portKey = (node: string, dir: 'in' | 'out', item: string) => `${node}|${dir}|${item}`

export function FlowDiagram({
  result,
  s,
  stepNumber,
  onSelect,
  setRow,
}: {
  result: Result
  s: Settings
  stepNumber: Map<string, number>
  onSelect: (id: string) => void
  setRow: (id: string, patch: RowOverride | null) => void
}) {
  const [offsets, setOffsets] = useState<Offsets>(loadOffsets)
  const [editing, setEditing] = useState<string | null>(null)
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null)
  useEffect(() => {
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(offsets))
    } catch {
      /* ignore */
    }
  }, [offsets])
  const visibleIds = new Set([...result.steps.map((st) => st.id), ...result.targets.map((t) => `target:${t.item}`)])
  const moved = Object.keys(offsets).some((id) => visibleIds.has(id))
  const over = overflowing(result.steps, s)
  const { columns, edges } = useMemo(() => layoutCached(result), [result])
  const wrap = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef(new Map<string, HTMLElement>())
  const portRefs = useRef(new Map<string, HTMLElement>())
  const [paths, setPaths] = useState<{ edge: Edge; d: string; color: string; w: number; title: string }[]>([])
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [hover, setHover] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const active = hover ?? pinned

  // Everything upstream (feeds it) and downstream (it feeds) of the active box.
  const chain = useMemo(() => {
    if (!active) return null
    const up = new Set<string>([active])
    const down = new Set<string>([active])
    const walk = (set: Set<string>, dir: 'up' | 'down') => {
      let grew = true
      while (grew) {
        grew = false
        for (const e of edges) {
          const [a, b] = dir === 'up' ? [e.to, e.from] : [e.from, e.to]
          if (set.has(a) && !set.has(b)) {
            set.add(b)
            grew = true
          }
        }
      }
    }
    walk(up, 'up')
    walk(down, 'down')
    return { up, down, all: new Set([...up, ...down]) }
  }, [active, edges])
  const edgeLit = (e: Edge) =>
    !chain || (chain.up.has(e.from) && chain.up.has(e.to)) || (chain.down.has(e.from) && chain.down.has(e.to))

  const pan = useRef<{ sx: number; sy: number; left: number; top: number; moved: boolean } | null>(null)
  const [panning, setPanning] = useState(false)

  // ---- zoom ----
  const canvas = useRef<HTMLDivElement>(null)
  const [zoom, setZoomState] = useState(() => {
    try {
      return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(localStorage.getItem(ZOOM_KEY)) || 1))
    } catch {
      return 1
    }
  })
  const zoomRef = useRef(zoom)
  useLayoutEffect(() => {
    zoomRef.current = zoom
  }, [zoom])
  // point (in wrap viewport px) to keep still while zooming
  const anchor = useRef<{ mx: number; my: number; px: number; py: number } | null>(null)
  const setZoom = (next: number, at?: { x: number; y: number }) => {
    const el = wrap.current
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(next * 100) / 100))
    if (el) {
      const mx = at ? at.x : el.clientWidth / 2
      const my = at ? at.y : el.clientHeight / 2
      anchor.current = { mx, my, px: (el.scrollLeft + mx) / zoomRef.current, py: (el.scrollTop + my) / zoomRef.current }
    }
    setZoomState(z)
  }
  useEffect(() => {
    try {
      localStorage.setItem(ZOOM_KEY, String(zoom))
    } catch {
      /* ignore */
    }
  }, [zoom])
  useLayoutEffect(() => {
    const el = wrap.current
    const a = anchor.current
    if (!el || !a) return
    anchor.current = null
    el.scrollLeft = a.px * zoom - a.mx
    el.scrollTop = a.py * zoom - a.my
  }, [zoom])
  // Ctrl/⌘ + wheel and trackpad pinch zoom around the cursor
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      setZoom(zoomRef.current * Math.exp(-Math.max(-150, Math.min(150, e.deltaY)) * 0.002), { x: e.clientX - r.left, y: e.clientY - r.top })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })
  const fitWidth = () => {
    const el = wrap.current
    if (el && box.w) setZoom(Math.min(1, (el.clientWidth - 4) / box.w, (el.clientHeight - 4) / box.h))
  }

  useLayoutEffect(() => {
    const el = canvas.current
    if (!el) return
    const draw = () => {
      const base = el.getBoundingClientRect()
      const z = zoomRef.current
      // positions in unzoomed canvas coordinates
      const rel = (r: DOMRect) => ({
        x: (r.left - base.left) / z,
        y: (r.top - base.top) / z,
        w: r.width / z,
        h: r.height / z,
      })
      let w = el.offsetWidth
      let h = el.offsetHeight
      for (const n of nodeRefs.current.values()) {
        const r = rel(n.getBoundingClientRect())
        w = Math.max(w, r.x + r.w + 14)
        h = Math.max(h, r.y + r.h + 14)
      }
      const out = []
      for (const e of edges) {
        const fromNode = nodeRefs.current.get(e.from)
        const toNode = nodeRefs.current.get(e.to)
        const fromPort = portRefs.current.get(portKey(e.from, 'out', e.item))
        const toPort = portRefs.current.get(portKey(e.to, 'in', e.item))
        if (!fromNode || !toNode) continue
        const fn = rel(fromNode.getBoundingClientRect())
        const tn = rel(toNode.getBoundingClientRect())
        const fp = fromPort ? rel(fromPort.getBoundingClientRect()) : fn
        const tp = toPort ? rel(toPort.getBoundingClientRect()) : tn
        const ax = fn.x + fn.w
        const ay = fp.y + fp.h / 2
        const bx = tn.x - 7 // leave room for the arrowhead
        const by = tp.y + tp.h / 2
        const mid = Math.max(28, (bx - ax) / 2)
        const fluid = isFluid(e.item)
        const belts = beltsNeeded(e.rate, s, e.belt)
        out.push({
          edge: e,
          d: `M${ax},${ay} C${ax + mid},${ay} ${bx - mid},${by} ${bx},${by}`,
          color: itemColor(e.item),
          w: fluid ? 3 : Math.max(2.5, Math.min(7, 2 + belts * 3)),
          title: `${prettyName(e.item)} — ${rate(e.rate, s)}${fluid ? ' (pipe)' : ` (${fmt(belts)} belts)`}`,
        })
      }
      setPaths(out)
      setBox({ w, h })
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(el)
    for (const n of nodeRefs.current.values()) ro.observe(n)
    return () => ro.disconnect()
  }, [edges, s, offsets, editing, zoom])

  if (!result.steps.length) return null

  const colors = [...new Set(paths.map((p) => p.color))]

  return (
    <>
      <div className="flow-toolbar">
        <span className="muted small">
          Drag any box to untangle lines. Click the module slots on a box to change just that group.
        </span>
        {over.length > 0 && (
          <span className="overflow-banner">
            ⚠ {over.length} group{over.length > 1 ? 's' : ''} overflow their belt
            <button className="btn small" onClick={() => fixAllBelts(result.steps, s, setRow)}>
              Upgrade belts to fit
            </button>
          </span>
        )}
        {moved && (
          <button className="btn small" onClick={() => setOffsets({})}>
            Reset layout
          </button>
        )}
        <span className="zoom-controls" title="Zoom (or hold Ctrl/⌘ and scroll / pinch on the chart)">
          <button className="btn small" onClick={() => setZoom(zoom / 1.2)} disabled={zoom <= ZOOM_MIN}>
            −
          </button>
          <input
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(+e.target.value)}
          />
          <button className="btn small" onClick={() => setZoom(zoom * 1.2)} disabled={zoom >= ZOOM_MAX}>
            +
          </button>
          <span className="zoom-pct">{Math.round(zoom * 100)}%</span>
          <button className="btn small" onClick={fitWidth}>
            Fit
          </button>
          <button className="btn small" onClick={() => setZoom(1)}>
            100%
          </button>
        </span>
      </div>
      <div
        className={'flow-wrap inset' + (chain ? ' focusing' : '') + (panning ? ' panning' : '')}
        ref={wrap}
        onPointerDown={(e) => {
          // drag on empty space pans the chart
          if (e.button !== 0 || (e.target as HTMLElement).closest('.flow-node')) return
          const el = wrap.current!
          pan.current = { sx: e.clientX, sy: e.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false }
        }}
        onPointerMove={(e) => {
          const p = pan.current
          if (!p) return
          const dx = e.clientX - p.sx
          const dy = e.clientY - p.sy
          if (!p.moved && Math.hypot(dx, dy) < 4) return
          if (!p.moved) {
            p.moved = true
            setPanning(true)
            wrap.current!.setPointerCapture(e.pointerId)
          }
          wrap.current!.scrollLeft = p.left - dx
          wrap.current!.scrollTop = p.top - dy
        }}
        onPointerUp={() => {
          const p = pan.current
          pan.current = null
          setPanning(false)
          if (p && !p.moved) setPinned(null)
        }}
      >
        <div className="flow-sizer" style={{ width: box.w * zoom, height: box.h * zoom }}>
          <div className="flow-canvas" ref={canvas} style={{ transform: `scale(${zoom})` }}>
            <svg className="flow-edges" width={box.w} height={box.h}>
              <defs>
                {colors.map((c) => (
                  <marker
                    key={c}
                    id={`arrow-${c.replace(/[^a-z0-9]/gi, '')}`}
                    viewBox="0 0 10 10"
                    refX="1"
                    refY="5"
                    markerWidth="3.2"
                    markerHeight="3.2"
                    orient="auto"
                  >
                    <path d="M0,0 L10,5 L0,10 z" fill={c} />
                  </marker>
                ))}
              </defs>
              {/* dim edges first so lit ones draw on top */}
              {[...paths]
                .sort((a, b) => Number(edgeLit(a.edge)) - Number(edgeLit(b.edge)))
                .map((p, i) => {
                  const lit = edgeLit(p.edge)
                  return (
                    <path
                      key={i}
                      d={p.d}
                      stroke={p.color}
                      strokeWidth={chain && lit ? p.w + 1.5 : p.w}
                      fill="none"
                      strokeOpacity={chain ? (lit ? 1 : 0.08) : 0.8}
                      markerEnd={`url(#arrow-${p.color.replace(/[^a-z0-9]/gi, '')})`}
                    >
                      <title>{p.title}</title>
                    </path>
                  )
                })}
            </svg>
            <div className="flow-cols">
              {columns.map((col, ci) => (
                <div className="flow-col" key={ci}>
                  {col.map((n) => {
                    const dim = chain && !chain.all.has(n.id) && editing !== n.id
                    const off = offsets[n.id]
                    return (
                      <div
                        key={n.id}
                        style={
                          off
                            ? { transform: `translate(${off.x}px, ${off.y}px)`, zIndex: editing === n.id ? 5 : 2 }
                            : editing === n.id
                              ? { zIndex: 5 }
                              : undefined
                        }
                        onPointerDown={(e) => {
                          if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, .module-editor'))
                            return
                          drag.current = {
                            id: n.id,
                            sx: e.clientX,
                            sy: e.clientY,
                            ox: off?.x || 0,
                            oy: off?.y || 0,
                            moved: false,
                          }
                          e.currentTarget.setPointerCapture(e.pointerId)
                        }}
                        onPointerMove={(e) => {
                          const d = drag.current
                          if (!d || d.id !== n.id) return
                          const dx = (e.clientX - d.sx) / zoom
                          const dy = (e.clientY - d.sy) / zoom
                          if (!d.moved && Math.hypot(dx, dy) < 4) return
                          d.moved = true
                          setOffsets((o) => ({ ...o, [n.id]: { x: d.ox + dx, y: d.oy + dy } }))
                        }}
                        onPointerUp={() => {
                          const d = drag.current
                          drag.current = null
                          if (d && d.id === n.id && !d.moved) setPinned((p) => (p === n.id ? null : n.id))
                        }}
                        ref={(el) => {
                          if (el) nodeRefs.current.set(n.id, el)
                          else nodeRefs.current.delete(n.id)
                        }}
                        className={
                          'flow-node' +
                          (n.target ? ' target' : '') +
                          (n.step?.kind === 'raw' ? ' raw' : '') +
                          (dim ? ' dim' : '') +
                          (active === n.id ? ' active' : '') +
                          (off ? ' moved' : '')
                        }
                        onMouseEnter={() => !drag.current && setHover(n.id)}
                        onMouseLeave={() => !drag.current && setHover(null)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {n.step ? (
                          <StepNode
                            st={n.step}
                            s={s}
                            num={stepNumber.get(n.step.id)!}
                            portRef={(dir, item, el) => {
                              const k = portKey(n.id, dir, item)
                              if (el) portRefs.current.set(k, el)
                              else portRefs.current.delete(k)
                            }}
                            onDetails={() => onSelect(n.step!.id)}
                            editor={
                              editing === n.id ? (
                                <ModuleEditor st={n.step} s={s} setRow={setRow} onClose={() => setEditing(null)} />
                              ) : null
                            }
                            onEditModules={() => setEditing((e) => (e === n.id ? null : n.id))}
                            belts={<BeltControls st={n.step} s={s} setRow={setRow} compact />}
                          />
                        ) : (
                          <TargetNode
                            t={n.target!}
                            s={s}
                            portRef={(el) => {
                              const k = portKey(n.id, 'in', n.target!.item)
                              if (el) portRefs.current.set(k, el)
                              else portRefs.current.delete(k)
                            }}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

type PortRef = (dir: 'in' | 'out', item: string, el: HTMLElement | null) => void

function StepNode({
  st,
  s,
  num,
  portRef,
  onDetails,
  editor,
  onEditModules,
  belts,
}: {
  st: Step
  s: Settings
  num: number
  portRef: PortRef
  onDetails: () => void
  editor: React.ReactNode
  onEditModules: () => void
  belts: React.ReactNode
}) {
  const canModule = st.kind !== 'raw' && st.kind !== 'pump' && st.slots.length > 0
  const raw = st.kind === 'raw'
  const machineName = st.kind === 'pump' ? 'offshore-pump' : st.machine?.name || ''
  return (
    <>
      <div className="node-head">
        <span className="node-num" title={`Step ${num} in the build guide`}>
          {num}
        </span>
        {raw ? (
          <NamedIcon name={st.item} size={36} />
        ) : (
          <span className="machine-badge">
            <NamedIcon name={machineName} size={36} />
            <span className="count">×{Math.ceil(st.count - 1e-6)}</span>
          </span>
        )}
        <div className="node-head-text">
          <div className="node-title">{prettyName(st.item)}</div>
          <div className="node-sub">
            {raw
              ? `bring in on a ${isFluid(st.item) ? 'pipe' : 'belt'}`
              : `${prettyName(machineName)} · exact ${fmt(st.count)}`}
          </div>
          <ModuleSavings st={st} />
        </div>
        <button
          className="node-details"
          title="Show this step in the build guide"
          onClick={(e) => {
            e.stopPropagation()
            onDetails()
          }}
        >
          ↓
        </button>
      </div>
      {canModule && (
        <button
          className={'slot-strip-btn' + (editor ? ' open' : '')}
          onClick={(e) => {
            e.stopPropagation()
            onEditModules()
          }}
          title="Change modules for just this group of machines"
        >
          <SlotStrip st={st} />
          <span className="strip-hint">{st.moduleList.length || st.beacons ? 'edit' : '+ modules'}</span>
        </button>
      )}
      {editor}
      {belts}

      {st.inputs.length > 0 && (
        <div className="ports">
          {st.inputs.map((i) => (
            <div key={i.item} className="port in" ref={(el) => portRef('in', i.item, el)}>
              <span className="port-dot" style={{ background: itemColor(i.item) }} />
              <NamedIcon name={i.item} size={16} />
              <span className="port-name">{prettyName(i.item)}</span>
              <span className="port-rate">{rate(i.rate, s)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="ports outs">
        {st.outputs.map((o) => (
          <div
            key={o.item}
            className={'port out' + (o.item !== st.item ? ' byproduct' : '')}
            ref={(el) => portRef('out', o.item, el)}
          >
            <span className="port-label">makes</span>
            <NamedIcon name={o.item} size={16} />
            <span className="port-rate">{rate(o.rate, s)}</span>
            <Carrier item={o.item} perSec={o.rate} s={s} belt={st.belt} />
            <span className="port-dot" style={{ background: itemColor(o.item) }} />
          </div>
        ))}
      </div>
    </>
  )
}

function TargetNode({
  t,
  s,
  portRef,
}: {
  t: { item: string; rate: number }
  s: Settings
  portRef: (el: HTMLElement | null) => void
}) {
  return (
    <>
      <div className="node-head">
        <NamedIcon name={t.item} size={40} />
        <div className="node-head-text">
          <div className="node-title">{prettyName(t.item)}</div>
          <div className="node-sub">your output</div>
        </div>
      </div>
      <div className="ports">
        <div className="port in" ref={portRef}>
          <span className="port-dot" style={{ background: itemColor(t.item) }} />
          <NamedIcon name={t.item} size={16} />
          <span className="port-rate">{rate(t.rate, s)}</span>
          <Carrier item={t.item} perSec={t.rate} s={s} />
        </div>
      </div>
    </>
  )
}

function Carrier({ item, perSec, s, belt }: { item: string; perSec: number; s: Settings; belt?: string }) {
  if (isFluid(item)) return <span className="pipe-tag">pipe</span>
  return (
    <span className={beltTagClass(perSec, s, belt)} title={`${prettyName(beltFor(s, belt).name)}s needed`}>
      <Icon icon={beltFor(s, belt).icon} size={14} />
      {fmt(beltsNeeded(perSec, s, belt))}
    </span>
  )
}

export function FlowLine({
  item,
  perSec,
  s,
  dim,
  belt,
}: {
  item: string
  perSec: number
  s: Settings
  dim?: boolean
  belt?: string
}) {
  return (
    <div className={'flow-line' + (dim ? ' dim' : '')}>
      <NamedIcon name={item} size={16} />
      <span>{rate(perSec, s)}</span>
      <Carrier item={item} perSec={perSec} s={s} belt={belt} />
    </div>
  )
}

const layoutCache = new WeakMap<Result, ReturnType<typeof layout>>()
function layoutCached(result: Result) {
  let l = layoutCache.get(result)
  if (!l) layoutCache.set(result, (l = layout(result)))
  return l
}

/** Steps in the order they appear in the chart: column by column, top to bottom. */
export function layoutOrder(result: Result): Step[] {
  return layoutCached(result)
    .columns.flat()
    .flatMap((n) => (n.step ? [n.step] : []))
}

function layout(result: Result): { columns: Node[][]; edges: Edge[] } {
  const steps = result.steps
  const maxDepth = steps.reduce((m, st) => Math.max(m, st.depth), 0)
  const nodes: Node[] = steps.map((st) => ({ id: st.id, col: st.depth, step: st }))
  for (const t of result.targets) nodes.push({ id: `target:${t.item}`, col: maxDepth + 1, target: t })

  const producers = new Map<string, Step[]>()
  for (const st of steps)
    for (const o of st.outputs) (producers.get(o.item) || producers.set(o.item, []).get(o.item)!).push(st)

  const edges: Edge[] = []
  for (const st of steps)
    for (const i of st.inputs)
      for (const p of producers.get(i.item) || [])
        if (p !== st) edges.push({ from: p.id, to: st.id, item: i.item, rate: i.rate, belt: p.belt })
  for (const t of result.targets)
    for (const p of producers.get(t.item) || [])
      edges.push({ from: p.id, to: `target:${t.item}`, item: t.item, rate: t.rate, belt: p.belt })

  const columns: Node[][] = Array.from({ length: maxDepth + 2 }, () => [])
  for (const n of nodes) columns[n.col].push(n)

  // Barycentre sweeps: keep each box level with the boxes it connects to.
  const index = new Map<string, number>()
  const reindex = () => columns.forEach((c) => c.forEach((n, i) => index.set(n.id, i)))
  reindex()
  const bary = (id: string, dir: 'out' | 'in') => {
    const linked = edges
      .filter((e) => (dir === 'out' ? e.from === id : e.to === id))
      .map((e) => index.get(dir === 'out' ? e.to : e.from)!)
    return linked.length ? linked.reduce((a, b) => a + b, 0) / linked.length : index.get(id)!
  }
  for (let k = 0; k < 4; k++) {
    for (let c = columns.length - 2; c >= 0; c--) {
      columns[c].sort((a, b) => bary(a.id, 'out') - bary(b.id, 'out'))
      reindex()
    }
    for (let c = 1; c < columns.length; c++) {
      columns[c].sort((a, b) => bary(a.id, 'in') - bary(b.id, 'in'))
      reindex()
    }
  }
  return { columns: columns.filter((c) => c.length), edges }
}
