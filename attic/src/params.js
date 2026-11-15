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
}

export const fmt = (v, digits = 2) => v.toFixed(digits).replace('.', ',')

export function derive(raw) {
  const p = { ...raw }
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

  return { ...p, run, rise, slant, angle, gable, areas, sizes, volume: gable * p.L, warnings, heightAt }
}
