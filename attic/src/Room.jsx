import * as THREE from 'three'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshReflectorMaterial, Mask, useMask, Line, Html } from '@react-three/drei'
import { makeLaminate, makePaint, makeForest } from './textures'
import { fmt, K, roomZones, zoneAt } from './params'
import { quad, wallX } from './geom'
import Hatch from './Hatch'
import Radiator from './Radiator'
import Extension from './Extension'
import Exterior from './Exterior'

/* ---------- геометрия ---------- */

// Торцевая стена (профиль мансарды) с проёмом окна или двери
function gableShape(d, { window, doorX }) {
  const { W, kH, cH, cW } = d
  const s = new THREE.Shape()
  s.moveTo(-W / 2, 0)
  if (doorX !== undefined) {
    const l = doorX - d.doorW / 2
    const r = doorX + d.doorW / 2
    s.lineTo(l, 0)
    s.lineTo(l, d.doorH)
    s.lineTo(r, d.doorH)
    s.lineTo(r, 0)
  }
  s.lineTo(W / 2, 0)
  s.lineTo(W / 2, kH)
  s.lineTo(cW / 2, cH)
  s.lineTo(-cW / 2, cH)
  s.lineTo(-W / 2, kH)
  s.closePath()
  if (window) {
    const h = new THREE.Path()
    const x0 = -d.winW / 2
    const x1 = d.winW / 2
    const y0 = d.winSill
    const y1 = d.winSill + d.winH
    h.moveTo(x0, y0)
    h.lineTo(x0, y1)
    h.lineTo(x1, y1)
    h.lineTo(x1, y0)
    h.closePath()
    s.holes.push(h)
  }
  return new THREE.ShapeGeometry(s)
}

const HL = '#3fd3a2'

function Paint({ map, color, active }) {
  return <meshStandardMaterial map={map} color={color} roughness={0.93} metalness={0} emissive={active ? HL : '#000000'} emissiveIntensity={active ? 0.35 : 0} />
}

/* ---------- окно ---------- */

function WindowUnit({ d, mode, maskId = 1 }) {
  const { winW: w, winH: h, winSill: s, winSections: n } = d
  const D = 0.16 // толщина стены в откосе
  const pvc = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f4f5f2', roughness: 0.38 }), [])
  const metal = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e9e9e9', roughness: 0.25, metalness: 0.4 }), [])
  const glass = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d6e6f2', roughness: 0.05, transparent: true, opacity: 0.14, depthWrite: false }), [])
  const forest = useMemo(() => makeForest(), [])
  const stencil = useMask(maskId)

  const B = ({ p, sz, m = pvc }) => (
    <mesh position={p} material={m} castShadow receiveShadow>
      <boxGeometry args={sz} />
    </mesh>
  )

  const p = 0.065 // профиль рамы
  const m = 0.07 // импост
  const q = 0.055 // створка
  const fz = -D + 0.05
  const sw = (w - 2 * p - (n - 1) * m) / n
  const sections = Array.from({ length: n }, (_, i) => {
    const xa = -w / 2 + p + i * (sw + m)
    return { xa, xb: xa + sw }
  })
  const ih = h - 2 * p

  return (
    <group>
      {/* откосы и подоконник */}
      <B p={[-w / 2 - 0.01, s + h / 2, -D / 2]} sz={[0.02, h, D]} />
      <B p={[w / 2 + 0.01, s + h / 2, -D / 2]} sz={[0.02, h, D]} />
      <B p={[0, s + h + 0.01, -D / 2]} sz={[w + 0.04, 0.02, D]} />
      <B p={[0, s - 0.0125, (0.17 - D) / 2]} sz={[w + 0.14, 0.025, D + 0.17]} />
      {/* рама */}
      <B p={[0, s + h - p / 2, fz]} sz={[w, p, 0.07]} />
      <B p={[0, s + p / 2, fz]} sz={[w, p, 0.07]} />
      <B p={[-w / 2 + p / 2, s + h / 2, fz]} sz={[p, ih, 0.07]} />
      <B p={[w / 2 - p / 2, s + h / 2, fz]} sz={[p, ih, 0.07]} />
      {sections.slice(1).map(({ xa }, i) => (
        <B key={'m' + i} p={[xa - m / 2, s + h / 2, fz]} sz={[m, ih, 0.07]} />
      ))}
      {/* створки и стёкла */}
      {sections.map(({ xa, xb }, i) => {
        const cx = (xa + xb) / 2
        const cy = s + h / 2
        return (
          <group key={'s' + i}>
            <B p={[cx, s + h - p - q / 2, fz + 0.012]} sz={[sw, q, 0.06]} />
            <B p={[cx, s + p + q / 2, fz + 0.012]} sz={[sw, q, 0.06]} />
            <B p={[xa + q / 2, cy, fz + 0.012]} sz={[q, ih - 2 * q, 0.06]} />
            <B p={[xb - q / 2, cy, fz + 0.012]} sz={[q, ih - 2 * q, 0.06]} />
            <mesh position={[cx, cy, fz]} material={glass}>
              <planeGeometry args={[sw - 2 * q, ih - 2 * q]} />
            </mesh>
            {i < n - 1 && <B p={[xb - q / 2, cy, fz + 0.06]} sz={[0.022, 0.13, 0.03]} m={metal} />}
          </group>
        )
      })}
      {/* вид за окном показывается только сквозь проём */}
      <Mask id={maskId} position={[0, s + h / 2, -D - 0.01]}>
        <planeGeometry args={[w, h]} />
      </Mask>
      <mesh position={[0, 1.4, -3.5]} renderOrder={2}>
        <planeGeometry args={[14, 7]} />
        <meshBasicMaterial map={forest} color={mode === 'day' ? '#ffffff' : '#56668c'} toneMapped={false} {...stencil} />
      </mesh>
    </group>
  )
}

