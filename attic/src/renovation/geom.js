// Геометрия ремонта кабинета. Поверхности берутся из существующей модели (derive() из params.js),
// ничего не пересчитывается заново: те же оси (X поперёк, Y вверх, Z от окна к двери), те же размеры.
import * as THREE from 'three'

const EPS = 1e-6

/**
 * Поверхности кабинета. У каждой своя плоская система координат (s, t) и внутренняя нормаль n:
 *   точка в мире = O + s·ex + t·ey + w·n,  где w — глубина «внутрь комнаты» от существующей поверхности.
 * Tw, Td — толщины слоёв на стене с окном и на стене с дверью: продольные поверхности заканчиваются у торцевых слоёв (встык).
 */
export function makeSurfaces(d, Tw, Td, niche = false) {
  const { W, L, kH, cH, cW, run, rise } = d
  const P = [[-W / 2, 0], [-W / 2, kH], [-cW / 2, cH], [cW / 2, cH], [W / 2, kH], [W / 2, 0]]
  const ids = ['kneeL', 'slopeL', 'ceiling', 'slopeR', 'kneeR']
  const out = {}
  ids.forEach((id, i) => {
    const [x0, y0] = P[i]
    const [x1, y1] = P[i + 1]
    const len = Math.hypot(x1 - x0, y1 - y0)
    const ey = [(x1 - x0) / len, (y1 - y0) / len, 0]
    const sLo = Tw
    const sHi = L - Td
    out[id] = {
      id, kind: 'long', O: [x0, y0, 0], ex: [0, 0, 1], ey, n: [ey[1], -ey[0], 0],
      bounds: { s: [sLo, sHi], t: [0, len] },
      range: (axis, p) => (axis === 's' ? (p >= -EPS && p <= len + EPS ? [sLo, sHi] : null) : p >= sLo - EPS && p <= sHi + EPS ? [0, len] : null),
      poly: [[sLo, 0], [sHi, 0], [sHi, len], [sLo, len]],
      skinPoly: [[0, 0], [L, 0], [L, len], [0, len]],
      holes: [],
    }
  })
  const xm = (y) => (y <= kH ? W / 2 : y >= cH ? cW / 2 : W / 2 - ((y - kH) * run) / rise)
  const gable = [[-W / 2, 0], [W / 2, 0], [W / 2, kH], [cW / 2, cH], [-cW / 2, cH], [-W / 2, kH]]
  const endRange = (axis, p) => (axis === 's' ? (p >= -EPS && p <= cH + EPS ? [-xm(p), xm(p)] : null) : Math.abs(p) <= W / 2 + EPS ? [0, d.heightAt(p)] : null)
  const win = { s: [-d.winW / 2, d.winW / 2], t: [d.winSill, d.winSill + d.winH], kind: 'window' }
  // радиатор под окном: слои обходят его нишей
  const nicheHole = { s: [-0.56, 0.56], t: [0.1, 0.8], kind: 'niche' }
  const door = { s: [d.doorX - d.doorW / 2, d.doorX + d.doorW / 2], t: [0, d.doorH], kind: 'door' }
  out.windowWall = {
    id: 'windowWall', kind: 'end', O: [0, 0, 0], ex: [1, 0, 0], ey: [0, 1, 0], n: [0, 0, 1],
    bounds: { s: [-W / 2, W / 2], t: [0, cH] }, range: endRange, poly: gable, skinPoly: gable, holes: niche ? [win, nicheHole] : [win],
  }
  out.doorWall = {
    id: 'doorWall', kind: 'end', O: [0, 0, L], ex: [1, 0, 0], ey: [0, 1, 0], n: [0, 0, -1],
    bounds: { s: [-W / 2, W / 2], t: [0, cH] }, range: endRange, poly: gable, skinPoly: gable, holes: [door],
  }
  return out
}

export const frameMatrix = (surf) => {
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...surf.ex), new THREE.Vector3(...surf.ey), new THREE.Vector3(...surf.n))
  m.setPosition(...surf.O)
  return m
}

