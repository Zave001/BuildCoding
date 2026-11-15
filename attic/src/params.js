// Все размеры — в метрах.
// Система координат: X — поперёк (от бока до бока), Y — вверх, Z — от стены с окном (z = 0) к стене с дверью (z = L).
export const DEFAULTS = {
  L: 5.0, // от стены с окном до стены с дверью
  W: 4.35, // от бока до бока
  kH: 1.5, // боковое перекрытие (вертикальная часть)
  cH: 2.1, // высота потолка
  cW: 2.35, // перекрытие потолка (ширина горизонтальной части)
  winW: 2.0,
  winH: 1.0,
  winSill: 1.02, // от пола до низа окна
  winSections: 3,
  doorW: 0.8,
  doorH: 2.0,
  doorX: 0, // смещение двери от оси комнаты
  // продолжение мансарды за стеной с дверью
  L2: 4.65, // от стены с дверью до стеклянной стены-купе
  cabW: 1.0, // санузел: ширина (у левого бока, если смотреть от двери на купе)
  cabP: 0.25, // санузел: выступ перед стеклянной стеной
  cabD: 1.2, // санузел: глубина за стеклянной стеной (выступает в кухню)
  L3: 3.5, // кухня: от стеклянной стены до торца с окном
  // дверь в подсобку в боковом перекрытии (слева, если смотреть от двери на кухню)
  hatchOff: 2.3, // от лицевой стенки санузла до ближайшего края двери (вдоль комнаты)
  hatchY: 0.3, // от пола до низа двери
  hatchW: 0.5,
  hatchH: 0.66,
  stL: 2.3, // проём лестницы вдоль стены-купе (из правого угла, если смотреть от двери на купе)
  stW: 1.0, // проём лестницы поперёк
}

// Постоянные конструктива (не редактируются в панели)
export const K = {
  winWallT: 0.16, // толщина стены с окном
  doorWallT: 0.12, // толщина стены с дверью
  roofT: 0.24, // толщина кровельного пирога
  gableOv: 0.45, // свес кровли над фронтоном
  eaveOv: 0.4, // свес кровли у карниза (вдоль ската)
  plinth: 0.3, // фронтон ниже уровня пола мансарды (до козырька)
  canopy: 1.5, // вынос козырька из профлиста
  stairDrop: 2.64, // глубина лестничного проёма до площадки
  stairSteps: 12,
  slideTop: 2.0, // верх раздвижной двери купе
  panelH: 0.85, // глухие белые панели внизу стены-купе
}

export const SURFACES = {
  knee: 'Боковое перекрытие',
  slope: 'Косое перекрытие',
  ceiling: 'Перекрытие потолка',
  windowWall: 'Стена у окна',
  doorWall: 'Стена с дверью',
  floor: 'Пол',
}

// Цвета подобраны по фото: мятно-серая краска, светлые скаты, белый глянец
export const DEFAULT_COLORS = {
  knee: '#bfd0c8',
  slope: '#d3dbd5',
  ceiling: '#eef0f2',
  windowWall: '#bfd0c8',
  doorWall: '#c9d6cf',
  backRoom: '#ddd6c6', // кухня: светлые бежевые обои (по фото)
}

export const fmt = (v, digits = 2) => v.toFixed(digits).replace('.', ',')