/* ---------- дверь ---------- */

function DoorUnit({ d, open }) {
  const { doorW: w, doorH: h, doorX: x, L } = d
  const D = K.doorWallT
  const wood = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e8e3da', roughness: 0.55 }), [])
  const frame = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f1eee8', roughness: 0.5 }), [])
  const metal = useMemo(() => new THREE.MeshStandardMaterial({ color: '#b9b9b9', roughness: 0.25, metalness: 0.85 }), [])
  const B = ({ p, sz, m = frame }) => (
    <mesh position={p} material={m} castShadow receiveShadow>
      <boxGeometry args={sz} />
    </mesh>
  )
  const zc = L + D / 2
  const leaf = useRef()
  const ang = useRef(open ? 1.45 : 0)
  useFrame((_, dt) => {
    ang.current += ((open ? 1.45 : 0) - ang.current) * Math.min(1, dt * 5)
    if (leaf.current) leaf.current.rotation.y = ang.current
  })
  const lw = w - 0.065
  const hx = x - w / 2 + 0.0325 // ось петель
  return (
    <group>
      {/* коробка */}
      <B p={[x - w / 2 + 0.015, h / 2, zc]} sz={[0.03, h, D]} />
      <B p={[x + w / 2 - 0.015, h / 2, zc]} sz={[0.03, h, D]} />
      <B p={[x, h - 0.015, zc]} sz={[w, 0.03, D]} />
      {/* полотно на петлях, открывается в кабинет */}
      <group ref={leaf} position={[hx, 0, zc - 0.02]}>
        <B p={[lw / 2, (h - 0.035) / 2 + 0.005, 0]} sz={[lw, h - 0.04, 0.04]} m={wood} />
        {[-1, 1].map((k) => (
          <group key={k}>
            <mesh position={[lw - 0.09, 1.0, k * 0.025]} rotation={[Math.PI / 2, 0, 0]} material={metal}>
              <cylinderGeometry args={[0.025, 0.025, 0.01, 24]} />
            </mesh>
            <B p={[lw - 0.13, 1.0, k * 0.05]} sz={[0.12, 0.018, 0.018]} m={metal} />
          </group>
        ))}
      </group>
      {/* наличники с обеих сторон стены */}
      {[L - 0.006, L + D + 0.006].map((z) => (
        <group key={z}>
          <B p={[x - w / 2 - 0.02, (h + 0.06) / 2, z]} sz={[0.07, h + 0.06, 0.012]} />
          <B p={[x + w / 2 + 0.02, (h + 0.06) / 2, z]} sz={[0.07, h + 0.06, 0.012]} />
          <B p={[x, h + 0.025, z]} sz={[w + 0.14, 0.07, 0.012]} />
        </group>
      ))}
    </group>
  )
}

/* ---------- свет ---------- */

