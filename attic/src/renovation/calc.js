// Расчёт ремонта: раскладка всех элементов, смета, потеря площади, проверки.
// Чистая логика без three.js-рендера: изменение любого параметра перестраивает и 3D, и смету из одних и тех же данных.
import { SURF, SURF_BY_ID, MATERIALS, LABOR, EXTRA_IDS } from './data'
export { stackOf } from './stack'
import { stackOf, innerSection, thicknessFinal, enabledOf, studyGeometry } from './stack'
import { makeSurfaces, bandQuads, quadPoly, quadLen, quadSlanted, lineSegs, positions, area, perimeter, clipConvex, subRect, rectPoly, insidePoly, packLengths } from './geom'

const EPS = 1e-6
const sum = (a) => a.reduce((s, v) => s + v, 0)
const pad = (n, w = 3) => String(n).padStart(w, '0')

/* ---------- вспомогательное ---------- */

const splitSeg = (lo, hi, stock) => {
  const l = hi - lo
  if (l <= stock + EPS) return [[lo, hi]]
  const n = Math.ceil(l / stock - EPS)
  const out = []
  for (let i = 0; i < n; i++) out.push([lo + i * stock, Math.min(hi, lo + (i + 1) * stock)])
  return out
}
const ptST = (axis, along, perp) => (axis === 's' ? [along, perp] : [perp, along])

function holesArea(surf) {
  return sum(surf.holes.map((h) => (h.s[1] - h.s[0]) * (h.t[1] - h.t[0])))
}

/** Поверхность не обрабатывается: слоёв нет, толщина 0. */
function emptyGen(surf) {
  return {
    id: surf.id, hangers: [], profiles: [], joints: [], crabs: [], wool: [], woolT: 0,
    sheets: [[], []], screws: [[], []], seams: [{ s: [], t: [] }, { s: [], t: [] }],
    battens: [], boards: [], reveals: [], lines: { A: [], B: [] }, axBd: 's', batPos: [], netArea: 0, perim: 0,
  }
}

/* ---------- раскладка по одной поверхности ---------- */