export function derive(raw) {
  const p = { ...raw }
  p.wallT = raw.doorWallT ?? K.doorWallT // толщина новой стены с дверью (по конструкции стены)
  const warnings = []
  if (p.cW >= p.W) warnings.push('Ширина потолка должна быть меньше ширины комнаты.')
  if (p.cH <= p.kH) warnings.push('Высота потолка должна быть больше бокового перекрытия.')
  // защита геометрии от вырождения
  p.cW = Math.min(p.cW, p.W - 0.02)
  p.cH = Math.max(p.cH, p.kH + 0.01)

  const run = (p.W - p.cW) / 2 // горизонтальная проекция ската
  const rise = p.cH - p.kH // вертикальная проекция ската
  const slant = Math.hypot(run, rise)
  const angle = (Math.atan2(rise, run) * 180) / Math.PI

  const heightAt = (x) => {
    const ax = Math.abs(x)
    if (ax <= p.cW / 2) return p.cH
    if (ax >= p.W / 2) return p.kH
    return p.kH + ((p.W / 2 - ax) / run) * rise
  }

  // продолжение: стеклянная стена, санузел, лестница
  const zG = p.L + p.L2 // плоскость стеклянной стены-купе
  const zEnd = zG + p.L3 // торцевая стена с окном в кухне
  const zCabB = zG + p.cabD // задняя стенка санузла
  if (p.cabD > p.L3 - 0.8) warnings.push('Санузел почти упирается в торцевую стену кухни.')
  // от двери к купе смотрим вдоль +Z, поэтому «слева» на фото 2 — это +X
  const xC = -p.W / 2 + p.cabW // стенка санузла со стороны прохода
  const zC = zG - p.cabP // лицевая стенка санузла
  const xS = p.W / 2 - p.stL // край лестничного проёма со стороны прохода (вход на лестницу)
  const zS = zG - p.stW // передний край лестничного проёма (перила)
  if (xS - xC < 0.6) warnings.push('Проход между лестницей и санузлом меньше 60 см.')
  if (p.cabW < 0.7) warnings.push('Санузел уже 70 см — дверь не поместится.')

  // дверь в подсобку: интервал по z на левой боковой стене
  const hz1 = zC - p.hatchOff
  const hz0 = hz1 - p.hatchW
  if (hz0 < 0.1) warnings.push('Дверь в подсобку выходит за начало стены — уменьшите отступ.')
  if (p.hatchY + p.hatchH > p.kH - 0.05) warnings.push('Дверь в подсобку выше бокового перекрытия.')

  // арочная дверь санузла: максимальная высота под скатом
  const cdW = Math.max(0.4, Math.min(0.6, p.cabW - 0.16))
  const cdX0 = xC - 0.07 - cdW // проём у стенки со стороны прохода — там выше всего
  const cdR = cdW / 2
  let cdSpring = 2.0 - cdR
  for (let i = 0; i <= 32; i++) {
    const t = (i / 32) * Math.PI
    cdSpring = Math.min(cdSpring, heightAt(cdX0 + cdR + cdR * Math.cos(t)) - 0.06 - cdR * Math.sin(t))
  }
  const cabDoor = { x0: cdX0, w: cdW, r: cdR, spring: cdSpring, top: cdSpring + cdR }
  if (cdSpring < 1.1) warnings.push('Дверь санузла получается ниже 1,4 м — скат слишком низкий.')

  // снаружи: продолжение ската до пола, конёк, подсобные пространства
  const xE = p.W / 2 + (p.kH * run) / rise // скат касается уровня пола
  const yR = p.cH + ((p.cW / 2) * rise) / run // конёк по внутренней линии ската
  const utilDepth = xE - p.W / 2
  const utilSect = 0.5 * p.kH * utilDepth
  const roofLen = Math.hypot(xE, yR) + K.eaveOv
  const roofZ = zEnd + 2 * (K.winWallT + K.gableOv)

  const winTop = p.winSill + p.winH
  if (winTop > Math.min(heightAt(-p.winW / 2), heightAt(p.winW / 2)) + 1e-6)
    warnings.push('Окно не помещается под скатом — уменьшите ширину или высоту.')
  if (p.winW >= p.W) warnings.push('Окно шире стены.')
  const dl = p.doorX - p.doorW / 2
  const dr = p.doorX + p.doorW / 2
  if (dl < -p.W / 2 || dr > p.W / 2) warnings.push('Дверь выходит за пределы стены.')
  else if (p.doorH > Math.min(heightAt(dl), heightAt(dr)) + 1e-6)
    warnings.push('Дверь упирается в скат — сместите её к центру.')

  const gable = p.W * p.kH + p.cW * rise + run * rise // площадь торцевой стены без проёмов
  const areas = {
    knee: 2 * p.kH * p.L,
    slope: 2 * slant * p.L,
    ceiling: p.cW * p.L,
    windowWall: gable - p.winW * p.winH,
    doorWall: gable - p.doorW * p.doorH,
    floor: p.W * p.L,
  }
  const sizes = {
    knee: `2 × ${fmt(p.L)} × ${fmt(p.kH)}`,
    slope: `2 × ${fmt(p.L)} × ${fmt(slant)}`,
    ceiling: `${fmt(p.L)} × ${fmt(p.cW)}`,
    windowWall: `${fmt(gable)} − окно ${fmt(p.winW * p.winH)}`,
    doorWall: `${fmt(gable)} − дверь ${fmt(p.doorW * p.doorH)}`,
    floor: `${fmt(p.L)} × ${fmt(p.W)}`,
  }

  const ext = {
    floor: p.W * p.L2 - p.stL * p.stW - p.cabW * p.cabP,
    volume: gable * p.L2,
    utilSect,
    back: p.W * p.L3 - p.cabW * p.cabD,
    backVolume: gable * p.L3,
    utilVol: 2 * utilSect * zEnd,
    utilFloor: 2 * utilDepth * zEnd,
    roof: 2 * roofLen * roofZ,
  }

  // все помещения целиком: кабинет, спальня, кухня и санузел (проём лестницы не считается)
  const cabinArea = p.cabW * (p.cabP + p.cabD)
  const rooms = [
    { name: 'Кабинет', size: `${fmt(p.L)} × ${fmt(p.W)}`, area: areas.floor },
    { name: 'Спальня', size: `${fmt(p.L2)} × ${fmt(p.W)}`, area: ext.floor },
    { name: 'Кухня', size: `${fmt(p.L3)} × ${fmt(p.W)}`, area: ext.back },
    { name: 'Санузел', size: `${fmt(p.cabW)} × ${fmt(p.cabP + p.cabD)}`, area: cabinArea },
  ]
  const total = {
    rooms,
    area: rooms.reduce((s, r) => s + r.area, 0),
    volume: gable * zEnd, // объём под скатами всей мансарды
    length: zEnd, // от окна кабинета до окна кухни
  }

  return {
    ...p, run, rise, slant, angle, gable, areas, sizes, volume: gable * p.L, warnings, heightAt,
    zG, zEnd, zCabB, hz0, hz1, xC, zC, xS, zS, cabDoor, xE, yR, utilDepth, roofLen, ext, total,
  }
}

