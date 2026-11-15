import * as THREE from 'three'

// Четырёхугольник с UV в метрах; лицевая сторона смотрит в сторону точки `toward`.
// Так стены видны только изнутри помещения, а снаружи модель читается «как в разрезе».
export function quad(pts, toward) {
  const [a, b, c, d] = pts.map((p) => new THREE.Vector3(...p))
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a.toArray(), ...b.toArray(), ...c.toArray(), ...d.toArray()], 3))
  const u = a.distanceTo(b)
  const v = a.distanceTo(d)
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, u, 0, u, v, 0, v], 2))
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a))
  const toC = new THREE.Vector3().subVectors(toward instanceof THREE.Vector3 ? toward : new THREE.Vector3(...toward), a)
  g.setIndex(n.dot(toC) >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2])
  g.computeVertexNormals()
  return g
}

// Треугольник с UV в метрах (ось U — вдоль a→b), лицом к точке `toward`.
export function tri(pts, toward) {
  const [a, b, c] = pts.map((p) => new THREE.Vector3(...p))
  const ex = new THREE.Vector3().subVectors(b, a).normalize()
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a))
  const ey = new THREE.Vector3().crossVectors(n, ex).normalize()
  const uv = (p) => {
    const r = new THREE.Vector3().subVectors(p, a)
    return [r.dot(ex), r.dot(ey)]
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a.toArray(), ...b.toArray(), ...c.toArray()], 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute([...uv(a), ...uv(b), ...uv(c)], 2))
  const toC = new THREE.Vector3().subVectors(new THREE.Vector3(...toward), a)
  g.setIndex(n.dot(toC) >= 0 ? [0, 1, 2] : [0, 2, 1])
  g.computeVertexNormals()
  return g
}

// Точки верхнего контура профиля мансарды (по боковым перекрытиям, скатам и потолку) от x0 до x1
export function profileTop(d, x0, x1) {
  const xs = [x0, ...[-d.W / 2, -d.cW / 2, d.cW / 2, d.W / 2].filter((x) => x > x0 + 1e-6 && x < x1 - 1e-6), x1]
  return xs.map((x) => [x, d.heightAt(x)])
}

// Брусок, натянутый между двумя точками в плоскости XY на глубине z
export function barProps(a, b, z) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  return {
    position: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z],
    rotation: [0, 0, Math.atan2(dy, dx)],
    len: Math.hypot(dx, dy),
  }
}

/**
 * Боковая стена в плоскости x = x0 от z0 до z1 высотой h, с прямоугольным проёмом hole = {z0, z1, y0, y1}.
 * facing = +1 / −1 — в какую сторону по X смотрит лицевая сторона.
 */
export function wallX(x0, z0, z1, h, hole, facing) {
  const s = new THREE.Shape()
  s.moveTo(z0, 0)
  s.lineTo(z1, 0)
  s.lineTo(z1, h)
  s.lineTo(z0, h)
  s.closePath()
  if (hole) {
    const p = new THREE.Path()
    p.moveTo(hole.z0, hole.y0)
    p.lineTo(hole.z0, hole.y1)
    p.lineTo(hole.z1, hole.y1)
    p.lineTo(hole.z1, hole.y0)
    p.closePath()
    s.holes.push(p)
  }
  const g = new THREE.ShapeGeometry(s)
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, x0, pos.getY(i), pos.getX(i))
  const idx = g.index.array
  const a = new THREE.Vector3().fromBufferAttribute(pos, idx[0])
  const b = new THREE.Vector3().fromBufferAttribute(pos, idx[1])
  const c = new THREE.Vector3().fromBufferAttribute(pos, idx[2])
  const nx = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).x
  if (nx * facing < 0) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]]
  g.computeVertexNormals()
  return g
}
