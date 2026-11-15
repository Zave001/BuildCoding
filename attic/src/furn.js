// Мебель: каталог, геометрия и проверки размещения (без three.js).
// Локальные оси предмета: перед — +z, спинка/голова — −z. Поворот rot — вокруг Y (как в three.js).
import { K } from './params'

export const CATALOG = {
  desk: {
    name: 'Стол', cat: 'tables', w: 1.68, d: 0.8, h: 0.78, support: true, topH: 0.78,
    info: 'венге + светлый дуб', defaults: { v: 0 },
    variants: ['Столешница венге, опоры дуб', 'Столешница дуб, опоры венге'],
  },
  table: {
    name: 'Стол тёмный', cat: 'tables', w: 1.7, d: 0.75, h: 0.8, support: true, topH: 0.8,
    info: 'тёмное дерево, с ПК на фото', defaults: {},
  },
  dresser: {
    name: 'Комод', cat: 'storage', w: 0.76, d: 0.34, h: 0.73, support: true, topH: 0.73,
    info: 'венге + светлый дуб', defaults: { v: 0 },
    variants: ['Корпус венге, фасады дуб', 'Корпус дуб, фасады венге'],
  },
  bed: {
    name: 'Кровать', cat: 'bedroom', w: 2.0, d: 2.1, h: 1.1, info: 'спинка 110, серый плед',
    defaults: { blanket: '#9b9a9c' },
    hAt: (lx, lz) => (lz < -0.9 ? 1.1 : 0.58),
  },
  screen: {
    // DEXP WMD-120: корпус 275 см, рабочая поверхность 265×149 см (16:9), настенно-потолочная установка
    name: 'Экран DEXP WMD-120', cat: 'tech', w: 2.75, d: 0.12, h: 1.94, overhead: true, slope: true, mountY: 1.9, drop: 1.6,
    dims: '275×12 см, полотно 265×149', info: '120″, крепится на скат', defaults: { open: false },
    hAt: () => 1.94,
  },
  tv: {
    name: 'Mi TV 110 см', cat: 'tech', w: 0.97, d: 0.2, h: 0.63, onSurface: true, info: '43″, на стол или комод',
    defaults: { on: false },
  },
  chair: {
    name: 'Cougar Armor S Royal', cat: 'chairs', w: 0.68, d: 0.68, h: 1.28, info: 'игровое кресло',
    defaults: { accent: '#c0407f' },
    hAt: (lx, lz) => (lz < 0 ? 1.28 : 0.72),
    tuck: ['desk', 'table'], // можно задвинуть под стол
  },
}

export const CATS = [
  ['all', 'Всё'],
  ['tables', 'Столы'],
  ['bedroom', 'Спальня'],
  ['storage', 'Хранение'],
  ['tech', 'Техника'],
  ['chairs', 'Кресла'],
]

export const BLANKETS = [['#9b9a9c', 'Серый'], ['#6c6e73', 'Графит'], ['#b4aa9c', 'Бежево-серый'], ['#7d8a82', 'Серо-зелёный']]
export const ACCENTS = [['#c0407f', 'Розовый'], ['#7a4bd1', 'Фиолетовый'], ['#2f7fd8', 'Синий'], ['#d6a437', 'Золотой'], ['#d23b3b', 'Красный']]

const cos = Math.cos
const sin = Math.sin

export const uid = () => 'f' + Math.random().toString(36).slice(2, 9)
export const snap = (v, s = 0.05) => Math.round(v / s) * s

/** локальные (lx, lz) → мировые */
export const toWorld = (px, pz, rot, lx, lz) => [px + lx * cos(rot) + lz * sin(rot), pz - lx * sin(rot) + lz * cos(rot)]

export const rectOf = (it) => ({ cx: it.x, cz: it.z, hw: CATALOG[it.type].w / 2, hd: CATALOG[it.type].d / 2, rot: it.rot })

export function corners(r) {
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
    const [x, z] = toWorld(r.cx, r.cz, r.rot, sx * r.hw, sz * r.hd)
    return { x, z, lx: sx * r.hw, lz: sz * r.hd }
  })
}

export function pointInRect(x, z, r) {
  const dx = x - r.cx
  const dz = z - r.cz
  const lx = dx * cos(r.rot) - dz * sin(r.rot)
  const lz = dx * sin(r.rot) + dz * cos(r.rot)
  return Math.abs(lx) <= r.hw && Math.abs(lz) <= r.hd
}

export function rectsOverlap(a, b, eps = 1e-4) {
  for (const r of [a, b]) {
    for (const [ax, az] of [[cos(r.rot), -sin(r.rot)], [sin(r.rot), cos(r.rot)]]) {
      const proj = (q) => {
        const cs = corners(q).map((c) => c.x * ax + c.z * az)
        return [Math.min(...cs), Math.max(...cs)]
      }
      const [a0, a1] = proj(a)
      const [b0, b1] = proj(b)
      if (a1 <= b0 + eps || b1 <= a0 + eps) return false
    }
  }
  return true
}

const TUBE_R = 0.045

