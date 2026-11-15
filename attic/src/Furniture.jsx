import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { CATALOG } from './furn'
import { makeWenge, makeOakLight, makeKnit, makeUpholstery, makeSheet, makeLeather, makeScreenOff, makeScreenOn } from './furnTextures'

/* ---------- материалы (создаются один раз) ---------- */

let cache
function M() {
  if (cache) return cache
  const std = (o) => new THREE.MeshStandardMaterial(o)
  cache = {
    wenge: std({ map: makeWenge(), roughness: 0.4, metalness: 0.04 }),
    oak: std({ map: makeOakLight(), roughness: 0.55 }),
    walnut: std({ map: makeWenge(), color: '#e0a47c', roughness: 0.42, metalness: 0.04 }),
    screenCase: std({ color: '#f1f1ee', roughness: 0.38, metalness: 0.15 }),
    screenFabric: new THREE.MeshStandardMaterial({ color: '#f3f3f0', roughness: 1, side: THREE.DoubleSide }),
    screenBorder: new THREE.MeshStandardMaterial({ color: '#111113', roughness: 0.9, side: THREE.DoubleSide }),
    steel: std({ color: '#c4c6c8', roughness: 0.28, metalness: 0.9 }),
    upholstery: std({ map: makeUpholstery(), roughness: 0.95 }),
    sheet: std({ map: makeSheet(), roughness: 0.92 }),
    pillow: std({ map: makeSheet(), color: '#e6dccb', roughness: 0.95 }),
    leather: std({ map: makeLeather(), roughness: 0.48, metalness: 0.02 }),
    plastic: std({ color: '#17171a', roughness: 0.5 }),
    tvBody: std({ color: '#0d0d0f', roughness: 0.4, metalness: 0.2 }),
    tvChin: std({ color: '#1b1c1f', roughness: 0.35, metalness: 0.5 }),
    knit: makeKnit(),
    screenOff: new THREE.MeshStandardMaterial({ map: makeScreenOff(), roughness: 0.08, metalness: 0.2 }),
    screenOn: new THREE.MeshBasicMaterial({ map: makeScreenOn(), toneMapped: false }),
  }
  return cache
}

/* ---------- примитивы ---------- */

// UV в метрах, волокна идут вдоль оси grain — так текстура не растягивается на больших гранях
function projectUV(geo, grain) {
  const pos = geo.attributes.position
  const nor = geo.attributes.normal
  const uv = geo.attributes.uv
  const ax = { x: 0, y: 1, z: 2 }
  const g = ax[grain]
  for (let i = 0; i < pos.count; i++) {
    const n = [Math.abs(nor.getX(i)), Math.abs(nor.getY(i)), Math.abs(nor.getZ(i))]
    const k = n.indexOf(Math.max(...n))
    const co = [pos.getX(i), pos.getY(i), pos.getZ(i)]
    const others = [0, 1, 2].filter((a) => a !== k)
    let u
    let v
    if (others.includes(g)) {
      u = co[g]
      v = co[others.find((a) => a !== g)]
    } else {
      u = co[others[0]]
      v = co[others[1]]
    }
    uv.setXY(i, u, v)
  }
  uv.needsUpdate = true
}

function Box({ s, p = [0, 0, 0], m, g = 'x', rot }) {
  const geo = useMemo(() => {
    const b = new THREE.BoxGeometry(...s)
    projectUV(b, g)
    return b
  }, [s[0], s[1], s[2], g])
  return <mesh geometry={geo} position={p} rotation={rot} material={m} castShadow receiveShadow />
}

const Soft = ({ s, p, m, r = 0.03, rot }) => (
  <RoundedBox args={s} radius={r} smoothness={3} position={p} rotation={rot} material={m} castShadow receiveShadow />
)

/* ---------- стол 168 × 80 × 78 ---------- */

