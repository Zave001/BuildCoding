// Состав конструкции по глубине, толщины по этапам и внутренний контур кабинета.
// Здесь же — состояние «ремонт на текущем этапе», по которому считаются коллизии мебели и ходьбы.
import { SURF, PROFILE_TYPES, stagesFor } from './data'

export const EDGE_IDS = ['kneeL', 'slopeL', 'ceiling', 'slopeR', 'kneeR']
export const enabledOf = (cfg, id) => cfg.surfaces[id]?.enabled !== false


/**
 * Состав конструкции по глубине (от существующей поверхности внутрь).
 * Варианты: 'frame' — подвесы + профиль + (вата) + ГКЛ [+ обрешётка] + вагонка/краска;
 * 'direct' — вагонка прямо на ГКЛ по профилям (без обрешётки);
 * 'plywood' — потолок: обрешётка прямо на фанеру и вагонка (без каркаса и ГКЛ).
 */
export function stackOf(cfg, id = 'kneeL') {
  const board = cfg.finish === 'boards'
  const bt = cfg.battens.t / 1000
  const bb = cfg.boards.thickness / 1000
  if (id === 'doorWall') {
    // новая стена строится сама (каркас + вата + ГКЛ); на поверхности стены в кабинете остаётся только чистовая отделка
    const base = { frame: false, reach: 0, ph: 0, pw: 0, levels: 0, frameDepth: 0, profA: null, profB: null, dw: [], dwEnd: 0, g: 0 }
    if (!board) return { ...base, mode: 'wallFinish', battens: null, boards: null, total: 0.003 }
    // вагонка прямо на ГКЛ стены крепится в вертикальные стойки — это возможно только при горизонтальной укладке
    if (cfg.mount === 'direct' && cfg.boardDir === 'horizontal') return { ...base, mode: 'wallDirect', battens: null, boards: [0, bb], total: bb }
    return { ...base, mode: 'wallFinish', battens: [0, bt], boards: [bt, bt + bb], total: bt + bb }
  }
  if (id === 'ceiling' && board && cfg.ceiling.mode === 'plywood') {
    return { mode: 'plywood', frame: false, reach: 0, ph: 0, pw: 0, levels: 0, frameDepth: 0, profA: null, profB: null, dw: [], dwEnd: 0, battens: [0, bt], boards: [bt, bt + bb], total: bt + bb, g: 0 }
  }
  const f = cfg.frame
  const pt = PROFILE_TYPES[f.profileType] || PROFILE_TYPES.CD60
  const reach = f.reach / 1000
  const ph = pt.h / 1000
  const pw = pt.w / 1000
  const levels = f.scheme === 'two' ? 2 : 1
  const frameDepth = reach + levels * ph
  const g = cfg.drywall.thickness / 1000
  const layers = cfg.drywall.layers
  const dw = Array.from({ length: layers }, (_, k) => [frameDepth + k * g, frameDepth + (k + 1) * g])
  const dwEnd = frameDepth + layers * g
  const direct = board && cfg.mount === 'direct'
  let battens = null
  let boards = null
  let total
  if (board && direct) {
    boards = [dwEnd, dwEnd + bb]
    total = dwEnd + bb
  } else if (board) {
    battens = [dwEnd, dwEnd + bt]
    boards = [dwEnd + bt, dwEnd + bt + bb]
    total = dwEnd + bt + bb
  } else total = dwEnd + 0.003
  return { mode: direct ? 'direct' : 'frame', frame: true, reach, ph, pw, levels, frameDepth, profA: [reach, reach + ph], profB: levels === 2 ? [reach + ph, reach + 2 * ph] : null, dw, dwEnd, battens, boards, total, g }
}