/** Внутри кабинета (z ≤ L) границы определяет ремонт на текущем этапе; в остальных комнатах — исходная геометрия. */
const inStudy = (d, z) => d.ren && z <= d.L + 1e-3
export const ceilAt = (d, x, z) => (inStudy(d, z) ? d.ren.heightAt(x) : d.heightAt(x))
const xBounds = (d, z) => (inStudy(d, z) ? [d.ren.xl, d.ren.xr] : [-d.W / 2, d.W / 2])

/**
 * Крепление на скат: tx — расстояние от оси комнаты до точки на скате, side = −1 (левый) или +1 (правый).
 * Тубус ложится на плоскость ската, ось тубуса идёт вдоль комнаты (по z), полотно висит вертикально.
 */
export function slopeMount(d, tx, side, z = d.zEnd) {
  const r = inStudy(d, z) ? d.ren : null
  const lo = (r ? (r.sec[3][0] - r.sec[2][0]) / 2 : d.cW / 2) + 0.12
  const hi = (r ? Math.max(-r.xl, r.xr) : d.W / 2) - 0.12
  const x = Math.max(lo, Math.min(hi, tx))
  const ang = Math.atan2(d.rise, d.run)
  const surf = ceilAt(d, side * x, z)
  return {
    x: side * (x - Math.sin(ang) * TUBE_R), // центр тубуса сдвинут от плоскости ската в комнату
    my: surf - Math.cos(ang) * TUBE_R,
    ang,
    rot: side > 0 ? -Math.PI / 2 : Math.PI / 2, // лицо экрана смотрит к оси комнаты
  }
}

/** Положение с учётом опоры: предметы на столе/комоде хранят локальные координаты в системе опоры. */
export function resolve(items) {
  const byId = Object.fromEntries(items.map((i) => [i.id, i]))
  return items.map((it) => {
    if (it.parent && byId[it.parent]) {
      const p = byId[it.parent]
      const [x, z] = toWorld(p.x, p.z, p.rot, it.lx, it.lz)
      return { ...it, x, z, rot: p.rot + it.lr, y: CATALOG[p.type].topH, parentId: p.id }
    }
    return { ...it, y: it.floatY || 0, parentId: null }
  })
}

/** Запретные зоны на плане: проёмы, перегородки, области открывания дверей. */
export function zonesOf(d, sc) {
  const { W, L, zG, xS, xC, zS, zC, zCabB, cabDoor: cd } = d
  const T = d.wallT
  const z = [
    { x0: xS, x1: W / 2, z0: zS, z1: zG + 0.04, label: 'проём лестницы' },
    { x0: xC, x1: W / 2, z0: zG - 0.04, z1: zG + 0.04, label: 'стена-купе', solid: true },
    { x0: xC, x1: xS, z0: zG - 0.55, z1: zG + 0.55, label: 'проход через купе' },
    { x0: -W / 2, x1: xC + 0.04, z0: zC - 0.04, z1: zCabB + 0.04, label: 'санузел', solid: true },
    { x0: cd.x0 - 0.05, x1: cd.x0 + cd.w + 0.05, z0: zC - 0.6, z1: zC, label: 'проход в санузел' },
  ]
  z.push({ x0: -W / 2, x1: -W / 2 + 0.7, z0: d.hz0 - 0.1, z1: d.hz1 + 0.1, label: 'дверь в подсобку' })
  if (sc.doorWall) {
    const dl = d.doorX - d.doorW / 2 - 0.05
    const dr = d.doorX + d.doorW / 2 + 0.05
    const zH = d.ren ? d.ren.zHi : L // внутренняя поверхность стены с учётом слоёв ремонта
    const rv = d.ren ? d.ren.reveal : 0
    z.push({ x0: -W / 2, x1: W / 2, z0: zH - 0.02, z1: L + T + 0.02, label: 'стена с дверью', solid: true })
    z.push({ x0: dl + rv, x1: dr - rv, z0: zH - 0.55, z1: L + T + 0.55, label: 'проход через дверь' })
  }
  return z
}

/** Прижать к стене, если край ближе tol. */
export function snapToWalls(cat, x, z, rot, d, tol = 0.12) {
  const ex = Math.abs(cos(rot)) * cat.w / 2 + Math.abs(sin(rot)) * cat.d / 2
  const ez = Math.abs(sin(rot)) * cat.w / 2 + Math.abs(cos(rot)) * cat.d / 2
  const [bx0, bx1] = xBounds(d, z)
  const lim = [[bx0 + ex, bx1 - ex], [(inStudy(d, z) ? d.ren.zLo : 0) + ez, d.zEnd - ez]]
  const out = [x, z]
  lim.forEach(([lo, hi], i) => {
    if (Math.abs(out[i] - lo) < tol) out[i] = lo
    else if (Math.abs(out[i] - hi) < tol) out[i] = hi
  })
  return { x: out[0], z: out[1] }
}

/**
 * Можно ли поставить предмет cand = {type, x, z, rot} (мировые координаты).
 * placed — уже расставленные предметы (resolve), selfId — какой исключить.
 * Возвращает { ok, reason, parent?, y? }.
 */
