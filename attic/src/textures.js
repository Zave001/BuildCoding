import * as THREE from 'three'

// Детерминированный генератор случайных чисел — текстуры одинаковы при каждой загрузке
export function rng(seed) {
  let s = seed >>> 0 || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

export const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)))

export function toTexture(canvas, repeatX, repeatY) {
  const t = new THREE.CanvasTexture(canvas)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeatX, repeatY)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

export const FLOORS = {
  grey: { label: 'Серый дуб (как на фото)', base: [190, 178, 162], spread: 10, grain: '92,80,66' },
  oak: { label: 'Натуральный дуб', base: [198, 160, 112], spread: 15, grain: '120,82,45' },
  walnut: { label: 'Тёмный орех', base: [112, 80, 57], spread: 11, grain: '50,33,22' },
  light: { label: 'Беленый дуб', base: [214, 206, 192], spread: 9, grain: '140,128,112' },
}

/** Ламинат: плитка 1,0 × 2,8 м, доски 0,2 × 1,4 м вразбежку. UV поверхности — в метрах. */
export function makeLaminate(key) {
  const cfg = FLOORS[key] || FLOORS.grey
  const PX = 512
  const TW = 1.0
  const TL = 2.8
  const pw = 0.2 * PX
  const pl = 1.4 * PX
  const c = document.createElement('canvas')
  c.width = TW * PX
  c.height = Math.round(TL * PX)
  const g = c.getContext('2d')
  const r0 = rng(7)

  for (let col = 0; col < 5; col++) {
    const off = r0() * c.height
    const x0 = col * pw
    for (let k = -2; k <= 1; k++) {
      const idx = ((k % 2) + 2) % 2
      const r = rng(1000 + col * 17 + idx * 331)
      const y0 = off + k * pl
      const j = (r() - 0.5) * 2 * cfg.spread
      g.fillStyle = `rgb(${cfg.base.map((v) => clamp(v + j + (r() - 0.5) * 5)).join(',')})`
      g.fillRect(x0, y0, pw, pl)

      g.save()
      g.beginPath()
      g.rect(x0, y0, pw, pl)
      g.clip()
      // волокна древесины
      for (let s = 0; s < 80; s++) {
        const x = x0 + r() * pw
        const dark = r() < 0.72
        g.strokeStyle = dark ? `rgba(${cfg.grain},${0.03 + r() * 0.08})` : `rgba(255,255,255,${0.03 + r() * 0.07})`
        g.lineWidth = 0.5 + r() * 2
        const amp = r() * 4
        const freq = 0.002 + r() * 0.008
        const ph = r() * 6.28
        g.beginPath()
        g.moveTo(x + Math.sin(ph) * amp, y0)
        for (let y = 0; y <= pl; y += 10) g.lineTo(x + Math.sin(y * freq + ph) * amp, y0 + y)
        g.stroke()
      }
      // сучки
      if (r() < 0.15) {
        const kx = x0 + pw * (0.2 + r() * 0.6)
        const ky = y0 + pl * (0.1 + r() * 0.8)
        const grad = g.createRadialGradient(kx, ky, 0, kx, ky, 9)
        grad.addColorStop(0, `rgba(${cfg.grain},0.3)`)
        grad.addColorStop(1, `rgba(${cfg.grain},0)`)
        g.fillStyle = grad
        g.beginPath()
        g.ellipse(kx, ky, 7, 16, 0, 0, Math.PI * 2)
        g.fill()
      }
      // фаска по длинным кромкам
      g.fillStyle = 'rgba(0,0,0,0.07)'
      g.fillRect(x0, y0, 3, pl)
      g.fillStyle = 'rgba(255,255,255,0.05)'
      g.fillRect(x0 + pw - 3, y0, 3, pl)
      g.restore()

      // стыки досок
      g.fillStyle = 'rgba(40,30,22,0.38)'
      g.fillRect(x0, y0, pw, 1.5)
      g.fillRect(x0, y0, 1.5, pl)
    }
  }
  return toTexture(c, 1 / TW, 1 / TL)
}

