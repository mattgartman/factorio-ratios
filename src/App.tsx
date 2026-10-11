import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChainView } from './components/ChainView'
import { LayoutView } from './components/LayoutView'
import { FlowDiagram, FlowLine, layoutOrder } from './components/FlowDiagram'
import { Icon, NamedIcon } from './components/Icon'
import { ItemPicker } from './components/ItemPicker'
import { SettingsPanel } from './components/SettingsPanel'
import { StepCard } from './components/StepCard'
import { beltFor, beltsNeeded, fmt, power, rate, beltTagClass } from './format'
import { game, prettyName } from './game'
import { DEFAULT_SETTINGS } from './presets'
import { RAW, solve, type RowOverride, type Settings, type Step } from './solver'

const STORAGE_KEY = 'factorio-ratios-settings-v1'

function load(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (saved) return { ...DEFAULT_SETTINGS, ...saved }
  } catch {
    /* ignore */
  }
  return DEFAULT_SETTINGS
}

export default function App() {
  const [s, setS] = useState<Settings>(load)
  const [picker, setPicker] = useState<number | null>(null) // index of target being picked, -1 = new
  const [flash, setFlash] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(true)
  const [view, setView] = useState<'flow' | 'chain' | 'layout'>(() => {
    try {
      const v = localStorage.getItem('factorio-ratios-view')
      return v === 'chain' || v === 'layout' ? v : 'flow'
    } catch {
      return 'flow'
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('factorio-ratios-view', view)
    } catch {
      /* ignore */
    }
  }, [view])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    } catch {
      /* ignore */
    }
  }, [s])

  const set = useCallback((p: Partial<Settings>) => setS((prev) => ({ ...prev, ...p })), [])
  const setRow = useCallback(
    (id: string, patch: RowOverride | null) =>
      setS((prev) => {
        const rows = { ...prev.rows }
        if (patch) rows[id] = patch
        else delete rows[id]
        return { ...prev, rows }
      }),
    [],
  )
  const setSource = useCallback(
    (item: string, src: string | null) =>
      setS((prev) => {
        const recipeFor = { ...prev.recipeFor }
        if (src) recipeFor[item] = src
        else delete recipeFor[item]
        return { ...prev, recipeFor }
      }),
    [],
  )

  const result = useMemo(() => solve(s), [s])
  const ordered = useMemo(() => layoutOrder(result), [result])
  const stepNumber = useMemo(() => new Map(ordered.map((st, i) => [st.id, i + 1])), [ordered])

  const select = (id: string) => {
    document.getElementById(`step-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setFlash(id)
    setTimeout(() => setFlash(null), 1200)
  }

  const updateTarget = (i: number, patch: Partial<Settings['targets'][number]>) =>
    set({ targets: s.targets.map((t, j) => (j === i ? { ...t, ...patch } : t)) })

  const rawSteps = result.steps.filter((st) => st.kind === 'raw' || st.kind === 'mine' || st.kind === 'pump')
  const supplied = Object.entries(s.recipeFor).filter(([, v]) => v === RAW)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <NamedIcon name="assembling-machine-2" size={34} />
          <div>
            <h1>Factorio Ratios</h1>
            <div className="tagline">Pick what you want. Get the machines, belts and modules. Build the spaghetti.</div>
          </div>
        </div>
        <button className="btn" onClick={() => setShowSettings((v) => !v)}>
          {showSettings ? 'Hide' : 'Show'} factory settings
        </button>
      </header>

      <div className={'layout' + (showSettings ? '' : ' no-settings')}>
        {showSettings && <SettingsPanel s={s} set={set} />}

        <main>
          <section className="panel targets">
            <div className="panel-title">
              <span>I want to make…</span>
              <div className="unit-toggle">
                {(['min', 'sec'] as const).map((u) => (
                  <button
                    key={u}
                    className={'btn small' + (s.unit === u ? ' active' : '')}
                    onClick={() => {
                      if (u === s.unit) return
                      const f = u === 'sec' ? 1 / 60 : 60
                      set({ unit: u, targets: s.targets.map((t) => ({ ...t, rate: +(t.rate * f).toFixed(3) })) })
                    }}
                  >
                    per {u === 'min' ? 'minute' : 'second'}
                  </button>
                ))}
              </div>
            </div>
            <div className="target-list">
              {s.targets.map((t, i) => (
                <div className="target" key={i}>
                  <button className="slot big" onClick={() => setPicker(i)} title="Change item">
                    <NamedIcon name={t.item} size={40} />
                  </button>
                  <div className="target-fields">
                    <div className="target-name">{prettyName(t.item)}</div>
                    <div className="target-rate">
                      <input
                        type="number"
                        min={0}
                        value={t.rate}
                        onChange={(e) => updateTarget(i, { rate: Math.max(0, +e.target.value || 0) })}
                      />
                      <span className="muted">/{s.unit}</span>
                    </div>
                    <BeltShortcut item={t.item} s={s} onPick={(r) => updateTarget(i, { rate: r })} />
                  </div>
                  <button
                    className="btn small danger"
                    onClick={() => set({ targets: s.targets.filter((_, j) => j !== i) })}
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button className="add-target" onClick={() => setPicker(-1)}>
                <span className="plus">+</span>
                Add item
              </button>
            </div>
          </section>

          {result.steps.length > 0 ? (
            <>
              <section className="summary-grid">
                <div className="panel">
                  <div className="panel-title">Raw materials in</div>
                  {rawSteps.map((st) => (
                    <SummaryLine key={st.id} st={st} s={s} />
                  ))}
                  {supplied.length > 0 && (
                    <div className="hint">
                      You're supplying: {supplied.map(([item]) => prettyName(item)).join(', ')}{' '}
                      <button className="link" onClick={() => set({ recipeFor: {} })}>
                        reset
                      </button>
                    </div>
                  )}
                </div>
                <div className="panel">
                  <div className="panel-title">Buildings to place</div>
                  <div className="build-list">
                    {result.buildings.map((b) => (
                      <div key={b.name} className="build-item" title={prettyName(b.name)}>
                        <NamedIcon name={b.name} size={36} />
                        <span className="count">{b.count}</span>
                      </div>
                    ))}
                    {result.moduleTotals.map((m) => (
                      <div key={m.name} className="build-item" title={prettyName(m.name)}>
                        <NamedIcon name={m.name} size={36} />
                        <span className="count">{m.count}</span>
                      </div>
                    ))}
                  </div>
                  <div className="hint">Power: about {power(result.power)} (machines running flat out)</div>
                </div>
                {result.surplus.length > 0 && (
                  <div className="panel">
                    <div className="panel-title">Leftovers to deal with</div>
                    {result.surplus.map((f) => (
                      <FlowLine key={f.item} item={f.item} perSec={f.rate} s={s} />
                    ))}
                    <div className="hint">Byproducts made more than you need — sink, store or use them elsewhere.</div>
                  </div>
                )}
              </section>

              <section className="panel">
                <div className="panel-title">
                  <span>Production line</span>
                  <div className="unit-toggle">
                    <button
                      className={'btn small' + (view === 'flow' ? ' active' : '')}
                      onClick={() => setView('flow')}
                    >
                      Flow chart
                    </button>
                    <button
                      className={'btn small' + (view === 'chain' ? ' active' : '')}
                      onClick={() => setView('chain')}
                    >
                      Chain (made from…)
                    </button>
                    <button
                      className={'btn small' + (view === 'layout' ? ' active' : '')}
                      onClick={() => setView('layout')}
                    >
                      Layout (blueprint)
                    </button>
                  </div>
                </div>
                {view === 'flow' ? (
                  <>
                    <div className="hint view-hint">
                      Left → right is the order things get made. Each line runs from a box's <b>makes</b> row to the
                      matching ingredient row of the next box. <b>Hover or click a box</b> to highlight only what feeds
                      it and what it feeds. Numbers match the build guide below.
                    </div>
                    <FlowDiagram result={result} s={s} stepNumber={stepNumber} onSelect={select} setRow={setRow} />
                  </>
                ) : view === 'layout' ? (
                  <LayoutView result={result} s={s} order={ordered} stepNumber={stepNumber} onSelect={select} />
                ) : (
                  <>
                    <div className="hint view-hint">
                      Each output, then what it's made from, then what that's made from… Click ▸ to fold a branch. When
                      a step feeds several lines, each branch shows its share (e.g. “1.2 of the 3 foundries”).
                    </div>
                    <ChainView result={result} s={s} stepNumber={stepNumber} onSelect={select} />
                  </>
                )}
              </section>

              <section>
                <h2 className="section-title">Build guide — step by step</h2>
                {ordered.map((st, i) => (
                  <StepCard
                    key={st.id}
                    st={st}
                    index={i}
                    result={result}
                    s={s}
                    stepNumber={stepNumber}
                    highlight={flash === st.id}
                    setRow={setRow}
                    setSource={setSource}
                  />
                ))}
              </section>
            </>
          ) : (
            <div className="panel empty">Add an item above to get started.</div>
          )}

          <footer className="muted small">
            Recipes and icons from Factorio 2.0 + Space Age. Factorio is © Wube Software — this is an unofficial fan
            tool, not affiliated with Wube. Assumes normal quality and 100% oil yield.{' '}
            <a href="https://github.com/mattgartman/factorio-ratios" target="_blank" rel="noreferrer">
              Source on GitHub
            </a>{' '}
            ·{' '}
            <button className="link" onClick={() => setS(DEFAULT_SETTINGS)}>
              Reset everything
            </button>
          </footer>
        </main>
      </div>

      {picker !== null && (
        <ItemPicker
          onClose={() => setPicker(null)}
          onPick={(item) => {
            if (picker === -1) set({ targets: [...s.targets, { item, rate: s.unit === 'min' ? 60 : 1 }] })
            else updateTarget(picker, { item })
            setPicker(null)
          }}
        />
      )}
    </div>
  )
}

/** One-click "fill a whole belt" rates. */
function BeltShortcut({ item, s, onPick }: { item: string; s: Settings; onPick: (rate: number) => void }) {
  if (game.items[item]?.kind === 'fluid') return null
  return (
    <div className="belt-shortcut">
      <span className="muted small">fill a belt:</span>
      {game.belts.map((b) => {
        const perSec = b.rate * s.beltStack
        return (
          <button
            key={b.name}
            className="mini-belt"
            title={`One full ${prettyName(b.name)} = ${perSec}/s`}
            onClick={() => onPick(s.unit === 'min' ? perSec * 60 : perSec)}
          >
            <Icon icon={b.icon} size={18} />
          </button>
        )
      })}
    </div>
  )
}

function SummaryLine({ st, s }: { st: Step; s: Settings }) {
  const out = st.outputs.find((o) => o.item === st.item) || st.outputs[0]
  const how =
    st.kind === 'mine'
      ? `${Math.ceil(st.count - 1e-6)} × ${prettyName(st.machine?.name || '')}`
      : st.kind === 'pump'
        ? `${Math.ceil(st.count - 1e-6)} × offshore pump`
        : 'bring in'
  const fluid = game.items[st.item]?.kind === 'fluid'
  return (
    <div className="summary-line">
      <NamedIcon name={st.item} size={28} />
      <span className="io-name">{prettyName(st.item)}</span>
      <span className="io-rate">{rate(out.rate, s)}</span>
      {!fluid && (
        <span className={beltTagClass(out.rate, s, st.belt)}>
          <Icon icon={beltFor(s, st.belt).icon} size={16} />
          {fmt(beltsNeeded(out.rate, s, st.belt))}
        </span>
      )}
      <span className="muted small">{how}</span>
    </div>
  )
}
