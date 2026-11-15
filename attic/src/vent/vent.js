// Вентиляция кабинета: набор систем и схем, раскладка в подсобке, проходы через слои, шумовая цепочка, количества для сметы.
// Координаты — как в модели: X поперёк, Y вверх, Z от окна кабинета; левая подсобка — это x < −W/2 (сторона, противоположная дороге).
import { K } from '../params'

/** Системы: что стоит в подсобке и что подключается. */
export const SYSTEMS = {
  window: {
    name: 'Окно (проветривание)', short: 'Окно', unit: null, fan: false, extract: false, recovery: 0, heater: false,
    desc: 'Без оборудования: открываем окно. Нет затрат, но вместе с воздухом идёт шум трассы.',
    pros: ['ничего не нужно монтировать', 'нет проходов в отделке'], cons: ['шум трассы в комнате', 'холод зимой', 'нет фильтрации'],
  },
  valve: {
    name: 'Акустический приточный клапан', short: 'Клапан', unit: null, fan: false, extract: false, recovery: 0, heater: false, flow: 30,
    desc: 'Пассивный клапан в стене с длинным глушителем: воздух идёт сам, без вентилятора.',
    pros: ['самый тихий', 'без электрики', 'дёшево'], cons: ['малый и нестабильный расход', 'нет подогрева и фильтра', 'холодный воздух зимой'],
  },
  breather: {
    name: 'Бризер (приток с подогревом и фильтром)', short: 'Бризер', unit: { w: 0.5, d: 0.3, h: 0.3 }, fan: true, extract: false, recovery: 0, heater: true, unitNoise: 40,
    desc: 'Приточный блок с вентилятором, фильтром и электронагревателем. Вытяжка — через зазор двери или санузел.',
    pros: ['стабильный приток', 'фильтр и подогрев', 'один проход в кабинет'], cons: ['расход электричества на нагрев', 'тепло не возвращается', 'нужен переток воздуха'],
  },
  erv: {
    name: 'Канальный рекуператор', short: 'Рекуператор', unit: { w: 0.6, d: 0.45, h: 0.3 }, fan: true, extract: true, recovery: 0.8, heater: true, unitNoise: 48,
    desc: 'Приток и вытяжка в одном блоке в подсобке, возвращает до ~80% тепла. Четыре присоединения: забор, выброс, приток, вытяжка.',
    pros: ['экономия тепла', 'баланс притока и вытяжки', 'фильтрация'], cons: ['дорого', 'два прохода в кабинет', 'нужно обслуживание через люк'],
  },
  ervWall: {
    name: 'Настенный рекуператор (компактный)', short: 'Настенный', unit: { w: 0.35, d: 0.25, h: 0.35 }, fan: true, extract: true, recovery: 0.7, heater: false, unitNoise: 44, wall: true,
    desc: 'Компактный блок у самой стены кабинета с короткими патрубками. Каналов почти нет, но блок прямо за стеной.',
    pros: ['мало каналов', 'дешевле канального'], cons: ['блок слышен через стену', 'хуже по шуму', 'меньше расход'],
  },
}

export const INTAKES = {
  slope: { name: 'Левый скат (дальняя от дороги сторона)', short: 'Скат' },
  endKitchen: { name: 'Торец кухни (у купе)', short: 'Торец кухни' },
  endCabinet: { name: 'Торец кабинета (окно)', short: 'Торец кабинета' },
}
export const SUPPLY_POS = {
  doorHigh: { name: 'Высоко у двери', door: true, high: true },
  doorLow: { name: 'Низко у двери', door: true, high: false },
  windowHigh: { name: 'Высоко у окна', door: false, high: true },
  windowLow: { name: 'Низко у окна', door: false, high: false },
}
export const EXTRACTS = {
  none: { name: 'Нет (переток через зазор двери)' },
  cabinet: { name: 'Из кабинета' },
  wc: { name: 'Из санузла (существующая вытяжка)' },
}
export const EXIT_KINDS = { endKitchen: 'В торец кухни', slope: 'Через левый скат' }

