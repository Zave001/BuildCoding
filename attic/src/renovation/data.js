import { DEFAULT_VENT } from '../vent/vent'
// Блок «Ремонт»: каталог, настройки по умолчанию, этапы. Единицы: толщины — мм, шаги — см, геометрия — м.

export const SURF = [
  { id: 'kneeL', name: 'Левая боковая стена', code: 'ЛС', group: 'walls' },
  { id: 'kneeR', name: 'Правая боковая стена', code: 'ПС', group: 'walls' },
  { id: 'slopeL', name: 'Левый скат', code: 'ЛК', group: 'slopes' },
  { id: 'slopeR', name: 'Правый скат', code: 'ПК', group: 'slopes' },
  { id: 'ceiling', name: 'Потолок', code: 'ПТ', group: 'ceiling' },
  { id: 'windowWall', name: 'Торцевая стена с окном', code: 'ТО', group: 'walls' },
  { id: 'doorWall', name: 'Новая стена с дверью', code: 'СД', group: 'walls' },
]
export const SURF_BY_ID = Object.fromEntries(SURF.map((s) => [s.id, s]))
export const GROUP_NAMES = { walls: 'Стены', slopes: 'Скаты', ceiling: 'Потолок' }

export const HANGER_TYPES = {
  low: { name: 'Низкий (вынос 30 мм)', reach: 30 },
  std: { name: 'Стандартный (вынос 40 мм)', reach: 40 },
  high: { name: 'Высокий (вынос 60 мм)', reach: 60 },
}
export const PROFILE_TYPES = {
  CD60: { name: 'CD 60×27', w: 60, h: 27 },
  UD27: { name: 'UD 27×28', w: 27, h: 28 },
  CW50: { name: 'CW 50×50', w: 50, h: 50 },
}
export const WOOL_THICKNESSES = [50, 100, 150, 200]

export const SPECIES = {
  spruce: { name: 'Ель', base: '#e3c58c', dark: '170,125,60', light: '250,232,190' },
  pine: { name: 'Сосна', base: '#d8b169', dark: '150,100,40', light: '250,225,160' },
  larch: { name: 'Лиственница', base: '#c98d5a', dark: '120,65,30', light: '240,200,150' },
  oak: { name: 'Дуб', base: '#c8a56c', dark: '120,85,45', light: '240,220,175' },
}
export const COATINGS = {
  none: { name: 'Без покрытия', tint: '#ffffff', gloss: 0.7, usage: 0 },
  varnish: { name: 'Лак матовый', tint: '#fbf1dc', gloss: 0.4, usage: 0.1 },
  oil: { name: 'Масло с воском', tint: '#f2dfb8', gloss: 0.55, usage: 0.08 },
  stain: { name: 'Морилка + лак', tint: '#e0b886', gloss: 0.4, usage: 0.12 },
}

export const DEFAULT_CFG = {
  finish: 'boards', // 'boards' — вагонка-штиль, 'paint' — ГКЛ под покраску
  mount: 'battens', // крепление вагонки на стенах и скатах: 'battens' — на обрешётку, 'direct' — прямо на ГКЛ по профилям
  // потолок: под натяжным потолком 5 см пространства, выше — фанера. После демонтажа основание потолка — фанера.
  ceiling: { mode: 'frame', removeStretch: true, gap: 50 }, // mode: 'frame' — профиль + ГКЛ, 'plywood' — обрешётка и вагонка на фанеру
  vent: DEFAULT_VENT,
  radiatorOut: true, // батарею выносим наружу после ремонта: ниши в отделке нет
  boardDir: 'horizontal', // 'horizontal' | 'vertical'
  surfaces: Object.fromEntries(SURF.map((s) => [s.id, { wool: true, woolT: 100 }])),
  frame: {
    scheme: 'two', // 'one' — одноуровневый, 'two' — двухуровневый (несущие + поперечные)
    hangerType: 'std',
    reach: 40, // мм: расстояние от поверхности до плоскости профиля (вынос подвеса)
    airGap: 10, // мм: воздушный зазор между основанием и ватой
    profileType: 'CD60',
    pitch: 40, // см: шаг профиля
    stock: 3.0, // м: длина стандартного профиля
    waste: 10, // %
    dir: 'along', // основной профиль: 'along' — вдоль комнаты/горизонтально, 'across' — поперёк
    edge: 5, // см: отступ первого профиля от края
  },
  hangers: {
    walls: { step: 60, row: 60, margin: 20 },
    slopes: { step: 60, row: 60, margin: 20 },
    ceiling: { step: 60, row: 60, margin: 20 },
  },
  wool: { density: 35, plateL: 1.2, plateW: 0.6, packVol: 0.288 },
  drywall: { layers: 2, thickness: 12.5, sheetL: 2.5, sheetW: 1.2, orient: 'along', shift: 0.6, waste: 10, screws: false, hide1: false, hide2: false },
  battens: { w: 40, t: 20, pitch: 40, stock: 3.0, waste: 8 },
  boards: { working: 90, full: 96, thickness: 14, stocks: [2.0, 2.5, 3.0], waste: 7, species: 'spruce', coating: 'varnish' },
  paint: { color: '#ebe7df' },
  electric: { show: false, route: 'batten', boxDepth: 45 },
  currency: '₽',
  labor: { include: true, rates: {} },
  prices: {}, // переопределения: { [id]: { price, packSize, waste, unit } }
}

