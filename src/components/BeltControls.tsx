import { beltByName, game, prettyName } from '../game'
import { beltFor, beltLoad, fmt, rowsFor, smallestFittingBelt, usesBelts } from '../format'
import type { RowOverride, Settings, Step } from '../solver'
import { Icon } from './Icon'

/** Belt choice for one group of machines, with how full it gets and how many rows that means. */
export function BeltControls({
  st,
  s,
  setRow,
  compact,
}: {
  st: Step
  s: Settings
  setRow: (id: string, patch: RowOverride | null) => void
  compact?: boolean
}) {
  if (!usesBelts(st)) return null
  const current = beltFor(s, st.belt).name
  const load = beltLoad(st, s)
  const { rows, perRow } = rowsFor(st, s)
  const fit = smallestFittingBelt(st, s)
  const setBelt = (belt: string) => setRow(st.id, { ...s.rows[st.id], belt })
  const size = compact ? 16 : 20
  const machineWord = st.kind === 'raw' ? 'belts' : st.kind === 'mine' ? 'drills' : 'machines'

  return (
    <div
      className={'belt-controls' + (compact ? ' compact' : '') + (rows > 1 ? ' over' : '')}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="belt-line">
        <span className="belt-label">Belt</span>
        {game.belts.map((b) => {
          const l = beltLoad(st, s, b.name)
          return (
            <button
              key={b.name}
              className={'slot belt-choice' + (current === b.name ? ' selected' : '')}
              onClick={() => setBelt(b.name)}
              title={`${prettyName(b.name)} — would be ${fmt(l * 100, 0)}% full${l > 1 ? ` (${Math.ceil(l - 1e-9)} rows)` : ''}`}
            >
              <Icon icon={b.icon} size={size} />
            </button>
          )
        })}
        <span className={'load-meter' + (load > 1 ? ' bad' : load > 0.9 ? ' tight' : '')} title="Fullest belt in this group">
          <span className="load-fill" style={{ width: `${Math.min(100, load * 100)}%` }} />
          <span className="load-text">{fmt(load * 100, 0)}%</span>
        </span>
      </div>
      {rows > 1 && st.kind !== 'raw' && (
        <div className="rows-warning">
          ⚠ More than one {prettyName(current).toLowerCase()} → build <b>{rows} rows</b> of {perRow} {machineWord}, each with
          its own belt
          {fit && fit !== current && (
            <button className="btn small fix-btn" onClick={() => setBelt(fit)}>
              <Icon icon={beltByName[fit].icon} size={14} /> Use {prettyName(fit).toLowerCase()} (1 row)
            </button>
          )}
        </div>
      )}
      {rows > 1 && st.kind === 'raw' && (
        <div className="rows-warning">
          ⚠ Needs <b>{rows}</b> {prettyName(current).toLowerCase()}s coming in
          {fit && fit !== current && (
            <button className="btn small fix-btn" onClick={() => setBelt(fit)}>
              <Icon icon={beltByName[fit].icon} size={14} /> Use {prettyName(fit).toLowerCase()}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Steps whose belts are over 100%. */
export function overflowing(steps: Step[], s: Settings): Step[] {
  return steps.filter((st) => usesBelts(st) && beltLoad(st, s) > 1 + 1e-9)
}

/** Upgrade every overflowing step to the cheapest belt that fits (or the fastest belt if none does). */
export function fixAllBelts(steps: Step[], s: Settings, setRow: (id: string, patch: RowOverride | null) => void) {
  const fastest = game.belts[game.belts.length - 1].name
  for (const st of overflowing(steps, s)) {
    setRow(st.id, { ...s.rows[st.id], belt: smallestFittingBelt(st, s) ?? fastest })
  }
}