export const DEFAULT_VENT = {
  enabled: true,
  show: true,
  system: 'erv',
  intake: 'slope',
  supplyPos: 'doorHigh',
  extract: 'cabinet',
  flow: 150, // м³/ч
  duct: 125, // мм
  unitZ: 5.75, // положение блока вдоль z
  unitT: 0.5, // от стены подсобки до центра блока
  intakeZ: 8.3, // колпак забора на скате
  exhaustZ: 3.0, // колпак выброса
  hoodT: 0.9, // расстояние колпаков от стены
  silencer: 0.9, // длина шумоглушителя, м
  grille: { w: 0.3, h: 0.1 }, // решётка притока: чем ниже она стоит, тем больше нужна, чтобы скорость в зоне сна была малой
  // существующая вытяжка из санузла: идёт высоко по левой стене подсобки и выходит наружу
  existing: { enabled: true, duct: 125, h: 1.3, exit: 'endKitchen', fan: true }, // fan: вентилятор в канале, выключается вручную
  auto: true, // сдвигать проход, если он попадает на профиль, подвес или рейку
  // дБА и дБ — ориентировочные значения, их нужно заменить замерами и паспортами
  noise: { outdoor: 55, outdoorEnd: 62, facade: 65, unit: 48, target: 30, flexDb: 2.5, silDb: 20, unitDb: 5, windowDb: 12 },
}

const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
const pathLen = (pts) => pts.slice(1).reduce((s, p, i) => s + dist(pts[i], p), 0)

function conflictAt(g, st, s, t, r) {
  if (!g || !st) return null
  for (const h of g.hangers) if (Math.abs(h[0] - s) < r + 0.03 && Math.abs(h[1] - t) < r + 0.03) return 'подвес'
  for (const p of g.profiles) {
    const along = p.axis === 's' ? s : t
    const perp = p.axis === 's' ? t : s
    if (along > p.lo - r && along < p.hi + r && Math.abs(perp - p.pos) < r + st.pw / 2 + 0.005) return 'профиль'
  }
  for (const b of g.battens) {
    const along = b.axis === 's' ? s : t
    const perp = b.axis === 's' ? t : s
    if (along > b.lo - r && along < b.hi + r && Math.abs(perp - b.pos) < r + 0.025) return 'рейка'
  }
  return null
}

function placeSleeve(g, st, s0, t0, r, auto, sRange) {
  const c0 = conflictAt(g, st, s0, t0, r)
  if (!c0) return { s: s0, t: t0, moved: 0, ok: true, was: null }
  if (!auto) return { s: s0, t: t0, moved: 0, ok: false, was: c0 }
  for (let k = 1; k <= 60; k++) {
    for (const sg of [1, -1]) {
      const s = s0 + sg * k * 0.02
      if (s < sRange[0] + r || s > sRange[1] - r) continue
      if (!conflictAt(g, st, s, t0, r)) return { s, t: t0, moved: Math.abs(s - s0), ok: true, was: c0 }
    }
  }
  return { s: s0, t: t0, moved: 0, ok: false, was: c0 }
}

const floor0 = (x) => Math.max(0, x)

/**
 * Раскладка выбранной системы. vIn — настройки (cfg.vent или вариант для сравнения).
 * Возвращает 3D-данные, шумовую цепочку, количества и предупреждения.
 */
