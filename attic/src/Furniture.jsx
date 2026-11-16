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
    printerWhite: std({ color: '#e9e8e3', roughness: 0.45 }),
    printerLid: std({ color: '#cfcfca', roughness: 0.4 }),
    paper: std({ color: '#fafaf8', roughness: 0.9 }),
    grille: std({ color: '#0e0e10', roughness: 0.9 }),
    cone: std({ color: '#26262a', roughness: 0.7 }),
    rubber: std({ color: '#050506', roughness: 1 }),
    cherry: std({ map: makeOakLight(), color: '#9c5a3a', roughness: 0.42, metalness: 0.03 }),
    cherryDark: std({ map: makeOakLight(), color: '#5e2d1c', roughness: 0.5 }),
    brass: std({ color: '#b8923d', roughness: 0.3, metalness: 0.85 }),
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

/* ---------- тумба 50 × 40 × 60: три ящика, вишня, латунные ручки (по фото) ---------- */

function Nightstand() {
  const m = M()
  const W = 0.5
  const D = 0.4
  const H = 0.6
  const t = 0.02 // толщина корпусных щитов
  const topT = 0.025
  const base = 0.02 // цоколь
  const frontZ = D / 2
  // три ящика: верхний ниже остальных, как на фото
  const rows = [
    { h: 0.15, handle: 'knob' },
    { h: 0.2, handle: 'bow' },
    { h: 0.2, handle: 'bow' },
  ]
  const innerH = H - topT - base
  const gap = 0.006
  const totalRows = rows.reduce((s, r) => s + r.h, 0)
  const scale = (innerH - gap * (rows.length + 1)) / totalRows
  let y = base + gap
  const fronts = [...rows].reverse().map((r) => {
    const h = r.h * scale
    const cy = y + h / 2
    y += h + gap
    return { ...r, h, cy }
  })
  return (
    <group>
      {/* столешница с небольшим свесом спереди */}
      <Box s={[W, topT, D]} p={[0, H - topT / 2, 0]} m={m.cherry} g="x" />
      <Box s={[W + 0.012, 0.008, D + 0.012]} p={[0, H - topT - 0.004, 0.0]} m={m.cherry} g="x" />
      {/* боковины, задняя стенка, дно */}
      {[-1, 1].map((k) => (
        <Box key={k} s={[t, H - topT - base, D - 0.01]} p={[k * (W / 2 - t / 2), base + (H - topT - base) / 2, -0.005]} m={m.cherry} g="y" />
      ))}
      <Box s={[W - 2 * t, H - topT - base, 0.01]} p={[0, base + (H - topT - base) / 2, -D / 2 + 0.005]} m={m.cherryDark} g="y" />
      <Box s={[W - 2 * t, 0.015, D - 0.02]} p={[0, base + 0.0075, 0]} m={m.cherry} g="x" />
      {/* цоколь */}
      <Box s={[W - 0.02, base, D - 0.04]} p={[0, base / 2, -0.01]} m={m.cherryDark} g="x" />
      {/* фасады ящиков с филёнкой по периметру */}
      {fronts.map((f, i) => (
        <group key={i} position={[0, f.cy, frontZ - 0.01]}>
          <Box s={[W - 2 * t - 0.004, f.h, 0.02]} p={[0, 0, 0]} m={m.cherry} g="x" />
          {/* рамка-филёнка: приподнятый прямоугольник в центре */}
          <Box s={[W - 2 * t - 0.05, f.h - 0.045, 0.008]} p={[0, 0, 0.012]} m={m.cherry} g="x" />
          <Box s={[W - 2 * t - 0.05, 0.004, 0.012]} p={[0, (f.h - 0.045) / 2, 0.012]} m={m.cherryDark} g="x" />
          <Box s={[W - 2 * t - 0.05, 0.004, 0.012]} p={[0, -(f.h - 0.045) / 2, 0.012]} m={m.cherryDark} g="x" />
          {f.handle === 'knob' ? (
            <group position={[0, 0.0, 0.025]}>
              <mesh rotation={[Math.PI / 2, 0, 0]} material={m.brass} castShadow>
                <cylinderGeometry args={[0.013, 0.013, 0.012, 16]} />
              </mesh>
              <mesh position={[0, 0, 0.004]} material={m.brass}>
                <sphereGeometry args={[0.012, 12, 8]} />
              </mesh>
            </group>
          ) : (
            <group position={[0, f.h * 0.1, 0.02]}>
              {/* дужка и две стойки */}
              <mesh position={[0, 0, 0.012]} rotation={[0, 0, Math.PI / 2]} material={m.brass} castShadow>
                <cylinderGeometry args={[0.004, 0.004, 0.1, 10]} />
              </mesh>
              {[-1, 1].map((k) => (
                <mesh key={k} position={[k * 0.048, 0, 0.005]} rotation={[Math.PI / 2, 0, 0]} material={m.brass}>
                  <cylinderGeometry args={[0.004, 0.004, 0.016, 8]} />
                </mesh>
              ))}
            </group>
          )}
        </group>
      ))}
    </group>
  )
}

/* ---------- ковёр 200 × 140: короткий ворс ---------- */

