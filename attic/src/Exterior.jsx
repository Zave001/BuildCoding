import * as THREE from 'three'
import { useMemo } from 'react'
import { quad, tri, wallX } from './geom'
import { K } from './params'
import { makeSiding, makeMetalTile, makeProfSheet, makeOSB, makeBoards, makeFilmTrim } from './textures'

/* ---------- кровля ---------- */

// Скат кровли продолжает линию внутреннего ската: вниз — до уровня пола (+ свес), вверх — до конька.
function RoofSide({ d, s, mats }) {
  const { run, rise, slant, xE, yR, zEnd } = d
  const geo = useMemo(() => {
    const u = [(s * run) / slant, -rise / slant] // вдоль ската вниз
    const n = [(s * rise) / slant, run / slant] // наружу
    const R = [0, yR]
    const E = [s * xE + u[0] * K.eaveOv, u[1] * K.eaveOv]
    const P = (pt, off) => [pt[0] + n[0] * off, pt[1] + n[1] * off]
    const zF = -K.winWallT - K.gableOv
    const zB = zEnd + K.winWallT + K.gableOv
    const zm = (zF + zB) / 2
    const lo = 0.012
    const T = K.roofT
    const mid = [(E[0] + R[0]) / 2, (E[1] + R[1]) / 2]
    const out = (k) => [mid[0] + n[0] * k, mid[1] + n[1] * k, zm]
    return {
      top: quad([[...P(E, T), zF], [...P(E, T), zB], [...P(R, T), zB], [...P(R, T), zF]], out(5)),
      under: quad([[...P(E, lo), zF], [...P(E, lo), zB], [...P(R, lo), zB], [...P(R, lo), zF]], out(-5)),
      fascia: quad([[...P(E, lo), zF], [...P(E, lo), zB], [...P(E, T), zB], [...P(E, T), zF]], [E[0] + u[0] * 5, E[1] + u[1] * 5, zm]),
      front: quad([[...P(E, lo), zF], [...P(R, lo), zF], [...P(R, T), zF], [...P(E, T), zF]], [mid[0], mid[1], zF - 5]),
      back: quad([[...P(E, lo), zB], [...P(R, lo), zB], [...P(R, T), zB], [...P(E, T), zB]], [mid[0], mid[1], zB + 5]),
    }
  }, [d, s])
  return (
    <group>
      <mesh geometry={geo.top} material={mats.tile} receiveShadow />
      <mesh geometry={geo.under} material={mats.soffit} receiveShadow />
      <mesh geometry={geo.fascia} material={mats.trimGreen} />
      <mesh geometry={geo.front} material={mats.trimGreen} />
      <mesh geometry={geo.back} material={mats.trimGreen} />
    </group>
  )
}

function Ridge({ d, mats }) {
  const zF = -K.winWallT - K.gableOv
  const len = d.zEnd + K.winWallT + K.gableOv - zF
  const y = d.yR + (d.run / d.slant) * K.roofT - 0.035
  return (
    <mesh position={[0, y, zF + len / 2]} rotation={[Math.PI / 2, 0, 0]} material={mats.ridge} castShadow>
      <cylinderGeometry args={[0.13, 0.13, len, 28, 1, true, Math.PI / 2, Math.PI]} />
    </mesh>
  )
}

/* ---------- подсобные пространства за боковыми перекрытиями ---------- */

function Utility({ d, s, mats }) {
  const { W, kH, xE, zEnd, utilDepth } = d
  const g = useMemo(() => {
    const a = (s * W) / 2
    const e = s * xE
    const c = [s * (W / 2 + utilDepth / 3), kH / 3, zEnd / 2]
    return {
      floor: quad([[a, 0, 0], [e, 0, 0], [e, 0, zEnd], [a, 0, zEnd]], c),
      knee:
        s < 0
          ? wallX(a, 0, zEnd, kH, { z0: d.hz0, z1: d.hz1, y0: d.hatchY, y1: d.hatchY + d.hatchH }, -1)
          : quad([[a, 0, 0], [a, 0, zEnd], [a, kH, zEnd], [a, kH, 0]], c),
      roof: quad([[a, kH, 0], [a, kH, zEnd], [e, 0, zEnd], [e, 0, 0]], c),
      end: tri([[a, 0, 0], [e, 0, 0], [a, kH, 0]], c),
      end2: tri([[a, 0, zEnd], [e, 0, zEnd], [a, kH, zEnd]], c),
    }
  }, [d, s])
  return (
    <group>
      <mesh geometry={g.floor} material={mats.osb} receiveShadow />
      <mesh geometry={g.knee} material={mats.osbWall} receiveShadow />
      <mesh geometry={g.roof} material={mats.boards} receiveShadow />
      <mesh geometry={g.end} material={mats.osbWall} receiveShadow />
      <mesh geometry={g.end2} material={mats.osbWall} receiveShadow />
    </group>
  )
}

/* ---------- фронтон снаружи: сайдинг, наличники, козырёк ---------- */

