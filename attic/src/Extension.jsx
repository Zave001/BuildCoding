import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { quad, profileTop, barProps } from './geom'
import { K } from './params'

const box = (sz) => <boxGeometry args={sz} />

function Bar({ a, b, z, th, depth, m }) {
  const { position, rotation, len } = barProps(a, b, z)
  return (
    <mesh position={position} rotation={rotation} material={m} castShadow receiveShadow>
      <boxGeometry args={[len + th, th, depth]} />
    </mesh>
  )
}

// плавно доводит значение до цели (анимация дверей)
function useEase(target, apply, speed = 6) {
  const cur = useRef(target)
  useFrame((_, dt) => {
    cur.current += (target - cur.current) * Math.min(1, dt * speed)
    apply(cur.current)
  })
}

/* ---------- стеклянная стена-купе ---------- */

function GlassWall({ d, slideOpen, mats }) {
  const { W, xS, xC, zG, cW, cH, rise, run } = d
  const top = Math.min(K.slideTop, d.heightAt(xS) - 0.04, d.heightAt(xC) - 0.04)

  const glassGeo = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(W / 2, 0)
    s.lineTo(xS, 0)
    s.lineTo(xS, top)
    s.lineTo(xC, top)
    profileTop(d, xC, W / 2).forEach(([x, y]) => s.lineTo(x, y))
    s.closePath()
    return new THREE.ShapeGeometry(s)
  }, [d, top])

  const prof = profileTop(d, xC, W / 2)
  // вертикальные стойки: санузел, проём, середина, излом ската, правый край
  const posts = [xC + 0.02, xS, (xS + cW / 2) / 2, cW / 2, W / 2 - 0.02].filter((x, i, a) => x >= xC && x <= W / 2 && a.indexOf(x) === i)
  // горизонтальная направляющая на высоте верха двери — там, где помещается под скатом
  const xTrack = Math.min(W / 2, cW / 2 + ((cH - top - 0.03) * run) / rise)

  const leafW = xS - xC + 0.04
  const leaf = useRef()
  useEase(slideOpen ? 1 : 0, (t) => {
    if (leaf.current) leaf.current.position.x = (xS + xC) / 2 + t * (leafW - 0.06)
  })

  const p = 0.04 // профиль алюминия
  return (
    <group>
      <mesh geometry={glassGeo} position={[0, 0, zG]} material={mats.frosted} renderOrder={3} />
      <Bar a={[xS, 0.02]} b={[W / 2, 0.02]} z={zG} th={p} depth={0.05} m={mats.alu} />
      {prof.slice(1).map(([x, y], i) => (
        <Bar key={i} a={[prof[i][0], prof[i][1] - 0.02]} b={[x, y - 0.02]} z={zG} th={p} depth={0.05} m={mats.alu} />
      ))}
      {posts.map((x) => (
        <Bar key={x} a={[x, 0]} b={[x, d.heightAt(x)]} z={zG} th={p} depth={0.05} m={mats.alu} />
      ))}
      <Bar a={[xC, top + 0.02]} b={[xTrack, top + 0.02]} z={zG - 0.025} th={0.05} depth={0.09} m={mats.alu} />
      {/* глухие белые панели снизу */}
      <mesh position={[(xS + W / 2) / 2, K.panelH / 2, zG]} material={mats.panel} receiveShadow>
        {box([W / 2 - xS, K.panelH, 0.022])}
      </mesh>
      <Bar a={[xS, K.panelH]} b={[W / 2, K.panelH]} z={zG} th={p} depth={0.05} m={mats.alu} />

      {/* раздвижная створка на стороне спальни */}
      <group ref={leaf} position={[(xS + xC) / 2, 0, zG - 0.05]}>
        <mesh position={[0, top / 2, 0]} material={mats.frosted} renderOrder={4}>
          <planeGeometry args={[leafW - 0.08, top - 0.08]} />
        </mesh>
        <Bar a={[-leafW / 2, 0.03]} b={[leafW / 2, 0.03]} z={0} th={0.05} depth={0.035} m={mats.alu} />
        <mesh position={[0, K.panelH / 2, 0]} material={mats.panel}>
          {box([leafW - 0.06, K.panelH, 0.02])}
        </mesh>
        <Bar a={[-leafW / 2, K.panelH]} b={[leafW / 2, K.panelH]} z={0} th={0.04} depth={0.035} m={mats.alu} />
        <Bar a={[-leafW / 2, top - 0.03]} b={[leafW / 2, top - 0.03]} z={0} th={0.05} depth={0.035} m={mats.alu} />
        <Bar a={[-leafW / 2 + 0.025, 0]} b={[-leafW / 2 + 0.025, top]} z={0} th={0.05} depth={0.035} m={mats.alu} />
        <Bar a={[leafW / 2 - 0.025, 0]} b={[leafW / 2 - 0.025, top]} z={0} th={0.05} depth={0.035} m={mats.alu} />
        <mesh position={[-leafW / 2 + 0.09, 1.0, -0.025]} material={mats.chrome}>
          <cylinderGeometry args={[0.022, 0.022, 0.02, 20]} />
        </mesh>
      </group>
    </group>
  )
}

