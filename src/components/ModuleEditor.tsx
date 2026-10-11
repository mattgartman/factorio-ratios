import { useState } from 'react'
import { game, moduleByName, prettyName } from '../game'
import { fmt } from '../format'
import type { RowOverride, Settings, Step } from '../solver'
import { Icon, NamedIcon } from './Icon'
import { RATE_MODULES } from './SettingsPanel'

const BEACON_MODULES = RATE_MODULES.filter((m) => m.cat !== 'productivity').map((m) => m.name)

/** Compact module slots shown on a flow-chart box. */
export function SlotStrip({ st, size = 18 }: { st: Step; size?: number }) {
  return (
    <span className="slot-strip">
      {st.slots.map((m, i) =>
        m === 'none' ? (
          <span key={i} className="empty-slot" style={{ width: size + 2, height: size + 2 }} />
        ) : (
          <span key={i} className="filled-slot">
            <NamedIcon name={m} size={size} />
          </span>
        ),
      )}
      {st.beacons > 0 && (
        <span className="beacon-tag">
          +{st.beacons}
          <Icon icon={game.beacons[0]?.icon} size={size - 2} />
        </span>
      )}
    </span>
  )
}

/** "saves 2 vs no modules (6)" */
export function ModuleSavings({ st }: { st: Step }) {
  const need = Math.ceil(st.count - 1e-6)
  const plain = Math.ceil(st.baseCount - 1e-6)
  if (plain === need) return null
  return (
    <div className={'node-saved' + (plain > need ? ' good-text' : ' warn')}>
      {plain > need ? `saves ${plain - need}` : `${need - plain} extra`} vs no modules ({plain})
    </div>
  )
}

/** Inline editor: fill all slots, set individual slots, and beacons — for one group of machines. */
export function ModuleEditor({
  st,
  s,
  setRow,
  onClose,
}: {
  st: Step
  s: Settings
  setRow: (id: string, patch: RowOverride | null) => void
  onClose: () => void
}) {
  const [slot, setSlot] = useState<number | null>(null)
  const row = s.rows[st.id] || {}
  const options = st.moduleOptions.filter((n) => RATE_MODULES.some((m) => m.name === n))
  const beacons = row.beacons ?? s.beacons
  const bMod = row.beaconModule ?? s.beaconModule

  const fillAll = (module: string) => setRow(st.id, { ...row, module, modules: undefined })
  const setOne = (i: number, module: string) => {
    const modules = [...st.slots]
    modules[i] = module
    setRow(st.id, { ...row, modules })
  }
  const saved = Math.ceil(st.baseCount - 1e-6) - Math.ceil(st.count - 1e-6)

  return (
    <div className="module-editor" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <div className="me-head">
        <span>Modules for this group</span>
        <button className="node-details" onClick={onClose} title="Close">
          ✕
        </button>
      </div>

      <div className="me-label">Slots — click one to set it alone</div>
      <div className="choice-row">
        {st.slots.map((m, i) => (
          <button
            key={i}
            className={'slot' + (slot === i ? ' selected' : '')}
            onClick={() => setSlot(slot === i ? null : i)}
            title={m === 'none' ? 'Empty slot' : prettyName(m)}
          >
            {m === 'none' ? (
              <span className="none-mark" style={{ width: 22, height: 22 }} />
            ) : (
              <NamedIcon name={m} size={22} />
            )}
          </button>
        ))}
      </div>

      <div className="me-label">{slot === null ? 'Fill every slot with' : `Put in slot ${slot + 1}`}</div>
      <div className="choice-row">
        <button
          className={'slot' + ((slot === null ? st.moduleChoice : st.slots[slot]) === 'none' ? ' selected' : '')}
          onClick={() => (slot === null ? fillAll('none') : setOne(slot, 'none'))}
          title="Empty"
        >
          <span className="none-mark" style={{ width: 22, height: 22 }}>
            ∅
          </span>
        </button>
        {options.map((n) => (
          <button
            key={n}
            className={'slot' + ((slot === null ? st.moduleChoice : st.slots[slot]) === n ? ' selected' : '')}
            onClick={() => (slot === null ? fillAll(n) : setOne(slot, n))}
            title={prettyName(n)}
          >
            <Icon icon={moduleByName[n].icon} size={22} />
          </button>
        ))}
      </div>

      <div className="me-label">Beacons around each machine</div>
      <div className="choice-row">
        <button className="btn small" onClick={() => setRow(st.id, { ...row, beacons: Math.max(0, beacons - 1) })}>
          −
        </button>
        <span className="me-count">{beacons}</span>
        <button className="btn small" onClick={() => setRow(st.id, { ...row, beacons: Math.min(16, beacons + 1) })}>
          +
        </button>
        {beacons > 0 &&
          BEACON_MODULES.map((n) => (
            <button
              key={n}
              className={'slot' + (bMod === n ? ' selected' : '')}
              onClick={() => setRow(st.id, { ...row, beaconModule: n })}
              title={`${prettyName(n)} ×2 in each beacon`}
            >
              <Icon icon={moduleByName[n].icon} size={18} />
            </button>
          ))}
      </div>

      <div className="me-result">
        <b>{Math.ceil(st.count - 1e-6)}</b> machines needed
        {saved > 0 && <span className="good-text"> — {saved} fewer than with no modules</span>}
        {saved < 0 && <span className="warn"> — {-saved} more than with no modules</span>}
        <div className="muted small">
          Speed {fmt(st.speed, 3)}
          {st.productivity > 0 && <> · +{fmt(st.productivity * 100, 0)}% productivity (less input needed upstream)</>}
        </div>
      </div>

      {s.rows[st.id] && (
        <button className="link small" onClick={() => setRow(st.id, null)}>
          Reset this group to defaults
        </button>
      )}
    </div>
  )
}
