import type { CSSProperties } from 'react'
import { game, prettyName, type Icon as IconT } from '../game'

const BASE = import.meta.env.BASE_URL

/**
 * Factorio icons are mipmapped strips (64px icon followed by 32/16/8 px copies),
 * so we scale to the requested height and only show the left-most square.
 */
function Layer({ src, size, style, tint }: { src: string; size: number; style?: CSSProperties; tint?: string }) {
  const url = BASE + src
  if (tint) {
    // Tinted mask layers (barrels etc.) – paint the colour through the image alpha.
    return (
      <span
        className="icon-layer"
        style={{
          ...style,
          width: size,
          height: size,
          backgroundColor: tint,
          WebkitMaskImage: `url(${url})`,
          maskImage: `url(${url})`,
          WebkitMaskSize: 'auto 100%',
          maskSize: 'auto 100%',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
        }}
      />
    )
  }
  return (
    <img className="icon-layer" src={url} alt="" draggable={false} style={{ ...style, width: size, height: size }} />
  )
}

export function Icon({ icon, size = 32, title }: { icon: IconT; size?: number; title?: string }) {
  if (!icon) return <span className="icon icon-missing" style={{ width: size, height: size }} title={title} />
  if (typeof icon === 'string') {
    return (
      <span className="icon" style={{ width: size, height: size }} title={title}>
        <Layer src={icon} size={size} />
      </span>
    )
  }
  const unit = icon[0].w
  return (
    <span className="icon" style={{ width: size, height: size }} title={title}>
      {icon.map((l, i) => {
        const s = (l.w / unit) * size
        const px = size / unit
        const left = (size - s) / 2 + (l.sh ? l.sh[0] * px : 0)
        const top = (size - s) / 2 + (l.sh ? l.sh[1] * px : 0)
        return <Layer key={i} src={l.s} size={s} tint={l.t} style={{ position: 'absolute', left, top }} />
      })}
    </span>
  )
}

/** Icon for any named thing: item, fluid, machine, drill, module, belt, planet. */
export function iconOf(name: string): IconT {
  return (
    game.items[name]?.icon ??
    game.machines[name]?.icon ??
    game.drills[name]?.icon ??
    game.planets.find((p) => p.name === name)?.icon ??
    (name === game.offshore.name ? game.offshore.icon : null)
  )
}

export function NamedIcon({ name, size = 32, title }: { name: string; size?: number; title?: string }) {
  return <Icon icon={iconOf(name)} size={size} title={title ?? prettyName(name)} />
}
