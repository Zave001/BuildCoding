// Новая каркасная стена с дверью между кабинетом и залом: направляющие UD на виброленте, стойки CW, минвата, ГКЛ с двух сторон.
// Подвесов у неё нет: стена стоит сама на полу и упирается в боковые стены и скаты через виброразвязку.
// Координаты стены: s = x, t = y (как у торцевых поверхностей), w — от стороны кабинета к залу (z = L + w).
import { positions, area, perimeter, clipConvex, subRect, rectPoly, packLengths } from './geom'
import { wallDims } from './stack'

const EPS = 1e-6

/** Внутренний сдвиг выпуклого многоугольника (против часовой стрелки) на o. */
export function offsetPoly(poly, o) {
  const n = poly.length
  const lines = poly.map((p, i) => {
    const q = poly[(i + 1) % n]
    const dx = q[0] - p[0]
    const dy = q[1] - p[1]
    const l = Math.hypot(dx, dy)
    const ex = dx / l
    const ey = dy / l
    return { p: [p[0] - ey * o, p[1] + ex * o], d: [ex, ey] }
  })
  const inter = (a, b) => {
    const det = a.d[0] * b.d[1] - a.d[1] * b.d[0]
    const t = ((b.p[0] - a.p[0]) * b.d[1] - (b.p[1] - a.p[1]) * b.d[0]) / (det || 1e-12)
    return [a.p[0] + a.d[0] * t, a.p[1] + a.d[1] * t]
  }
  return poly.map((_, i) => inter(lines[(i + n - 1) % n], lines[i]))
}

const yMaxAt = (poly, x) => {
  let best = -Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    if (Math.abs(b[0] - a[0]) < 1e-9) continue
    const lo = Math.min(a[0], b[0])
    const hi = Math.max(a[0], b[0])
    if (x < lo - 1e-9 || x > hi + 1e-9) continue
    best = Math.max(best, a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]))
  }
  return best
}

/** Листы ГКЛ одного слоя на плоскости стены (с проёмом двери и скатами): тот же раскрой и сдвиг швов, что у остальных поверхностей. */
function sheetPieces(surf, dwc, k) {
  const us = dwc.orient === 'along' ? dwc.sheetL : dwc.sheetW
  const vs = dwc.orient === 'along' ? dwc.sheetW : dwc.sheetL
  const offU = k === 0 ? 0 : ((dwc.shift % us) + us) % us
  const offV = k === 0 ? 0 : vs / 2
  const B = surf.bounds
  const bs = []
  for (let b = B.s[0] - offU; b < B.s[1] - EPS; b += us) bs.push(b)
  bs.push(bs[bs.length - 1] + us)
  const bt = []
  for (let b = B.t[0] - offV; b < B.t[1] - EPS; b += vs) bt.push(b)
  bt.push(bt[bt.length - 1] + vs)
  const out = []
  const gap = 0.0015
  for (let i = 0; i < bs.length - 1; i++) {
    for (let j = 0; j < bt.length - 1; j++) {
      const r0 = [Math.max(bs[i], B.s[0]), Math.min(bs[i + 1], B.s[1]), Math.max(bt[j], B.t[0]), Math.min(bt[j + 1], B.t[1])]
      if (r0[1] - r0[0] < 0.01 || r0[3] - r0[2] < 0.01) continue
      const cellFull = Math.abs(r0[1] - r0[0] - us) < 1e-4 && Math.abs(r0[3] - r0[2] - vs) < 1e-4
      let rects = [[r0[0] + gap / 2, r0[1] - gap / 2, r0[2] + gap / 2, r0[3] - gap / 2]]
      for (const h of surf.holes) rects = rects.flatMap((r) => subRect(r, h))
      const cut = rects.length !== 1 || Math.abs(rects[0][1] - rects[0][0] - (r0[1] - r0[0] - gap)) > 1e-4 || Math.abs(rects[0][3] - rects[0][2] - (r0[3] - r0[2] - gap)) > 1e-4
      for (const r of rects) {
        if (r[1] - r[0] < 0.005 || r[3] - r[2] < 0.005) continue
        const c = clipConvex(rectPoly(r), surf.poly)
        if (c.length < 3) continue
        const a = area(c)
        if (a < 1e-4) continue
        const clipped = Math.abs(a - (r[1] - r[0]) * (r[3] - r[2])) > 1e-5
        out.push({ poly: c, area: a, full: cellFull && !cut && !clipped })
      }
    }
  }
  return out
}

