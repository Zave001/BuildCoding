// Физика прогулки без three.js: препятствия на плане и выталкивание из них
import { K } from './params'

export const EYE = 1.6 // высота глаз стоя
export const R = 0.22 // «радиус» человека
export const R_CROUCH = 0.16 // в приседе человек компактнее — иначе в дверь подсобки не пролезть
export const HATCH_MARGIN = 0.1

/** Створка двери в подсобку закрыта — перекрывает проём. */
export const hatchSeg = (d) => [-d.W / 2, d.hz0 - HATCH_MARGIN, -d.W / 2, d.hz1 + HATCH_MARGIN]

/** Высота потолка в подсобке (под скатом кровли) на расстоянии x от оси; для x внутри комнаты — высота комнаты. */
export const utilHeight = (d, x) => {
  const t = Math.abs(x) - d.W / 2
  return t <= 0 ? d.kH : Math.max(0, d.kH * (1 - t / d.utilDepth))
}

/** Препятствия на плане: отрезки [x1, z1, x2, z2]. */
export function walkSegments(d, { doorWall, doorOpen, slideOpen, cabOpen = true, utility = true }) {
  const { W, L, zG, zEnd, zCabB, xS, zS, xC, zC, cabDoor: cd } = d
  const T = K.doorWallT
  // левая стена: с подсобкой в ней есть проём двери (с запасом по краям — чтобы пролезть боком)
  const hm = HATCH_MARGIN
  const leftWall = utility
    ? [
        [-W / 2, 0, -W / 2, d.hz0 - hm],
        [-W / 2, d.hz1 + hm, -W / 2, zEnd],
        // торцы подсобки
        [-d.xE, 0, -W / 2, 0],
        [-d.xE, zEnd, -W / 2, zEnd],
      ]
    : [[-W / 2, 0, -W / 2, zEnd]]
  const ren = d.ren
  const s = [
    [-W / 2, 0, W / 2, 0],
    ...leftWall,
    [W / 2, 0, W / 2, zEnd],
    // перила и открытая сторона лестничного проёма
    [xS, zS - 0.03, W / 2, zS - 0.03],
    [xS, zS - 0.03, xS, zG],
    // стеклянная стена и торец кухни
    [xS, zG, W / 2, zG],
    [-W / 2, zEnd, W / 2, zEnd],
    // санузел
    [-W / 2, zC, cd.x0, zC],
    [cd.x0 + cd.w, zC, xC, zC],
    [xC, zC, xC, zCabB],
    [-W / 2, zCabB, xC, zCabB],
  ]
  // ремонт кабинета: внутренние поверхности слоёв на текущем этапе — стены, торцы и откосы двери
  if (ren) {
    const { xl, xr, zLo, zHi, reveal } = ren
    const dl = d.doorX - d.doorW / 2 + reveal
    const dr = d.doorX + d.doorW / 2 - reveal
    s.push([xl, zLo, xl, zHi], [xr, zLo, xr, zHi], [xl, zLo, xr, zLo])
    if (doorWall) {
      s.push([xl, zHi, dl, zHi], [dr, zHi, xr, zHi])
      if (zHi < L - 1e-4) s.push([dl, zHi, dl, L], [dr, zHi, dr, L])
    } else s.push([xl, zHi, xr, zHi])
  }
  // блок вентиляции в левой подсобке — препятствие при ползании
  if (d.ventUnit) {
    const u = d.ventUnit
    s.push([u.x0, u.z0, u.x1, u.z0], [u.x1, u.z0, u.x1, u.z1], [u.x1, u.z1, u.x0, u.z1], [u.x0, u.z1, u.x0, u.z0])
  }
  // створка санузла (петли со стороны прохода): открытая торчит в комнату, закрытая перекрывает арку
  const hx = cd.x0 + cd.w
  if (cabOpen) s.push([hx, zC - 0.04, hx - cd.w * Math.cos(1.35), zC - 0.04 - cd.w * Math.sin(1.35)])
  else s.push([cd.x0, zC, hx, zC])
  // унитаз
  const tx = (-W / 2 + xC) / 2
  const tz = zCabB - 0.66
  s.push([tx - 0.2, tz, tx + 0.2, tz], [tx - 0.2, tz, tx - 0.2, zCabB], [tx + 0.2, tz, tx + 0.2, zCabB])
  if (!slideOpen) s.push([xS, zG, xC, zG])
  if (doorWall) {
    const dl = d.doorX - d.doorW / 2
    const dr = d.doorX + d.doorW / 2
    s.push([-W / 2, L, dl, L], [dr, L, W / 2, L], [-W / 2, L + T, dl, L + T], [dr, L + T, W / 2, L + T], [dl, L, dl, L + T], [dr, L, dr, L + T])
    if (doorOpen) {
      const hx = dl + 0.0325
      const lw = d.doorW - 0.065
      s.push([hx, L + T / 2 - 0.02, hx + lw * Math.cos(1.45), L + T / 2 - 0.02 - lw * Math.sin(1.45)])
    } else s.push([dl, L + T / 2, dr, L + T / 2])
  }
  return s
}