function genSurface(surf, cfg, st, d) {
  const meta = SURF_BY_ID[surf.id]
  const f = cfg.frame
  const hg = cfg.hangers[meta.group]
  const sc = cfg.surfaces[surf.id]
  const pitch = f.pitch / 100
  const edge = f.edge / 100
  // направление досок и профилей. При креплении вагонки прямо на ГКЛ внешние профили идут поперёк досок.
  const axBd = cfg.boardDir === 'horizontal' ? 's' : 't'
  const axBt = axBd === 's' ? 't' : 's'
  const hasFrame = st.frame
  const direct = st.mode === 'direct'
  const axA = direct ? (f.scheme === 'two' ? axBd : axBt) : f.dir === 'along' ? 's' : 't'
  const axB = axA === 's' ? 't' : 's'
  const B = surf.bounds
  const hw = st.pw / 2
  const stockP = f.stock

  const R = {
    id: surf.id, hangers: [], profiles: [], joints: [], crabs: [], wool: [], woolT: 0,
    sheets: [[], []], screws: [[], []], seams: [{ s: [], t: [] }, { s: [], t: [] }],
    battens: [], boards: [], reveals: [], lines: { A: [], B: [] },
  }
  const gross = area(surf.poly)
  R.netArea = gross - holesArea(surf)
  R.perim = perimeter(surf.poly)

  /* --- несущие/основные линии и подвесы --- */
  let outerPos = [] // позиции линий внешнего профиля — по ним крепится вагонка прямо на ГКЛ
  const posA = !hasFrame ? [] : f.scheme === 'two' ? positions(B[axB][0], B[axB][1], hg.row / 100, hg.margin / 100) : positions(B[axB][0], B[axB][1], pitch, edge)
  if (hasFrame && f.scheme !== 'two') outerPos = posA
  R.lines.A = posA
  const segsA = []
  for (const p of posA) {
    for (const [lo, hi] of lineSegs(surf, axA, p, hw, 0.01, 0.03)) {
      segsA.push({ p, lo, hi })
      const lineId = `${axA}:${p.toFixed(3)}:A`
      splitSeg(lo, hi, stockP).forEach(([a, b], k) => {
        R.profiles.push({ axis: axA, pos: p, lo: a, hi: b, level: 'A', lineId })
        if (k > 0) R.joints.push(ptST(axA, a, p))
      })
      const hm = Math.min(hg.margin / 100, (hi - lo) / 2)
      // подвес: [s, t, ось профиля, линия профиля, к которой он крепится]
      for (const a of positions(lo, hi, hg.step / 100, hm)) R.hangers.push([...ptST(axA, a, p), axA, lineId])
    }
  }

  /* --- поперечные линии (двухуровневая схема) --- */
  if (st.levels === 2) {
    const posB = positions(B[axA][0], B[axA][1], pitch, edge)
    outerPos = posB
    R.lines.B = posB
    const segsB = []
    for (const q of posB) {
      for (const [lo, hi] of lineSegs(surf, axB, q, hw, 0.01, 0.03)) {
        segsB.push({ q, lo, hi })
        splitSeg(lo, hi, stockP).forEach(([a, b], k) => {
          R.profiles.push({ axis: axB, pos: q, lo: a, hi: b, level: 'B', lineId: `${axB}:${q.toFixed(3)}:B` })
          if (k > 0) R.joints.push(ptST(axB, a, q))
        })
      }
    }
    // «крабы» — в каждом пересечении несущего и поперечного профиля
    for (const A of segsA) for (const Bq of segsB) if (Bq.q >= A.lo && Bq.q <= A.hi && A.p >= Bq.lo && A.p <= Bq.hi) R.crabs.push(ptST(axA, Bq.q, A.p))
  }

  /* --- минеральная вата: полосы между несущими профилями --- */
  R.woolT = hasFrame && sc.wool ? sc.woolT : 0
  if (hasFrame && sc.wool) {
    const bounds = [{ p: B[axB][0], h: 0 }, ...posA.map((p) => ({ p, h: hw })), { p: B[axB][1], h: 0 }]
    for (let i = 0; i < bounds.length - 1; i++) {
      const g0 = bounds[i].p + bounds[i].h
      const g1 = bounds[i + 1].p - bounds[i + 1].h
      if (g1 - g0 < 0.01) continue
      for (const q of bandQuads(surf, axA, g0, g1)) R.wool.push(quadPoly(q))
    }
  }

  /* --- гипсокартон: отдельные листы по слоям --- */
  const dwc = cfg.drywall
  const us = dwc.orient === 'along' ? dwc.sheetL : dwc.sheetW // размер листа вдоль s
  const vs = dwc.orient === 'along' ? dwc.sheetW : dwc.sheetL // и вдоль t
  const gap = 0.0015
  for (let k = 0; k < (hasFrame ? dwc.layers : 0); k++) {
    const offU = k === 0 ? 0 : ((dwc.shift % us) + us) % us
    const offV = k === 0 ? 0 : vs / 2
    const bs = []
    for (let b = B.s[0] - offU; b < B.s[1] - EPS; b += us) bs.push(b)
    bs.push(bs[bs.length - 1] + us)
    const bt = []
    for (let b = B.t[0] - offV; b < B.t[1] - EPS; b += vs) bt.push(b)
    bt.push(bt[bt.length - 1] + vs)
    R.seams[k].s = bs.slice(1, -1).filter((x) => x > B.s[0] + 0.02 && x < B.s[1] - 0.02)
    R.seams[k].t = bt.slice(1, -1).filter((x) => x > B.t[0] + 0.02 && x < B.t[1] - 0.02)
    for (let i = 0; i < bs.length - 1; i++) {
      for (let j = 0; j < bt.length - 1; j++) {
        const r0 = [Math.max(bs[i], B.s[0]), Math.min(bs[i + 1], B.s[1]), Math.max(bt[j], B.t[0]), Math.min(bt[j + 1], B.t[1])]
        if (r0[1] - r0[0] < 0.01 || r0[3] - r0[2] < 0.01) continue
        const cellFull = Math.abs(r0[1] - r0[0] - us) < 1e-4 && Math.abs(r0[3] - r0[2] - vs) < 1e-4
        let rects = [[r0[0] + gap / 2, r0[1] - gap / 2, r0[2] + gap / 2, r0[3] - gap / 2]]
        for (const h of surf.holes) rects = rects.flatMap((r) => subRect(r, h))
        const cutByHole = rects.length !== 1 || Math.abs((rects[0][1] - rects[0][0]) - (r0[1] - r0[0] - gap)) > 1e-4 || Math.abs((rects[0][3] - rects[0][2]) - (r0[3] - r0[2] - gap)) > 1e-4
        for (const r of rects) {
          if (r[1] - r[0] < 0.005 || r[3] - r[2] < 0.005) continue
          let poly = rectPoly(r)
          let clipped = false
          if (surf.kind === 'end') {
            const c = clipConvex(poly, surf.poly)
            if (c.length < 3) continue
            clipped = Math.abs(area(c) - area(poly)) > 1e-5
            poly = c
          }
          const a = area(poly)
          if (a < 1e-4) continue
          R.sheets[k].push({ poly, area: a, full: cellFull && !cutByHole && !clipped })
          // саморезы: сетка 20 см внутри листа
          const xs = poly.map((p) => p[0])
          const ys = poly.map((p) => p[1])
          for (let x = Math.min(...xs) + 0.03; x < Math.max(...xs) - 0.02; x += 0.2) for (let y = Math.min(...ys) + 0.03; y < Math.max(...ys) - 0.02; y += 0.2) if (insidePoly([x, y], poly)) R.screws[k].push([x, y])
        }
      }
    }
  }

  /* --- обрешётка и вагонка --- */
  const bdc = cfg.boards
  const bc = cfg.battens
  const bw = bc.w / 1000
  R.axBd = axBd
  R.batPos = []
  if (cfg.finish === 'boards') {
    // линии крепления досок: рейки обрешётки или (при монтаже на ГКЛ) линии профиля
    const bpos = direct ? [...outerPos] : positions(B[axBd][0], B[axBd][1], bc.pitch / 100, 0.03)
    // дополнительные рейки по сторонам проёмов
    for (const h of direct ? [] : surf.holes) {
      for (const p of [h[axBd][0] - 0.04, h[axBd][1] + 0.04]) {
        if (p > B[axBd][0] + 0.03 && p < B[axBd][1] - 0.03 && bpos.every((q) => Math.abs(q - p) > 0.06)) bpos.push(p)
      }
    }
    bpos.sort((a, b) => a - b)
    R.batPos = bpos
    for (const p of st.battens ? bpos : []) {
      for (const [lo, hi] of lineSegs(surf, axBt, p, bw / 2, 0.01, 0, 0.1)) {
        splitSeg(lo, hi, bc.stock).forEach(([a, b]) => R.battens.push({ axis: axBt, pos: p, lo: a, hi: b, kind: 'main' }))
      }
    }
    // усиление по периметру: рейки вдоль досок у краёв поверхности (углы и примыкания)
    for (const p of st.battens ? [B[axBt][0] + 0.03, B[axBt][1] - 0.03] : []) {
      for (const [lo, hi] of lineSegs(surf, axBd, p, bw / 2, 0.01, 0, 0.1)) {
        splitSeg(lo, hi, bc.stock).forEach(([a, b]) => R.battens.push({ axis: axBd, pos: p, lo: a, hi: b, kind: 'edge' }))
      }
    }

    const ww = bdc.working / 1000
    const maxStock = Math.max(...bdc.stocks)
    let n = 0
    let row = 0
    for (let p0 = B[axBt][0]; p0 < B[axBt][1] - EPS; p0 += ww, row++) {
      const p1 = Math.min(p0 + ww, B[axBt][1])
      // зазор между досками 1,2 мм — видимый шов; номинальная рабочая ширина в таблице не меняется
      for (const q of bandQuads(surf, axBd, p0 + 0.0006, p1 - 0.0006, 0)) {
        let lo0 = q.a0lo
        let lo1 = q.a1lo
        const pieces = []
        let guard = 0
        while (Math.max(q.a0hi - lo0, q.a1hi - lo1) > maxStock + 1e-6 && guard++ < 50) {
          const from = Math.max(lo0, lo1)
          const cands = bpos.filter((c) => c > from + 0.5 && c <= from + maxStock + 1e-9).sort((a, b) => b - a)
          const c = cands.length ? cands[Math.min(row % 2, cands.length - 1)] : from + maxStock
          pieces.push({ ...q, a0lo: lo0, a1lo: lo1, a0hi: c, a1hi: c, joint: true })
          lo0 = lo1 = c
        }
        pieces.push({ ...q, a0lo: lo0, a1lo: lo1 })
        for (const pc of pieces) {
          const notes = []
          if (quadSlanted(pc)) notes.push('подрезка под скат')
          if (surf.holes.some((h) => Math.abs(h[axBd][0] - pc.a0hi) < 1e-6 || Math.abs(h[axBd][1] - pc.a0lo) < 1e-6)) notes.push('подрезка по проёму')
          if (p1 - p0 < ww - 0.002) notes.push('подрезка по ширине')
          if (pc.joint || (pieces.length > 1 && pc !== pieces[0])) notes.push('стык на рейке')
          n += 1
          R.boards.push({ num: `${meta.code}-${pad(n)}`, surf: surf.id, poly: quadPoly(pc), len: quadLen(pc), width: p1 - p0, axis: axBd, row, notes: [...new Set(notes)] })
        }
      }
    }
  }

  /* --- откосы проёмов (окно: боковые и верхний; дверь: то же) --- */
  const rt = 0.012
  for (const h of surf.holes) {
    if (h.kind === 'niche') continue
    const [s0, s1] = h.s
    const [t0, t1] = h.t
    R.reveals.push({ kind: h.kind, poly: [[s0, t1 - rt], [s1, t1 - rt], [s1, t1], [s0, t1]] }) // верх
    R.reveals.push({ kind: h.kind, poly: [[s0, t0], [s0 + rt, t0], [s0 + rt, t1 - rt], [s0, t1 - rt]] })
    R.reveals.push({ kind: h.kind, poly: [[s1 - rt, t0], [s1, t0], [s1, t1 - rt], [s1 - rt, t1 - rt]] })
  }
  return R
}