function Rug({ item }) {
  const m = M()
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: m.knit, color: item.c || '#b8ad9c', roughness: 1 }), [item.c])
  return (
    <group>
      <Soft s={[2.0, 0.016, 1.4]} p={[0, 0.009, 0]} m={mat} r={0.006} />
      {/* окантовка тоном темнее */}
      <Soft s={[1.9, 0.004, 1.3]} p={[0, 0.0185, 0]} m={mat} r={0.002} />
    </group>
  )
}

/* ---------- МФУ Brother DCP-15xx: 385 × 340 × 255 мм ---------- */

function Printer() {
  const m = M()
  const W = 0.385
  const D = 0.34
  const H = 0.255
  const lowH = 0.135 // белый корпус
  const fz = D / 2
  return (
    <group>
      {/* белый корпус */}
      <Soft s={[W, lowH, D]} p={[0, lowH / 2 + 0.004, 0]} m={m.printerWhite} r={0.012} />
      {/* чёрная средняя часть: приёмный лоток и панель */}
      <Box s={[W, 0.05, D - 0.02]} p={[0, lowH + 0.029, -0.005]} m={m.plastic} g="x" />
      <Box s={[W - 0.03, 0.03, 0.01]} p={[0, lowH + 0.022, fz - 0.002]} m={m.tvChin} g="x" />
      {/* крышка сканера */}
      <Soft s={[W - 0.01, 0.055, D - 0.02]} p={[0, lowH + 0.082, -0.005]} m={m.printerLid} r={0.01} />
      <Box s={[0.1, 0.004, 0.06]} p={[0.08, lowH + 0.112, 0.06]} m={m.tvChin} g="x" />
      {/* выдвинутый лоток с бумагой */}
      <Box s={[0.22, 0.008, 0.09]} p={[0, 0.034, fz + 0.03]} m={m.printerWhite} g="x" />
      <Box s={[0.2, 0.022, 0.08]} p={[0, 0.049, fz + 0.03]} m={m.paper} g="x" />
      <Box s={[0.07, 0.012, 0.02]} p={[0, 0.04, fz + 0.075]} m={m.plastic} g="x" />
      {/* ножки */}
      {[-1, 1].flatMap((a) => [-1, 1].map((b) => (
        <Box key={a + '_' + b} s={[0.03, 0.004, 0.03]} p={[a * (W / 2 - 0.03), 0.002, b * (D / 2 - 0.03)]} m={m.rubber} g="x" />
      )))}
    </group>
  )
}

/* ---------- Leem SPA-15: 485 × 400 × 755 мм ---------- */

function Speaker() {
  const m = M()
  const W = 0.485
  const D = 0.4
  const H = 0.755
  const fz = D / 2 // плоскость решётки спереди
  return (
    <group>
      {/* корпус */}
      <Soft s={[W, H, D]} p={[0, H / 2, 0]} m={m.plastic} r={0.018} />
      {/* лицевая решётка с вырезом под НЧ и рупор */}
      <Box s={[W - 0.03, H - 0.04, 0.012]} p={[0, H / 2, fz + 0.002]} m={m.grille} g="x" />
      {/* НЧ-динамик 15″: диффузор и пылезащитный колпак */}
      <group position={[0, 0.27, fz + 0.012]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={m.plastic}>
          <cylinderGeometry args={[0.2, 0.2, 0.006, 40]} />
        </mesh>
        <mesh position={[0, 0, 0.004]} rotation={[Math.PI / 2, 0, 0]} material={m.cone}>
          <cylinderGeometry args={[0.17, 0.12, 0.012, 40]} />
        </mesh>
        <mesh position={[0, 0, 0.012]} material={m.plastic}>
          <sphereGeometry args={[0.04, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
      </group>
      {/* ВЧ-рупор */}
      <Box s={[0.32, 0.17, 0.02]} p={[0, 0.62, fz + 0.014]} m={m.plastic} g="x" />
      <mesh position={[0, 0.62, fz + 0.028]} rotation={[Math.PI / 2, 0, 0]} material={m.cone}>
        <cylinderGeometry args={[0.05, 0.02, 0.012, 20]} />
      </mesh>
      {/* фазоинвертор */}
      <mesh position={[0, 0.05, fz + 0.012]} rotation={[Math.PI / 2, 0, 0]} material={m.plastic}>
        <cylinderGeometry args={[0.02, 0.02, 0.01, 16]} />
      </mesh>
      {/* ручки по бокам и логотип-планка */}
      {[-1, 1].map((k) => (
        <Box key={k} s={[0.012, 0.03, 0.14]} p={[k * (W / 2 + 0.004), 0.55, 0]} m={m.steel} g="x" />
      ))}
      <Box s={[0.08, 0.012, 0.004]} p={[0, 0.7, fz + 0.016]} m={m.steel} g="x" />
      {/* ножки */}
      {[-1, 1].flatMap((a) => [-1, 1].map((b) => (
        <Box key={a + '_' + b} s={[0.03, 0.01, 0.03]} p={[a * (W / 2 - 0.04), 0.005, b * (D / 2 - 0.04)]} m={m.rubber} g="x" />
      )))}
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
    case 'nightstand': return <Nightstand />
    case 'speaker': return <Speaker />
    case 'printer': return <Printer />
    case 'rug': return <Rug item={item} />
    case 'bed': return <Bed item={item} />
    case 'tv': return <TV item={item} />
    case 'chair': return <Chair item={item} />
    default: return null
  }
}

export const defaultsOf = (type) => ({ ...(CATALOG[type].defaults || {}) })