// Каталог материалов (демонстрационные цены, можно менять в смете)
export const MATERIALS = {
  hanger: { name: 'Акустический подвес', unit: 'шт', pack: 1, price: 85, waste: 5, group: 'frame' },
  profile: { name: 'Профиль CD 60×27, хлыст', unit: 'шт', pack: 1, price: 190, waste: 0, group: 'frame' },
  joiner: { name: 'Удлинитель профиля', unit: 'шт', pack: 1, price: 22, waste: 5, group: 'frame' },
  crab: { name: 'Соединитель двухуровневый (профиль на профиль)', unit: 'шт', pack: 1, price: 18, waste: 5, group: 'frame' },
  wool: { name: 'Минеральная вата (упаковка)', unit: 'упак', pack: 1, price: 1500, waste: 5, group: 'wool' },
  gkl: { name: 'ГКЛ 12,5 мм (1200×2500)', unit: 'лист', pack: 1, price: 480, waste: 0, group: 'gkl' },
  scMetal: { name: 'Саморезы по металлу 3,5×25 (ГКЛ→профиль)', unit: 'шт', pack: 1000, price: 380, waste: 5, group: 'gkl' },
  tape: { name: 'Армирующая лента для швов', unit: 'м', pack: 90, price: 160, waste: 10, group: 'gkl' },
  putty: { name: 'Шпаклёвка', unit: 'кг', pack: 25, price: 780, waste: 10, group: 'gkl' },
  primer: { name: 'Грунтовка', unit: 'л', pack: 10, price: 650, waste: 10, group: 'gkl' },
  batten: { name: 'Рейка обрешётки, хлыст', unit: 'шт', pack: 1, price: 75, waste: 0, group: 'battens' },
  scWood: { name: 'Саморезы по дереву 4×50 (рейки)', unit: 'шт', pack: 200, price: 320, waste: 5, group: 'battens' },
  boardRate: { name: 'Вагонка-штиль (цена за пог. м)', unit: 'м', pack: 1, price: 140, waste: 0, group: 'boards' },
  klyamer: { name: 'Кляймеры для вагонки', unit: 'шт', pack: 100, price: 280, waste: 5, group: 'boards' },
  coating: { name: 'Защитное покрытие для вагонки', unit: 'л', pack: 2.7, price: 2400, waste: 10, group: 'boards' },
  paint: { name: 'Краска интерьерная', unit: 'л', pack: 9, price: 2100, waste: 10, group: 'paint' },
  seal: { name: 'Уплотнительная лента', unit: 'м', pack: 30, price: 240, waste: 10, group: 'extra' },
  corner: { name: 'Уголки / декоративные планки', unit: 'м', pack: 2.5, price: 95, waste: 10, group: 'extra' },
  trim: { name: 'Наличники окна и двери', unit: 'м', pack: 2.2, price: 130, waste: 10, group: 'extra' },
  ervWall: { name: 'Рекуператор настенный компактный', unit: 'шт', pack: 1, price: 54000, waste: 0, group: 'vent' },
  breather: { name: 'Бризер с нагревом и фильтром', unit: 'шт', pack: 1, price: 26000, waste: 0, group: 'vent' },
  valve: { name: 'Акустический приточный клапан', unit: 'шт', pack: 1, price: 4800, waste: 0, group: 'vent' },
  louver: { name: 'Решётка-жалюзи в торце с защитой от снега', unit: 'шт', pack: 1, price: 2400, waste: 0, group: 'vent' },
  erv: { name: 'Рекуператор канальный (150–250 м³/ч)', unit: 'шт', pack: 1, price: 78000, waste: 0, group: 'vent' },
  silencer: { name: 'Шумоглушитель Ø125, 900 мм', unit: 'шт', pack: 1, price: 4200, waste: 0, group: 'vent' },
  flexduct: { name: 'Воздуховод гибкий акустический Ø125', unit: 'м', pack: 1, price: 480, waste: 8, group: 'vent' },
  sleeve: { name: 'Гильза-проход через слои Ø165 (с уплотнением)', unit: 'шт', pack: 1, price: 750, waste: 0, group: 'vent' },
  hood: { name: 'Колпак кровельный (проход через кровлю)', unit: 'шт', pack: 1, price: 3600, waste: 0, group: 'vent' },
  grille: { name: 'Решётка / диффузор', unit: 'шт', pack: 1, price: 1900, waste: 0, group: 'vent' },
  vclamp: { name: 'Виброподвес канала', unit: 'шт', pack: 1, price: 240, waste: 5, group: 'vent' },
  ventinsul: { name: 'Теплоизоляция тёплых каналов', unit: 'м', pack: 1, price: 190, waste: 10, group: 'vent' },
  ventseal: { name: 'Виброгерметик и лента для проходов', unit: 'компл', pack: 1, price: 1100, waste: 0, group: 'vent' },
  plinth: { name: 'Плинтус', unit: 'м', pack: 2.5, price: 110, waste: 10, group: 'extra' },
}
export const GROUP_LABEL = {
  frame: 'Подвесы и металлопрофиль',
  wool: 'Минеральная вата',
  gkl: 'Гипсокартон',
  battens: 'Деревянная обрешётка',
  boards: 'Вагонка-штиль',
  paint: 'Окраска',
  vent: 'Вентиляция (рекуператор)',
  extra: 'Дополнительные материалы',
  labor: 'Работы мастеров',
}

