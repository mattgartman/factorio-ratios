import { game, prettyName } from '../game'
import { beltFor, beltsNeeded, fmt, isFluid, rate, beltTagClass, rowsFor } from '../format'
import type { Result, Settings, Step } from '../solver'
import { Icon, NamedIcon } from './Icon'
import { itemColor } from './FlowDiagram'

/**
 * Tree view: each output, then what it's made from, then what *that* is made from…
 * Shared steps are split proportionally, so every branch shows how much of that step it uses.
 */
export function ChainView({
  result,
  s,
  stepNumber,
  onSelect,
}: {
  result: Result
  s: Settings
  stepNumber: Map<string, number>
  onSelect: (id: string) => void
}) {
  const producerOf = (item: string): Step | undefined =>
    result.steps.find((st) => st.item === item) || result.steps.find((st) => st.outputs.some((o) => o.item === item))

  const renderItem = (item: string, perSec: number, path: Set<string>, depth: number): React.ReactNode => {
    const st = producerOf(item)
    const out = st?.outputs.find((o) => o.item === item)
    const share = st && out && out.rate > 0 ? perSec / out.rate : 0
    const loop = st && path.has(st.id)
    const children = st && !loop && st.kind !== 'raw' ? st.inputs : []
    const nextPath = st ? new Set(path).add(st.id) : path
    const whole = Math.ceil((st?.count ?? 0) - 1e-6)
    const partial = st ? st.count * share : 0
    const shared = st && st.kind !== 'raw' && share < 0.999

    const row = (
      <div className="chain-row" style={{ borderLeftColor: itemColor(item) }}>
        {st && (
          <button className="node-num" title="Show in build guide" onClick={() => onSelect(st.id)}>
            {stepNumber.get(st.id)}
          </button>
        )}
        <NamedIcon name={item} size={30} />
        <div className="chain-main">
          <div>
            <b>{prettyName(item)}</b> <span className="io-rate">{rate(perSec, s)}</span>{' '}
            {isFluid(item) ? (
              <span className="pipe-tag">pipe</span>
            ) : (
              <span className={beltTagClass(perSec, s, st?.belt)}>
                <Icon icon={beltFor(s, st?.belt).icon} size={14} />
                {fmt(beltsNeeded(perSec, s, st?.belt))}
              </span>
            )}
          </div>
          <div className="chain-how">
            {!st || st.kind === 'raw' ? (
              <span className="muted">bring it in from outside</span>
            ) : (
              <>
                <NamedIcon name={st.kind === 'pump' ? game.offshore.name : st.machine?.name || ''} size={20} />
                <span>
                  {shared ? (
                    <>
                      {fmt(partial)} of the <b>{whole}</b>
                    </>
                  ) : (
                    <b>{whole}</b>
                  )}{' '}
                  × {prettyName(st.kind === 'pump' ? game.offshore.name : st.machine?.name || '')}
                </span>
                {st.moduleList.length > 0 && (
                  <span className="node-mods">
                    {st.moduleList.map((m, i) => (
                      <NamedIcon key={i} name={m} size={14} />
                    ))}
                  </span>
                )}
                {rowsFor(st, s).rows > 1 && <span className="tag bad">{rowsFor(st, s).rows} rows (belt full)</span>}
                {shared && <span className="tag">shared with other lines</span>}
                {loop && <span className="tag">loops back</span>}
              </>
            )}
          </div>
        </div>
      </div>
    )

    if (!children.length) return <div className="chain-leaf">{row}</div>
    return (
      <details className="chain-node" open={depth < 6}>
        <summary>{row}</summary>
        <div className="chain-children">
          <div className="chain-from">made from</div>
          {children.map((c) => (
            <div className="chain-child" key={c.item}>
              {renderItem(c.item, c.rate * share, nextPath, depth + 1)}
            </div>
          ))}
        </div>
      </details>
    )
  }

  return (
    <div className="chain inset">
      {result.targets.map((t) => (
        <div key={t.item} className="chain-root">
          {renderItem(t.item, t.rate, new Set(), 0)}
        </div>
      ))}
    </div>
  )
}