export function computeVent(d, cfg, gen, stacks, thick, vIn) {
  const v = vIn || cfg.vent
  if (!v.enabled) return null
  const sys = SYSTEMS[v.system] || SYSTEMS.erv
  const nz = v.noise
  const warnings = []
  const info = []
  const W2 = d.W / 2
  const depth = d.utilDepth
  const kH = d.kH
  const roofH = (t) => Math.max(0, kH * (1 - t / depth))
  const nrm = [kH / Math.hypot(depth, kH), depth / Math.hypot(depth, kH)]
  const xOfT = (t) => -(W2 + t)
  const r = v.duct / 2000
  const ro = r + 0.03

  /* --- окно: оборудования нет, считаем шум при открытой створке --- */
  if (v.system === 'window') {
    const level = nz.facade - nz.windowDb
    const chain = [
      { n: 'Уровень шума у фасада (сторона дороги)', v: nz.facade },
      { n: `Открытое окно ослабляет шум примерно на ${nz.windowDb} дБ`, v: floor0(level), total: true },
    ]
    if (level > nz.target) warnings.push(`Вентиляция: при открытом окне шум в комнате около ${level.toFixed(0)} дБА (цель ${nz.target}) — звукоизоляция по сути теряется.`)
    info.push('Проветривание окном: без оборудования, без проходов в отделке. Шум трассы поступает прямо в комнату.')
    return { system: v.system, sys, routes: [], silencers: [], hoods: [], sleeves: [], grilles: [], unit: null, unitRect: null, chain, total: level, vDuct: 0, vGrille: 0, qty: {}, warnings, info, r, ro, roofH, xOfT, xf: 0, sleeve: { x0: 0, x1: 0, r: 0 } }
  }

  /* --- блок --- */
  const hasUnit = !!sys.unit
  const u = sys.unit || { w: 0, d: 0, h: 0 }
  // настенный блок стоит у самой стены напротив приточной решётки
  const layout = SUPPLY_POS[v.supplyPos] || SUPPLY_POS.doorHigh
  const zDoor = d.L - 0.7
  const zWin = 0.9
  const supZ = layout.door ? zDoor : zWin
  const supH = layout.high ? 1.15 : 0.4
  const exH = layout.high ? 0.45 : 1.15
  let exZ = layout.door ? zWin : zDoor
  const zWc = (d.zC + d.zCabB) / 2
  const extractOn = sys.extract && v.extract !== 'none'
  if (v.extract === 'wc') exZ = zWc
  const unitZ = sys.wall ? supZ + 0.6 : v.unitZ
  const unitT = sys.wall ? u.d / 2 + 0.1 : v.unitT
  const xu = xOfT(unitT)
  const unit = hasUnit ? { x: xu, y: u.h / 2, z: unitZ, w: u.w, d: u.d, h: u.h } : null
  const unitRect = hasUnit ? { x0: xu - u.d / 2, x1: xu + u.d / 2, z0: unitZ - u.w / 2, z1: unitZ + u.w / 2 } : null
  const hw = u.w / 2
  if (hasUnit) {
    const tMax = unitT + u.d / 2
    if (u.h > roofH(tMax) - 0.03) warnings.push(`Вентиляция: блок высотой ${u.h} м не помещается под скат подсобки (${roofH(tMax).toFixed(2)} м на расстоянии ${tMax.toFixed(2)} м от стены).`)
    const dims = [u.w, u.d, u.h].sort((a, b) => a - b)
    if (!(dims[0] <= Math.min(d.hatchW, d.hatchH) && dims[1] <= Math.max(d.hatchW, d.hatchH))) warnings.push('Вентиляция: блок не пройдёт в люк подсобки (50×66 см) — нужен разбор блока, вторая дверь или другой блок.')
    if (unitRect.z0 < d.L) warnings.push(sys.wall ? 'Вентиляция: настенный блок стоит прямо за стеной кабинета — его шум пойдёт через стену.' : 'Вентиляция: блок стоит за стеной кабинета — его шум пойдёт через стену. Сдвиньте его за стену с дверью (z > 5 м).')
    else info.push(`Блок за стеной с дверью: до кабинета ${((unitRect.z0 - d.L) * 100).toFixed(0)} см по z, на виброопорах отдельно от каркаса отделки.`)
  }

  /* --- проходы в кабинет (через слои ремонта) --- */
  const sRange = [thick.windowWall, d.L - thick.doorWall]
  const g = gen.kneeL
  const st = stacks.kneeL
  const slv = { supply: placeSleeve(g, st, supZ, supH, r + 0.04, v.auto, sRange) }
  if (extractOn && v.extract === 'cabinet') slv.extract = placeSleeve(g, st, exZ, exH, r + 0.04, v.auto, sRange)
  const zs = slv.supply.s
  const ze = slv.extract ? slv.extract.s : exZ
  for (const [k, n] of [['supply', 'приток'], ['extract', 'вытяжка']]) {
    if (!slv[k]) continue
    if (!slv[k].ok) warnings.push(`Вентиляция: проход «${n}» попадает на ${slv[k].was}${v.auto ? ' и свободного места рядом нет' : ''} — сдвиньте точку прохода.`)
    else if (slv[k].moved > 0) info.push(`Проход «${n}» сдвинут на ${(slv[k].moved * 100).toFixed(0)} см, чтобы пройти между элементами каркаса (был конфликт: ${slv[k].was}).`)
  }
  const xf = -W2 + thick.kneeL
  const sleeve = { x0: -W2, x1: xf, r: r + 0.02 }

  /* --- трассы --- */
  const tc = 0.22
  const xc = xOfT(tc)
  const xc2 = xOfT(0.3)
  const ys = supH
  const ye = exH
  const routes = []
  const hoods = []
  const hood = (z, name, id) => {
    const tin = [v.hoodT, roofH(v.hoodT)]
    const tb = [tin[0] - nrm[0] * 0.4, tin[1] - nrm[1] * 0.4]
    const out = [tin[0] + nrm[0] * K.roofT, tin[1] + nrm[1] * K.roofT]
    return { id, kind: 'slope', name, z, tin, tb, out, angle: Math.atan2(nrm[0], nrm[1]) }
  }
  // забор: путь от блока (или от стены) наружу
  const zRun = v.intake === 'slope' ? v.intakeZ : v.intake === 'endKitchen' ? d.zEnd - 0.2 : -0.2
  let intakePts
  if (v.intake === 'slope') {
    const h = hood(v.intakeZ, 'Забор', 'intake')
    hoods.push(h)
    intakePts = { run: [xOfT(h.tb[0]), 0.18], end: [[xOfT(h.tb[0]), h.tb[1], v.intakeZ], [xOfT(h.tin[0]), h.tin[1], v.intakeZ]] }
  } else {
    const zOut = v.intake === 'endKitchen' ? d.zEnd + K.winWallT : -K.winWallT
    const xo = xOfT(0.8)
    hoods.push({ id: 'intake', kind: v.intake === 'endKitchen' ? 'endPlus' : 'endMinus', name: 'Забор', z: zOut, x: xo, y: 0.55 })
    intakePts = { run: [xo, 0.18], end: [[xo, 0.55, zRun], [xo, 0.55, zOut]] }
  }
  /* --- существующая вытяжка из санузла: канал высоко вдоль левой стены, выход наружу --- */
  const ex0 = v.existing || { enabled: false }
  const exOn = !!ex0.enabled
  const exR = (ex0.duct || 100) / 2000
  let existing = null
  if (exOn) {
    const pts = [[-W2 - 0.02, ex0.h, zWc], [xOfT(0.1), ex0.h, zWc]]
    let outlet
    if (ex0.exit === 'slope') {
      const tin = [0.1, roofH(0.1)]
      pts.push([xOfT(tin[0]), tin[1], zWc])
      outlet = { kind: 'slope', tin, out: [tin[0] + nrm[0] * K.roofT, tin[1] + nrm[1] * K.roofT], z: zWc, angle: Math.atan2(nrm[0], nrm[1]) }
    } else {
      pts.push([xOfT(0.1), ex0.h, d.zEnd + K.winWallT])
      outlet = { kind: 'end', pos: [xOfT(0.1), ex0.h, d.zEnd + K.winWallT] }
    }
    existing = { pts, r: exR, outlet, h: ex0.h }
    info.push(`Существующая вытяжка из санузла (Ø${ex0.duct} мм, на высоте ${ex0.h} м${ex0.fan ? ', с вентилятором, выключается вручную' : ', естественная тяга'}) идёт по левой стене подсобки и выходит ${EXIT_KINDS[ex0.exit] ? EXIT_KINDS[ex0.exit].toLowerCase() : 'наружу'}.`)
  }
  const unitPortIn = hasUnit ? [xu, 0.18, unitZ + hw] : null
  const roofChecks = []
  if (hasUnit) {
    const intakeRoute = [unitPortIn]
    if (v.intake === 'endCabinet') {
      const xI = xOfT(0.9)
      intakeRoute.push([xI, 0.18, unitZ + hw], [xI, 0.18, zRun], ...intakePts.end)
    } else {
      intakeRoute.push([xu, 0.18, zRun], [intakePts.run[0], 0.18, zRun], ...intakePts.end)
    }
    routes.push({ id: 'intake', kind: 'intake', name: 'Забор воздуха', warm: false, pts: intakeRoute })
    routes.push({
      id: 'supply', kind: 'supply', name: 'Приток', warm: true,
      pts: [[xu, u.h, unitZ - 0.12], [xu, 0.75, unitZ - 0.12], [xc, 0.75, unitZ - 0.12], [xc, ys, unitZ - 0.12], [xc, ys, zs], [-W2, ys, zs]],
    })
    if (extractOn) {
      let pts
      if (v.extract === 'cabinet') pts = [[xu, u.h, unitZ + 0.12], [xu, ye, unitZ + 0.12], [xc2, ye, unitZ + 0.12], [xc2, ye, ze], [-W2, ye, ze]]
      else if (exOn) {
        // врезка в существующий канал после санузла: по подсобке на 1,1 м, затем вверх к каналу
        const zTap = zWc + 0.5
        pts = [[xu, u.h, unitZ + 0.12], [xu, 0.6, unitZ + 0.12], [xc2, 0.6, unitZ + 0.12], [xc2, 1.1, unitZ + 0.12], [xc2, 1.1, zTap], [xOfT(0.1), 1.1, zTap], [xOfT(0.1), ex0.h, zTap]]
      } else pts = [[xu, u.h, unitZ + 0.12], [xu, 0.6, unitZ + 0.12], [xc2, 0.6, unitZ + 0.12], [xc2, 1.1, unitZ + 0.12], [xc2, 1.1, ze], [-W2, 1.1, ze]]
      routes.push({ id: 'extract', kind: 'extract', name: v.extract === 'wc' ? 'Вытяжка из санузла' : 'Вытяжка', warm: true, pts })
      const h2 = hood(v.exhaustZ, 'Выброс', 'exhaust')
      hoods.push(h2)
      routes.push({
        id: 'exhaust', kind: 'exhaust', name: 'Выброс', warm: true,
        pts: [[xu, 0.18, unitZ - hw], [xu, 0.18, v.exhaustZ], [xOfT(h2.tb[0]), 0.18, v.exhaustZ], [xOfT(h2.tb[0]), h2.tb[1], v.exhaustZ], [xOfT(h2.tin[0]), h2.tin[1], v.exhaustZ]],
      })
    }
  } else {
    // клапан: воздух сразу от забора к стене кабинета, без блока
    const pts = [...intakePts.end.slice().reverse()]
    const last = pts[pts.length - 1]
    pts.push([xc, last[1], last[2]], [xc, ys, last[2]], [xc, ys, zs], [-W2, ys, zs])
    routes.push({ id: 'supply', kind: 'supply', name: 'Приток (клапан)', warm: false, pts: pts.reverse().reverse() })
  }
  // проверка зазоров до подшивки ската вдоль внутренних трасс
  for (const rt of routes) {
    if (rt.kind === 'intake' || rt.kind === 'exhaust') continue
    for (const [i, p] of rt.pts.entries()) {
      if (!hasUnit && i < 2) continue // начало ветки клапана — сам колпак на скате
      const t = -p[0] - W2
      if (t > 0 && p[1] + ro + 0.02 > roofH(t) + 1e-6) {
        warnings.push(`Вентиляция: канал «${rt.name}» упирается в скат подсобки (высота ${p[1].toFixed(2)} м при потолке ${roofH(t).toFixed(2)} м) — опустите проход или уменьшите диаметр.`)
        break
      }
    }
  }
  void roofChecks

  /* --- глушители --- */
  const L = v.silencer
  const silencers = []
  if (hasUnit) {
    silencers.push({ id: 'sil-supply', name: 'Глушитель притока', x: xc, y: ys, z0: unitZ - 0.12 - 0.15 - L, z1: unitZ - 0.12 - 0.15, route: 'supply' })
    if (extractOn) silencers.push({ id: 'sil-extract', name: 'Глушитель вытяжки', x: xc2, y: v.extract === 'cabinet' ? ye : 1.1, z0: unitZ + 0.12 - 0.15 - L, z1: unitZ + 0.12 - 0.15, route: 'extract' })
    if (v.intake === 'endCabinet') silencers.push({ id: 'sil-intake', name: 'Глушитель забора', x: xOfT(0.9), y: 0.18, z0: unitZ + hw + 0.2, z1: unitZ + hw + 0.2 + L, route: 'intake' })
    else silencers.push({ id: 'sil-intake', name: 'Глушитель забора', x: xu, y: 0.18, z0: unitZ + hw + 0.15, z1: unitZ + hw + 0.15 + L, route: 'intake' })
    if (silencers[0].z0 < zs + 0.15) warnings.push('Вентиляция: глушитель притока не помещается между блоком и проходом в стену — сдвиньте проход ближе к окну или уменьшите глушитель.')
  } else {
    const rt = routes[0]
    const z0 = Math.max(zs + 0.2, rt.pts[0][2] - L - 0.2)
    silencers.push({ id: 'sil-valve', name: 'Глушитель клапана', x: xc, y: ys, z0, z1: z0 + L, route: 'supply' })
  }

  /* --- решётки --- */
  const gw = v.grille?.w ?? 0.3
  const gh = v.grille?.h ?? 0.1
  const grilles = [{ id: 'g-supply', kind: 'supply', x: xf, y: ys, z: zs, w: gw, h: gh }]
  if (extractOn && !(v.extract === 'wc' && exOn)) grilles.push({ id: 'g-extract', kind: 'extract', x: v.extract === 'wc' ? -W2 : xf, y: v.extract === 'wc' ? 1.1 : ye, z: ze, round: 0.16 })

  /* --- расход, скорости, расстояния --- */
  const flow = sys.flow ? Math.min(v.flow, sys.flow) : v.flow
  const q = flow / 3600
  const vDuct = q / (Math.PI * r * r)
  const vGrille = q / (grilles[0].w * grilles[0].h)
  if (sys.flow && v.flow > sys.flow) info.push(`Пассивный клапан даёт не больше ~${sys.flow} м³/ч — расход ограничен.`)
  if (vDuct > 4) warnings.push(`Вентиляция: скорость в канале ${vDuct.toFixed(1)} м/с — выше 4 м/с, будет шумно. Увеличьте диаметр.`)
  if (vGrille > 2) info.push(`Скорость в решётке притока ${vGrille.toFixed(1)} м/с — для тишины лучше не выше 2 м/с.`)
  if (!layout.high && vGrille > 0.5) warnings.push(`Вентиляция: низкий приток со скоростью в решётке ${vGrille.toFixed(1)} м/с даст сквозняк по полу на уровне кровати (0,5 м). Для низкой раздачи нужна решётка площадью не меньше ${(q / 0.3).toFixed(2)} м² (скорость ≤0,3 м/с) либо перенесите приток вверх.`)
  if (!layout.high && sys.heater) info.push('Низкий приток с подогревом: тёплый воздух сам поднимается к потолку и в зоне сна почти не остаётся — высокий приток вдоль потолка зимой эффективнее.')
  if (extractOn && v.extract === 'cabinet' && Math.abs(zs - ze) < 2) warnings.push('Вентиляция: приток и вытяжка в кабинете ближе 2 м — воздух «замыкается», разнесите решётки.')
  if (extractOn && hoods.length > 1 && v.intake === 'slope' && Math.abs(v.intakeZ - v.exhaustZ) < 2) warnings.push('Вентиляция: колпаки забора и выброса ближе 2 м — возможен подсос выброса.')
  if (!extractOn && sys.fan) {
    info.push(exOn ? (ex0.fan ? 'Вытяжка из санузла принудительная, но включается вручную: пока вентилятор работает, воздух из кабинета уходит к ней через зазор под дверью кабинета (1–2 см) и санузла. Когда он выключен, выхода нет — нужна переточная решётка или нужно включать вентилятор вместе с приточкой (лучше связать их автоматикой).' : 'Вытяжка из санузла уже есть (естественная тяга): воздух из кабинета уходит к ней через зазор под дверью — при слабой тяге может не хватить на расход приточки.') : 'Вытяжки нет: воздух уходит через зазор под дверью (1–2 см) или переточную решётку — иначе в комнате возникнет избыточное давление.')
  }
  if (extractOn && v.extract === 'wc' && exOn) {
    warnings.push(ex0.fan
      ? 'Вентиляция: врезка рекуператора в канал с вентилятором, который включается вручную: при включённом вентиляторе потоки спорят (нарушается баланс), при выключенном его крыльчатка и обратный клапан создают сопротивление. Лучше вести вытяжку рекуператора отдельным каналом или заменить ручное включение автоматикой с обратным клапаном.'
      : 'Вентиляция: подключение к существующей вытяжке санузла — проверьте её тягу и обратный клапан; рекуператор не должен «давить» воздух обратно в санузел.')
  }
  if (exOn) {
    // расстояние от забора до существующего выброса: подсос запаха и влаги
    const ip = v.intake === 'slope' ? [xOfT(v.hoodT), 0.9, v.intakeZ] : v.intake === 'endKitchen' ? [xOfT(0.8), 0.55, d.zEnd + K.winWallT] : [xOfT(0.8), 0.55, -K.winWallT]
    const op = existing.outlet.kind === 'slope' ? [xOfT(existing.outlet.tin[0]), existing.outlet.tin[1], existing.outlet.z] : existing.outlet.pos
    const dd = dist(ip, op)
    if (sys.unit || sys.name) {
      if (dd < 2) warnings.push(`Вентиляция: забор воздуха в ${dd.toFixed(1)} м от выброса вытяжки санузла — возможен подсос запахов и влаги. Разнесите минимум на 2 м.`)
      else info.push(`Забор в ${dd.toFixed(1)} м от выброса вытяжки санузла — безопасно.`)
    }
  }
  info.push(`Забор: ${INTAKES[v.intake].name}; расход ${flow} м³/ч, канал Ø${v.duct} мм, скорость ${vDuct.toFixed(1)} м/с.`)
  if (v.intake !== 'slope') info.push('Забор через торец: оба торца обращены к дороге — уровень шума у входа выше, чем на левом скате; нужен глушитель и защита от снега.')

  /* --- шумовая цепочка (ориентировочно) --- */
  const lenOf = (id) => {
    const rt = routes.find((x) => x.id === id)
    if (!rt) return 0
    const s = silencers.find((x) => x.route === id)
    return Math.max(0, pathLen(rt.pts) - (s ? s.z1 - s.z0 : 0))
  }
  const lvOut = v.intake === 'slope' ? nz.outdoor : nz.outdoorEnd
  let total
  let chain
  if (hasUnit) {
    const lenIn = lenOf('intake')
    const lenSup = lenOf('supply')
    const afterIntake = lvOut - nz.flexDb * lenIn - nz.silDb
    const afterUnit = afterIntake - nz.unitDb
    const supOut = afterUnit - nz.flexDb * lenSup - nz.silDb
    const unitNoise = sys.unitNoise ?? nz.unit
    const unitOut = unitNoise - nz.flexDb * lenSup - nz.silDb
    total = 10 * Math.log10(10 ** (supOut / 10) + 10 ** (unitOut / 10))
    chain = [
      { n: `Уровень у забора (${v.intake === 'slope' ? 'сторона от дороги' : 'торец, у дороги'})`, v: lvOut },
      { n: `После забора: канал ${lenIn.toFixed(1)} м и глушитель`, v: floor0(afterIntake) },
      { n: 'После блока', v: floor0(afterUnit) },
      { n: `По притоку к решётке: канал ${lenSup.toFixed(1)} м и глушитель — шум с улицы`, v: floor0(supOut) },
      { n: 'Собственный шум блока на выходе притока', v: floor0(unitOut) },
      { n: 'Итог у решётки притока (сумма)', v: total, total: true },
    ]
    if (sys.wall) {
      const wallLeak = unitNoise - 20 // шум блока через стену кабинета
      const t2 = 10 * Math.log10(10 ** (total / 10) + 10 ** (wallLeak / 10))
      chain.splice(5, 0, { n: 'Шум блока через стену (блок прямо за стеной)', v: floor0(wallLeak) })
      total = t2
      chain[chain.length - 1].v = total
    }
  } else {
    const len = lenOf('supply')
    total = lvOut - nz.flexDb * len - nz.silDb
    chain = [
      { n: `Уровень у забора (${v.intake === 'slope' ? 'сторона от дороги' : 'торец, у дороги'})`, v: lvOut },
      { n: `Канал ${len.toFixed(1)} м и глушитель`, v: floor0(total) },
      { n: 'Итог у клапана в кабинете', v: floor0(total), total: true },
    ]
  }
  if (total > nz.target) warnings.push(`Вентиляция: ориентировочный шум у решётки ${total.toFixed(0)} дБА выше цели ${nz.target} дБА — добавьте глушитель или улучшите схему.`)

  /* --- количества для сметы --- */
  const flexLen = routes.reduce((s, rt) => s + pathLen(rt.pts), 0) - silencers.reduce((s, x) => s + (x.z1 - x.z0), 0)
  const warmLen = routes.filter((x) => x.warm).reduce((s, rt) => s + pathLen(rt.pts), 0)
  const qty = {
    erv: v.system === 'erv' ? 1 : 0,
    ervWall: v.system === 'ervWall' ? 1 : 0,
    breather: v.system === 'breather' ? 1 : 0,
    valve: v.system === 'valve' ? 1 : 0,
    silencer: silencers.length,
    flex: flexLen,
    sleeve: grilles.filter((x) => !(x.kind === 'extract' && v.extract === 'wc')).length,
    hood: hoods.filter((x) => x.kind === 'slope').length,
    louver: hoods.filter((x) => x.kind !== 'slope').length,
    grille: grilles.length,
    clamp: Math.ceil(flexLen / 0.8) + 4,
    insul: warmLen,
  }
  return { system: v.system, sys, existing, unit, unitRect, routes, silencers, hoods, sleeve, sleeves: Object.entries(slv).map(([kind, s]) => ({ kind, z: s.s, y: kind === 'supply' ? ys : ye })), grilles, r, ro, roofH, xOfT, xf, chain, total, vDuct, vGrille, qty, warnings, info }
}