function Desk({ item }) {
  const m = M()
  const [top, leg] = item.v === 1 ? [m.oak, m.wenge] : [m.wenge, m.oak]
  return (
    <group>
      <Box s={[1.68, 0.03, 0.8]} p={[0, 0.765, 0]} m={top} g="x" />
      {/* кромка столешницы в цвет опор */}
      <Box s={[1.68, 0.03, 0.012]} p={[0, 0.765, 0.394]} m={leg} g="x" />
      {[-1, 1].map((k) => (
        <Box key={k} s={[0.03, 0.735, 0.74]} p={[k * 0.825, 0.3675, -0.01]} m={leg} g="y" />
      ))}
      {/* задняя царга */}
      <Box s={[1.62, 0.34, 0.02]} p={[0, 0.58, -0.34]} m={leg} g="x" />
      {/* опорные бруски под столешницей */}
      <Box s={[1.62, 0.04, 0.04]} p={[0, 0.725, 0.3]} m={leg} g="x" />
    </group>
  )
}

/* ---------- экран для проектора DEXP WMD-120 (275 × 12, полотно 265 × 149) ---------- */

function Screen({ item }) {
  const m = M()
  const t = useRef(item.open ? 1 : 0)
  const fab = useRef()
  const bar = useRef()
  const Y = item.my ?? CATALOG.screen.mountY // высота оси тубуса
  const ang = item.ang || 0 // наклон ската, на котором висит экран
  const FH = 1.49 + 0.04 // полотно + нижняя чёрная кайма
  useFrame((_, dt) => {
    const target = item.open ? 1 : 0
    // полотно разматывается с постоянной скоростью (~2 с), в конце мягко тормозит
    const diff = target - t.current
    t.current += Math.sign(diff) * Math.min(Math.abs(diff), dt * 0.55 * (0.25 + Math.min(1, Math.abs(diff) * 3)))
    const k = Math.max(t.current, 0.0001)
    if (fab.current) {
      fab.current.visible = t.current > 0.01
      fab.current.scale.y = k
    }
    if (bar.current) bar.current.position.y = Y - 0.045 - FH * k - 0.015
  })
  return (
    <group>
      {/* корпус-тубус и торцы */}
      <mesh position={[0, Y, ang ? 0 : -0.015]} rotation={[0, 0, Math.PI / 2]} material={m.screenCase} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 2.75, 24]} />
      </mesh>
      {[-1, 1].map((k) => (
        <group key={k}>
          <mesh position={[k * 1.376, Y, ang ? 0 : -0.015]} rotation={[0, 0, Math.PI / 2]} material={m.screenCase}>
            <cylinderGeometry args={[0.042, 0.042, 0.012, 24]} />
          </mesh>
          {/* кронштейны: к стене — или под углом к скату */}
          {ang ? (
            <Box s={[0.05, 0.08, 0.025]} p={[k * 1.2, Y + Math.cos(ang) * 0.05, -Math.sin(ang) * 0.05]} m={m.screenCase} g="x" rot={[-ang, 0, 0]} />
          ) : (
            <Box s={[0.05, 0.08, 0.05]} p={[k * 1.2, Y + 0.005, -0.035]} m={m.screenCase} g="x" />
          )}
        </group>
      ))}
      {/* полотно: сматывается вверх, чёрная кайма по периметру, матовый белый винил */}
      <group ref={fab} position={[0, Y - 0.045, ang ? 0.04 : 0.01]} visible={item.open}>
        <mesh position={[0, -FH / 2, 0]} material={m.screenFabric} receiveShadow>
          <planeGeometry args={[2.65, FH]} />
        </mesh>
        {[-1, 1].map((k) => (
          <mesh key={k} position={[k * (1.325 + 0.04), -FH / 2, 0]} material={m.screenBorder}>
            <planeGeometry args={[0.08, FH]} />
          </mesh>
        ))}
        <mesh position={[0, -FH + 0.02, 0.001]} material={m.screenBorder}>
          <planeGeometry args={[2.65, 0.04]} />
        </mesh>
      </group>
      {/* утяжелитель с ручкой */}
      <group ref={bar} position={[0, Y - 0.06, ang ? 0.04 : 0.01]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={m.screenCase} castShadow>
          <cylinderGeometry args={[0.014, 0.014, 2.73, 14]} />
        </mesh>
        <mesh position={[0, -0.03, 0.005]} material={m.screenCase}>
          <sphereGeometry args={[0.014, 10, 8]} />
        </mesh>
      </group>
    </group>
  )
}