/** Размеры новой стены с дверью по толщине: ГКЛ кабинета, каркас, ГКЛ зала. w отсчитывается от стороны кабинета к залу. */
export function wallDims(cfg) {
  const g = cfg.drywall.thickness / 1000
  const nl = cfg.drywall.layers
  const fd = cfg.wall.frame / 1000
  return {
    g, nl, fd,
    frameZ: [nl * g, nl * g + fd],
    cabZ: (k) => [(nl - 1 - k) * g, (nl - k) * g], // k = 0 — первый слой у каркаса, дальше к лицевой стороне
    hallZ: (k) => [nl * g + fd + k * g, nl * g + fd + (k + 1) * g],
    total: 2 * nl * g + fd,
  }
}
export const wallThickness = (cfg) => wallDims(cfg).total

/** Стена с дверью построена (каркас с этапа профиля) и дверь установлена (с первого слоя ГКЛ). */
export function wallBuiltAt(cfg, stage) {
  const keys = stagesFor(cfg).map((s) => s.key)
  return Math.min(stage, keys.length - 1) >= keys.indexOf('profile')
}
export function doorInstalledAt(cfg, stage) {
  const keys = stagesFor(cfg).map((s) => s.key)
  return Math.min(stage, keys.length - 1) >= keys.indexOf('gkl1')
}

/** Геометрия кабинета после демонтажа натяжного потолка: основание потолка (фанера) выше на величину gap. */
export function studyGeometry(d, cfg) {
  const gap = cfg.ceiling.gap / 1000
  // подъём зависит только от снятия натяжного потолка — даже если сам потолок потом не обшивается
  if (!cfg.ceiling.removeStretch || gap <= 0) return d
  const rise = d.rise + gap
  const run = (d.run * rise) / d.rise // наклон скатов сохраняется — они просто продолжаются выше
  const cW = d.W - 2 * run
  const cH = d.cH + gap
  const heightAt = (x) => {
    const ax = Math.abs(x)
    if (ax <= cW / 2) return cH
    if (ax >= d.W / 2) return d.kH
    return d.kH + ((d.W / 2 - ax) / run) * rise
  }
  return { ...d, rise, run, cW, cH, heightAt, slant: Math.hypot(run, rise) }
}

/** Начаты ли работы: с первого рабочего этапа натяжной потолок снят, а батарея вынесена (отдельного этапа демонтажа нет). */
export function demoReached(cfg, stage) {
  return Math.min(stage, stagesFor(cfg).length - 1) >= 1
}

/** Итоговая толщина конструкции по поверхностям (0 — поверхность не обрабатывается). */
export function thicknessFinal(cfg) {
  return Object.fromEntries(SURF.map((s) => [s.id, enabledOf(cfg, s.id) ? stackOf(cfg, s.id).total : 0]))
}

/** Внутренний контур сечения кабинета при толщине T[id] на каждой из пяти поверхностей сечения. */
export function innerSection(d, T) {
  const { W, kH, cH, cW } = d
  const P = [[-W / 2, 0], [-W / 2, kH], [-cW / 2, cH], [cW / 2, cH], [W / 2, kH], [W / 2, 0]]
  const lines = []
  for (let i = 0; i < 5; i++) {
    const [x0, y0] = P[i]
    const [x1, y1] = P[i + 1]
    const l = Math.hypot(x1 - x0, y1 - y0)
    const ex = (x1 - x0) / l
    const ey = (y1 - y0) / l
    const t = typeof T === 'number' ? T : T[EDGE_IDS[i]]
    lines.push({ p: [x0 + ey * t, y0 - ex * t], d: [ex, ey] })
  }
  const inter = (a, b) => {
    const det = a.d[0] * b.d[1] - a.d[1] * b.d[0]
    const t = ((b.p[0] - a.p[0]) * b.d[1] - (b.p[1] - a.p[1]) * b.d[0]) / (det || 1e-12)
    return [a.p[0] + a.d[0] * t, a.p[1] + a.d[1] * t]
  }
  const floor = { p: [0, 0], d: [1, 0] }
  return [inter(lines[0], floor), inter(lines[0], lines[1]), inter(lines[1], lines[2]), inter(lines[2], lines[3]), inter(lines[3], lines[4]), inter(lines[4], floor)]
}

