import * as THREE from 'three'
import { rng, toTexture, clamp } from './textures'

function cv(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')]
}

function grain(g, w, h, noiseAmp, seed) {
  const r = rng(seed)
  const img = g.getImageData(0, 0, w, h)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * noiseAmp
    img.data[i] = clamp(img.data[i] + n)
    img.data[i + 1] = clamp(img.data[i + 1] + n)
    img.data[i + 2] = clamp(img.data[i + 2] + n)
  }
  g.putImageData(img, 0, 0)
}

// Волокна идут вдоль оси u; все линии периодичны по ширине, поэтому плитка бесшовна.
function woodLines(g, S, r, { dark, light, count, wob }) {
  for (let i = 0; i < count; i++) {
    const y = r() * S
    const isDark = r() < 0.65
    g.strokeStyle = isDark ? `rgba(${dark},${0.08 + r() * 0.3})` : `rgba(${light},${0.05 + r() * 0.16})`
    g.lineWidth = 0.4 + r() * 2.2
    const amp = r() * wob
    const k = 1 + Math.floor(r() * 3)
    const ph = r() * 6.28
    g.beginPath()
    for (let x = 0; x <= S; x += 8) {
      const yy = y + Math.sin((x / S) * Math.PI * 2 * k + ph) * amp
      x ? g.lineTo(x, yy) : g.moveTo(x, yy)
    }
    g.stroke()
  }
}

/** Венге: почти чёрно-коричневое дерево с тонкой полосой. Плитка 0,5 м. */
export function makeWenge() {
  const S = 512
  const [c, g] = cv(S, S)
  g.fillStyle = '#35241b'
  g.fillRect(0, 0, S, S)
  const r = rng(101)
  woodLines(g, S, r, { dark: '8,4,2', light: '120,84,60', count: 420, wob: 3 })
  // поры
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(10,5,3,${0.2 + r() * 0.3})`
    g.fillRect(r() * S, r() * S, 4 + r() * 14, 0.8 + r() * 0.8)
  }
  grain(g, S, S, 7, 102)
  return toTexture(c, 2, 2)
}

/** Светлый дуб. Плитка 0,5 м. */
export function makeOakLight() {
  const S = 512
  const [c, g] = cv(S, S)
  g.fillStyle = '#d2bb95'
  g.fillRect(0, 0, S, S)
  const r = rng(111)
  woodLines(g, S, r, { dark: '150,112,70', light: '246,232,205', count: 300, wob: 6 })
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(140,104,66,${0.1 + r() * 0.2})`
    g.fillRect(r() * S, r() * S, 3 + r() * 10, 0.8)
  }
  grain(g, S, S, 6, 112)
  return toTexture(c, 2, 2)
}

/** Вязаный плед: светлая текстура, цвет задаётся материалом. Плитка 0,25 м. */
export function makeKnit() {
  const S = 256
  const [c, g] = cv(S, S)
  g.fillStyle = '#c9c9ca'
  g.fillRect(0, 0, S, S)
  const cell = 8
  for (let y = 0; y < S; y += cell) {
    for (let x = 0; x < S; x += cell) {
      g.strokeStyle = 'rgba(255,255,255,0.55)'
      g.lineWidth = 1.6
      g.beginPath()
      g.moveTo(x + 1, y + 1)
      g.lineTo(x + cell / 2, y + cell - 1)
      g.stroke()
      g.strokeStyle = 'rgba(70,70,74,0.5)'
      g.beginPath()
      g.moveTo(x + cell - 1, y + 1)
      g.lineTo(x + cell / 2, y + cell - 1)
      g.stroke()
    }
  }
  grain(g, S, S, 14, 121)
  return toTexture(c, 4, 4)
}

/** Серая обивка кровати. Плитка 0,25 м. */
export function makeUpholstery() {
  const S = 256
  const [c, g] = cv(S, S)
  g.fillStyle = '#85878a'
  g.fillRect(0, 0, S, S)
  for (let i = 0; i < S; i += 3) {
    g.fillStyle = i % 6 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'
    g.fillRect(i, 0, 1.5, S)
    g.fillRect(0, i, S, 1.5)
  }
  grain(g, S, S, 16, 131)
  return toTexture(c, 4, 4)
}

