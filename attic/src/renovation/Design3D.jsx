// Дизайн-проект финального этапа: шторы (интерактивные, как двери) и LED-лента COB 3000 K — основной свет кабинета.
// Мебели здесь нет: всё, что стоит в комнате (в том числе ковёр), ставится через редактор.
import * as THREE from 'three'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'

RectAreaLightUniformsLib.init()

export const LED_COLOR = '#ffb36b' // 3000 K

/** высота внутренней отделки в точке x по контуру сечения sec (стена → скат → потолок → скат → стена) */
function ceilYOf(sec, x) {
  if (x <= sec[1][0]) return sec[1][1]
  if (x >= sec[4][0]) return sec[4][1]
  if (x <= sec[2][0]) return sec[1][1] + ((x - sec[1][0]) / (sec[2][0] - sec[1][0] || 1e-9)) * (sec[2][1] - sec[1][1])
  if (x <= sec[3][0]) return sec[2][1]
  return sec[3][1] + ((x - sec[3][0]) / (sec[4][0] - sec[3][0] || 1e-9)) * (sec[4][1] - sec[3][1])
}

/* ---------- шторы ---------- */

function CurtainPanel({ side, xo, wc, h, y0, open, mat }) {
  const g = useRef()
  const t = useRef(open ? 1 : 0)
  const geo = useMemo(() => {
    const gm = new THREE.PlaneGeometry(wc, h, Math.max(24, Math.round(wc / 0.012)), 1)
    const pos = gm.attributes.position
    const lam = 0.13 // шаг складки
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      // складки чуть расходятся книзу, как у драпировки
      pos.setZ(i, 0.034 * Math.sin((x / lam) * Math.PI * 2 + (y / h) * 0.9))
    }
    gm.computeVertexNormals()
    return gm
  }, [wc, h])
  useFrame((_, dt) => {
    const target = open ? 1 : 0
    const diff = target - t.current
    t.current += Math.sign(diff) * Math.min(Math.abs(diff), dt * 0.8)
    if (g.current) g.current.scale.x = 1 - 0.76 * t.current
  })
  // якорь у внешнего края; полотно раскрывается к центру окна
  return (
    <group ref={g} position={[side * xo, 0, 0]}>
      <mesh geometry={geo} position={[-side * wc / 2, y0 + h / 2, 0]} material={mat} castShadow receiveShadow />
    </group>
  )
}

function Curtains({ sec, d, Tw, open }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8d8174', roughness: 0.95, side: THREE.DoubleSide }), [])
  const rod = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3a2a22', roughness: 0.4, metalness: 0.3 }), [])
  // ширина по обе стороны окна ограничена скатом: карниз должен проходить под отделкой
  const wantX = d.winW / 2 + 0.28
  const topAt = (x) => ceilYOf(sec, x) - 0.1
  let xo = wantX
  while (xo > d.winW / 2 + 0.05 && topAt(xo) < d.winSill + d.winH + 0.12) xo -= 0.02
  const rodY = Math.min(2.3, topAt(xo))
  const z = Tw + 0.1
  const y0 = 0.03
  const h = rodY - y0 - 0.02
  const wc = xo + 0.06 // полотно от внешнего края чуть за центр: в закрытом виде панели перекрываются
  return (
    <group position={[0, 0, z]}>
      <mesh position={[0, rodY, 0]} rotation={[0, 0, Math.PI / 2]} material={rod} castShadow>
        <cylinderGeometry args={[0.013, 0.013, 2 * xo + 0.1, 14]} />
      </mesh>
      {[-1, 1].map((k) => (
        <group key={k}>
          <mesh position={[k * (xo + 0.06), rodY, 0]} material={rod}>
            <sphereGeometry args={[0.024, 14, 10]} />
          </mesh>
          <mesh position={[k * (xo - 0.02), rodY, -0.05]} rotation={[Math.PI / 2, 0, 0]} material={rod}>
            <cylinderGeometry args={[0.006, 0.006, 0.1, 8]} />
          </mesh>
          <CurtainPanel side={k} xo={xo} wc={wc} h={h} y0={y0} open={open} mat={mat} />
        </group>
      ))}
    </group>
  )
}

