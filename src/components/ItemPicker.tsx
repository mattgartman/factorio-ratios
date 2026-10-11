import { useEffect, useMemo, useRef, useState } from 'react'
import { itemsByGroup, prettyName } from '../game'
import { Icon } from './Icon'

const GROUPS = itemsByGroup()

export function ItemPicker({ onPick, onClose }: { onPick: (item: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState(GROUPS.findIndex((g) => g.group.name === 'intermediate-products'))
  const [q, setQ] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const matches = useMemo(() => {
    if (!q.trim()) return null
    const needle = q.toLowerCase()
    return GROUPS.flatMap((g) => g.subs.flat()).filter((i) => prettyName(i.name).toLowerCase().includes(needle))
  }, [q])

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="panel picker" onMouseDown={(e) => e.stopPropagation()}>
        <div className="panel-title">
          <span>What do you want to make?</span>
          <button className="btn small" onClick={onClose}>
            ✕
          </button>
        </div>
        <input
          ref={input}
          className="search"
          placeholder="Search… (e.g. circuit, gear, science)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches?.length) onPick(matches[0].name)
          }}
        />
        {!matches && (
          <div className="group-tabs">
            {GROUPS.map((g, i) => (
              <button
                key={g.group.name}
                className={'group-tab' + (i === tab ? ' active' : '')}
                onClick={() => setTab(i)}
                title={prettyName(g.group.name)}
              >
                <Icon icon={g.group.icon} size={56} />
              </button>
            ))}
          </div>
        )}
        <div className="picker-grid inset">
          {matches ? (
            <div className="picker-row">
              {matches.map((i) => (
                <button key={i.name} className="slot" onClick={() => onPick(i.name)} title={prettyName(i.name)}>
                  <Icon icon={i.icon} size={32} />
                </button>
              ))}
              {!matches.length && <div className="muted pad">Nothing matches “{q}”.</div>}
            </div>
          ) : (
            GROUPS[tab].subs.map((sub, si) => (
              <div className="picker-row" key={si}>
                {sub.map((i) => (
                  <button key={i.name} className="slot" onClick={() => onPick(i.name)} title={prettyName(i.name)}>
                    <Icon icon={i.icon} size={32} />
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