/** Окрашенная поверхность: почти белая, с едва заметной фактурой; цвет задаётся материалом. Плитка 2 × 2 м. */
export function makePaint(seed = 3) {
  const S = 512
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')
  g.fillStyle = '#f3f3f3'
  g.fillRect(0, 0, S, S)
  const r = rng(seed)
  for (let i = 0; i < 2200; i++) {
    const x = r() * S
    const y = r() * S
    const rad = 2 + r() * 14
    g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${r() * 0.025})` : `rgba(0,0,0,${r() * 0.012})`
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        g.beginPath()
        g.arc(x + dx * S, y + dy * S, rad, 0, Math.PI * 2)
        g.fill()
      }
  }
  const img = g.getImageData(0, 0, S, S)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 5
    img.data[i] = clamp(img.data[i] + n)
    img.data[i + 1] = clamp(img.data[i + 1] + n)
    img.data[i + 2] = clamp(img.data[i + 2] + n)
  }
  g.putImageData(img, 0, 0)
  return toTexture(c, 0.5, 0.5)
}

/** Вид за окном: зимний лес с берёзами, как на фото. */
export function makeForest() {
  const W = 2048
  const H = 1024
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  const r = rng(42)

  const sky = g.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#b9c7da')
  sky.addColorStop(0.7, '#e3e9f1')
  g.fillStyle = sky
  g.fillRect(0, 0, W, H)

  const branch = (x, y, len, a, w, depth, color) => {
    if (depth === 0 || len < 3) return
    const x2 = x + Math.sin(a) * len
    const y2 = y - Math.cos(a) * len
    g.strokeStyle = color
    g.lineWidth = Math.max(0.6, w)
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x2, y2)
    g.stroke()
    branch(x2, y2, len * (0.78 + r() * 0.12), a + (r() - 0.5) * 0.35, w * 0.72, depth - 1, color)
    const n = r() < 0.6 ? 1 : 2
    for (let i = 0; i < n; i++)
      branch(x2, y2, len * (0.5 + r() * 0.25), a + (r() < 0.5 ? -1 : 1) * (0.4 + r() * 0.6), w * 0.55, depth - 1, color)
  }

  // дальний план
  for (let i = 0; i < 160; i++) branch(r() * W, 780 + r() * 25, 40 + r() * 70, (r() - 0.5) * 0.2, 2, 6, 'rgba(95,100,115,0.16)')
  // снег
  const snow = g.createLinearGradient(0, 760, 0, H)
  snow.addColorStop(0, '#eef2f7')
  snow.addColorStop(1, '#cfd8e4')
  g.fillStyle = snow
  g.beginPath()
  g.moveTo(0, H)
  for (let x = 0; x <= W; x += 32) g.lineTo(x, 775 + Math.sin(x * 0.006) * 14 + Math.sin(x * 0.019) * 6)
  g.lineTo(W, H)
  g.fill()
  // средний план — тёмные деревья
  for (let i = 0; i < 38; i++) branch(r() * W, 790 + r() * 60, 90 + r() * 90, (r() - 0.5) * 0.15, 5 + r() * 5, 8, 'rgba(52,52,60,0.8)')
  // берёзы
  for (let i = 0; i < 9; i++) {
    const x = r() * W
    const base = 820 + r() * 80
    const top = 40 + r() * 120
    const w = 9 + r() * 6
    g.fillStyle = '#ecebe6'
    g.fillRect(x - w / 2, top, w, base - top)
    g.fillStyle = 'rgba(30,30,32,0.85)'
    for (let y = top; y < base; y += 10 + r() * 30) g.fillRect(x - w / 2 + r() * w * 0.4, y, w * (0.3 + r() * 0.5), 2 + r() * 3)
    for (let k = 0; k < 5; k++)
      branch(x, top + r() * (base - top) * 0.5, 60 + r() * 60, (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.5), 2.5, 6, 'rgba(45,42,48,0.75)')
  }
  // кусты на переднем плане
  for (let i = 0; i < 26; i++) branch(r() * W, H - r() * 140, 40 + r() * 50, (r() - 0.5) * 0.9, 3, 6, 'rgba(40,40,46,0.7)')

  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function canvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')]
}

function noise(g, w, h, amp, seed) {
  const r = rng(seed)
  const img = g.getImageData(0, 0, w, h)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * amp
    img.data[i] = clamp(img.data[i] + n)
    img.data[i + 1] = clamp(img.data[i + 1] + n)
    img.data[i + 2] = clamp(img.data[i + 2] + n)
  }
  g.putImageData(img, 0, 0)
}

/** Виниловый сайдинг «корабельный брус», бежево-розовый как на фото. Плитка 3,0 × 1,2 м, ламели по 0,2 м с двойным изломом. */
export function makeSiding() {
  const PX = 400
  const [c, g] = canvas(3 * PX, 1.2 * PX)
  const lap = 0.2 * PX
  g.fillStyle = '#cdb9ad'
  g.fillRect(0, 0, c.width, c.height)
  for (let y = 0; y < c.height; y += lap) {
    for (let k = 0; k < 2; k++) {
      const y0 = y + (k * lap) / 2
      const gr = g.createLinearGradient(0, y0, 0, y0 + lap / 2)
      gr.addColorStop(0, 'rgba(255,255,255,0.10)')
      gr.addColorStop(0.75, 'rgba(0,0,0,0.0)')
      gr.addColorStop(1, 'rgba(60,35,25,0.22)')
      g.fillStyle = gr
      g.fillRect(0, y0, c.width, lap / 2)
    }
    g.fillStyle = 'rgba(70,45,35,0.45)'
    g.fillRect(0, y + lap - 2, c.width, 2)
  }
  // H-профиль стыка панелей
  g.fillStyle = '#d6c4b8'
  g.fillRect(0, 0, 0.04 * PX, c.height)
  g.fillStyle = 'rgba(60,40,30,0.25)'
  g.fillRect(0.04 * PX, 0, 2, c.height)
  noise(g, c.width, c.height, 6, 5)
  return toTexture(c, 1 / 3, 1 / 1.2)
}

/** Металлочерепица (зелёная, RAL 6005): волна 0,185 м, ступень 0,35 м. Возвращает цвет и карту рельефа. */
export function makeMetalTile() {
  const PX = 400
  const waves = 6
  const ww = 0.185 * PX
  const sh = 0.35 * PX
  const [c, g] = canvas(Math.round(waves * ww), Math.round(sh))
  const [b, gb] = canvas(c.width, c.height)
  const img = g.createImageData(c.width, c.height)
  const bimg = gb.createImageData(c.width, c.height)
  const base = [44, 86, 60]
  for (let y = 0; y < c.height; y++) {
    const t = y / c.height // 0 — верх ступени (к коньку), 1 — нижний край ступени
    const step = t < 0.12 ? 0.35 + t * 4 : 1 - (t - 0.12) * 0.55
    for (let x = 0; x < c.width; x++) {
      const w = Math.sin(((x % ww) / ww) * Math.PI * 2)
      const h = (0.5 + 0.5 * w) * (0.55 + 0.45 * step)
      const light = 0.62 + 0.3 * Math.cos(((x % ww) / ww) * Math.PI * 2 - 0.9) * 0.5 + 0.25 * step
      const i = (y * c.width + x) * 4
      img.data[i] = clamp(base[0] * light * 1.25)
      img.data[i + 1] = clamp(base[1] * light * 1.25)
      img.data[i + 2] = clamp(base[2] * light * 1.25)
      img.data[i + 3] = 255
      const v = clamp(h * 255)
      bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = v
      bimg.data[i + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  gb.putImageData(bimg, 0, 0)
  // тень от ступени
  g.fillStyle = 'rgba(8,20,12,0.55)'
  g.fillRect(0, c.height - 3, c.width, 3)
  gb.fillStyle = '#000'
  gb.fillRect(0, c.height - 2, c.width, 2)
  const map = toTexture(c, 1 / (waves * 0.185), 1 / 0.35)
  const bump = toTexture(b, 1 / (waves * 0.185), 1 / 0.35)
  bump.colorSpace = THREE.NoColorSpace
  return { map, bump }
}

/** Трапециевидный профлист для козырька: шаг 0,2 м, рёбра вдоль ската. */
export function makeProfSheet() {
  const PX = 400
  const [c, g] = canvas(PX, 64)
  const pitch = 0.2 * PX
  for (let x = 0; x < PX; x++) {
    const f = (x % pitch) / pitch
    let l = 0.82
    if (f < 0.12) l = 1.05
    else if (f < 0.2) l = 0.6
    else if (f > 0.9) l = 0.95
    g.fillStyle = `rgb(${clamp(52 * l)},${clamp(98 * l)},${clamp(68 * l)})`
    g.fillRect(x, 0, 1, 64)
  }
  noise(g, PX, 64, 4, 9)
  return toTexture(c, 1, 1)
}

/** OSB для подсобных пространств. Плитка 1,25 × 1,25 м. */
export function makeOSB() {
  const S = 512
  const [c, g] = canvas(S, S)
  g.fillStyle = '#cdb994'
  g.fillRect(0, 0, S, S)
  const r = rng(77)
  for (let i = 0; i < 1600; i++) {
    const x = r() * S
    const y = r() * S
    const w = 10 + r() * 34
    const h = 3 + r() * 8
    const tone = r()
    g.save()
    g.translate(x, y)
    g.rotate((r() - 0.5) * Math.PI)
    g.fillStyle = tone < 0.4 ? `rgba(160,130,90,${0.2 + r() * 0.25})` : tone < 0.8 ? `rgba(228,210,175,${0.25 + r() * 0.3})` : `rgba(120,95,65,${0.15 + r() * 0.2})`
    g.fillRect(-w / 2, -h / 2, w, h)
    g.restore()
  }
  noise(g, S, S, 10, 78)
  return toTexture(c, 1.6, 1.6)
}

/** Вагонка (подшивка ската изнутри подсобки и софиты). Доска 0,1 м. Плитка 1 × 2 м. */
export function makeBoards(color = [214, 186, 140], seed = 21) {
  const PX = 256
  const [c, g] = canvas(PX, PX * 2)
  const r = rng(seed)
  const bw = 0.1 * PX
  for (let x = 0; x < PX; x += bw) {
    const j = (r() - 0.5) * 18
    g.fillStyle = `rgb(${color.map((v) => clamp(v + j)).join(',')})`
    g.fillRect(x, 0, bw, c.height)
    for (let s = 0; s < 14; s++) {
      g.strokeStyle = `rgba(120,85,45,${0.05 + r() * 0.08})`
      g.lineWidth = 0.5 + r()
      const xx = x + r() * bw
      g.beginPath()
      g.moveTo(xx, 0)
      g.bezierCurveTo(xx + (r() - 0.5) * 6, c.height * 0.3, xx + (r() - 0.5) * 6, c.height * 0.7, xx, c.height)
      g.stroke()
    }
    g.fillStyle = 'rgba(60,40,20,0.35)'
    g.fillRect(x, 0, 1.5, c.height)
  }
  return toTexture(c, 1, 0.5)
}

/** Белый ПВХ с остатками синей защитной плёнки, которую не сняли при монтаже (как на фото). Плитка 1 × 1 м. */
export function makeFilmTrim() {
  const S = 512
  const [c, g] = canvas(S, S)
  g.fillStyle = '#f2f2ef'
  g.fillRect(0, 0, S, S)
  const r = rng(13)
  for (let i = 0; i < 70; i++) {
    const cx = r() * S
    const cy = r() * S
    const rad = 14 + r() * 60
    g.fillStyle = `rgba(${150 + r() * 20},${172 + r() * 15},${196 + r() * 15},${0.75 + r() * 0.25})`
    g.beginPath()
    const n = 9
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      const rr = rad * (0.45 + r() * 0.7)
      const px = cx + Math.cos(a) * rr
      const py = cy + Math.sin(a) * rr * (0.5 + r())
      k ? g.lineTo(px, py) : g.moveTo(px, py)
    }
    g.closePath()
    g.fill()
    // надпись-рисунок плёнки
    g.fillStyle = 'rgba(70,95,140,0.35)'
    for (let k = 0; k < 3; k++) g.fillRect(cx - rad * 0.3 + r() * rad * 0.3, cy - rad * 0.2 + k * 7, 10 + r() * 14, 2)
  }
  return toTexture(c, 1, 1)
}