function Lights({ d, mode, cut }) {
  const day = mode === 'day'
  const dl = useRef()
  useLayoutEffect(() => {
    dl.current.target.position.set(0, 0.3, d.zG * 0.5)
    dl.current.target.updateMatrixWorld()
  }, [d.zG])
  // точечные светильники: в кабинете и в спальне отдельно
  const row = (z0, len) => {
    const n = Math.max(2, Math.round(len / 1.25))
    return Array.from({ length: n }, (_, i) => z0 + (len * (i + 0.5)) / n)
  }
  const zs = [...(cut ? [] : row(0, d.L)), ...row(d.L + K.doorWallT, d.L2 - K.doorWallT), ...row(d.zG, d.L3)]
  return (
    <>
      <ambientLight color={day ? '#fbf8f3' : '#9aa6c4'} intensity={day ? 1.25 : 0.18} />
      <hemisphereLight args={[day ? '#eef3fb' : '#7a89ad', day ? '#d8cfc2' : '#2d2723', day ? 0.7 : 0.15]} />
      <directionalLight
        ref={dl}
        castShadow
        position={[1.4, 4.0, -4.2]}
        color={day ? '#f2f6ff' : '#8197cf'}
        intensity={day ? 3.4 : 0.55}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-camera-near={0.5}
        shadow-camera-far={34}
      />
      {zs.map((z) => (
        <group key={z}>
          <mesh position={[0, d.cH - 0.003, z]} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.045, 0.066, 40]} />
            <meshStandardMaterial color="#cfcfcf" metalness={0.7} roughness={0.25} />
          </mesh>
          <mesh position={[0, d.cH - 0.004, z]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.045, 40]} />
            <meshBasicMaterial color={day ? '#dcdcdc' : '#fff4df'} toneMapped={false} />
          </mesh>
          {!day && <pointLight position={[0, d.cH - 0.12, z]} color="#ffe4c4" intensity={1.5} decay={2} />}
        </group>
      ))}
    </>
  )
}

/* ---------- размеры ---------- */

function Dim({ a, b, text, color = '#ffb547' }) {
  const mid = a.map((v, i) => (v + b[i]) / 2)
  return (
    <group>
      <Line points={[a, b]} color={color} lineWidth={1.6} depthTest={false} renderOrder={10} />
      {[a, b].map((p, i) => (
        <mesh key={i} position={p} renderOrder={10}>
          <sphereGeometry args={[0.018, 12, 8]} />
          <meshBasicMaterial color={color} depthTest={false} />
        </mesh>
      ))}
      <Html position={mid} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div className="dim" style={{ borderColor: color }}>
          {text}
        </div>
      </Html>
    </group>
  )
}

