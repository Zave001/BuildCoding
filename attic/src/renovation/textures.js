import * as THREE from 'three'
import { rng, toTexture, clamp } from '../textures'
import { SPECIES } from './data'

function cv(w, h) {
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

const cache = {}
const once = (k, f) => (cache[k] ||= f())

/** Напылённый ППУ: жёлто-кремовая «пенистая» поверхность. Плитка 0,5 м. */
export const foamTex = () =>
  once('foam', () => {
    const S = 512
    const [c, g] = cv(S, S)
    g.fillStyle = '#e6c56d'
    g.fillRect(0, 0, S, S)
    const r = rng(201)
    for (let i = 0; i < 2600; i++) {
      const x = r() * S
      const y = r() * S
      const rad = 3 + r() * 11
      const gr = g.createRadialGradient(x, y, 0, x, y, rad)
      const dark = r() < 0.5
      gr.addColorStop(0, dark ? 'rgba(150,105,40,0.22)' : 'rgba(255,240,190,0.3)')
      gr.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = gr
      g.beginPath()
      g.arc(x, y, rad, 0, 6.3)
      g.fill()
    }
    noise(g, S, S, 14, 202)
    return toTexture(c, 2, 2)
  })

/** Минеральная вата: волокнистая фактура. Плитка 0,4 м. */
export const woolTex = () =>
  once('wool', () => {
    const S = 512
    const [c, g] = cv(S, S)
    g.fillStyle = '#d9c25f'
    g.fillRect(0, 0, S, S)
    const r = rng(211)
    for (let i = 0; i < 2600; i++) {
      const x = r() * S
      const y = r() * S
      const l = 14 + r() * 50
      const a = (r() - 0.5) * 0.9 + (r() < 0.5 ? 0 : Math.PI / 2.4)
      g.strokeStyle = r() < 0.5 ? `rgba(255,235,150,${0.2 + r() * 0.3})` : `rgba(140,110,30,${0.12 + r() * 0.25})`
      g.lineWidth = 0.6 + r() * 1.2
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l)
      g.stroke()
    }
    noise(g, S, S, 12, 212)
    return toTexture(c, 2.5, 2.5)
  })

/** Гипсокартон: бумага с мелким шумом. Плитка 1 м. */
export const drywallTex = () =>
  once('dw', () => {
    const S = 256
    const [c, g] = cv(S, S)
    g.fillStyle = '#cfcabf'
    g.fillRect(0, 0, S, S)
    noise(g, S, S, 12, 221)
    return toTexture(c, 1, 1)
  })

// периодический value-noise: плитка бесшовная по обеим осям
function makeNoise(seed, NX = 16, NY = NX) {
  const r = rng(seed)
  const grid = Array.from({ length: NX * NY }, () => r())
  const at = (i, j) => grid[(((j % NY) + NY) % NY) * NX + (((i % NX) + NX) % NX)]
  const sm = (t) => t * t * (3 - 2 * t)
  return (x, y) => {
    const i = Math.floor(x)
    const j = Math.floor(y)
    const fx = sm(x - i)
    const fy = sm(y - j)
    return (at(i, j) * (1 - fx) + at(i + 1, j) * fx) * (1 - fy) + (at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx) * fy
  }
}

/**
 * Дерево вагонки/реек: волокна вдоль оси u. Годичные кольца (тангенциальный рисунок «ёлочкой»),
 * поздняя/ранняя древесина полосами, сучки с обтекающими волокнами, смоляные кармашки. Плитка 0,5 м.
 */