/** Что и где построить: каркас, вата, листы, развязка по краям; количества и оценка резонанса. */
export function genWall(d, cfg) {
  const w = cfg.wall
  if (!w.enabled) return null
  const wd = wallDims(cfg)
  const W2 = d.W / 2
  const gable = [[-W2, 0], [W2, 0], [W2, d.kH], [d.cW / 2, d.cH], [-d.cW / 2, d.cH], [-W2, d.kH]]
  const ud = 0.04 // полка направляющей
  const tp = w.edge === 'rigid' ? 0 : 0.004 // виброразвязывающая лента под направляющей
  const dl = d.doorX - d.doorW / 2
  const dr = d.doorX + d.doorW / 2
  const dh = d.doorH
  const A0 = offsetPoly(gable, tp)
  const A1 = offsetPoly(gable, tp + ud)
  const pitch = w.studPitch / 100
  const warnings = []
  const info = []

  /* --- направляющие и лента по периметру (внизу — с разрывом на проёме двери) --- */
  const tracks = []
  const tape = []
  for (let i = 0; i < gable.length; i++) {
    const j = (i + 1) % gable.length
    const strip = [A0[i], A0[j], A1[j], A1[i]]
    const tapeStrip = [gable[i], gable[j], A0[j], A0[i]]
    if (i === 0) {
      // нижняя направляющая разрывается на проёме двери
      const x0 = A0[0][0]
      const x1 = A0[1][0]
      for (const [a, b] of [[x0, Math.min(dl, x1)], [Math.max(dr, x0), x1]]) {
        if (b - a > 0.02) {
          tracks.push([[a, A0[0][1]], [b, A0[0][1]], [b, A1[0][1]], [a, A1[0][1]]])
          if (tp > 0) tape.push([[a, 0], [b, 0], [b, A0[0][1]], [a, A0[0][1]]])
        }
      }
    } else {
      tracks.push(strip)
      if (tp > 0) tape.push(tapeStrip)
    }
  }
  // перемычка над дверью
  const header = [[dl - 0.1, dh], [dr + 0.1, dh], [dr + 0.1, dh + ud], [dl - 0.1, dh + ud]]
  tracks.push(header)

  /* --- стойки: основные, двойные по краям проёма, над перемычкой --- */
  const yb = A1[0][1]
  const xl = A1[0][0]
  const xr = A1[1][0]
  const stud = (x, y0) => {
    const top = Math.min(yMaxAt(A1, x - 0.025), yMaxAt(A1, x + 0.025), yMaxAt(A1, x))
    const topL = yMaxAt(A1, x - 0.025)
    const topR = yMaxAt(A1, x + 0.025)
    if (top - y0 < 0.08) return null
    return { x, y0, poly: [[x - 0.025, y0], [x + 0.025, y0], [x + 0.025, topR], [x - 0.025, topL]], len: Math.max(topL, topR) - y0 }
  }
  const studs = []
  const xsMain = positions(xl, xr, pitch, 0.03).filter((x) => x < dl - 0.12 || x > dr + 0.12)
  for (const x of xsMain) studs.push(stud(x, yb))
  for (const x of [dl - 0.025, dl - 0.075, dr + 0.025, dr + 0.075]) studs.push(stud(x, yb)) // двойные стойки у проёма
  const xsCrip = positions(dl, dr, pitch, 0.03)
  for (const x of xsCrip) studs.push(stud(x, dh + ud))
  const studList = studs.filter(Boolean)

  /* --- вата: ячейки между стойками, над перемычкой — отдельно --- */
  const wool = []
  const tw = Math.min(w.woolT, w.frame) / 1000
  const top = (x) => yMaxAt(A1, x)
  const bay = (a, b, y0) => {
    if (b - a < 0.02) return
    const ta = top(a + 1e-6)
    const tb = top(b - 1e-6)
    if (Math.min(ta, tb) - y0 < 0.05) return
    wool.push([[a, y0], [b, y0], [b, tb], [a, ta]])
  }
  const lower = [...studList.filter((s) => s.y0 === yb).map((s) => s.x)].sort((p, q) => p - q)
  const edgesL = [xl, ...lower.flatMap((x) => [x - 0.025, x + 0.025]), xr]
  for (let i = 0; i < edgesL.length; i += 2) {
    const a = edgesL[i]
    const b = edgesL[i + 1]
    const mid = (a + b) / 2
    if (mid > dl - 0.05 && mid < dr + 0.05) continue // между двойными стойками проём
    bay(a, b, yb)
  }
  const upper = [dl, ...xsCrip.flatMap((x) => [x - 0.025, x + 0.025]), dr]
  for (let i = 0; i < upper.length; i += 2) bay(upper[i], upper[i + 1], dh + ud)

  /* --- ГКЛ: слои с двух сторон, швы второго слоя смещены --- */
  const wallSurf = { kind: 'end', bounds: { s: [-W2, W2], t: [0, d.cH] }, poly: gable, holes: [{ s: [dl, dr], t: [0, dh], kind: 'door' }] }
  const dwc = cfg.drywall
  const sheets = { cab: [], hall: [] }
  for (let k = 0; k < wd.nl; k++) {
    const pcs = sheetPieces(wallSurf, dwc, k)
    sheets.cab.push(pcs)
    sheets.hall.push(pcs)
  }

  /* --- развязка по краям: виброопоры по периметру (кроме низа) --- */
  const pads = []
  if (w.edge === 'bracket') {
    for (let i = 1; i < gable.length; i++) {
      const a = gable[i]
      const b = gable[(i + 1) % gable.length]
      const l = Math.hypot(b[0] - a[0], b[1] - a[1])
      const n = Math.max(1, Math.ceil(l / 0.6))
      for (let k = 0; k <= n; k++) pads.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])
    }
  }

  /* --- количества --- */
  const edgeLen = (poly) => poly.reduce((s, p, i) => s + Math.max(Math.hypot(poly[(i + 1) % 4][0] - p[0], poly[(i + 1) % 4][1] - p[1]), 0), 0) / 2
  const trackLens = tracks.map((p) => Math.max(Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]), Math.hypot(p[2][0] - p[3][0], p[2][1] - p[3][1])))
  const trackLen = trackLens.reduce((s, v) => s + v, 0)
  const studPack = packLengths(studList.map((s) => s.len), 3)
  const trackPack = packLengths(trackLens, 3)
  const woolArea = wool.reduce((s, p) => s + area(p), 0)
  const sheetArea = sheets.cab.flat().reduce((s, x) => s + x.area, 0) * 2
  const perim = perimeter(gable)
  void edgeLen
  const m1 = wd.nl * (cfg.drywall.thickness * 0.8) // кг/м² одной стороны (ГКЛ ≈ 0,8 кг на мм толщины)
  const f0 = 60 * Math.sqrt((2 / m1) / Math.max(0.03, tw > 0 ? wd.fd : wd.fd))
  if (w.woolOn === false) warnings.push('Стена с дверью без минваты в полости: звукоизоляция заметно хуже, возникает «барабанный» резонанс. Вату в полость нужно ставить.')
  if (w.edge === 'rigid') warnings.push('Стена с дверью жёстко закреплена к боковым стенам и скатам: звук и вибрации пойдут по обходным путям — используйте виброленту и герметик по периметру.')
  if (w.woolT > w.frame) warnings.push('Вата в стене толще полости профиля — будет сжата и потеряет свойства.')
  if (f0 > 100) warnings.push(`Ориентировочная частота резонанса стены ${f0.toFixed(0)} Гц — выше 100 Гц: увеличьте глубину профиля или число слоёв ГКЛ.`)
  info.push(`Стена: ГКЛ ${wd.nl}×${cfg.drywall.thickness} мм с каждой стороны + профиль CW${w.frame} (шаг стоек ${w.studPitch} см) + вата ${(tw * 1000).toFixed(0)} мм = ${(wd.total * 1000).toFixed(0)} мм. Подвесов на ней нет: она стоит сама.`)
  info.push(`Ориентировочная частота «масса–пружина–масса» ≈ ${f0.toFixed(0)} Гц (ниже 100 Гц — резонанс вне основного шума).`)
  info.push(w.edge === 'tape'
    ? 'Развязка: направляющие стоят на виброленте, зазор 5–10 мм между ГКЛ и прилегающими поверхностями герметизирован акустическим герметиком. Лист ГКЛ стены не прикручивают к боковым стенам и скатам.'
    : w.edge === 'bracket'
      ? 'Развязка: вибролента под направляющими, виброопоры по краям и акустический герметик. Опоры нужны, если рядом с краем стены каркас отделки лёгкий и «звенит».'
      : 'Развязка по краям не выполнена (жёсткое крепление).')

  return {
    dims: wd, gable, A0, A1, tracks, tape, studs: studList, wool, tw, sheets, pads, header, doorHole: [dl, dr, dh], f0, perim,
    qty: {
      studs: studPack.count, studLen: studList.reduce((s, x) => s + x.len, 0), tracks: trackPack.count, trackLen,
      tape: tp > 0 ? trackLen : 0, sealant: Math.ceil((2 * perim) / 6), pads: pads.length,
      woolArea: w.woolOn === false ? 0 : woolArea, woolVol: w.woolOn === false ? 0 : woolArea * tw, sheetArea,
      studCount: studList.length,
    },
    warnings, info,
  }
}