function Dimensions({ d, doorWall, utility }) {
  const { L, W, kH, cH, cW, winW, winH, winSill, doorW, doorH, doorX, zG, xC, zC, xS, zS, xE } = d
  const z = 0.03
  const nx = d.rise / d.slant
  const ny = -d.run / d.slant
  const o = 0.07
  const xh = cW / 2 > winW / 2 + 0.06 ? (cW / 2 + winW / 2) / 2 : Math.max(cW / 2 - 0.06, 0)
  const win = '#6fd3ff'
  const ext = '#c99bff'
  return (
    <group>
      <Dim a={[-W / 2 + 0.12, 0.012, 0]} b={[-W / 2 + 0.12, 0.012, L]} text={`${fmt(L)} м`} />
      <Dim a={[(xC + xS) / 2, 0.012, L]} b={[(xC + xS) / 2, 0.012, zG]} text={`${fmt(d.L2)} м до купе`} color={ext} />
      <Dim a={[-W / 2, 0.012, 0.25]} b={[W / 2, 0.012, 0.25]} text={`${fmt(W)} м`} />
      <Dim a={[-W / 2 + 0.05, 0, z]} b={[-W / 2 + 0.05, kH, z]} text={`${fmt(kH)}`} />
      <Dim a={[-W / 2 + nx * o, kH + ny * o, z]} b={[-cW / 2 + nx * o, cH + ny * o, z]} text={`${fmt(d.slant)} · ${d.angle.toFixed(0)}°`} />
      <Dim a={[-cW / 2, cH - 0.05, z]} b={[cW / 2, cH - 0.05, z]} text={`${fmt(cW)}`} />
      <Dim a={[xh, 0, z]} b={[xh, cH, z]} text={`h ${fmt(cH)}`} />
      <Dim a={[-winW / 2, winSill - 0.07, 0.2]} b={[winW / 2, winSill - 0.07, 0.2]} text={`окно ${fmt(winW)} × ${fmt(winH)}`} color={win} />
      <Dim a={[-winW / 2 + 0.3, 0, 0.2]} b={[-winW / 2 + 0.3, winSill, 0.2]} text={fmt(winSill)} color={win} />
      {doorWall && (
        <>
          <Dim a={[doorX - doorW / 2, doorH + 0.14, L - 0.03]} b={[doorX + doorW / 2, doorH + 0.14, L - 0.03]} text={`дверь ${fmt(doorW)}`} color={win} />
          <Dim a={[doorX - doorW / 2 - 0.13, 0, L - 0.03]} b={[doorX - doorW / 2 - 0.13, doorH, L - 0.03]} text={fmt(doorH)} color={win} />
        </>
      )}
      <Dim a={[(xC + xS) / 2, 0.012, zG]} b={[(xC + xS) / 2, 0.012, d.zEnd]} text={`${fmt(d.L3)} м кухня`} color={ext} />
      <Dim a={[-winW / 2, winSill - 0.07, d.zEnd - 0.2]} b={[winW / 2, winSill - 0.07, d.zEnd - 0.2]} text={`окно ${fmt(winW)} × ${fmt(winH)}`} color={win} />
      <Dim a={[-W / 2, 0.012, zC - 0.12]} b={[xC, 0.012, zC - 0.12]} text={`санузел ${fmt(d.cabW)}`} color={ext} />
      <Dim a={[-W / 2 + 0.1, 0.012, zC]} b={[-W / 2 + 0.1, 0.012, zG]} text={fmt(d.cabP)} color={ext} />
      <Dim a={[xS, 1.08, zS - 0.03]} b={[W / 2, 1.08, zS - 0.03]} text={`лестница ${fmt(d.stL)}`} color={ext} />
      <Dim a={[xS - 0.08, 0.012, zS]} b={[xS - 0.08, 0.012, zG]} text={fmt(d.stW)} color={ext} />
      {utility && (
        <>
          <Dim a={[W / 2, 0.012, 0.4]} b={[xE, 0.012, 0.4]} text={`подсобка ${fmt(d.utilDepth)}`} color="#9fd27a" />
          <Dim a={[-W / 2, 0.012, 0.4]} b={[-xE, 0.012, 0.4]} text={`подсобка ${fmt(d.utilDepth)}`} color="#9fd27a" />
        </>
      )}
    </group>
  )
}

/* ---------- подсветка зоны при наведении ---------- */

function ZoneOverlay({ d, hl, withWall }) {
  const [type, zoneKey] = hl && hl.includes(':') ? hl.split(':') : [null, null]
  const parts = useMemo(() => {
    if (!type) return null
    const z = roomZones(d, withWall).find((q) => q.key === zoneKey)
    if (!z) return null
    const { W, kH, cH, cW, xS, zS, zG } = d
    const zc = (z.z0 + z.z1) / 2
    const c = new THREE.Vector3(0, cH / 2, zc)
    const out = []
    if (type === 'floor') {
      // пол зоны; в зале и в объединённой зоне вырезан проём лестницы
      const notch = z.z1 > zS && z.z0 < zG
      const pts = notch
        ? [[-W / 2, -z.z0], [W / 2, -z.z0], [W / 2, -zS], [xS, -zS], [xS, -Math.min(z.z1, zG)], [-W / 2, -Math.min(z.z1, zG)]]
        : [[-W / 2, -z.z0], [W / 2, -z.z0], [W / 2, -z.z1], [-W / 2, -z.z1]]
      out.push({ g: new THREE.ShapeGeometry(new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])))), floor: true })
    } else if (type === 'knee') {
      for (const s of [-1, 1]) out.push({ g: quad([[s * W / 2, 0, z.z0], [s * W / 2, 0, z.z1], [s * W / 2, kH, z.z1], [s * W / 2, kH, z.z0]], c) })
    } else if (type === 'slope') {
      for (const s of [-1, 1]) out.push({ g: quad([[s * W / 2, kH, z.z0], [s * W / 2, kH, z.z1], [s * cW / 2, cH, z.z1], [s * cW / 2, cH, z.z0]], c) })
    } else if (type === 'ceiling') {
      out.push({ g: quad([[-cW / 2, cH - 0.004, z.z0], [cW / 2, cH - 0.004, z.z0], [cW / 2, cH - 0.004, z.z1], [-cW / 2, cH - 0.004, z.z1]], c) })
    }
    return out
  }, [d, hl, withWall])
  if (!parts) return null
  return (
    <group renderOrder={8}>
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.g} rotation={p.floor ? [-Math.PI / 2, 0, 0] : [0, 0, 0]} position={p.floor ? [0, 0.006, 0] : [0, 0, 0]}>
          <meshBasicMaterial color={HL} transparent opacity={0.42} side={THREE.DoubleSide} depthWrite={false} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