export function validate(cand, placed, d, sc, selfId) {
  const cat = CATALOG[cand.type]
  const r = { cx: cand.x, cz: cand.z, hw: cat.w / 2, hd: cat.d / 2, rot: cand.rot }
  const others = placed.filter((p) => p.id !== selfId && p.parentId == null)

  if (cat.onSurface) {
    const sup = others
      .filter((p) => CATALOG[p.type].support)
      .find((p) => pointInRect(cand.x, cand.z, rectOf(p)))
    if (!sup) return { ok: false, reason: 'Ставится только на стол или комод' }
    const kids = placed.filter((p) => p.id !== selfId && p.parentId === sup.id)
    if (kids.some((k) => rectsOverlap(r, rectOf(k)))) return { ok: false, reason: 'На поверхности уже стоит предмет' }
    const y = CATALOG[sup.type].topH
    for (const c of corners(r)) {
      if (ceilAt(d, c.x, c.z) < y + cat.h) return { ok: false, reason: 'Не помещается под скатом' }
    }
    return { ok: true, parent: sup, y }
  }

  for (const c of corners(r)) {
    if (cat.slope) {
      // на скате: вдоль комнаты — в пределах длины, поперёк — только в зоне ската
      if (c.z < -1e-3 || c.z > d.zEnd + 1e-3) return { ok: false, reason: 'Выходит за стены' }
      const xb = xBounds(d, c.z)
      const cw = inStudy(d, c.z) ? (d.ren.sec[3][0] - d.ren.sec[2][0]) / 2 : d.cW / 2
      if (Math.abs(cand.x) < cw - 0.2 || Math.abs(cand.x) > Math.max(-xb[0], xb[1])) return { ok: false, reason: 'Крепится только на скат' }
      continue
    }
    const [bx0, bx1] = xBounds(d, c.z)
    const zLo = inStudy(d, c.z) ? d.ren.zLo : 0
    if (c.x < bx0 - 1e-3 || c.x > bx1 + 1e-3 || c.z < zLo - 1e-3 || c.z > d.zEnd + 1e-3) return { ok: false, reason: d.ren && inStudy(d, c.z) ? 'Упирается в отделку' : 'Выходит за стены' }
    if (d.ren && c.z > d.ren.zHi + 1e-3 && c.z <= d.L + 1e-3) return { ok: false, reason: 'Упирается в отделку' }
    const need = cat.hAt ? cat.hAt(c.lx, c.lz) : cat.h
    if (ceilAt(d, c.x, c.z) < need + 0.005) return { ok: false, reason: 'Упирается в скат' }
  }
  for (const zn of zonesOf(d, sc)) {
    if (cat.overhead && !zn.solid) continue // висит над проходами и лестничным проёмом
    const zr = { cx: (zn.x0 + zn.x1) / 2, cz: (zn.z0 + zn.z1) / 2, hw: (zn.x1 - zn.x0) / 2, hd: (zn.z1 - zn.z0) / 2, rot: 0 }
    if (rectsOverlap(r, zr)) return { ok: false, reason: 'Мешает: ' + zn.label }
  }
  for (const o of others) {
    if (cat.overhead) break // экран висит над мебелью
    const oc = CATALOG[o.type]
    if (oc.overhead) continue
    if ((cat.tuck || []).includes(o.type) || (oc.tuck || []).includes(cand.type)) continue
    if (rectsOverlap(r, rectOf(o))) return { ok: false, reason: 'Занято: ' + oc.name }
  }
  return { ok: true, y: 0 }
}

/** Приводит результат проверки к полям предмета. */
export function stored(item, cand, res) {
  const base = { ...item, x: cand.x, z: cand.z, rot: cand.rot }
  if (cand.my !== undefined) {
    base.my = cand.my
    base.ang = cand.ang
  }
  delete base.floatY
  if (res.parent) {
    const p = res.parent
    const dx = cand.x - p.x
    const dz = cand.z - p.z
    return {
      ...base,
      parent: p.id,
      lx: dx * cos(p.rot) - dz * sin(p.rot),
      lz: dx * sin(p.rot) + dz * cos(p.rot),
      lr: cand.rot - p.rot,
    }
  }
  return { ...base, parent: null }
}

/** Отрезки препятствий для режима прогулки: контуры предметов на полу. */
export function furnSegments(placed) {
  const s = []
  for (const it of placed) {
    if (it.parentId != null || CATALOG[it.type].onSurface || CATALOG[it.type].overhead) continue
    const c = corners(rectOf(it))
    for (let i = 0; i < 4; i++) s.push([c[i].x, c[i].z, c[(i + 1) % 4].x, c[(i + 1) % 4].z])
  }
  return s
}

/** Предметы, с которыми можно взаимодействовать при прогулке (в том же списке, что и двери). */
export function screenList(placed) {
  return placed
    .filter((p) => CATALOG[p.type].overhead)
    .map((p) => ({ id: 'screen:' + p.id, x: p.x, z: p.z, open: !!p.open, name: 'экран', kind: 'screen', reach: 2.6 }))
}