/* ---------- LED-лента ---------- */

// RectAreaLight смотрит вдоль −Z и растянут по X: ставим X вдоль комнаты (ось z мира), −Z — по направлению света
function AreaStrip({ pos, dir, len, height, intensity }) {
  const ref = useRef()
  useLayoutEffect(() => {
    const zAxis = new THREE.Vector3(...dir, 0).setZ(0).normalize().negate() // −направление света
    const xAxis = new THREE.Vector3(0, 0, 1)
    const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize()
    const m = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis)
    ref.current.quaternion.setFromRotationMatrix(m)
  }, [dir])
  return <rectAreaLight ref={ref} position={pos} width={len} height={height} intensity={intensity} color={LED_COLOR} />
}

function Leds({ sec, z0, z1, level, day }) {
  const len = z1 - z0
  const zc = (z0 + z1) / 2
  const k = (level / 100) * (day ? 0.35 : 1)
  const glow = useMemo(() => new THREE.MeshBasicMaterial({ color: LED_COLOR, toneMapped: false }), [])
  const base = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3a2a22', roughness: 0.6 }), [])
  const strips = useMemo(() => {
    const out = []
    const mk = (a, b, side, kind) => {
      // a — угол, b — второй конец ската; u — вдоль ската от угла; n — внутренняя нормаль ската
      const u = new THREE.Vector2(b[0] - a[0], b[1] - a[1]).normalize()
      const n = new THREE.Vector2(-u.y, u.x)
      if (n.x * (0 - a[0]) + n.y * (1.0 - a[1]) < 0) n.negate() // нормаль внутрь комнаты (к её середине)
      const p = [a[0] + u.x * 0.04 + n.x * 0.006, a[1] + u.y * 0.04 + n.y * 0.006]
      // свет идёт вдоль ската (скользящий), немного в комнату: подчёркивает фактуру вагонки
      const dir = new THREE.Vector2(u.x * 0.75 + n.x * 0.55, u.y * 0.75 + n.y * 0.55).normalize()
      out.push({ k: kind + side, p, n, u, dir })
    }
    // верхняя лента у потолка светит вниз по скату, нижняя — у колена, вверх по скату
    mk(sec[2], sec[1], -1, 'top')
    mk(sec[3], sec[4], 1, 'top')
    mk(sec[1], sec[2], -1, 'low')
    mk(sec[4], sec[3], 1, 'low')
    return out
  }, [sec])
  return (
    <group>
      {strips.map((s) => {
        const rot = Math.atan2(s.u.y, s.u.x)
        return (
          <group key={s.k}>
            {/* профиль-короб ленты и сама лента (COB — сплошная линия без точек) */}
            <mesh position={[s.p[0] - s.n.x * 0.001, s.p[1] - s.n.y * 0.001, zc]} rotation={[0, 0, rot]} material={base}>
              <boxGeometry args={[0.02, 0.012, len]} />
            </mesh>
            <mesh position={[s.p[0] + s.n.x * 0.0045, s.p[1] + s.n.y * 0.0045, zc]} rotation={[0, 0, rot]} material={glow}>
              <boxGeometry args={[0.012, 0.003, len - 0.02]} />
            </mesh>
            <AreaStrip pos={[s.p[0] + s.n.x * 0.02, s.p[1] + s.n.y * 0.02, zc]} dir={[s.dir.x, s.dir.y]} len={len} height={0.07} intensity={9 * k} />
          </group>
        )
      })}
    </group>
  )
}

export default function Design3D({ model, cfg, curtainOpen, day }) {
  const d = model.d
  const sec = model.dims.section
  const Tw = model.thick.windowWall
  const Td = model.thick.doorWall
  const z0 = Tw + 0.03
  const z1 = d.L - Td - 0.03
  const ds = cfg.design
  return (
    <group>
      {ds.curtains && model.enabled.windowWall && <Curtains sec={sec} d={d} Tw={Tw} open={curtainOpen} />}
      {ds.led && z1 > z0 && <Leds sec={sec} z0={z0} z1={z1} level={ds.ledLevel} day={day} />}
    </group>
  )
}
