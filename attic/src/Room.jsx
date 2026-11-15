import * as THREE from 'three'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshReflectorMaterial, Mask, useMask, Line, Html } from '@react-three/drei'
import { makeLaminate, makePaint, makeForest } from './textures'
import { fmt } from './params'

/* ---------- геометрия ---------- */

// Четырёхугольник с UV в метрах; лицевая сторона всегда смотрит внутрь комнаты,
// поэтому снаружи ближние стены не рисуются и комнату видно «как в разрезе».
function quad(pts, center) {
  const [a, b, c, d] = pts.map((p) => new THREE.Vector3(...p))
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a.toArray(), ...b.toArray(), ...c.toArray(), ...d.toArray()], 3))
  const u = a.distanceTo(b)
  const v = a.distanceTo(d)
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, u, 0, u, v, 0, v], 2))
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a))
  const toC = new THREE.Vector3().subVectors(center, a)
  g.setIndex(n.dot(toC) >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2])
  g.computeVertexNormals()
  return g
}

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

function WindowUnit({ d, mode }) {
  const { winW: w, winH: h, winSill: s, winSections: n } = d
  const D = 0.16 // толщина стены в откосе
  const pvc = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f4f5f2', roughness: 0.38 }), [])
  const metal = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e9e9e9', roughness: 0.25, metalness: 0.4 }), [])
  const glass = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d6e6f2', roughness: 0.05, transparent: true, opacity: 0.14, depthWrite: false }), [])
  const forest = useMemo(() => makeForest(), [])
  const stencil = useMask(1)

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
      <Mask id={1} position={[0, s + h / 2, -D - 0.01]}>
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

function DoorUnit({ d }) {
  const { doorW: w, doorH: h, doorX: x, L } = d
  const D = 0.12
  const wood = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e8e3da', roughness: 0.55 }), [])
  const frame = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f1eee8', roughness: 0.5 }), [])
  const metal = useMemo(() => new THREE.MeshStandardMaterial({ color: '#b9b9b9', roughness: 0.25, metalness: 0.85 }), [])
  const B = ({ p, sz, m = frame }) => (
    <mesh position={p} material={m} castShadow receiveShadow>
      <boxGeometry args={sz} />
    </mesh>
  )
  const zc = L + D / 2
  return (
    <group>
      {/* коробка */}
      <B p={[x - w / 2 + 0.015, h / 2, zc]} sz={[0.03, h, D]} />
      <B p={[x + w / 2 - 0.015, h / 2, zc]} sz={[0.03, h, D]} />
      <B p={[x, h - 0.015, zc]} sz={[w, 0.03, D]} />
      {/* полотно */}
      <B p={[x, (h - 0.035) / 2 + 0.005, zc]} sz={[w - 0.065, h - 0.04, 0.04]} m={wood} />
      {/* наличники со стороны комнаты */}
      <B p={[x - w / 2 - 0.02, (h + 0.06) / 2, L - 0.006]} sz={[0.07, h + 0.06, 0.012]} />
      <B p={[x + w / 2 + 0.02, (h + 0.06) / 2, L - 0.006]} sz={[0.07, h + 0.06, 0.012]} />
      <B p={[x, h + 0.025, L - 0.006]} sz={[w + 0.14, 0.07, 0.012]} />
      {/* ручка */}
      <mesh position={[x + w / 2 - 0.09, 1.0, zc - 0.025]} rotation={[Math.PI / 2, 0, 0]} material={metal}>
        <cylinderGeometry args={[0.025, 0.025, 0.01, 24]} />
      </mesh>
      <B p={[x + w / 2 - 0.13, 1.0, zc - 0.05]} sz={[0.12, 0.018, 0.018]} m={metal} />
    </group>
  )
}

/* ---------- свет ---------- */

function Lights({ d, mode }) {
  const day = mode === 'day'
  const dl = useRef()
  useLayoutEffect(() => {
    dl.current.target.position.set(0, 0.3, d.L * 0.5)
    dl.current.target.updateMatrixWorld()
  }, [d.L])
  const n = Math.max(2, Math.round(d.L / 1.25))
  const zs = Array.from({ length: n }, (_, i) => (d.L * (i + 0.5)) / n)
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
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-camera-near={0.5}
        shadow-camera-far={20}
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
          {!day && <pointLight position={[0, d.cH - 0.12, z]} color="#ffe4c4" intensity={1.7} decay={2} />}
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

function Dimensions({ d }) {
  const { L, W, kH, cH, cW, winW, winH, winSill, doorW, doorH, doorX } = d
  const z = 0.03
  const nx = d.rise / d.slant
  const ny = -d.run / d.slant
  const o = 0.07
  const xh = cW / 2 > winW / 2 + 0.06 ? (cW / 2 + winW / 2) / 2 : Math.max(cW / 2 - 0.06, 0)
  const win = '#6fd3ff'
  return (
    <group>
      <Dim a={[-W / 2 + 0.12, 0.012, 0]} b={[-W / 2 + 0.12, 0.012, L]} text={`${fmt(L)} м`} />
      <Dim a={[-W / 2, 0.012, 0.25]} b={[W / 2, 0.012, 0.25]} text={`${fmt(W)} м`} />
      <Dim a={[-W / 2 + 0.05, 0, z]} b={[-W / 2 + 0.05, kH, z]} text={`${fmt(kH)}`} />
      <Dim a={[-W / 2 + nx * o, kH + ny * o, z]} b={[-cW / 2 + nx * o, cH + ny * o, z]} text={`${fmt(d.slant)} · ${d.angle.toFixed(0)}°`} />
      <Dim a={[-cW / 2, cH - 0.05, z]} b={[cW / 2, cH - 0.05, z]} text={`${fmt(cW)}`} />
      <Dim a={[xh, 0, z]} b={[xh, cH, z]} text={`h ${fmt(cH)}`} />
      <Dim a={[-winW / 2, winSill - 0.07, 0.2]} b={[winW / 2, winSill - 0.07, 0.2]} text={`окно ${fmt(winW)} × ${fmt(winH)}`} color={win} />
      <Dim a={[-winW / 2 + 0.3, 0, 0.2]} b={[-winW / 2 + 0.3, winSill, 0.2]} text={fmt(winSill)} color={win} />
      <Dim a={[doorX - doorW / 2, doorH + 0.14, L - 0.03]} b={[doorX + doorW / 2, doorH + 0.14, L - 0.03]} text={`дверь ${fmt(doorW)}`} color={win} />
      <Dim a={[doorX - doorW / 2 - 0.13, 0, L - 0.03]} b={[doorX - doorW / 2 - 0.13, doorH, L - 0.03]} text={fmt(doorH)} color={win} />
    </group>
  )
}

/* ---------- комната ---------- */

export default function Room({ d, colors, floorKey, mode, gloss, showDims, hl, setHl }) {
  const { L, W, kH, cH, cW } = d
  const paintA = useMemo(() => makePaint(3), [])
  const paintB = useMemo(() => makePaint(11), [])
  const floorTex = useMemo(() => makeLaminate(floorKey), [floorKey])

  const geoms = useMemo(() => {
    const center = new THREE.Vector3(0, cH / 2, L / 2)
    return {
      floor: quad([[-W / 2, 0, 0], [W / 2, 0, 0], [W / 2, 0, L], [-W / 2, 0, L]], center),
      kneeL: quad([[-W / 2, 0, 0], [-W / 2, 0, L], [-W / 2, kH, L], [-W / 2, kH, 0]], center),
      kneeR: quad([[W / 2, 0, 0], [W / 2, 0, L], [W / 2, kH, L], [W / 2, kH, 0]], center),
      slopeL: quad([[-W / 2, kH, 0], [-W / 2, kH, L], [-cW / 2, cH, L], [-cW / 2, cH, 0]], center),
      slopeR: quad([[W / 2, kH, 0], [W / 2, kH, L], [cW / 2, cH, L], [cW / 2, cH, 0]], center),
      windowWall: gableShape(d, { window: true }),
      // стена с дверью повёрнута на 180°, поэтому ось X у неё зеркальна
      doorWall: gableShape(d, { doorX: -d.doorX }),
    }
  }, [d])

  const winRef = useRef()
  const doorRef = useRef()
  // проёмы прячутся вместе со стеной, когда камера смотрит на неё снаружи
  useFrame(({ camera }) => {
    if (winRef.current) winRef.current.visible = camera.position.z > -0.05
    if (doorRef.current) doorRef.current.visible = camera.position.z < L + 0.05
  })

  const ev = (k) => ({
    onPointerOver: (e) => {
      e.stopPropagation()
      setHl(k)
    },
    onPointerOut: () => setHl((h) => (h === k ? null : h)),
  })

  return (
    <group>
      <Lights d={d} mode={mode} />

      <mesh geometry={geoms.floor} receiveShadow {...ev('floor')}>
        <meshStandardMaterial map={floorTex} roughness={0.48} metalness={0} emissive={hl === 'floor' ? HL : '#000'} emissiveIntensity={hl === 'floor' ? 0.3 : 0} />
      </mesh>

      {['kneeL', 'kneeR'].map((k) => (
        <mesh key={k} geometry={geoms[k]} castShadow receiveShadow {...ev('knee')}>
          <Paint map={paintA} color={colors.knee} active={hl === 'knee'} />
        </mesh>
      ))}
      {['slopeL', 'slopeR'].map((k) => (
        <mesh key={k} geometry={geoms[k]} castShadow receiveShadow {...ev('slope')}>
          <Paint map={paintB} color={colors.slope} active={hl === 'slope'} />
        </mesh>
      ))}

      <mesh geometry={geoms.windowWall} castShadow receiveShadow {...ev('windowWall')}>
        <Paint map={paintA} color={colors.windowWall} active={hl === 'windowWall'} />
      </mesh>
      <mesh geometry={geoms.doorWall} position={[0, 0, L]} rotation={[0, Math.PI, 0]} castShadow receiveShadow {...ev('doorWall')}>
        <Paint map={paintB} color={colors.doorWall} active={hl === 'doorWall'} />
      </mesh>

      {/* натяжной потолок: глянец с отражением */}
      <mesh position={[0, cH, L / 2]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow {...ev('ceiling')}>
        <planeGeometry args={[cW, L]} />
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
            emissive={hl === 'ceiling' ? HL : '#000'}
            emissiveIntensity={hl === 'ceiling' ? 0.35 : 0}
          />
        ) : (
          <meshStandardMaterial color={colors.ceiling} roughness={0.75} emissive={hl === 'ceiling' ? HL : '#000'} emissiveIntensity={hl === 'ceiling' ? 0.35 : 0} />
        )}
      </mesh>

      <group ref={winRef}>
        <WindowUnit d={d} mode={mode} />
      </group>
      <group ref={doorRef}>
        <DoorUnit d={d} />
      </group>

      {showDims && <Dimensions d={d} />}
    </group>
  )
}