/* ---------- санузел ---------- */

function archShape(x0, w, spring) {
  const s = new THREE.Shape()
  s.moveTo(x0, 0)
  s.lineTo(x0 + w, 0)
  s.lineTo(x0 + w, spring)
  s.absarc(x0 + w / 2, spring, w / 2, 0, Math.PI, false)
  s.lineTo(x0, 0)
  return s
}

function Cabin({ d, mats, open }) {
  const cabLeaf = useRef()
  const { W, xC, zC, zCabB: zEnd, cabDoor: cd } = d // zEnd здесь — задняя стенка санузла
  const T = 0.03 // стенки из МДФ/ГКЛ

  const { front, back, leafGeo } = useMemo(() => {
    const outline = () => {
      const s = new THREE.Shape()
      s.moveTo(-W / 2, 0)
      s.lineTo(xC, 0)
      profileTop(d, -W / 2, xC).reverse().forEach(([x, y]) => s.lineTo(x, y))
      s.closePath()
      return s
    }
    const f = outline()
    // проём касается пола — делаем его вырезом снизу контура
    const fr = new THREE.Shape()
    fr.moveTo(-W / 2, 0)
    fr.lineTo(cd.x0, 0)
    fr.lineTo(cd.x0, cd.spring)
    fr.absarc(cd.x0 + cd.w / 2, cd.spring, cd.w / 2, Math.PI, 0, true)
    fr.lineTo(cd.x0 + cd.w, 0)
    fr.lineTo(xC, 0)
    profileTop(d, -W / 2, xC).reverse().forEach(([x, y]) => fr.lineTo(x, y))
    fr.closePath()
    const opt = { depth: T, bevelEnabled: false, curveSegments: 24 }
    // полотно строится от оси петель (со стороны прохода) влево
    const leaf = new THREE.ExtrudeGeometry(archShape(-(cd.w - 0.01), cd.w - 0.01, cd.spring - 0.005), { depth: 0.035, bevelEnabled: false, curveSegments: 24 })
    return { front: new THREE.ExtrudeGeometry(fr, opt), back: new THREE.ExtrudeGeometry(f, opt), leafGeo: leaf }
  }, [d])

  useEase(open ? 1 : 0, (t) => {
    if (cabLeaf.current) cabLeaf.current.rotation.y = -1.35 * t
  })

  const hSide = d.heightAt(xC)
  const cx = (-W / 2 + xC) / 2
  return (
    <group>
      <mesh geometry={front} position={[0, 0, zC]} material={mats.cabin} castShadow receiveShadow />
      <mesh geometry={back} position={[0, 0, zEnd - T]} material={mats.cabin} castShadow receiveShadow />
      <mesh position={[xC - T / 2, hSide / 2, (zC + zEnd) / 2]} material={mats.cabin} castShadow receiveShadow>
        {box([T, hSide, zEnd - zC])}
      </mesh>
      {/* наличник арки */}
      <mesh position={[0, 0, zC - 0.008]} material={mats.cabinTrim}>
        <extrudeGeometry
          args={[
            (() => {
              const s = archShape(cd.x0 - 0.05, cd.w + 0.1, cd.spring)
              s.holes.push(archShape(cd.x0, cd.w, cd.spring))
              return s
            })(),
            { depth: 0.01, bevelEnabled: false, curveSegments: 24 },
          ]}
        />
      </mesh>
      {/* полотно открыто наружу, петли со стороны прохода */}
      <group ref={cabLeaf} position={[cd.x0 + cd.w - 0.005, 0.005, zC - 0.04]} rotation={[0, -1.35, 0]}>
        <mesh geometry={leafGeo} material={mats.cabinLeaf} castShadow receiveShadow />
        <mesh position={[-(cd.w - 0.08), 1.0, -0.02]} material={mats.chrome}>
          <sphereGeometry args={[0.028, 16, 12]} />
        </mesh>
      </group>
      {/* унитаз — только чтобы читалось назначение кабинки */}
      <group position={[cx, 0, zEnd - T]}>
        <mesh position={[0, 0.58, -0.09]} material={mats.ceramic} castShadow>
          {box([0.36, 0.34, 0.16])}
        </mesh>
        <mesh position={[0, 0.2, -0.4]} scale={[1, 1, 1.35]} material={mats.ceramic} castShadow>
          <cylinderGeometry args={[0.18, 0.12, 0.4, 28]} />
        </mesh>
        <mesh position={[0, 0.41, -0.4]} scale={[1, 1, 1.35]} material={mats.ceramic}>
          <cylinderGeometry args={[0.19, 0.19, 0.025, 28]} />
        </mesh>
      </group>
    </group>
  )
}

/* ---------- лестница ---------- */