function Facade({ d, mats, canopy: withCanopy = true }) {
  const { xE, yR, winW, winH, winSill } = d
  const T = K.winWallT
  const P = K.plinth
  const hw = winW / 2 + 0.02
  const y0 = winSill - 0.025
  const y1 = winSill + winH + 0.02

  const wall = useMemo(() => {
    const sh = new THREE.Shape()
    sh.moveTo(-xE, -P)
    sh.lineTo(xE, -P)
    sh.lineTo(xE, 0)
    sh.lineTo(0, yR)
    sh.lineTo(-xE, 0)
    sh.closePath()
    const h = new THREE.Path()
    h.moveTo(-hw, y0)
    h.lineTo(-hw, y1)
    h.lineTo(hw, y1)
    h.lineTo(hw, y0)
    h.closePath()
    sh.holes.push(h)
    return new THREE.ExtrudeGeometry(sh, { depth: T - 0.01, bevelEnabled: false })
  }, [d])

  const canopy = useMemo(() => {
    const x = xE + 0.1
    const yA = -P + 0.005
    const yB = yA - 0.42
    const zA = -T
    const zB = -T - K.canopy
    return {
      top: quad([[-x, yA, zA], [x, yA, zA], [x, yB, zB], [-x, yB, zB]], [0, 5, zA - 1]),
      under: quad([[-x, yA - 0.02, zA], [x, yA - 0.02, zA], [x, yB - 0.02, zB], [-x, yB - 0.02, zB]], [0, -5, zA]),
      x,
      yB,
      zB,
    }
  }, [d])

  const tw = 0.09
  const zt = -T - 0.012
  return (
    <group>
      <mesh geometry={wall} position={[0, 0, -T]} material={[mats.siding, mats.white]} receiveShadow />
      {/* наличники с недоснятой защитной плёнкой */}
      <mesh position={[0, y1 + tw / 2, zt]} material={mats.film} castShadow>
        <boxGeometry args={[2 * hw + 2 * tw, tw, 0.024]} />
      </mesh>
      {[-1, 1].map((k) => (
        <mesh key={k} position={[k * (hw + tw / 2), (y0 + y1) / 2, zt]} material={mats.film} castShadow>
          <boxGeometry args={[tw, y1 - y0, 0.024]} />
        </mesh>
      ))}
      <mesh position={[0, y0 - 0.008, -T - 0.08]} rotation={[-0.12, 0, 0]} material={mats.white} castShadow>
        <boxGeometry args={[2 * hw + 2 * tw + 0.04, 0.016, 0.17]} />
      </mesh>
      {/* козырёк из профлиста у основания фронтона */}
      {withCanopy && (
        <>
          <mesh geometry={canopy.top} material={mats.prof} receiveShadow />
          <mesh geometry={canopy.under} material={mats.profUnder} />
          <mesh position={[0, -P + 0.04, -T - 0.03]} material={mats.white}>
            <boxGeometry args={[2 * canopy.x, 0.08, 0.05]} />
          </mesh>
          <mesh position={[0, canopy.yB - 0.02, canopy.zB]} material={mats.trimGreen}>
            <boxGeometry args={[2 * canopy.x, 0.05, 0.03]} />
          </mesh>
        </>
      )}
    </group>
  )
}

export default function Exterior({ d, roof, utility, facade }) {
  const mats = useMemo(() => {
    const tile = makeMetalTile()
    const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o })
    return {
      tile: std({ map: tile.map, bumpMap: tile.bump, bumpScale: 3, roughness: 0.42, metalness: 0.35 }),
      ridge: std({ color: '#2f5a3f', roughness: 0.42, metalness: 0.35, side: THREE.DoubleSide }),
      trimGreen: std({ color: '#2b5039', roughness: 0.5, metalness: 0.3 }),
      soffit: std({ map: makeBoards([238, 238, 234], 5), roughness: 0.6 }),
      section: std({ color: '#30353b', roughness: 0.95 }),
      osb: std({ map: makeOSB() }),
      osbWall: std({ map: makeOSB(), color: '#efe6d8' }),
      boards: std({ map: makeBoards() }),
      siding: std({ map: makeSiding(), roughness: 0.55 }),
      white: std({ color: '#f3f3f0', roughness: 0.45 }),
      film: std({ map: makeFilmTrim(), roughness: 0.4 }),
      prof: std({ map: makeProfSheet(), roughness: 0.45, metalness: 0.35 }),
      profUnder: std({ color: '#7d8a83', roughness: 0.7 }),
    }
  }, [])
  return (
    <group>
      {roof !== 'off' && <RoofSide d={d} s={-1} mats={mats} />}
      {roof === 'full' && <RoofSide d={d} s={1} mats={mats} />}
      {roof === 'full' && <Ridge d={d} mats={mats} />}
      {utility && [-1, 1].map((s) => <Utility key={s} d={d} s={s} mats={mats} />)}
      {facade && <Facade d={d} mats={mats} />}
      {/* второй фронтон — торец кухни; про козырёк с этой стороны данных нет */}
      {facade && (
        <group position={[0, 0, d.zEnd]} rotation={[0, Math.PI, 0]}>
          <Facade d={d} mats={mats} canopy={false} />
        </group>
      )}
    </group>
  )
}
