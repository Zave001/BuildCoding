import * as THREE from 'three'
import { useMemo } from 'react'
import { Html } from '@react-three/drei'

const COLORS = { supply: '#e46a5c', extract: '#5c8fe4', intake: '#9aa4ae', exhaust: '#d1a05c' }
const Y = new THREE.Vector3(0, 1, 0)

function Tube({ a, b, r, color, opacity = 1 }) {
  const { pos, quat, len } = useMemo(() => {
    const va = new THREE.Vector3(...a)
    const vb = new THREE.Vector3(...b)
    const dir = vb.clone().sub(va)
    const l = dir.length()
    return { pos: va.clone().add(vb).multiplyScalar(0.5).toArray(), quat: new THREE.Quaternion().setFromUnitVectors(Y, dir.normalize()), len: l }
  }, [a, b])
  if (len < 1e-4) return null
  return (
    <mesh position={pos} quaternion={quat} castShadow>
      <cylinderGeometry args={[r, r, len, 20]} />
      <meshStandardMaterial color={color} roughness={0.7} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  )
}

const Label = ({ p, text, sub }) => (
  <Html position={p} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
    <div className="sec-label">
      <b>{text}</b>
      {sub && <span>{sub}</span>}
    </div>
  </Html>
)

/** Рекуператор в подсобке, каналы, глушители, проходы через слои, решётки и колпаки на левом скате. */
export default function Vent3D({ vent, cfg, labels = true }) {
  if (!vent) return null
  const { unit, routes = [], silencers = [], hoods = [], sleeve, sleeves = [], grilles = [], r, ro, xOfT, existing } = vent
  const v = cfg.vent
  return (
    <group>
      {/* существующая вытяжка санузла: высоко вдоль стены, выход наружу */}
      {existing && (
        <group>
          {existing.pts.slice(1).map((p, i) => <Tube key={i} a={existing.pts[i]} b={p} r={existing.r} color="#7d848c" />)}
          {existing.outlet.kind === 'end' ? (
            <mesh position={existing.outlet.pos}>
              <boxGeometry args={[0.2, 0.2, 0.04]} />
              <meshStandardMaterial color="#6b6f75" roughness={0.5} />
            </mesh>
          ) : (
            <mesh position={[xOfT(existing.outlet.out[0]), existing.outlet.out[1], existing.outlet.z]} rotation={[0, 0, existing.outlet.angle]}>
              <cylinderGeometry args={[0.07, 0.06, 0.12, 20]} />
              <meshStandardMaterial color="#6b6f75" roughness={0.5} />
            </mesh>
          )}
          {labels && <Label p={[xOfT(0.1) - 0.1, existing.h + 0.2, existing.pts[0][2] + 0.6]} text="Вытяжка санузла" sub="существующая" />}
        </group>
      )}
      {/* блок: корпус и виброопоры */}
      {unit && (
        <>
          <mesh position={[unit.x, unit.y, unit.z]} castShadow receiveShadow>
            <boxGeometry args={[unit.d, unit.h, unit.w]} />
            <meshStandardMaterial color="#d9dde1" roughness={0.5} />
          </mesh>
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => (
            <mesh key={sx + ':' + sz} position={[unit.x + sx * (unit.d / 2 - 0.05), 0.012, unit.z + sz * (unit.w / 2 - 0.06)]}>
              <cylinderGeometry args={[0.03, 0.035, 0.024, 14]} />
              <meshStandardMaterial color="#2a2a2d" />
            </mesh>
          ))}
        </>
      )}
      {routes.map((rt) => {
        const rad = rt.warm ? ro : r + 0.01
        return (
          <group key={rt.id}>
            {rt.pts.slice(1).map((p, i) => (
              <Tube key={i} a={rt.pts[i]} b={p} r={rad} color={COLORS[rt.kind]} />
            ))}
            {rt.pts.slice(1, -1).map((p, i) => (
              <mesh key={'j' + i} position={p}>
                <sphereGeometry args={[rad, 14, 10]} />
                <meshStandardMaterial color={COLORS[rt.kind]} roughness={0.7} />
              </mesh>
            ))}
          </group>
        )
      })}
      {silencers.map((s) => (
        <group key={s.id}>
          <Tube a={[s.x, s.y, s.z0]} b={[s.x, s.y, s.z1]} r={r + 0.07} color="#4a5058" />
          {labels && <Label p={[s.x, s.y + 0.2, (s.z0 + s.z1) / 2]} text={s.name} sub={`${((s.z1 - s.z0) * 1000).toFixed(0)} мм`} />}
        </group>
      ))}
      {/* гильзы: проход через все слои, к чистовой поверхности */}
      {sleeves.map((s) => (
        <mesh key={s.kind} position={[(sleeve.x0 + sleeve.x1) / 2, s.y, s.z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[sleeve.r, sleeve.r, Math.max(0.01, sleeve.x1 - sleeve.x0), 20]} />
          <meshStandardMaterial color="#e8e8e4" roughness={0.6} transparent opacity={0.85} />
        </mesh>
      ))}
      {grilles.map((g) =>
        g.round ? (
          <mesh key={g.id} position={[g.x + 0.007, g.y, g.z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[g.round / 2, g.round / 2, 0.014, 24]} />
            <meshStandardMaterial color="#f1f1ee" roughness={0.5} />
          </mesh>
        ) : (
          <mesh key={g.id} position={[g.x + 0.007, g.y, g.z]}>
            <boxGeometry args={[0.014, g.h, g.w]} />
            <meshStandardMaterial color="#f1f1ee" roughness={0.5} />
          </mesh>
        ),
      )}
      {/* колпаки на левом скате */}
      {hoods.filter((h) => h.kind !== 'slope').map((h) => (
        <group key={h.id} position={[h.x, h.y, h.z]}>
          <mesh castShadow>
            <boxGeometry args={[0.32, 0.22, 0.05]} />
            <meshStandardMaterial color="#6b6f75" roughness={0.5} metalness={0.2} />
          </mesh>
          {labels && <Label p={[0, 0.25, 0]} text={h.name} sub="жалюзи в торце" />}
        </group>
      ))}
      {hoods.filter((h) => h.kind === 'slope').map((h) => (
        <group key={h.id} position={[xOfT(h.out[0]), h.out[1], h.z]} rotation={[0, 0, h.angle]}>
          <mesh position={[0, 0.07, 0]} castShadow>
            <cylinderGeometry args={[0.085, 0.07, 0.14, 24]} />
            <meshStandardMaterial color="#2c5a3f" roughness={0.5} metalness={0.2} />
          </mesh>
          <mesh position={[0, 0.17, 0]} castShadow>
            <coneGeometry args={[0.15, 0.08, 24]} />
            <meshStandardMaterial color="#2c5a3f" roughness={0.5} metalness={0.2} />
          </mesh>
          {labels && <Label p={[-0.2, 0.3, 0]} text={h.name} sub="колпак на скате" />}
        </group>
      ))}
      {labels && (
        <>
          {unit && <Label p={[unit.x, unit.h + 0.25, unit.z]} text={vent.sys.short} sub={`${v.flow} м³/ч · ${unit.w}×${unit.d}×${unit.h} м`} />}
          {grilles.map((g) => <Label key={'l' + g.id} p={[g.x + 0.12, g.y + 0.12, g.z]} text={g.kind === 'supply' ? 'Приток' : 'Вытяжка'} />)}
        </>
      )}
    </group>
  )
}