export const woodTex = (key) =>
  once('wood' + key, () => {
    const sp = SPECIES[key] || SPECIES.spruce
    const W = 512
    const H = 512
    const [c, g] = cv(W, H)
    const dark = sp.dark.split(',').map(Number)
    const light = sp.light.split(',').map(Number)
    const base = sp.base
    const bc = [parseInt(base.slice(1, 3), 16), parseInt(base.slice(3, 5), 16), parseInt(base.slice(5, 7), 16)]
    // периоды подобраны так, чтобы плитка стыковалась без шва: целое число клеток на всю плитку
    const n1 = makeNoise(301 + key.length, 4, 4)
    const n2 = makeNoise(302 + key.length, 8, 8)
    const n3 = makeNoise(303 + key.length, 16, 256)
    const r = rng(331 + key.length)
    // сучки: положение, размер
    const knots = Array.from({ length: 3 }, () => ({ x: r() * W, y: r() * H, rx: 10 + r() * 12, ry: 5 + r() * 6 }))
    const img = g.createImageData(W, H)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        // смещение колец: плавная волна + искривление вокруг сучков
        let off = (n1((x * 2) / W, (y * 4) / H) - 0.5) * 20 + (n2((x * 4) / W, (y * 16) / H) - 0.5) * 5
        for (const k of knots) {
          const dx = (x - k.x) / (k.rx * 3)
          const dy = (y - k.y) / (k.ry * 5)
          const q = Math.exp(-(dx * dx + dy * dy))
          off += q * Math.sign(y - k.y || 1) * 14
        }
        const ring = Math.sin(((y + off) / H) * Math.PI * 2 * 16) * 0.5 + 0.5
        // поздняя древесина — узкие тёмные полосы, ранняя — светлая широкая
        const late = Math.pow(ring, 3.2)
        const fibre = n3((x * 16) / W, (y * 256) / H) - 0.5 // тонкие продольные волокна
        const broad = n2((x * 8) / W + 3, (y * 8) / H + 5) - 0.5 // крупная неравномерность тона
        let t = 0.3 + late * 0.34 + fibre * 0.42 + broad * 0.22
        t = Math.min(1, Math.max(0, t))
        const lo = light
        const hi = dark
        let rr = lo[0] + (hi[0] - lo[0]) * t
        let gg = lo[1] + (hi[1] - lo[1]) * t
        let bb = lo[2] + (hi[2] - lo[2]) * t
        // привязка к базовому цвету породы
        rr = rr * 0.22 + bc[0] * 0.78
        gg = gg * 0.22 + bc[1] * 0.78
        bb = bb * 0.22 + bc[2] * 0.78
        // тёмное в тени поздней древесины
        const sh = 1 - late * 0.06
        const i = (y * W + x) * 4
        img.data[i] = clamp(rr * sh)
        img.data[i + 1] = clamp(gg * sh)
        img.data[i + 2] = clamp(bb * sh)
        img.data[i + 3] = 255
      }
    }
    g.putImageData(img, 0, 0)
    // сучки: тёмное ядро и светлый ореол
    for (const k of knots) {
      for (const [mul, col] of [[2.2, `rgba(${light.join(',')},0.0)`], [1, `rgba(${dark.join(',')},0.0)`]]) {
        const gr = g.createRadialGradient(k.x, k.y, 0, k.x, k.y, k.rx * mul)
        gr.addColorStop(0, mul === 1 ? `rgba(${dark.map((v) => v * 0.55).join(',')},0.85)` : `rgba(${dark.join(',')},0.18)`)
        gr.addColorStop(0.55, mul === 1 ? `rgba(${dark.join(',')},0.45)` : `rgba(${dark.join(',')},0.08)`)
        gr.addColorStop(1, col)
        g.fillStyle = gr
        g.beginPath()
        g.ellipse(k.x, k.y, k.rx * mul, k.ry * mul, 0, 0, 6.3)
        g.fill()
      }
    }
    // редкие смоляные кармашки и трещинки
    for (let i = 0; i < 5; i++) {
      const x = r() * W
      const y = r() * H
      g.strokeStyle = `rgba(${dark.map((v) => v * 0.6).join(',')},${0.25 + r() * 0.25})`
      g.lineWidth = 0.7
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + 20 + r() * 40, y + (r() - 0.5) * 3)
      g.stroke()
    }
    return toTexture(c, 2, 2)
  })

/** Берёзовая фанера: светлый шпон с волокнами и редкими прожилками. Плитка 0,5 м. */
export const plywoodTex = () =>
  once('ply', () => {
    const S = 512
    const [c, g] = cv(S, S)
    g.fillStyle = '#d8bd8c'
    g.fillRect(0, 0, S, S)
    const r = rng(241)
    for (let i = 0; i < 240; i++) {
      const y = r() * S
      g.strokeStyle = r() < 0.6 ? `rgba(150,110,60,${0.08 + r() * 0.2})` : `rgba(255,240,205,${0.08 + r() * 0.2})`
      g.lineWidth = 0.5 + r() * 1.8
      const amp = r() * 5
      const ph = r() * 6.28
      g.beginPath()
      for (let x = 0; x <= S; x += 8) {
        const yy = y + Math.sin((x / S) * Math.PI * 2 + ph) * amp
        x ? g.lineTo(x, yy) : g.moveTo(x, yy)
      }
      g.stroke()
    }
    // стыки листов 1,25 × 2,5 м
    g.strokeStyle = 'rgba(90,60,30,0.35)'
    g.lineWidth = 1.5
    g.strokeRect(0, 0, S, S)
    noise(g, S, S, 8, 242)
    return toTexture(c, 2, 2)
  })