/** Бельё: тёплый белый с тонкой полосой. Плитка 0,5 м. */
export function makeSheet() {
  const S = 256
  const [c, g] = cv(S, S)
  g.fillStyle = '#ebe5d8'
  g.fillRect(0, 0, S, S)
  for (let y = 0; y < S; y += 32) {
    g.fillStyle = 'rgba(160,150,130,0.12)'
    g.fillRect(0, y, S, 2)
  }
  grain(g, S, S, 8, 141)
  return toTexture(c, 2, 2)
}

/** Чёрная экокожа с мелким зерном. */
export function makeLeather() {
  const S = 256
  const [c, g] = cv(S, S)
  g.fillStyle = '#1b1b1d'
  g.fillRect(0, 0, S, S)
  const r = rng(151)
  for (let i = 0; i < 5000; i++) {
    const x = r() * S
    const y = r() * S
    g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.25)'
    g.beginPath()
    g.arc(x, y, 0.8 + r() * 1.6, 0, 6.3)
    g.fill()
  }
  grain(g, S, S, 6, 152)
  return toTexture(c, 3, 3)
}

function screenBase(w, h) {
  const [c, g] = cv(w, h)
  return [c, g]
}

const finishScreen = (c) => {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** Выключенный экран: тёмное стекло с бликом. */
export function makeScreenOff() {
  const [c, g] = screenBase(512, 288)
  const gr = g.createLinearGradient(0, 0, 512, 288)
  gr.addColorStop(0, '#16181c')
  gr.addColorStop(1, '#07080a')
  g.fillStyle = gr
  g.fillRect(0, 0, 512, 288)
  g.fillStyle = 'rgba(255,255,255,0.05)'
  g.beginPath()
  g.moveTo(300, 0)
  g.lineTo(420, 0)
  g.lineTo(160, 288)
  g.lineTo(40, 288)
  g.fill()
  return finishScreen(c)
}

/** Включённый экран: поисковая страница в тёмной теме, как на фото. */
export function makeScreenOn() {
  const [c, g] = screenBase(1024, 576)
  g.fillStyle = '#202124'
  g.fillRect(0, 0, 1024, 576)
  g.fillStyle = '#35363a'
  g.fillRect(0, 0, 1024, 28)
  const letters = [['G', '#4285f4'], ['o', '#ea4335'], ['o', '#fbbc05'], ['g', '#4285f4'], ['l', '#34a853'], ['e', '#ea4335']]
  g.font = '600 110px "Product Sans", Arial, sans-serif'
  let w = letters.reduce((s, [t]) => s + g.measureText(t).width, 0)
  let x = (1024 - w) / 2
  letters.forEach(([t, col]) => {
    g.fillStyle = col
    g.fillText(t, x, 270)
    x += g.measureText(t).width
  })
  g.fillStyle = '#303134'
  g.strokeStyle = '#5f6368'
  g.lineWidth = 2
  g.beginPath()
  g.roundRect(250, 310, 524, 56, 28)
  g.fill()
  g.stroke()
  g.fillStyle = 'rgba(255,255,255,0.04)'
  g.beginPath()
  g.moveTo(620, 0)
  g.lineTo(840, 0)
  g.lineTo(380, 576)
  g.lineTo(160, 576)
  g.fill()
  return finishScreen(c)
}


/** Полотно двери в подсобку: тёмная матовая плита с тонкой окантовкой, как на фото. Плитка 0,5 × 0,66 м. */
export function makeHatchLeaf() {
  const W = 256
  const H = 340
  const [c, g] = cv(W, H)
  g.fillStyle = '#1c1c1f'
  g.fillRect(0, 0, W, H)
  const r = rng(171)
  for (let i = 0; i < 160; i++) {
    g.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.18)'
    g.lineWidth = 0.6 + r()
    const x = r() * W
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x + (r() - 0.5) * 4, H)
    g.stroke()
  }
  // лёгкий блик и кромка по периметру
  const gr = g.createLinearGradient(0, 0, W, H)
  gr.addColorStop(0, 'rgba(255,255,255,0.07)')
  gr.addColorStop(0.5, 'rgba(255,255,255,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, W, H)
  g.strokeStyle = 'rgba(190,190,195,0.35)'
  g.lineWidth = 3
  g.strokeRect(5, 5, W - 10, H - 10)
  grain(g, W, H, 7, 172)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}