/**
 * Какая глубина «съедена» на каждом из семи поверхностей на выбранном этапе.
 * Подвесы выступают на вынос, профиль — на полость каркаса, затем каждый слой по очереди; вата может выступать за каркас.
 */
export function thicknessAtStage(cfg, stage, frameOnly = false) {
  const keys = stagesFor(cfg).map((s) => s.key)
  const idx = Math.min(stage, keys.length - 1)
  const has = (k) => {
    const i = keys.indexOf(k)
    if (i < 0 || idx < i) return false
    return !(frameOnly && ['wool', 'gkl1', 'gkl2', 'putty', 'battens', 'boards', 'done'].includes(k))
  }
  const T = {}
  for (const s of SURF) {
    if (!enabledOf(cfg, s.id)) {
      T[s.id] = 0
      continue
    }
    const st = stackOf(cfg, s.id)
    let t = 0
    if (st.frame) {
      if (has('hangers')) t = st.reach
      if (has('profile')) t = st.frameDepth
      if (has('wool') && cfg.surfaces[s.id].wool) t = Math.max(t, (cfg.frame.airGap + cfg.surfaces[s.id].woolT) / 1000)
      if (has('gkl1')) t = Math.max(t, st.dw[0][1])
      if (has('gkl2')) t = Math.max(t, st.dw[1][1])
      if (has('putty')) t = Math.max(t, st.dwEnd + 0.002)
    }
    if (st.battens && has('battens')) t = Math.max(t, st.battens[1])
    if (st.boards && has('boards')) t = Math.max(t, st.boards[1])
    if (has('done')) t = Math.max(t, st.total)
    T[s.id] = t
  }
  return { T, has }
}

/**
 * Состояние помещения с ремонтом на этапе: внутренние границы кабинета, потолок, откосы двери.
 * Возвращает null, если ничего не установлено. Используется коллизиями мебели и прогулки.
 */
export function renState(d0, cfg, stage, frameOnly = false) {
  const { T, has } = thicknessAtStage(cfg, stage, frameOnly)
  if (!wallBuiltAt(cfg, stage)) T.doorWall = 0 // стены ещё нет — граница кабинета по z не сдвигается
  const d = demoReached(cfg, stage) ? studyGeometry(d0, cfg) : d0
  if (Math.max(...Object.values(T)) < 1e-6 && d === d0) return null
  const sec = innerSection(d, T)
  const xl = sec[0][0]
  const xr = sec[5][0]
  const ceilH = sec[2][1]
  const interp = (a, b, y) => a[0] + ((y - a[1]) / (b[1] - a[1] || 1e-9)) * (b[0] - a[0])
  // высота потолка в точке x по ломаной «стена → скат → потолок → скат → стена»
  const heightAt = (x) => {
    if (x <= sec[1][0]) return sec[1][1]
    if (x >= sec[4][0]) return sec[4][1]
    if (x <= sec[2][0]) return sec[1][1] + ((x - sec[1][0]) / (sec[2][0] - sec[1][0] || 1e-9)) * (sec[2][1] - sec[1][1])
    if (x <= sec[3][0]) return ceilH
    return sec[3][1] + ((x - sec[3][0]) / (sec[4][0] - sec[3][0] || 1e-9)) * (sec[4][1] - sec[3][1])
  }
  // где можно стоять с головой на высоте h
  const xMinAt = (h) => (h <= sec[1][1] ? xl : h >= ceilH ? (sec[2][0] + sec[3][0]) / 2 : interp(sec[1], sec[2], h))
  const xMaxAt = (h) => (h <= sec[4][1] ? xr : h >= ceilH ? (sec[2][0] + sec[3][0]) / 2 : interp(sec[4], sec[3], h))
  return {
    T, sec, xl, xr, ceilH, heightAt, xMinAt, xMaxAt,
    zLo: T.windowWall,
    zHi: d.L - T.doorWall,
    Td: T.doorWall,
    reveal: has('gkl1') && T.doorWall > 0 ? 0.012 : 0, // откосы двери сужают проём
    kneeH: sec[1][1],
  }
}