/* ---------- 1D / 2D раскладка ---------- */

/** Свободные участки полосы [p0, p1] вдоль оси axis: границы поверхности минус проёмы. Возвращает «трапеции» (скошенные края у скатов). */
export function bandQuads(surf, axis, p0, p1, holeM = 0) {
  const r0 = surf.range(axis, p0)
  const r1 = surf.range(axis, p1)
  if (!r0 || !r1) return []
  const perp = axis === 's' ? 't' : 's'
  const cuts = surf.holes
    .filter((h) => h[perp][0] < p1 - EPS && h[perp][1] > p0 + EPS)
    .map((h) => [h[axis][0] - holeM, h[axis][1] + holeM])
    .sort((a, b) => a[0] - b[0])
  const cut = (r) => {
    const o = []
    let lo = r[0]
    for (const [c0, c1] of cuts) {
      if (c1 <= lo) continue
      if (c0 >= r[1]) break
      if (c0 > lo + EPS) o.push([lo, Math.min(c0, r[1])])
      lo = Math.max(lo, c1)
    }
    if (lo < r[1] - EPS) o.push([lo, r[1]])
    return o
  }
  const a = cut(r0)
  const b = cut(r1)
  const n = Math.min(a.length, b.length)
  return Array.from({ length: n }, (_, i) => ({ axis, p0, p1, a0lo: a[i][0], a0hi: a[i][1], a1lo: b[i][0], a1hi: b[i][1] }))
}

export const quadPoly = (q) =>
  q.axis === 's'
    ? [[q.a0lo, q.p0], [q.a0hi, q.p0], [q.a1hi, q.p1], [q.a1lo, q.p1]]
    : [[q.p0, q.a0lo], [q.p0, q.a0hi], [q.p1, q.a1hi], [q.p1, q.a1lo]]
export const quadLen = (q) => Math.max(q.a0hi - q.a0lo, q.a1hi - q.a1lo)
export const quadSlanted = (q) => Math.abs(q.a0lo - q.a1lo) > 1e-4 || Math.abs(q.a0hi - q.a1hi) > 1e-4

/** Прямолинейный элемент (профиль, рейка) шириной 2·hw вдоль оси axis на координате pos: список отрезков [lo, hi]. */
export function lineSegs(surf, axis, pos, hw, endM = 0.01, holeM = 0.02, minLen = 0.05) {
  return bandQuads(surf, axis, pos - hw, pos + hw, holeM)
    .map((q) => [Math.max(q.a0lo, q.a1lo) + endM, Math.min(q.a0hi, q.a1hi) - endM])
    .filter((s) => s[1] - s[0] > minLen)
}

/**
 * Равномерные позиции от lo+margin до hi−margin с шагом не больше pitch: число промежутков n = ceil(длина / шаг),
 * они делятся поровну — «довесков» в конце линии, дающих два элемента рядом, не бывает.
 */
export function positions(lo, hi, pitch, margin) {
  const a = lo + margin
  const b = hi - margin
  if (b - a < 0.02) return [(lo + hi) / 2]
  const n = Math.max(1, Math.ceil((b - a) / pitch - 1e-9))
  return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n)
}

/* ---------- полигоны ---------- */

export const area = (poly) => {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i]
    const [x1, y1] = poly[(i + 1) % poly.length]
    s += x0 * y1 - x1 * y0
  }
  return s / 2
}
export const perimeter = (poly) => poly.reduce((s, p, i) => s + Math.hypot(poly[(i + 1) % poly.length][0] - p[0], poly[(i + 1) % poly.length][1] - p[1]), 0)