/* ---------- комната ---------- */

export default function Room({ d, colors, floorKey, mode, gloss, showDims, hl, setHl, view }) {
  const { L, W, kH, cH, cW, zEnd, zG } = d
  const { doorWall, doorOpen, slideOpen, cabOpen, hatchOpen, roof, utility, facade, interactive, ceilCut, radHide } = view
  const paintA = useMemo(() => makePaint(3), [])
  const paintB = useMemo(() => makePaint(11), [])
  const floorTex = useMemo(() => makeLaminate(floorKey), [floorKey])

  const geoms = useMemo(() => {
    const center = new THREE.Vector3(0, cH / 2, zEnd / 2)
    // пол на всю длину с вырезом под лестницу; контур в координатах (x, −z), затем поворот в горизонталь
    const f = new THREE.Shape()
    f.moveTo(-W / 2, 0)
    f.lineTo(W / 2, 0)
    f.lineTo(W / 2, -d.zS)
    f.lineTo(d.xS, -d.zS)
    f.lineTo(d.xS, -d.zG)
    f.lineTo(W / 2, -d.zG)
    f.lineTo(W / 2, -zEnd)
    f.lineTo(-W / 2, -zEnd)
    f.closePath()
    return {
      floor: new THREE.ShapeGeometry(f),
      kneeL: wallX(-W / 2, 0, zG, kH, utility ? { z0: d.hz0, z1: d.hz1, y0: d.hatchY, y1: d.hatchY + d.hatchH } : null, 1),
      kneeR: quad([[W / 2, 0, 0], [W / 2, 0, zG], [W / 2, kH, zG], [W / 2, kH, 0]], center),
      slopeL: quad([[-W / 2, kH, 0], [-W / 2, kH, zG], [-cW / 2, cH, zG], [-cW / 2, cH, 0]], center),
      slopeR: quad([[W / 2, kH, 0], [W / 2, kH, zG], [cW / 2, cH, zG], [cW / 2, cH, 0]], center),
      // кухня — отдельные плоскости со своим цветом
      backKneeL: quad([[-W / 2, 0, zG], [-W / 2, 0, zEnd], [-W / 2, kH, zEnd], [-W / 2, kH, zG]], center),
      backKneeR: quad([[W / 2, 0, zG], [W / 2, 0, zEnd], [W / 2, kH, zEnd], [W / 2, kH, zG]], center),
      backSlopeL: quad([[-W / 2, kH, zG], [-W / 2, kH, zEnd], [-cW / 2, cH, zEnd], [-cW / 2, cH, zG]], center),
      backSlopeR: quad([[W / 2, kH, zG], [W / 2, kH, zEnd], [cW / 2, cH, zEnd], [cW / 2, cH, zG]], center),
      windowWall: gableShape(d, { window: true }),
      // сторона кабинета повёрнута на 180°, поэтому ось X у неё зеркальна
      doorWall: gableShape(d, { doorX: -d.doorX }),
      doorWallBack: gableShape(d, { doorX: d.doorX }),
      endWall: gableShape(d, { window: true }),
    }
  }, [d, utility])

  // при ремонте натяжной потолок кабинета снимается — остаётся только над спальней и кухней
  const zStart = ceilCut ? d.L + K.doorWallT : 0
  const winRef = useRef()
  const win2Ref = useRef()
  // без фасада окна прячутся вместе со стеной, когда камера смотрит на неё снаружи
  useFrame(({ camera }) => {
    if (winRef.current) winRef.current.visible = facade || camera.position.z > -0.05
    if (win2Ref.current) win2Ref.current.visible = facade || camera.position.z < zEnd + 0.05
  })

  // перекрытия и пол подсвечиваются по зонам (кабинет / зал / кухня): зона берётся по точке наведения
  const ZONED = ['knee', 'slope', 'ceiling', 'floor']
  const ev = (k) =>
    interactive
      ? {
          onPointerOver: (e) => {
            e.stopPropagation()
            setHl(ZONED.includes(k) ? `${k}:${zoneAt(d, !!doorWall, e.point.z)}` : k)
          },
          onPointerMove: ZONED.includes(k)
            ? (e) => {
                e.stopPropagation()
                const key = `${k}:${zoneAt(d, !!doorWall, e.point.z)}`
                setHl((h) => (h === key ? h : key))
              }
            : undefined,
          onPointerOut: () => setHl((h) => (h === k || (h && h.startsWith(k + ':')) ? null : h)),
        }
      : {}

  return (
    <group>
      <Lights d={d} mode={mode} cut={ceilCut} />
      <ZoneOverlay d={d} hl={hl} withWall={!!doorWall} />

      <mesh geometry={geoms.floor} rotation={[-Math.PI / 2, 0, 0]} receiveShadow {...ev('floor')}>
        <meshStandardMaterial map={floorTex} roughness={0.48} metalness={0} emissive="#000" emissiveIntensity={0} />
      </mesh>

      {['kneeL', 'kneeR'].map((k) => (
        <mesh key={k} geometry={geoms[k]} castShadow receiveShadow {...ev('knee')}>
          <Paint map={paintA} color={colors.knee} active={false} />
        </mesh>
      ))}
      {['slopeL', 'slopeR'].map((k) => (
        <mesh key={k} geometry={geoms[k]} castShadow receiveShadow {...ev('slope')}>
          <Paint map={paintB} color={colors.slope} active={false} />
        </mesh>
      ))}

      <mesh geometry={geoms.windowWall} castShadow receiveShadow {...ev('windowWall')}>
        <Paint map={paintA} color={colors.windowWall} active={hl === 'windowWall'} />
      </mesh>
      {doorWall && (
        <>
          <mesh geometry={geoms.doorWall} position={[0, 0, L]} rotation={[0, Math.PI, 0]} castShadow receiveShadow {...ev('doorWall')}>
            <Paint map={paintB} color={colors.doorWall} active={hl === 'doorWall'} />
          </mesh>
          <mesh geometry={geoms.doorWallBack} position={[0, 0, L + K.doorWallT]} castShadow receiveShadow {...ev('doorWall')}>
            <Paint map={paintB} color={colors.doorWall} active={hl === 'doorWall'} />
          </mesh>
          <DoorUnit d={d} open={doorOpen} />
        </>
      )}

      {/* натяжной потолок: глянец с отражением, по всей длине */}
      <mesh position={[0, cH, (zEnd + zStart) / 2]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow {...ev('ceiling')}>
        <planeGeometry args={[cW, zEnd - zStart]} />
        {gloss ? (
          <MeshReflectorMaterial
            resolution={1024}
            blur={[60, 30]}
            mixBlur={0.5}
            mixStrength={0.55}
            mirror={0.35}
            roughness={0.06}
            metalness={0.05}
            depthScale={0}
            color={colors.ceiling}
            emissive="#000"
            emissiveIntensity={0}
          />
        ) : (
          <meshStandardMaterial color={colors.ceiling} roughness={0.75} />
        )}
      </mesh>

      <group ref={winRef}>
        <WindowUnit d={d} mode={mode} />
        {!radHide && <Radiator />}
      </group>

      {/* кухня: боковые и косые перекрытия, торец с таким же окном */}
      {['backKneeL', 'backKneeR', 'backSlopeL', 'backSlopeR'].map((k) => (
        <mesh key={k} geometry={geoms[k]} castShadow receiveShadow {...ev(k.includes('Knee') ? 'knee' : 'slope')}>
          <Paint map={k.includes('Knee') ? paintA : paintB} color={colors.backRoom} />
        </mesh>
      ))}
      <mesh geometry={geoms.endWall} position={[0, 0, zEnd]} rotation={[0, Math.PI, 0]} castShadow receiveShadow>
        <Paint map={paintA} color={colors.backRoom} />
      </mesh>
      <group ref={win2Ref} position={[0, 0, zEnd]} rotation={[0, Math.PI, 0]}>
        <WindowUnit d={d} mode={mode} maskId={2} />
        <Radiator />
      </group>

      {utility && <Hatch d={d} open={hatchOpen} />}
      <Extension d={d} slideOpen={slideOpen} cabOpen={cabOpen} />
      <Exterior d={d} roof={roof} utility={utility} facade={facade} />

      {showDims && <Dimensions d={d} doorWall={doorWall} utility={utility} />}
    </group>
  )
}
