import { game, prettyName } from '../game'
import { PRESETS } from '../presets'
import type { Settings } from '../solver'
import { Icon, NamedIcon } from './Icon'

const MACHINE_GROUPS: { label: string; names: string[] }[] = [
  { label: 'Assemblers', names: ['assembling-machine-1', 'assembling-machine-2', 'assembling-machine-3'] },
  { label: 'Furnaces', names: ['stone-furnace', 'steel-furnace', 'electric-furnace'] },
  {
    label: 'Space Age',
    names: ['foundry', 'electromagnetic-plant', 'biochamber', 'cryogenic-plant', 'crusher', 'captive-biter-spawner'],
  },
  { label: 'Chemistry & other', names: ['oil-refinery', 'chemical-plant', 'centrifuge', 'rocket-silo'] },
]

export const RATE_MODULES = game.modules.filter((m) => m.cat !== 'quality')

export function ModulePicker({
  value,
  onChange,
  options = RATE_MODULES.map((m) => m.name),
  size = 28,
}: {
  value: string
  onChange: (v: string) => void
  options?: string[]
  size?: number
}) {
  return (
    <div className="choice-row">
      <button
        className={'slot' + (value === 'none' ? ' selected' : '')}
        onClick={() => onChange('none')}
        title="No modules"
      >
        <span className="none-mark" style={{ width: size, height: size }}>
          ∅
        </span>
      </button>
      {options
        .filter((n) => RATE_MODULES.some((m) => m.name === n))
        .map((n) => (
          <button
            key={n}
            className={'slot' + (value === n ? ' selected' : '')}
            onClick={() => onChange(n)}
            title={prettyName(n)}
          >
            <Icon icon={game.modules.find((m) => m.name === n)!.icon} size={size} />
          </button>
        ))}
    </div>
  )
}

export function BeltPicker({
  value,
  onChange,
  size = 28,
}: {
  value: string
  onChange: (v: string) => void
  size?: number
}) {
  return (
    <div className="choice-row">
      {game.belts.map((b) => (
        <button
          key={b.name}
          className={'slot' + (value === b.name ? ' selected' : '')}
          onClick={() => onChange(b.name)}
          title={`${prettyName(b.name)} – ${b.rate}/s`}
        >
          <Icon icon={b.icon} size={size} />
        </button>
      ))}
    </div>
  )
}

export function SettingsPanel({ s, set }: { s: Settings; set: (p: Partial<Settings>) => void }) {
  const toggleMachine = (name: string) =>
    set({ machines: s.machines.includes(name) ? s.machines.filter((m) => m !== name) : [...s.machines, name] })

  return (
    <aside className="panel settings">
      <div className="panel-title">Your factory</div>

      <section>
        <h3>Planet</h3>
        <div className="choice-row">
          {[...game.planets]
            .sort((a, b) => a.order.localeCompare(b.order))
            .map((p) => (
              <button
                key={p.name}
                className={'slot planet' + (s.planet === p.name ? ' selected' : '')}
                onClick={() => set({ planet: p.name })}
                title={prettyName(p.name)}
              >
                <Icon icon={p.icon} size={30} />
              </button>
            ))}
        </div>
        <div className="hint">{prettyName(s.planet)} — picks local resources & recipes</div>
      </section>

      <section>
        <h3>Quick setup</h3>
        <div className="preset-grid">
          {PRESETS.map((p) => (
            <button key={p.id} className="btn preset" onClick={() => set(p.apply)} title={p.blurb}>
              {p.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>Machines I have</h3>
        <div className="hint">The fastest one you've ticked is used. Change any single step below.</div>
        {MACHINE_GROUPS.map((g) => (
          <div key={g.label} className="machine-group">
            <div className="sub-label">{g.label}</div>
            <div className="choice-row">
              {g.names
                .filter((n) => game.machines[n])
                .map((n) => (
                  <button
                    key={n}
                    className={'slot' + (s.machines.includes(n) ? ' selected' : ' off')}
                    onClick={() => toggleMachine(n)}
                    title={`${prettyName(n)} (speed ${game.machines[n].speed}, ${game.machines[n].slots} module slots)`}
                  >
                    <NamedIcon name={n} size={30} />
                  </button>
                ))}
            </div>
          </div>
        ))}
      </section>

      <section>
        <h3>Mining drill</h3>
        <div className="choice-row">
          {Object.values(game.drills)
            .filter((d) => d.cats.includes('basic-solid'))
            .map((d) => (
              <button
                key={d.name}
                className={'slot' + (s.drill === d.name ? ' selected' : '')}
                onClick={() => set({ drill: d.name })}
                title={prettyName(d.name)}
              >
                <Icon icon={d.icon} size={30} />
              </button>
            ))}
        </div>
      </section>

      <section>
        <h3>Belts</h3>
        <BeltPicker value={s.belt} onChange={(belt) => set({ belt })} size={30} />
        <label className="inline">
          Items stacked per belt slot
          <select value={s.beltStack} onChange={(e) => set({ beltStack: +e.target.value })}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? '1 (normal)' : n}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section>
        <h3>Default modules</h3>
        <div className="sub-label">In machines</div>
        <ModulePicker value={s.module} onChange={(module) => set({ module })} />
        <div className="sub-label">In mining drills</div>
        <ModulePicker value={s.drillModule} onChange={(drillModule) => set({ drillModule })} />
        <div className="hint">Productivity is skipped automatically where the game doesn't allow it.</div>
      </section>

      <section>
        <h3>Beacons</h3>
        <label className="inline">
          Beacons touching each machine
          <input
            type="number"
            min={0}
            max={16}
            value={s.beacons}
            onChange={(e) => set({ beacons: Math.max(0, Math.min(16, +e.target.value || 0)) })}
          />
        </label>
        <ModulePicker
          value={s.beaconModule}
          onChange={(beaconModule) => set({ beaconModule })}
          options={RATE_MODULES.filter((m) => m.cat !== 'productivity').map((m) => m.name)}
        />
      </section>

      <section>
        <h3>Research</h3>
        <label className="inline">
          Mining productivity bonus
          <span>
            <input
              type="number"
              min={0}
              step={10}
              value={s.miningProd}
              onChange={(e) => set({ miningProd: Math.max(0, +e.target.value || 0) })}
            />
            %
          </span>
        </label>
      </section>
    </aside>
  )
}