/** Отсечение выпуклого многоугольника subject выпуклым clip (оба против часовой стрелки). */
export function clipConvex(subject, clip) {
  let out = subject
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i]
    const b = clip[(i + 1) % clip.length]
    const inside = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= -1e-9
    const inter = (p, q) => {
      const dx = q[0] - p[0]
      const dy = q[1] - p[1]
      const ex = b[0] - a[0]
      const ey = b[1] - a[1]
      const t = (ex * (a[1] - p[1]) - ey * (a[0] - p[0])) / (ex * dy - ey * dx || 1e-12)
      return [p[0] + t * dx, p[1] + t * dy]
    }
    const inp = out
    out = []
    for (let k = 0; k < inp.length; k++) {
      const p = inp[k]
      const q = inp[(k + 1) % inp.length]
      if (inside(p)) {
        out.push(p)
        if (!inside(q)) out.push(inter(p, q))
      } else if (inside(q)) out.push(inter(p, q))
    }
  }
  return out
}

/** Прямоугольник r = [s0, s1, t0, t1] минус прямоугольник-проём h = {s, t}. */
export function subRect(r, h) {
  if (h.s[1] <= r[0] + EPS || h.s[0] >= r[1] - EPS || h.t[1] <= r[2] + EPS || h.t[0] >= r[3] - EPS) return [r]
  const o = []
  if (h.t[0] > r[2] + EPS) o.push([r[0], r[1], r[2], h.t[0]])
  if (h.t[1] < r[3] - EPS) o.push([r[0], r[1], h.t[1], r[3]])
  const m0 = Math.max(r[2], h.t[0])
  const m1 = Math.min(r[3], h.t[1])
  if (h.s[0] > r[0] + EPS) o.push([r[0], h.s[0], m0, m1])
  if (h.s[1] < r[1] - EPS) o.push([h.s[1], r[1], m0, m1])
  return o
}

export const rectPoly = (r) => [[r[0], r[2]], [r[1], r[2]], [r[1], r[3]], [r[0], r[3]]]

export const insidePoly = (p, poly) => {
  // выпуклый CCW
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) < -1e-9) return false
  }
  return true
}

/* ---------- построитель призм (объединённая геометрия) ---------- */

/**
 * Накапливает призмы, заданные многоугольником в (s,t) и глубиной [w0, w1],
 * и превращает их в одну BufferGeometry в мировых координатах. owners хранит диапазоны треугольников по id.
 */
export class Builder {
  constructor(surf) {
    this.M = frameMatrix(surf)
    this.pos = []
    this.nor = []
    this.uv = []
    this.owners = []
    this.tris = 0
  }

  prism(poly0, w0, w1, id, swapUV = false) {
    let poly = poly0
    if (area(poly) < 0) poly = [...poly].reverse()
    const n = poly.length
    if (n < 3) return
    const start = this.tris
    const push = (p, nr, u, v) => {
      this.pos.push(p[0], p[1], p[2])
      this.nor.push(nr[0], nr[1], nr[2])
      this.uv.push(u, v)
    }
    const tri = (a, b, c, nr, ua, ub, uc) => {
      push(a, nr, ...ua)
      push(b, nr, ...ub)
      push(c, nr, ...uc)
      this.tris++
    }
    const uvOf = (p) => (swapUV ? [p[1], p[0]] : [p[0], p[1]])
    for (let i = 1; i < n - 1; i++) {
      const a = poly[0]
      const b = poly[i]
      const c = poly[i + 1]
      tri([a[0], a[1], w1], [b[0], b[1], w1], [c[0], c[1], w1], [0, 0, 1], uvOf(a), uvOf(b), uvOf(c))
      tri([a[0], a[1], w0], [c[0], c[1], w0], [b[0], b[1], w0], [0, 0, -1], uvOf(a), uvOf(c), uvOf(b))
    }
    let acc = 0
    for (let i = 0; i < n; i++) {
      const p = poly[i]
      const q = poly[(i + 1) % n]
      const ds = q[0] - p[0]
      const dt = q[1] - p[1]
      const l = Math.hypot(ds, dt) || 1
      const nr = [dt / l, -ds / l, 0]
      const a = [p[0], p[1], w0]
      const b = [q[0], q[1], w0]
      const c = [q[0], q[1], w1]
      const dd = [p[0], p[1], w1]
      const u0 = swapUV ? w0 : acc
      const u1 = swapUV ? w0 : acc + l
      const v = (w) => (swapUV ? acc : w)
      tri(a, b, c, nr, [u0, v(w0)], [u1, swapUV ? acc + l : w0], [u1, swapUV ? acc + l : w1])
      tri(a, c, dd, nr, [u0, v(w0)], [u1, swapUV ? acc + l : w1], [u0, swapUV ? acc : w1])
      acc += l
    }
    if (id !== undefined) this.owners.push({ id, start, count: this.tris - start })
  }