function Stair({ d, mats }) {
  const { W, xS, zS, zG, stL, stW } = d
  const x0 = W / 2 // дальний от входа край проёма
  const dep = K.stairDrop
  const n = K.stairSteps
  const rise = dep / n
  const tr = (stL - 0.04) / n
  const zc = (zS + zG) / 2

  const shaft = useMemo(() => {
    const c = [(x0 + xS) / 2, -dep / 2, zc]
    return [
      quad([[x0, 0, zS], [xS, 0, zS], [xS, -dep, zS], [x0, -dep, zS]], c),
      quad([[x0, 0, zG], [xS, 0, zG], [xS, -dep, zG], [x0, -dep, zG]], c),
      quad([[x0, 0, zS], [x0, 0, zG], [x0, -dep, zG], [x0, -dep, zS]], c),
      quad([[xS, 0, zS], [xS, 0, zG], [xS, -dep, zG], [xS, -dep, zS]], c),
    ]
  }, [d])
  const bottom = useMemo(() => quad([[x0, -dep, zS], [xS, -dep, zS], [xS, -dep, zG], [x0, -dep, zG]], [0, 0, zc]), [d])

  // перила по переднему краю проёма, вход на лестницу — справа, со стороны купе
  const zr = zS - 0.03
  const nb = Math.max(2, Math.round(stL / 0.13))
  return (
    <group>
      {shaft.map((g, i) => (
        <mesh key={i} geometry={g} material={mats.shaft} receiveShadow />
      ))}
      <mesh geometry={bottom} material={mats.landing} receiveShadow />
      {Array.from({ length: n - 1 }, (_, i) => {
        const k = i + 1
        return (
          <mesh key={k} position={[xS + (k - 0.5) * tr, -k * rise - 0.02, zc]} material={mats.tread} castShadow receiveShadow>
            {box([tr + 0.03, 0.04, stW - 0.08])}
          </mesh>
        )
      })}
      {[zS + 0.03, zG - 0.03].map((z) => (
        <Bar key={z} a={[xS, -0.12]} b={[x0, -dep - 0.12]} z={z} th={0.24} depth={0.04} m={mats.tread} />
      ))}

      <mesh position={[(x0 + xS) / 2, 0.93, zr]} material={mats.handrail} castShadow>
        {box([stL, 0.055, 0.065])}
      </mesh>
      <mesh position={[(x0 + xS) / 2, 0.05, zr]} material={mats.handrail} castShadow>
        {box([stL, 0.05, 0.05])}
      </mesh>
      {Array.from({ length: nb - 1 }, (_, i) => (
        <mesh key={i} position={[xS + ((i + 1) * stL) / nb, 0.49, zr]} material={mats.baluster} castShadow>
          <cylinderGeometry args={[0.017, 0.02, 0.83, 10]} />
        </mesh>
      ))}
      {[xS + 0.04, x0 - 0.04].map((x) => (
        <group key={x} position={[x, 0, zr]}>
          <mesh position={[0, 0.52, 0]} material={mats.handrail} castShadow>
            {box([0.075, 1.04, 0.075])}
          </mesh>
          <mesh position={[0, 1.09, 0]} material={mats.handrail} castShadow>
            <sphereGeometry args={[0.045, 18, 12]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

export default function Extension({ d, slideOpen, cabOpen = true }) {
  const mats = useMemo(
    () => ({
      frosted: new THREE.MeshStandardMaterial({ color: '#e9f0f3', roughness: 0.35, metalness: 0, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false }),
      panel: new THREE.MeshStandardMaterial({ color: '#f1f2f0', roughness: 0.5 }),
      alu: new THREE.MeshStandardMaterial({ color: '#c3c7cb', roughness: 0.35, metalness: 0.6 }),
      chrome: new THREE.MeshStandardMaterial({ color: '#d9d9d9', roughness: 0.15, metalness: 0.9 }),
      cabin: new THREE.MeshStandardMaterial({ color: '#dcc6a4', roughness: 0.62 }),
      cabinTrim: new THREE.MeshStandardMaterial({ color: '#d2b994', roughness: 0.55 }),
      cabinLeaf: new THREE.MeshStandardMaterial({ color: '#e4d0b0', roughness: 0.5 }),
      ceramic: new THREE.MeshStandardMaterial({ color: '#f5f6f4', roughness: 0.2 }),
      shaft: new THREE.MeshStandardMaterial({ color: '#c3d1ca', roughness: 0.92 }),
      landing: new THREE.MeshStandardMaterial({ color: '#8f8576', roughness: 0.7 }),
      tread: new THREE.MeshStandardMaterial({ color: '#c99f6b', roughness: 0.6 }),
      handrail: new THREE.MeshStandardMaterial({ color: '#5a3424', roughness: 0.45 }),
      baluster: new THREE.MeshStandardMaterial({ color: '#d8b98c', roughness: 0.55 }),
    }),
    [],
  )
  return (
    <group>
      <GlassWall d={d} slideOpen={slideOpen} mats={mats} />
      <Cabin d={d} mats={mats} open={cabOpen} />
      <Stair d={d} mats={mats} />
    </group>
  )
}