/* ---------- тёмный стол 170 × 75 × 80 (с фото кухни) ---------- */

function Table() {
  const m = M()
  const w = m.walnut
  return (
    <group>
      <Box s={[1.7, 0.035, 0.75]} p={[0, 0.7825, 0]} m={w} g="x" />
      {/* боковины-щиты по краям и сплошная задняя стенка */}
      {[-1, 1].map((k) => (
        <Box key={k} s={[0.03, 0.765, 0.7]} p={[k * 0.8, 0.3825, -0.01]} m={w} g="y" />
      ))}
      <Box s={[1.57, 0.4, 0.02]} p={[0, 0.58, -0.33]} m={w} g="x" />
      {/* средняя опора-щит */}
      <Box s={[0.03, 0.765, 0.7]} p={[0.15, 0.3825, -0.01]} m={w} g="y" />
      {/* царга спереди */}
      <Box s={[1.57, 0.06, 0.02]} p={[0, 0.735, 0.33]} m={w} g="x" />
    </group>
  )
}

/* ---------- комод 76 × 34 × 73 ---------- */

function Dresser({ item }) {
  const m = M()
  const [body, front] = item.v === 1 ? [m.oak, m.wenge] : [m.wenge, m.oak]
  const rows = 4
  const y0 = 0.07
  const hAll = 0.73 - 0.025 - y0
  const hF = hAll / rows
  return (
    <group>
      <Box s={[0.76, 0.025, 0.34]} p={[0, 0.7175, 0]} m={body} g="x" />
      {[-1, 1].map((k) => (
        <Box key={k} s={[0.022, 0.66, 0.34]} p={[k * 0.369, 0.4, 0]} m={body} g="y" />
      ))}
      <Box s={[0.72, 0.06, 0.3]} p={[0, 0.03, -0.01]} m={m.plastic} g="x" />
      <Box s={[0.72, 0.66, 0.012]} p={[0, 0.4, -0.164]} m={body} g="y" />
      {Array.from({ length: rows }, (_, i) => {
        const y = y0 + hF * (i + 0.5)
        return (
          <group key={i}>
            <Box s={[0.716, hF - 0.008, 0.02]} p={[0, y, 0.162]} m={front} g="x" />
            <Box s={[0.13, 0.01, 0.014]} p={[0, y + hF / 2 - 0.035, 0.18]} m={m.steel} g="x" />
          </group>
        )
      })}
    </group>
  )
}

/* ---------- кровать 210 × 200 × 50, спинка 110, серый плед ---------- */

function useBlanket() {
  return useMemo(() => {
    const g = new THREE.BoxGeometry(1.98, 0.05, 1.5, 44, 1, 36)
    const pos = g.attributes.position
    const r = (x, z, k) => Math.sin(x * 5.3 + k) * Math.cos(z * 4.1 - k * 0.7)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      if (pos.getY(i) > 0) {
        // небрежно сброшенный плед: складки и бугор ближе к изголовью
        const bump = 0.045 * Math.exp(-((z + 0.55) ** 2) / 0.18) * (0.6 + 0.4 * Math.sin(x * 2.2))
        pos.setY(i, 0.025 + 0.022 * r(x, z, 1) + 0.014 * r(x * 2.1, z * 1.7, 3) + bump)
      }
    }
    g.computeVertexNormals()
    const uv = g.attributes.uv
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i), pos.getZ(i))
    return g
  }, [])
}

