import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { makeHatchLeaf } from './furnTextures'

/**
 * Дверь в подсобку (50 × 66 см, низ на 30 см от пола) в левом боковом перекрытии.
 * Петли со стороны начала комнаты, полотно открывается в комнату.
 */
export default function Hatch({ d, open }) {
  const leaf = useRef()
  const t = useRef(open ? 1 : 0)
  const mats = useMemo(
    () => ({
      leaf: new THREE.MeshStandardMaterial({ map: makeHatchLeaf(), roughness: 0.55, metalness: 0.05 }),
      frame: new THREE.MeshStandardMaterial({ color: '#efefec', roughness: 0.5 }),
      metal: new THREE.MeshStandardMaterial({ color: '#c8c9cb', roughness: 0.25, metalness: 0.9 }),
    }),
    [],
  )
  const { hatchY: y0, hatchH: h, hatchW: w, hz0 } = d
  const y1 = y0 + h
  const zc = hz0 + w / 2
  useFrame((_, dt) => {
    const target = open ? 1 : 0
    t.current += (target - t.current) * Math.min(1, dt * 5)
    if (leaf.current) leaf.current.rotation.y = t.current * 1.6
  })
  const B = ({ p, s, m = mats.frame }) => (
    <mesh position={p} material={m} castShadow receiveShadow>
      <boxGeometry args={s} />
    </mesh>
  )
  const fw = 0.035
  return (
    <group position={[-d.W / 2, 0, 0]}>
      {/* наличник по периметру проёма */}
      <B p={[0.012, y1 + fw / 2, zc]} s={[0.024, fw, w + 2 * fw]} />
      <B p={[0.012, y0 - fw / 2, zc]} s={[0.024, fw, w + 2 * fw]} />
      <B p={[0.012, (y0 + y1) / 2, hz0 - fw / 2]} s={[0.024, h, fw]} />
      <B p={[0.012, (y0 + y1) / 2, hz0 + w + fw / 2]} s={[0.024, h, fw]} />
      {/* полотно на петлях у края hz0 */}
      <group ref={leaf} position={[0.016, (y0 + y1) / 2, hz0 + 0.004]}>
        <mesh position={[0, 0, (w - 0.008) / 2]} material={mats.leaf} castShadow receiveShadow>
          <boxGeometry args={[0.022, h - 0.008, w - 0.008]} />
        </mesh>
        <B p={[0.02, 0.0, w - 0.06]} s={[0.012, 0.1, 0.014]} m={mats.metal} />
        <B p={[0.012, h / 2 - 0.1, 0.0]} s={[0.02, 0.05, 0.012]} m={mats.metal} />
        <B p={[0.012, -h / 2 + 0.1, 0.0]} s={[0.02, 0.05, 0.012]} m={mats.metal} />
      </group>
    </group>
  )
}