export function pushOut(p, segs, r = R) {
  for (let it = 0; it < 3; it++) {
    for (const [ax, az, bx, bz] of segs) {
      const dx = bx - ax
      const dz = bz - az
      const l2 = dx * dx + dz * dz || 1e-9
      const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / l2))
      const cx = ax + t * dx
      const cz = az + t * dz
      let ox = p.x - cx
      let oz = p.z - cz
      const dist = Math.hypot(ox, oz)
      if (dist < r) {
        if (dist < 1e-6) {
          ox = -dz
          oz = dx
        }
        const k = (r - dist) / (Math.hypot(ox, oz) || 1)
        p.x += ox * k
        p.z += oz * k
      }
    }
  }
}

/** Допустимый диапазон x для человека с глазами на высоте eye в точке z (учитывает ремонт кабинета). */
export function xRange(d, eye, z) {
  const head = eye + 0.12
  if (d.ren && z <= d.L + 1e-3) {
    const lo = d.ren.xMinAt(head) + R
    const hi = d.ren.xMaxAt(head) - R
    return lo > hi ? [(lo + hi) / 2, (lo + hi) / 2] : [lo, hi]
  }
  const x = limitX(d, eye)
  return [-x, x]
}

/** Максимальная высота глаз в точке (x, z): потолок кабинета с ремонтом может быть ниже обычного. */
export const maxEye = (d, x, z) => (d.ren && z <= d.L + 1e-3 ? d.ren.heightAt(x) - 0.14 : Infinity)

// Голова не должна упираться в скат: у бокового перекрытия можно стоять только пригнувшись
export function limitX(d, eye) {
  const head = eye + 0.12
  let x = d.W / 2 - R
  if (head > d.kH) x = Math.min(x, Math.max(d.cW / 2, d.W / 2 - ((head - d.kH) * d.run) / d.rise))
  return x
}

/** Двери, с которыми можно взаимодействовать при прогулке. */
export function doorList(d, sc) {
  const list = []
  if (sc.doorWall) list.push({ id: 'entry', x: d.doorX, z: d.L + K.doorWallT / 2, open: sc.doorOpen, name: 'дверь' })
  list.push({ id: 'slide', x: (d.xC + d.xS) / 2, z: d.zG, open: sc.slideOpen, name: 'дверь-купе' })
  if (sc.utility ?? true) list.push({ id: 'hatch', x: -d.W / 2, z: (d.hz0 + d.hz1) / 2, open: sc.hatchOpen, name: 'дверь в подсобку', reach: 1.7 })
  list.push({ id: 'cabin', x: d.cabDoor.x0 + d.cabDoor.w / 2, z: d.zC, open: sc.cabOpen, name: 'дверь санузла' })
  return list
}