function Bed({ item }) {
  const m = M()
  const blanketGeo = useBlanket()
  const blanket = useMemo(() => {
    const k = m.knit.clone()
    k.needsUpdate = true
    return new THREE.MeshStandardMaterial({ map: k, color: item.blanket || '#9b9a9c', roughness: 1 })
  }, [item.blanket])
  return (
    <group>
      {/* основание */}
      <Box s={[2.0, 0.3, 2.02]} p={[0, 0.15, 0.04]} m={m.upholstery} g="x" />
      {/* изголовье — высокая мягкая панель до 110 см */}
      <Soft s={[2.0, 1.1, 0.08]} p={[0, 0.55, -1.01]} m={m.upholstery} r={0.02} />
      {[-0.5, 0, 0.5].map((x) => (
        <Box key={x} s={[0.012, 0.8, 0.012]} p={[x * 1.6, 0.72, -0.965]} m={m.plastic} g="y" />
      ))}
      {/* матрас в белье */}
      <Soft s={[1.94, 0.2, 1.98]} p={[0, 0.4, 0.04]} m={m.sheet} r={0.04} />
      {/* заправленный серый плед: накрывает ноги и бока */}
      <mesh geometry={blanketGeo} position={[0, 0.5, 0.29]} material={blanket} castShadow receiveShadow />
      {[-1, 1].map((k) => (
        <Soft key={k} s={[0.05, 0.3, 1.5]} p={[k * 0.985, 0.38, 0.29]} m={blanket} r={0.02} />
      ))}
      <Soft s={[1.98, 0.3, 0.05]} p={[0, 0.37, 1.04]} m={blanket} r={0.02} />
      {/* отворот у подушек */}
      <mesh position={[0, 0.56, -0.5]} rotation={[0, 0, Math.PI / 2]} material={blanket} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 1.9, 18]} />
      </mesh>
      {/* подушки */}
      {[-0.5, 0.5].map((x, i) => (
        <Soft key={x} s={[0.62, 0.14, 0.42]} p={[x, 0.59, -0.76]} m={m.pillow} r={0.06} rot={[-0.18, i ? -0.05 : 0.04, 0]} />
      ))}
    </group>
  )
}

/* ---------- Mi TV 110 см (43″) ---------- */

function TV({ item }) {
  const m = M()
  const W = 0.97
  const H = 0.56
  const y0 = 0.07 // нижний край панели над поверхностью
  const cy = y0 + H / 2
  return (
    <group>
      {/* панель с тонкой рамкой */}
      <Box s={[W, H, 0.012]} p={[0, cy, 0.018]} m={m.tvBody} g="x" />
      <mesh position={[0, cy + 0.003, 0.0251]} material={item.on ? m.screenOn : m.screenOff}>
        <planeGeometry args={[0.959, 0.539]} />
      </mesh>
      {/* нижняя панель-«подбородок» */}
      <Box s={[W, 0.012, 0.014]} p={[0, y0 + 0.006, 0.018]} m={m.tvChin} g="x" />
      {/* задняя часть */}
      <Box s={[0.9, 0.46, 0.04]} p={[0, cy - 0.01, -0.014]} m={m.tvBody} g="x" />
      <Box s={[0.5, 0.3, 0.026]} p={[0, cy - 0.04, -0.045]} m={m.tvBody} g="x" />
      {/* ножки */}
      {[-1, 1].map((k) => (
        <group key={k}>
          <Box s={[0.045, y0 + 0.03, 0.025]} p={[k * 0.38, (y0 + 0.03) / 2, -0.01]} m={m.tvChin} g="y" />
          <Box s={[0.22, 0.012, 0.2]} p={[k * 0.38, 0.006, 0.0]} m={m.tvChin} g="x" />
        </group>
      ))}
    </group>
  )
}

/* ---------- кресло Cougar Armor S Royal ---------- */