export const LABOR = {
  demo: { name: 'Демонтаж натяжного потолка и батареи', unit: 'м²', rate: 150 },
  frame: { name: 'Монтаж подвесов и профиля', unit: 'м²', rate: 650 },
  wool: { name: 'Укладка минеральной ваты', unit: 'м²', rate: 180 },
  gkl: { name: 'Обшивка ГКЛ (за слой)', unit: 'м²', rate: 350 },
  battens: { name: 'Монтаж обрешётки', unit: 'м²', rate: 280 },
  boards: { name: 'Монтаж вагонки', unit: 'м²', rate: 700 },
  finish: { name: 'Шпаклёвка, грунтовка, покраска', unit: 'м²', rate: 450 },
}

export const ceilingPlywood = (cfg) => cfg.finish === 'boards' && cfg.ceiling.mode === 'plywood' && cfg.surfaces.ceiling.enabled !== false
/** Нужен ли этап обрешётки: на стенах/скатах при монтаже на рейки или на потолке при монтаже на фанеру. */
export const usesBattens = (cfg) => cfg.finish === 'boards' && (cfg.mount !== 'direct' || ceilingPlywood(cfg))

/** Этапы ремонта в зависимости от выбранной отделки, числа слоёв ГКЛ и способа крепления вагонки. */
export function stagesFor(cfg) {
  const s = [
    { key: 'initial', name: 'Исходное состояние', hint: 'Существующая отделка кабинета без изменений.' },
    { key: 'hangers', name: 'Акустические подвесы', hint: 'Разметка по обоям поверх вспененного утеплителя и крепление подвесов. Натяжной потолок снят, батарея вынесена.' },
    { key: 'profile', name: 'Металлический профиль', hint: 'Каркас на подвесах: профили, соединители и стыки.' },
    { key: 'wool', name: 'Минеральная вата', hint: 'Утеплитель в полости каркаса — только на выбранных поверхностях.' },
    { key: 'gkl1', name: 'Первый слой ГКЛ', hint: 'Листы первого слоя, швы и откосы проёмов.' },
  ]
  if (cfg.drywall.layers === 2) s.push({ key: 'gkl2', name: 'Второй слой ГКЛ', hint: 'Второй слой со смещением швов относительно первого.' })
  if (cfg.finish === 'boards') {
    if (usesBattens(cfg)) {
      s.push({
        key: 'battens', name: 'Деревянная обрешётка',
        hint: cfg.mount === 'direct' ? 'Рейки только на потолке — прямо на фанеру (стены и скаты — вагонка на ГКЛ без реек).' : ceilingPlywood(cfg) ? 'Рейки перпендикулярно вагонке; на потолке — прямо на фанеру.' : 'Рейки перпендикулярно вагонке, усиление по периметру и вокруг проёмов.',
      })
    }
    s.push({
      key: 'boards', name: 'Вагонка-штиль',
      hint: cfg.mount === 'direct' ? 'Доски крепятся к профилю через ГКЛ (по линиям профиля), подрезка по проёмам и скатам.' : 'Отдельные доски по рабочей ширине, подрезка по проёмам и скатам.',
    })
    s.push({ key: 'done', name: 'Завершённый ремонт', hint: 'Углы, наличники и плинтус. Итоговая отделка — вагонка.' })
  } else {
    s.push({ key: 'putty', name: 'Шпаклёвка и шлифовка', hint: 'Финишная шпаклёвка швов и шлифовка.' })
    s.push({ key: 'done', name: 'Грунтовка и покраска', hint: 'Окраска гипсокартона в выбранный цвет.' })
  }
  return s
}

/** Слияние сохранённых настроек с актуальными значениями по умолчанию (на случай добавления полей). */
export function mergeCfg(saved) {
  const m = (a, b) => {
    if (b === undefined || b === null) return a
    if (Array.isArray(a) || typeof a !== 'object') return typeof b === typeof a || Array.isArray(a) ? b : a
    const out = { ...a }
    for (const k of Object.keys(b)) out[k] = k in a ? m(a[k], b[k]) : b[k]
    return out
  }
  return m(DEFAULT_CFG, saved)
}

// «Дополнительные» материалы и расходники для отдельной строки итога
export const EXTRA_IDS = new Set(['joiner', 'crab', 'scMetal', 'tape', 'putty', 'primer', 'scWood', 'klyamer', 'coating', 'seal', 'corner', 'trim', 'plinth'])
