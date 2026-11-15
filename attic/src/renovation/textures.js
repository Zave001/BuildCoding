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

/** Дерево вагонки/реек: волокна вдоль оси u. Плитка 0,5 м. */
export const woodTex = (key) =>
  once('wood' + key, () => {
    const sp = SPECIES[key] || SPECIES.spruce
    const S = 512
    const [c, g] = cv(S, S)
    g.fillStyle = sp.base
    g.fillRect(0, 0, S, S)
    const r = rng(231 + key.length)
    for (let i = 0; i < 260; i++) {
      const y = r() * S
      const dark = r() < 0.65
      g.strokeStyle = dark ? `rgba(${sp.dark},${0.1 + r() * 0.3})` : `rgba(${sp.light},${0.06 + r() * 0.2})`
      g.lineWidth = 0.4 + r() * 2.2
      const amp = r() * 7
      const k = 1 + Math.floor(r() * 3)
      const ph = r() * 6.28
      g.beginPath()
      for (let x = 0; x <= S; x += 8) {
        const yy = y + Math.sin((x / S) * Math.PI * 2 * k + ph) * amp
        x ? g.lineTo(x, yy) : g.moveTo(x, yy)
      }
      g.stroke()
    }
    for (let i = 0; i < 5; i++) {
      const x = r() * S
      const y = r() * S
      const gr = g.createRadialGradient(x, y, 0, x, y, 8)
      gr.addColorStop(0, `rgba(${sp.dark},0.5)`)
      gr.addColorStop(1, `rgba(${sp.dark},0)`)
      g.fillStyle = gr
      g.beginPath()
      g.ellipse(x, y, 7, 13, 0, 0, 6.3)
      g.fill()
    }
    noise(g, S, S, 7, 232)
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