/* ---------- электрика (демонстрационные данные) ---------- */

function electricMock(d, surfaces, gen, stacks, cfg) {
  const L = d.L
  const devices = []
  const cables = []
  const n = Math.max(2, Math.round(L / 1.25))
  const cs = surfaces.ceiling
  const midT = cs.bounds.t[1] / 2
  devices.push({ id: 'jb1', type: 'box', name: 'Распред. коробка', surf: 'ceiling', s: L / 2, t: midT, size: 0.1 })
  for (let i = 0; i < n; i++) devices.push({ id: 'spot' + i, type: 'light', name: `Светильник ${i + 1}`, surf: 'ceiling', s: (L * (i + 0.5)) / n, t: midT, size: 0.09 })
  cables.push({ id: 'c-ceil', surf: 'ceiling', pts: [[(L * 0.5) / n, midT], [(L * (n - 0.5)) / n, midT]], name: 'Линия освещения' })
  const kR = surfaces.kneeR
  const tSock = d.kH - 0.3
  devices.push({ id: 'sk1', type: 'socket', name: 'Розетка', surf: 'kneeR', s: 1.2, t: tSock, size: 0.075 })
  devices.push({ id: 'sk2', type: 'socket', name: 'Розетка', surf: 'kneeR', s: 3.8, t: tSock, size: 0.075 })
  cables.push({ id: 'c-sock', surf: 'kneeR', pts: [[1.2, tSock], [3.8, tSock]], name: 'Розеточная группа' })
  devices.push({ id: 'sk3', type: 'socket', name: 'Розетка', surf: 'kneeL', s: 2.5, t: d.kH - 0.3, size: 0.075 })
  const sx = d.doorX + d.doorW / 2 + 0.22
  devices.push({ id: 'sw1', type: 'switch', name: 'Выключатель', surf: 'doorWall', s: sx, t: 0.9, size: 0.075 })
  cables.push({ id: 'c-sw', surf: 'doorWall', pts: [[sx, 0.9], [sx, d.cH - 0.2]], name: 'Спуск к выключателю' })
  const conflicts = []
  const boxD = cfg.electric.boxDepth / 1000
  const overlap = (a, b) => a[0] < b[1] - 1e-6 && b[0] < a[1] - 1e-6
  for (const dv of devices) {
    const g = gen[dv.surf]
    const st = stacks[dv.surf]
    const depthRange = [st.total - boxD, st.total]
    const hs = dv.size / 2 + 0.01
    const hits = []
    if (overlap(depthRange, [0, st.reach]) && g.hangers.some((h) => Math.abs(h[0] - dv.s) < hs + 0.03 && Math.abs(h[1] - dv.t) < hs + 0.03)) hits.push('подвес')
    for (const p of g.profiles) {
      const dr = p.level === 'A' ? st.profA : st.profB
      if (!overlap(depthRange, dr)) continue
      const along = p.axis === 's' ? dv.s : dv.t
      const perp = p.axis === 's' ? dv.t : dv.s
      if (along >= p.lo - hs && along <= p.hi + hs && Math.abs(perp - p.pos) < hs + st.pw / 2) {
        hits.push('профиль')
        break
      }
    }
    if (st.battens && overlap(depthRange, st.battens)) {
      for (const b of g.battens) {
        const along = b.axis === 's' ? dv.s : dv.t
        const perp = b.axis === 's' ? dv.t : dv.s
        if (along >= b.lo - hs && along <= b.hi + hs && Math.abs(perp - b.pos) < hs + cfg.battens.w / 2000) {
          hits.push('рейка')
          break
        }
      }
    }
    dv.hits = hits
    if (hits.length) conflicts.push(`${dv.name} (${SURF_BY_ID[dv.surf].name.toLowerCase()}) попадает на ${[...new Set(hits)].join(', ')}.`)
  }
  for (const c of cables) {
    const g = gen[c.surf]
    const st = stacks[c.surf]
    const inBatten = cfg.electric.route === 'batten' && st.battens
    const hits = []
    for (let i = 0; i < c.pts.length - 1; i++) {
      const [a, b] = [c.pts[i], c.pts[i + 1]]
      const axis = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]) ? 's' : 't'
      const pos = axis === 's' ? a[1] : a[0]
      const lo = Math.min(axis === 's' ? a[0] : a[1], axis === 's' ? b[0] : b[1])
      const hi = Math.max(axis === 's' ? a[0] : a[1], axis === 's' ? b[0] : b[1])
      if (inBatten) {
        // в слое обрешётки конфликт — прокладка вдоль рейки
        for (const bt of g.battens) if (bt.axis === axis && Math.abs(bt.pos - pos) < cfg.battens.w / 2000 + 0.01 && bt.hi > lo && bt.lo < hi) hits.push('рейка')
      } else {
        for (const p of g.profiles) if (p.axis === axis && Math.abs(p.pos - pos) < st.pw / 2 + 0.01 && p.hi > lo && p.lo < hi) hits.push('профиль')
        for (const h of g.hangers) {
          const al = axis === 's' ? h[0] : h[1]
          const pe = axis === 's' ? h[1] : h[0]
          if (al >= lo && al <= hi && Math.abs(pe - pos) < 0.03) hits.push('подвес')
        }
      }
    }
    c.hits = [...new Set(hits)]
    if (c.hits.length) conflicts.push(`Трасса «${c.name}» (${SURF_BY_ID[c.surf].name.toLowerCase()}) идёт вдоль элемента: ${c.hits.join(', ')}.`)
    if (!inBatten && cfg.surfaces[c.surf].wool) conflicts.push(`Трасса «${c.name}» проходит в полости с минеральной ватой — требуется отдельная проверка (защита, нагрев, доступность соединений).`)
  }
  return { devices, cables, conflicts }
}

