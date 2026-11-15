import * as THREE from 'three'
import { useMemo } from 'react'

/**
 * Секционный радиатор, симметричный относительно оси окна (x = 0): 12 секций, колпаки, краны и кронштейны
 * с обеих сторон. Стоит у стены (z = 0), обращён в +z.
 */
export default function Radiator({ sections = 12, y0 = 0.16, h = 0.58, depth = 0.08 }) {
  const m = useMemo(
    () => ({
      enamel: new THREE.MeshStandardMaterial({ color: '#f6f6f4', roughness: 0.32, metalness: 0.05 }),
      metal: new THREE.MeshStandardMaterial({ color: '#d4d5d7', roughness: 0.25, metalness: 0.85 }),
      shade: new THREE.MeshStandardMaterial({ color: '#c9cac8', roughness: 0.6 }),
    }),
    [],
  )
  const pitch = 0.08
  const total = sections * pitch
  const zc = 0.045 + depth / 2 // зазор до стены 4,5 см
  const cy = y0 + h / 2
  return (
    <group position={[0, 0, zc]}>
      {/* секции */}
      {Array.from({ length: sections }, (_, i) => {
        const x = -total / 2 + pitch * (i + 0.5)
        return (
          <group key={i} position={[x, cy, 0]}>
            <mesh material={m.enamel} castShadow receiveShadow>
              <boxGeometry args={[0.062, h - 0.1, depth]} />
            </mesh>
            {/* две «колонны» на секции, чтобы читалась ребристость */}
            {[-1, 1].map((k) => (
              <mesh key={k} position={[k * 0.022, 0, depth / 2 + 0.002]} material={m.enamel}>
                <boxGeometry args={[0.014, h - 0.12, 0.004]} />
              </mesh>
            ))}
            <mesh position={[0, 0, depth / 2 + 0.003]} material={m.shade}>
              <boxGeometry args={[0.004, h - 0.14, 0.003]} />
            </mesh>
          </group>
        )
      })}
      {/* коллекторы сверху и снизу */}
      {[y0 + 0.045, y0 + h - 0.045].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[0, 0, Math.PI / 2]} material={m.enamel} castShadow>
          <cylinderGeometry args={[0.032, 0.032, total + 0.004, 18]} />
        </mesh>
      ))}
      {/* верхняя декоративная решётка */}
      <mesh position={[0, y0 + h + 0.006, 0]} material={m.enamel} castShadow>
        <boxGeometry args={[total + 0.02, 0.012, depth + 0.01]} />
      </mesh>
      {/* торцевые колпаки, краны и воздухоотводчики — одинаково по обе стороны */}
      {[-1, 1].map((k) => (
        <group key={k} position={[k * (total / 2 + 0.006), 0, 0]}>
          {[y0 + 0.045, y0 + h - 0.045].map((y) => (
            <mesh key={y} position={[0, y, 0]} rotation={[0, 0, Math.PI / 2]} material={m.enamel}>
              <cylinderGeometry args={[0.034, 0.034, 0.014, 18]} />
            </mesh>
          ))}
          <mesh position={[k * 0.026, y0 + 0.045, 0]} rotation={[0, 0, Math.PI / 2]} material={m.metal}>
            <cylinderGeometry args={[0.014, 0.014, 0.04, 12]} />
          </mesh>
          <mesh position={[k * 0.052, y0 + 0.045, 0]} material={m.enamel}>
            <sphereGeometry args={[0.02, 12, 10]} />
          </mesh>
          <mesh position={[k * 0.02, y0 + h - 0.045, 0]} rotation={[0, 0, Math.PI / 2]} material={m.metal}>
            <cylinderGeometry args={[0.009, 0.009, 0.03, 10]} />
          </mesh>
        </group>
      ))}
      {/* кронштейны к стене — симметрично */}
      {[-1, 1].map((k) => (
        <mesh key={'b' + k} position={[k * (total / 2 - 0.12), y0 + h - 0.06, -depth / 2 - 0.02]} material={m.metal}>
          <boxGeometry args={[0.03, 0.05, 0.04]} />
        </mesh>
      ))}
    </group>
  )
}
