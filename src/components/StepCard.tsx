import { useState } from 'react'
import { game, prettyName, resourceByProduct } from '../game'
import { beltsNeeded, beltFor, fmt, isFluid, power, rate, beltTagClass } from '../format'
import {
  MINE,
  PUMP,
  RAW,
  sourceFor,
  sourceOptions,
  type Result,
  type RowOverride,
  type Settings,
  type Step,
} from '../solver'
import { Icon, NamedIcon } from './Icon'
import { ModuleSavings, SlotStrip } from './ModuleEditor'
import { BeltControls } from './BeltControls'
import { ModulePicker } from './SettingsPanel'

interface Props {
  st: Step
  index: number
  result: Result
  s: Settings
  stepNumber: Map<string, number>
  highlight: boolean
  setRow: (id: string, patch: RowOverride | null) => void
  setSource: (item: string, src: string | null) => void
}

export function StepCard({ st, index, result, s, stepNumber, highlight, setRow, setSource }: Props) {
  const [picking, setPicking] = useState(false)
  const machines = Math.ceil(st.count - 1e-6)
  const src = sourceFor(st.item, s)
  const overridden = !!s.rows[st.id]

  const producersOf = (item: string) => result.steps.filter((x) => x !== st && x.outputs.some((o) => o.item === item))
  const consumersOf = (item: string) => result.steps.filter((x) => x !== st && x.inputs.some((i) => i.item === item))
  const link = (x: Step) => (
    <a key={x.id} href={`#step-${x.id}`} className="step-link">
      step {stepNumber.get(x.id)}
    </a>
  )

  return (
    <div id={`step-${st.id}`} className={'panel step' + (highlight ? ' flash' : '')}>
      <div className="step-head">
        <span className="step-num">{index + 1}</span>
        <NamedIcon name={st.item} size={36} />
        <div className="step-title">
          <div className="name">{prettyName(st.item)}</div>
          <div className="muted">{describeSource(src, st)}</div>
        </div>
        <div className="step-actions">
          <button className="btn small" onClick={() => setPicking((p) => !p)}>
            Change recipe ▾
          </button>
          {st.kind !== 'raw' ? (
            <button
              className="btn small"
              onClick={() => setSource(st.item, RAW)}
              title="I already have this on a belt/bus"
            >
              I'll supply this
            </button>
          ) : (
            s.recipeFor[st.item] && (
              <button className="btn small" onClick={() => setSource(st.item, null)}>
                Make it instead
              </button>
            )
          )}
        </div>
      </div>

      {picking && (
        <div className="recipe-options inset">
          {sourceOptions(st.item, s).map((o) => (
            <button
              key={o}
              className={'recipe-option' + (o === src ? ' selected' : '')}
              onClick={() => {
                setSource(st.item, o)
                setPicking(false)
              }}
            >
              <SourcePreview item={st.item} src={o} />
            </button>
          ))}
        </div>
      )}

      {st.kind === 'raw' ? (
        <div className="step-body">
          <div className="big-count">
            {rate(st.outputs[0].rate, s)}
            <span className="muted"> brought in from elsewhere</span>
          </div>
          <IOList title="Feeds" flows={st.outputs} s={s} belt={st.belt} where={(item) => consumersOf(item).map(link)} />
          <BeltControls st={st} s={s} setRow={setRow} />
        </div>
      ) : (
        <div className="step-body">
          <div className="step-grid">
            <div className="machine-col">
              <div className="big-count">
                <span className="machine-badge">
                  <NamedIcon name={st.kind === 'pump' ? game.offshore.name : st.machine?.name || ''} size={56} />
                </span>
                <span>
                  <b>{machines}</b> × {prettyName(st.kind === 'pump' ? game.offshore.name : st.machine?.name || '?')}
                  <div className="muted">exact {fmt(st.count, 3)}</div>
                  <ModuleSavings st={st} />
                </span>
              </div>
              {st.notUnlocked && (
                <div className="warn">
                  You haven't ticked a machine that can make this — showing {prettyName(st.machine?.name || '')}.
                </div>
              )}
              {st.machineOptions.length > 1 && (
                <>
                  <div className="sub-label">Machine</div>
                  <div className="choice-row">
                    {st.machineOptions.map((m) => (
                      <button
                        key={m.name}
                        className={'slot' + (st.machine?.name === m.name ? ' selected' : '')}
                        onClick={() => setRow(st.id, { ...s.rows[st.id], machine: m.name })}
                        title={`${prettyName(m.name)} (speed ${m.speed})`}
                      >
                        <Icon icon={m.icon} size={28} />
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="stats">
                Speed {fmt(st.speed, 3)}
                {st.speedBonus !== 0 && (
                  <>
                    {' '}
                    ({st.speedBonus > 0 ? '+' : ''}
                    {fmt(st.speedBonus * 100, 0)}%)
                  </>
                )}
                {st.productivity > 0 && <> · Productivity +{fmt(st.productivity * 100, 0)}%</>}
                {st.power > 0 && <> · {power(st.power)}</>}
              </div>
            </div>

            {st.machine && st.machine.slots > 0 && st.kind !== 'pump' && (
              <div className="module-col">
                <div className="sub-label">
                  Modules ({st.machine.slots} slot{st.machine.slots > 1 ? 's' : ''})
                </div>
                {st.moduleChoice === 'mixed' && (
                  <div className="choice-row muted small">
                    <SlotStrip st={st} /> mixed — pick one below to fill every slot
                  </div>
                )}
                <ModulePicker
                  value={st.moduleChoice}
                  options={st.moduleOptions}
                  onChange={(module) => setRow(st.id, { ...s.rows[st.id], module, modules: undefined })}
                  size={24}
                />
                <div className="sub-label">Beacons per machine</div>
                <div className="choice-row">
                  <input
                    type="number"
                    min={0}
                    max={16}
                    value={s.rows[st.id]?.beacons ?? s.beacons}
                    onChange={(e) => setRow(st.id, { ...s.rows[st.id], beacons: Math.max(0, +e.target.value || 0) })}
                  />
                  {st.beacons > 0 && <NamedIcon name={st.beaconModule} size={22} />}
                </div>
              </div>
            )}

            <div className="io-col">
              <IOList
                title="Needs"
                flows={st.inputs}
                s={s}
                belt={st.belt}
                where={(item) => {
                  const p = producersOf(item)
                  return p.length ? ['from ', ...p.map(link)] : []
                }}
              />
              <IOList
                title="Makes"
                flows={st.outputs}
                s={s}
                belt={st.belt}
                where={(item) => {
                  const c = consumersOf(item).map(link)
                  const target = result.targets.some((t) => t.item === item)
                  const extra = result.surplus.some((x) => x.item === item)
                  return [
                    ...(c.length ? ['to ', ...c] : []),
                    target ? (
                      <span key="out" className="tag good">
                        your output
                      </span>
                    ) : null,
                    extra ? (
                      <span key="ex" className="tag">
                        surplus
                      </span>
                    ) : null,
                  ]
                }}
              />
            </div>
          </div>
          <div className="step-foot">
            <BeltControls st={st} s={s} setRow={setRow} />
            {overridden && (
              <button className="btn small" onClick={() => setRow(st.id, null)}>
                Reset this step
              </button>
            )}
            {st.notes.map((n) => (
              <span key={n} className="muted">
                {n}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function IOList({
  title,
  flows,
  s,
  belt,
  where,
}: {
  title: string
  flows: { item: string; rate: number }[]
  s: Settings
  belt?: string
  where: (item: string) => React.ReactNode[]
}) {
  if (!flows.length) return null
  return (
    <div className="io">
      <div className="sub-label">{title}</div>
      {flows.map((f) => (
        <div key={f.item} className="io-row">
          <NamedIcon name={f.item} size={24} />
          <span className="io-name">{prettyName(f.item)}</span>
          <span className="io-rate">{rate(f.rate, s)}</span>
          {isFluid(f.item) ? (
            <span className="pipe-tag">pipe</span>
          ) : (
            <span className={beltTagClass(f.rate, s, belt)} title={`${prettyName(beltFor(s, belt).name)}s needed`}>
              <Icon icon={beltFor(s, belt).icon} size={18} />
              {fmt(beltsNeeded(f.rate, s, belt))}
            </span>
          )}
          <span className="io-where">{where(f.item)}</span>
        </div>
      ))}
    </div>
  )
}

function describeSource(src: string, st: Step): string {
  if (src === RAW) return 'Supplied from outside this build'
  if (src === MINE) return `Mined from ${prettyName(resourceByProduct[st.item]?.name || st.item)}`
  if (src === PUMP) return 'Pumped with offshore pumps'
  const r = game.recipes[src]
  return r && r.name !== st.item ? `Recipe: ${prettyName(r.name)}` : `${fmt(r?.time ?? 0)}s craft`
}

function SourcePreview({ item, src }: { item: string; src: string }) {
  if (src === RAW)
    return (
      <>
        <span className="arrow">⇢</span> <NamedIcon name={item} size={24} /> Bring it in on a belt (don't build it)
      </>
    )
  if (src === MINE)
    return (
      <>
        <NamedIcon name="electric-mining-drill" size={24} /> Mine it
      </>
    )
  if (src === PUMP)
    return (
      <>
        <NamedIcon name="offshore-pump" size={24} /> Offshore pump
      </>
    )
  const r = game.recipes[src]
  return (
    <>
      <span className="recipe-io">
        {r.in.map((i) => (
          <span key={i.name} className="amt">
            <NamedIcon name={i.name} size={22} />
            <sub>{fmt(i.amount)}</sub>
          </span>
        ))}
      </span>
      <span className="arrow">→</span>
      <span className="recipe-io">
        {r.out.map((o) => (
          <span key={o.name} className="amt">
            <NamedIcon name={o.name} size={22} />
            <sub>{fmt(o.amount)}</sub>
          </span>
        ))}
      </span>
      <span className="muted">{prettyName(r.name)}</span>
    </>
  )
}