/* ---------- основной расчёт ---------- */

export function computeRenovation(dIn, cfg) {
  let d = dIn
  // после демонтажа натяжного потолка основание потолка (фанера) выше на gap — вся геометрия ремонта строится по ней
  const d0 = d
  d = studyGeometry(d0, cfg)
  const stacks = Object.fromEntries(SURF.map((s) => [s.id, stackOf(cfg, s.id)]))
  const st = stacks.kneeL
  const thick = thicknessFinal(cfg)
  const surfaces = makeSurfaces(d, thick.windowWall, thick.doorWall, !cfg.radiatorOut)
  const enabled = Object.fromEntries(SURF.map((s) => [s.id, enabledOf(cfg, s.id)]))
  const gen = {}
  for (const s of SURF) gen[s.id] = enabled[s.id] ? genSurface(surfaces[s.id], cfg, stacks[s.id], d) : emptyGen(surfaces[s.id])

  const warnings = []
  const info = []

  /* --- общие величины --- */
  const T = Math.max(0, ...Object.values(thick))
  const sec = innerSection(d, thick)
  const newW = sec[5][0] - sec[0][0]
  const newL = d.L - thick.windowWall - thick.doorWall
  const dims = {
    old: { W: d0.W, L: d0.L, area: d0.W * d0.L, ceil: d0.cH, knee: d0.kH, vol: d0.gable * d0.L },
    nw: { W: newW, L: newL, area: newW * newL, ceil: sec[2][1], knee: sec[1][1] },
    section: sec,
    T,
  }
  dims.loss = { W: dims.old.W - dims.nw.W, L: dims.old.L - dims.nw.L, area: dims.old.area - dims.nw.area, ceil: dims.old.ceil - dims.nw.ceil, knee: dims.old.knee - dims.nw.knee }

  /* --- подвесы, профиль --- */
  const hangers = sum(SURF.map((s) => gen[s.id].hangers.length))
  const profLines = SURF.flatMap((s) => gen[s.id].profiles.map((p) => p.hi - p.lo))
  const profLen = sum(profLines)
  const profPack = packLengths(profLines, cfg.frame.stock)
  const joints = sum(SURF.map((s) => gen[s.id].joints.length))
  const crabs = sum(SURF.map((s) => gen[s.id].crabs.length))

  /* --- вата --- */
  let woolVol = 0
  let woolArea = 0
  const woolBy = []
  for (const s of SURF) {
    const g = gen[s.id]
    if (g.woolT > 0) {
      const v = (g.netArea * g.woolT) / 1000
      woolVol += v
      woolArea += g.netArea
      woolBy.push({ id: s.id, area: g.netArea, t: g.woolT, vol: v })
    }
    if (g.woolT > 0 && cfg.frame.airGap + g.woolT > stacks[s.id].frameDepth * 1000 + 1e-6) {
      warnings.push(`${s.name}: вата ${g.woolT} мм при зазоре ${cfg.frame.airGap} мм выходит за плоскость профиля (полость ${Math.round(stacks[s.id].frameDepth * 1000)} мм) — увеличьте вынос подвеса или уменьшите толщину.`)
    }
  }

  /* --- ГКЛ --- */
  const dwc = cfg.drywall
  const sheetArea = dwc.sheetL * dwc.sheetW
  const dwBy = []
  let fullTotal = 0
  const partials = []
  let dwArea = 0
  for (const s of SURF) {
    const g = gen[s.id]
    const lay = g.sheets.slice(0, dwc.layers).map((sheets) => {
      const full = sheets.filter((x) => x.full).length
      const part = sheets.filter((x) => !x.full)
      return { full, part: part.length, area: sum(sheets.map((x) => x.area)), parts: part }
    })
    dwBy.push({ id: s.id, lay })
    lay.forEach((l, k) => {
      fullTotal += l.full
      dwArea += l.area
      for (const p of l.parts) partials.push(p.area)
    })
  }
  // обрезки используются повторно: упаковка по площади
  const bins = []
  for (const a of [...partials].sort((x, y) => y - x)) {
    let b = -1
    for (let i = 0; i < bins.length; i++) if (bins[i] >= a - 1e-9 && (b < 0 || bins[i] < bins[b])) b = i
    if (b >= 0) bins[b] -= a
    else bins.push(sheetArea * 0.97 - a)
  }
  const sheetsTotal = fullTotal + bins.length
  const sheetsL = [0, 1].map((k) => (k < dwc.layers ? sum(dwBy.map((x) => x.lay[k].full + x.lay[k].part)) : 0))
  const screws = sum(SURF.flatMap((s) => gen[s.id].screws.slice(0, dwc.layers).map((a) => a.length)))
  const lastLayer = dwc.layers - 1
  const tapeLen = sum(SURF.flatMap((s) => gen[s.id].sheets[lastLayer].map((x) => perimeter(x.poly) / 2)))
  const netTotal = sum(SURF.map((s) => gen[s.id].netArea))

  /* --- обрешётка --- */
  const batLens = sum(SURF.map((s) => 0)) // заглушка для типизации ниже
  const batPieces = SURF.flatMap((s) => gen[s.id].battens.map((b) => b.hi - b.lo))
  const batPack = packLengths(batPieces, cfg.battens.stock)
  const batLen = sum(batPieces)

  /* --- вагонка: упаковка кусков в доски стандартной длины --- */
  const stocks = [...cfg.boards.stocks].sort((a, b) => a - b)
  const allPieces = SURF.flatMap((s) => gen[s.id].boards)
  const boardBins = [] // { stock, rest, items[] }
  for (const pc of [...allPieces].sort((a, b) => b.len - a.len)) {
    let best = -1
    for (let i = 0; i < boardBins.length; i++) {
      if (boardBins[i].rest >= pc.len + 0.003 - 1e-9 && (best < 0 || boardBins[i].rest < boardBins[best].rest)) best = i
    }
    if (best >= 0) {
      boardBins[best].rest -= pc.len + 0.003
      boardBins[best].items.push(pc)
      pc.stock = boardBins[best].stock
      pc.offcut = true
    } else {
      const stock = stocks.find((s) => s >= pc.len - 1e-9) || stocks[stocks.length - 1]
      boardBins.push({ stock, rest: stock - pc.len - 0.003, items: [pc] })
      pc.stock = stock
      pc.offcut = false
    }
  }
  const boardByStock = {}
  for (const b of boardBins) boardByStock[b.stock] = (boardByStock[b.stock] || 0) + 1
  const bdWaste = 1 + cfg.boards.waste / 100
  const boardPurchase = stocks.map((l) => ({ len: l, count: boardByStock[l] ? Math.ceil(boardByStock[l] * bdWaste - 1e-9) : 0, net: boardByStock[l] || 0 })).filter((r) => r.net > 0)
  const boardsArea = sum(allPieces.map((p) => p.len * p.width))
  const boardsPurchaseLen = sum(boardPurchase.map((r) => r.len * r.count))
  // кляймеры: на каждое пересечение доски с рейкой
  let klyamers = 0
  for (const s of SURF) {
    const g = gen[s.id]
    for (const b of g.boards) {
      const axisIdx = b.axis === 's' ? 0 : 1
      const xs = b.poly.map((p) => p[axisIdx])
      const lo = Math.min(...xs)
      const hi = Math.max(...xs)
      klyamers += Math.max(2, g.batPos.filter((p) => p >= lo - 1e-6 && p <= hi + 1e-6).length)
    }
  }

  /* --- отделка, покрытия, планки --- */
  const finArea = netTotal
  const coatUse = { boards: 0, paint: 0 }
  if (cfg.finish === 'boards') coatUse.boards = boardsArea * 2 * 0.1 * (cfg.boards.coating === 'none' ? 0 : 1) // два слоя
  else coatUse.paint = netTotal * 0.18 * 2
  const perimInner = perimeter(sec)
  const cornersLen = 4 * newL + 2 * (perimInner - newW)
  const trimLen = d.winW + 2 * d.winH + d.doorW + 2 * d.doorH
  const plinthLen = Math.max(0, 2 * (newW + newL) - d.doorW)
  const sealLen = sum(SURF.map((s) => gen[s.id].perim)) * 2

  /* --- смета --- */
  const pr = (id) => cfg.prices[id] || {}
  const rows = []
  const addRow = (id, net, note = '', over = {}) => {
    const m = MATERIALS[id]
    const o = pr(id)
    const unit = o.unit ?? over.unit ?? m.unit
    const waste = o.waste ?? over.waste ?? m.waste
    const packSize = o.packSize ?? over.packSize ?? m.pack
    const price = o.price ?? over.price ?? m.price
    const qty = net * (1 + waste / 100)
    const packs = Math.ceil(qty / packSize - 1e-9)
    rows.push({ id, group: m.group, name: over.name || m.name, net, unit, waste, packSize, price, qty, packs, cost: packs * price, note, extra: EXTRA_IDS.has(id) })
  }
  addRow('hanger', hangers, 'по всем поверхностям')
  addRow('profile', profPack.count, `${fmtN(profLen)} м пог., хлыст ${cfg.frame.stock} м (раскрой FFD)`, { waste: cfg.frame.waste })
  if (joints) addRow('joiner', joints, 'стыки профиля')
  if (crabs) addRow('crab', crabs, 'пересечения несущего и поперечного профиля')
  if (woolVol > 0) {
    const t = woolBy.length ? sum(woolBy.map((w) => w.t * w.area)) / sum(woolBy.map((w) => w.area)) : 100
    const plateVol = cfg.wool.plateL * cfg.wool.plateW * (t / 1000)
    addRow('wool', woolVol / cfg.wool.packVol, `${fmtN(woolArea)} м², ${fmtN(woolVol, 2)} м³, ≈${Math.max(1, Math.floor(cfg.wool.packVol / plateVol))} плит в упаковке`, { unit: 'упак', packSize: 1 })
    rows[rows.length - 1].net = woolVol / cfg.wool.packVol
  }
  addRow('gkl', sheetsTotal, `полных ${fullTotal}, обрезков ${partials.length} (повторное использование ${bins.length})`, { name: `ГКЛ ${dwc.thickness} мм (${dwc.sheetW}×${dwc.sheetL} м)`, waste: dwc.waste })
  addRow('scMetal', screws, `${dwc.layers} сл.`)
  addRow('tape', tapeLen, 'швы последнего слоя')
  const puttyKg = cfg.finish === 'paint' ? netTotal * 1.5 : tapeLen * 0.35
  addRow('putty', puttyKg, cfg.finish === 'paint' ? '1,5 кг/м² (стыки и сплошная шпаклёвка)' : 'только стыки, 0,35 кг/м')
  addRow('primer', netTotal * 0.15 * 2, '2 слоя, 0,15 л/м²')
  if (cfg.finish === 'boards') {
    if (batLen > 0) {
    addRow('batten', batPack.count, `${fmtN(batLen)} м пог., сечение ${cfg.battens.w}×${cfg.battens.t} мм`, { waste: cfg.battens.waste })
    addRow('scWood', batLen / 0.4 + 6, 'шаг 40 см по рейке')
    }
    for (const r of boardPurchase) {
      const rate = pr('boardRate').price ?? MATERIALS.boardRate.price
      rows.push({ id: 'board' + r.len, group: 'boards', name: `Вагонка-штиль ${cfg.boards.thickness}×${cfg.boards.full}, ${r.len.toFixed(1).replace('.', ',')} м`, net: r.net, unit: 'шт', waste: cfg.boards.waste, packSize: 1, price: rate * r.len, qty: r.count, packs: r.count, cost: r.count * rate * r.len, note: `${rate} ${cfg.currency}/м`, extra: false, board: true })
    }
    addRow('klyamer', klyamers, cfg.mount === 'direct' ? 'по пересечениям доска × профиль (через ГКЛ)' : 'по числу пересечений доска × рейка')
    if (coatUse.boards > 0) addRow('coating', coatUse.boards, 'в 2 слоя')
  } else {
    addRow('paint', coatUse.paint, '2 слоя, 0,18 л/м²')
  }
  addRow('seal', sealLen, 'по периметру поверхностей')
  addRow('corner', cornersLen, 'углы, примыкания, декоративные планки')
  addRow('trim', trimLen, 'окно (3 стороны) и дверь')
  addRow('plinth', plinthLen, 'по периметру пола без проёма двери')

  const labor = []
  const lrate = (id) => cfg.labor.rates[id] ?? LABOR[id].rate
  const lab = (id, qty) => labor.push({ id, name: LABOR[id].name, unit: LABOR[id].unit, qty, rate: lrate(id), cost: qty * lrate(id) })
  if (cfg.ceiling.removeStretch && cfg.ceiling.gap > 0) lab('demo', d0.cW * d0.L)
  lab('frame', netTotal)
  if (woolArea > 0) lab('wool', woolArea)
  lab('gkl', netTotal * dwc.layers)
  if (cfg.finish === 'boards') {
    lab('battens', netTotal)
    lab('boards', netTotal)
  } else lab('finish', netTotal)
  const laborTotal = cfg.labor.include ? sum(labor.map((l) => l.cost)) : 0
  const mainCost = sum(rows.filter((r) => !r.extra).map((r) => r.cost))
  const extraCost = sum(rows.filter((r) => r.extra).map((r) => r.cost))
  const estimate = { rows, labor, mainCost, extraCost, laborTotal, total: mainCost + extraCost + laborTotal }

  /* --- проверки --- */
  const hgStep = Math.max(...Object.values(cfg.hangers).map((h) => h.step))
  if (hgStep > 80) warnings.push('Шаг подвесов вдоль профиля больше 80 см — проверьте нагрузку на подвесы.')
  if (cfg.frame.pitch > 60) warnings.push('Шаг профиля больше 60 см — для ГКЛ он слишком велик, возможны прогибы листов.')
  if (cfg.drywall.layers === 2 && cfg.frame.pitch > 40) info.push('Для двухслойной обшивки обычно принимают шаг профиля не более 40 см.')
  for (const s of SURF) {
    const sm = gen[s.id].seams
    if (cfg.drywall.layers === 2) {
      const clash = ['s', 't'].some((ax) => sm[0][ax].some((a) => sm[1][ax].some((b) => Math.abs(a - b) < 0.1)))
      if (clash) warnings.push(`${s.name}: швы второго слоя ГКЛ совпадают со швами первого — измените смещение.`)
    }
  }
  if (T > 0.25) warnings.push(`Общая толщина конструкции ${Math.round(T * 1000)} мм: потеря ширины кабинета ${Math.round(dims.loss.W * 100)} см, проверьте достаточность пространства.`)
  if (T > 0.17) warnings.push('Толщина конструкции больше выноса подоконника (17 см): подоконник и откосы придётся переделывать.')
  if (T > 0.12) warnings.push('Слои перекрывают существующие наличники двери и коробку: потребуется замена наличников и откосов.')
  if (T > 0.125) info.push('Радиатор под окном остаётся в нише: слои обходят его контур.')
  if (hangers === 0 && Object.values(enabled).some(Boolean)) warnings.push('Подвесы не размещены: проверьте шаг и отступы.')
  if (!enabled.ceiling) info.push(`Потолок не обрабатывается: высота кабинета сохраняется (${fmtN(dims.nw.ceil, 2)} м вместо ${fmtN(d.cH - T, 2)} м при полной отделке).`)
  for (const sd of SURF) if (!enabled[sd.id] && sd.id !== 'ceiling') info.push(`${sd.name}: ремонт не выполняется, поверхность остаётся как есть.`)
  if (cfg.boards.working > cfg.boards.full) warnings.push('Рабочая ширина вагонки больше полной.')
  warnings.push('Подвесы должны крепиться только к подтверждённым несущим элементам основания: геометрическая модель не доказывает прочность крепления.')
  if (cfg.finish === 'boards') warnings.push('Гипсокартон не считается несущим основанием для обрешётки: рейки крепят к профилю или основанию по подтверждённой схеме.')
  if (woolArea > 0) warnings.push('Утеплитель: проверьте влажностный режим, вентиляцию полости, пожарные характеристики и отсутствие воздушных карманов.')
  if (cfg.ceiling.removeStretch && cfg.ceiling.gap > 0) {
    const ds = d.slant - d0.slant
    const slopeDa = 2 * ds * (surfaces.slopeL.bounds.s[1] - surfaces.slopeL.bounds.s[0])
    info.push(`Натяжной потолок снимается: основание — фанера на ${cfg.ceiling.gap} мм выше (потолок ${fmtN(d0.cH, 2)} → ${fmtN(d.cH, 2)} м до отделки). Косые части стен удлиняются на ${fmtN(ds * 100, 1)} см (${fmtN(d0.slant, 2)} → ${fmtN(d.slant, 2)} м), их площадь растёт на ${fmtN(slopeDa, 2)} м²; ширина плоского потолка ${fmtN(d0.cW, 2)} → ${fmtN(d.cW, 2)} м. Отделка скатов и количество вагонки пересчитаны по удлинённым скатам.`)
  }
  if (stacks.ceiling.mode === 'plywood') {
    const bl = gen.ceiling.battens.filter((b) => b.kind === 'main').map((b) => b.hi - b.lo)
    const wide = Math.max(0, ...bl)
    info.push(`Потолок на фанере: рейки ${cfg.battens.w}×${cfg.battens.t} мм поперёк комнаты, длина по ширине потолка ${fmtN(wide, 2)} м${wide > cfg.battens.stock ? ` — длиннее хлыста ${cfg.battens.stock} м, нужны стыки` : ` — укладывается в хлыст ${cfg.battens.stock} м без стыков`}.`)
    warnings.push('Потолок: рейки крепятся прямо к фанере — подтвердите толщину фанеры, её крепление к несущим элементам и допустимую нагрузку от реек и вагонки.')
  }
  if (cfg.mount === 'direct' && cfg.finish === 'boards') {
    info.push(`Вагонка крепится на ГКЛ по линиям профиля (шаг ${cfg.frame.pitch} см); направление внешнего профиля согласовано с досками автоматически.`)
    if (cfg.frame.pitch > 60) warnings.push('Шаг профиля больше 60 см: доски на ГКЛ будут крепиться слишком редко.')
    warnings.push('Вагонка на ГКЛ: доски нужно крепить в профиль (не в один гипсокартон) — для тяжёлых пород и частых креплений проверьте несущую способность листа.')
  }
  if (cfg.radiatorOut) info.push('Батарея в кабинете демонтируется и выносится наружу после ремонта — ниши в отделке нет.')
  warnings.push('Электрика: требования к трассам, защите и доступности соединений проверяются отдельно.')
  const elec = electricMock(d, surfaces, gen, stacks, cfg)
  warnings.push(...elec.conflicts)

  const surfaceStats = SURF.map((s) => {
    const g = gen[s.id]
    const lay = dwBy.find((x) => x.id === s.id).lay
    return {
      id: s.id, name: s.name, area: g.netArea, hangers: g.hangers.length, profLen: sum(g.profiles.map((p) => p.hi - p.lo)),
      wool: g.woolT, sheets: lay.map((l) => l.full + l.part), battens: sum(g.battens.map((b) => b.hi - b.lo)), boards: g.boards.length,
    }
  })

  return {
    st, stacks, thick, enabled, d, d0, raised: d !== d0, surfaces, gen, dims, estimate, warnings, info, elec, surfaceStats,
    board: { pieces: allPieces, purchase: boardPurchase, bins: boardBins, area: boardsArea, purchaseLen: boardsPurchaseLen, klyamers },
    totals: { hangers, profLen, profPieces: profPack.count, joints, crabs, woolVol, woolArea, sheetsTotal, sheetsL, screws, tapeLen, batLen, netTotal },
  }
}

export function fmtN(v, digits = 1) {
  return Number(v).toFixed(digits).replace('.', ',')
}