  geometry() {
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(this.pos)
    const nor = new Float32Array(this.nor)
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uv), 2))
    g.applyMatrix4(this.M)
    if (this.M.determinant() < 0) {
      // отражённая система координат — переворачиваем обход треугольников
      const p = g.attributes.position.array
      const nn = g.attributes.normal.array
      const u = g.attributes.uv.array
      for (let i = 0; i < p.length; i += 9) {
        for (let k = 0; k < 3; k++) {
          const t = p[i + 3 + k]
          p[i + 3 + k] = p[i + 6 + k]
          p[i + 6 + k] = t
          const tn = nn[i + 3 + k]
          nn[i + 3 + k] = nn[i + 6 + k]
          nn[i + 6 + k] = tn
        }
        const t0 = u[(i / 9) * 6 + 2]
        const t1 = u[(i / 9) * 6 + 3]
        u[(i / 9) * 6 + 2] = u[(i / 9) * 6 + 4]
        u[(i / 9) * 6 + 3] = u[(i / 9) * 6 + 5]
        u[(i / 9) * 6 + 4] = t0
        u[(i / 9) * 6 + 5] = t1
      }
    }
    g.userData.owners = this.owners
    g.computeBoundingSphere()
    return g
  }
}

/** Плоская поверхность по многоугольнику с проёмами (ППУ-«шкура» основания). */
export function skinGeometry(surf, depth = 0.0008, poly = surf.skinPoly, withHoles = true) {
  const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p[0], p[1])))
  ;(withHoles ? surf.holes : [])
    .filter((h) => h.kind !== 'niche')
    .forEach((h) => {
      const path = new THREE.Path([new THREE.Vector2(h.s[0], h.t[0]), new THREE.Vector2(h.s[1], h.t[0]), new THREE.Vector2(h.s[1], h.t[1]), new THREE.Vector2(h.s[0], h.t[1])])
      shape.holes.push(path)
    })
  const g = new THREE.ShapeGeometry(shape)
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) pos.setZ(i, depth)
  const M = frameMatrix(surf)
  g.applyMatrix4(M)
  if (M.determinant() < 0) {
    const idx = g.index.array
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]]
  }
  g.computeVertexNormals()
  return g
}

/** Контур поверхности линией (для подсветки выбранной). */
export function outlinePoints(surf, depth = 0.003) {
  const M = frameMatrix(surf)
  const pts = [...surf.skinPoly, surf.skinPoly[0]].map((p) => new THREE.Vector3(p[0], p[1], depth).applyMatrix4(M))
  return pts.map((v) => v.toArray())
}

/** Первое-подходящее упаковывание (FFD) отрезков по длине в хлысты stock. Возвращает { bins, used, remainder }. */
export function packLengths(lengths, stock, kerf = 0.003) {
  const bins = []
  for (const l of [...lengths].sort((a, b) => b - a)) {
    const need = l + kerf
    let best = -1
    for (let i = 0; i < bins.length; i++) if (bins[i] >= need - 1e-9 && (best < 0 || bins[i] < bins[best])) best = i
    if (best >= 0) bins[best] -= need
    else bins.push(stock - need)
  }
  return { count: bins.length, rest: bins }
}