/* ---------- зоны: кабинет / зал (спальня) / кухня ---------- */
export const ZONE_NAMES = { cab: 'Кабинет', hall: 'Зал (спальня)', kitchen: 'Кухня', all: 'Кабинет и зал' }

/**
 * Зоны помещений. Пока между кабинетом и залом есть стена, они разделены; без стены кабинет и зал сливаются в одну зону.
 * Для каждой зоны — диапазон по z и площади боковых и косых перекрытий, потолка и пола.
 */
export function roomZones(d, withWall, dCab = d) {
  const T = d.wallT
  // parts — участки [геометрия, длина]: кабинет может быть с поднятым потолком (удлинённые скаты), остальные комнаты — как есть
  const mk = (key, z0, z1, parts, floor, ends = {}) => {
    const len = parts.reduce((s, [, l]) => s + l, 0)
    const sum = (f) => parts.reduce((s, [g, l]) => s + f(g) * l, 0)
    return {
      key, name: ZONE_NAMES[key], z0, z1, len,
      areas: { knee: 2 * sum((g) => g.kH), slope: 2 * sum((g) => g.slant), ceiling: sum((g) => g.cW), floor, ...ends },
      sizes: {
        knee: `2 × ${fmt(len)} × ${fmt(d.kH)}`,
        slope: `2 × ${fmt(len)} × ${fmt(parts[0][0].slant)}`,
        ceiling: `${fmt(len)} × ${fmt(parts[0][0].cW)}`,
        floor: floor === d.W * len ? `${fmt(len)} × ${fmt(d.W)}` : `${fmt(len)} × ${fmt(d.W)} − вырезы`,
      },
    }
  }
  const kitchen = mk('kitchen', d.zG, d.zEnd, [[d, d.L3]], d.ext.back)
  if (withWall) {
    return [
      mk('cab', 0, d.L, [[dCab, d.L]], d.W * d.L, { windowWall: d.areas.windowWall, doorWall: d.areas.doorWall }),
      mk('hall', d.L + T, d.zG, [[d, d.L2]], d.ext.floor),
      kitchen,
    ]
  }
  return [mk('all', 0, d.zG, [[dCab, d.L], [d, d.L2]], d.W * d.L + d.ext.floor, { windowWall: d.areas.windowWall }), kitchen]
}

/** Зона по координате z (для подсветки при наведении). */
export function zoneAt(d, withWall, z) {
  if (z >= d.zG) return 'kitchen'
  if (!withWall) return 'all'
  return z <= d.L + d.wallT / 2 ? 'cab' : 'hall'
}