function Chair({ item }) {
  const m = M()
  const accent = useMemo(() => new THREE.MeshStandardMaterial({ color: item.accent || '#c0407f', roughness: 0.55 }), [item.accent])
  const seatY = 0.5
  return (
    <group>
      {/* пятилучевая крестовина с роликами */}
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i * Math.PI * 2) / 5
        return (
          <group key={i} rotation={[0, a, 0]}>
            <mesh position={[0.17, 0.06, 0]} rotation={[0, 0, -0.1]} material={m.plastic} castShadow>
              <boxGeometry args={[0.34, 0.035, 0.055]} />
            </mesh>
            <mesh position={[0.32, 0.03, 0]} material={m.plastic} castShadow>
              <cylinderGeometry args={[0.03, 0.03, 0.04, 14]} />
            </mesh>
          </group>
        )
      })}
      <mesh position={[0, 0.09, 0]} material={m.plastic} castShadow>
        <cylinderGeometry args={[0.06, 0.07, 0.06, 20]} />
      </mesh>
      <mesh position={[0, 0.27, 0]} material={m.steel} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 0.3, 14]} />
      </mesh>
      <mesh position={[0, 0.4, 0]} material={m.plastic} castShadow>
        <cylinderGeometry args={[0.04, 0.05, 0.1, 16]} />
      </mesh>
      {/* сиденье: центр + боковые валики */}
      <Soft s={[0.5, 0.09, 0.5]} p={[0, seatY - 0.01, 0.03]} m={m.leather} r={0.035} />
      {[-1, 1].map((k) => (
        <Soft key={k} s={[0.09, 0.14, 0.5]} p={[k * 0.235, seatY + 0.01, 0.03]} m={m.leather} r={0.04} />
      ))}
      <Soft s={[0.012, 0.005, 0.46]} p={[-0.16, seatY + 0.037, 0.03]} m={accent} r={0.002} />
      <Soft s={[0.012, 0.005, 0.46]} p={[0.16, seatY + 0.037, 0.03]} m={accent} r={0.002} />
      {/* спинка с наклоном */}
      <group position={[0, seatY + 0.04, -0.23]} rotation={[-0.14, 0, 0]}>
        <Soft s={[0.46, 0.62, 0.1]} p={[0, 0.32, 0]} m={m.leather} r={0.04} />
        {[-1, 1].map((k) => (
          <Soft key={k} s={[0.1, 0.66, 0.15]} p={[k * 0.215, 0.34, 0.015]} m={m.leather} r={0.05} />
        ))}
        <Soft s={[0.5, 0.3, 0.1]} p={[0, 0.78, 0]} m={m.leather} r={0.05} />
        {[-1, 1].map((k) => (
          <Soft key={'s' + k} s={[0.1, 0.3, 0.14]} p={[k * 0.24, 0.78, 0.01]} m={m.leather} r={0.05} />
        ))}
        {/* акцентные вставки и строчка */}
        {[-0.07, 0.07].map((x) => (
          <Soft key={x} s={[0.014, 0.5, 0.006]} p={[x, 0.34, 0.054]} m={accent} r={0.002} />
        ))}
        <Soft s={[0.28, 0.14, 0.09]} p={[0, 0.98, 0.0]} m={m.leather} r={0.05} />
        <Soft s={[0.2, 0.012, 0.006]} p={[0, 0.98, 0.048]} m={accent} r={0.002} />
        <Soft s={[0.28, 0.12, 0.07]} p={[0, 0.2, 0.09]} m={m.leather} r={0.05} />
      </group>
      {/* подлокотники 4D */}
      {[-1, 1].map((k) => (
        <group key={k} position={[k * 0.305, 0, 0]}>
          <Box s={[0.035, 0.2, 0.06]} p={[0, seatY + 0.1, -0.05]} m={m.plastic} g="y" />
          <Soft s={[0.075, 0.035, 0.27]} p={[0, seatY + 0.215, 0.0]} m={m.leather} r={0.012} />
        </group>
      ))}
    </group>
  )
}

export function Model({ item }) {
  switch (item.type) {
    case 'desk': return <Desk item={item} />
    case 'table': return <Table />
    case 'screen': return <Screen item={item} />
    case 'dresser': return <Dresser item={item} />
    case 'bed': return <Bed item={item} />
    case 'tv': return <TV item={item} />
    case 'chair': return <Chair item={item} />
    default: return null
  }
}

export const defaultsOf = (type) => ({ ...(CATALOG[type].defaults || {}) })
