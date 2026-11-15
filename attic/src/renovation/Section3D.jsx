import * as THREE from 'three'
import { useMemo } from 'react'
import { Html } from '@react-three/drei'
import { SURF_BY_ID, SPECIES, COATINGS, PROFILE_TYPES } from './data'
import { Builder } from './geom'
import { foamTex, woolTex, drywallTex, woodTex } from './textures'

export const SECTION_ORIGIN = [40, 1.2, 0]

const FRAME = { O: [0, 0, 0], ex: [0, 0, 1], ey: [0, 1, 0], n: [1, 0, 0] } // s → Z, t → Y, глубина w → X
const rect = (s0, s1, t0, t1) => [[s0, t0], [s1, t0], [s1, t1], [s0, t1]]
const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o })

/** Состав конструкции выбранной поверхности по слоям — общий для разреза и таблицы. */
export function layerList(model, cfg, surfId) {
  const st = model.stacks[surfId]
  const sc = cfg.surfaces[surfId]
  const mm = (a, b) => Math.round((b - a) * 1000 * 10) / 10
  const L = []
  L.push(st.mode === 'plywood'
    ? { key: 'base', name: 'Фанера (основание потолка)', d0: -0.012, d1: 0, color: '#c9a66b', note: `над снятым натяжным потолком, ${cfg.ceiling.gap} мм выше его плоскости` }
    : { key: 'base', name: 'Существующая отделка (обои) по вспененному утеплителю', d0: -0.04, d1: 0, color: '#e6c56d', note: 'основание, разметка наносится прямо на обои' })
  if (st.frame) L.push({ key: 'hangers', name: 'Акустический подвес', d0: 0, d1: st.reach, color: '#b9bec4', note: `вынос ${Math.round(st.reach * 1000)} мм` })
  if (st.frame) L.push({ key: 'profile', name: `Металлический профиль ${PROFILE_TYPES[cfg.frame.profileType].name}${st.levels === 2 ? ' (2 уровня)' : ''}`, d0: st.reach, d1: st.frameDepth, color: '#b9bec4', note: `шаг ${cfg.frame.pitch} см` })
  if (sc.wool && st.frame) L.push({ key: 'wool', name: 'Минеральная вата', d0: cfg.frame.airGap / 1000, d1: cfg.frame.airGap / 1000 + sc.woolT / 1000, color: '#d9c25f', note: `${sc.woolT} мм, зазор ${cfg.frame.airGap} мм`, overlay: true })
  st.dw.forEach((r, k) => L.push({ key: 'gkl' + (k + 1), name: `Гипсокартон, слой ${k + 1}`, d0: r[0], d1: r[1], color: '#d6d2c8', note: `лист ${cfg.drywall.sheetW}×${cfg.drywall.sheetL} м` }))
  if (cfg.finish === 'boards') {
    if (st.battens) L.push({ key: 'battens', name: 'Деревянная обрешётка', d0: st.battens[0], d1: st.battens[1], color: '#d8c8a2', note: `${cfg.battens.w}×${cfg.battens.t} мм, шаг ${cfg.battens.pitch} см` })
    L.push({ key: 'boards', name: st.mode === 'direct' ? 'Вагонка-штиль (на ГКЛ по профилям)' : 'Вагонка-штиль', d0: st.boards[0], d1: st.boards[1], color: SPECIES[cfg.boards.species].base, note: `${cfg.boards.thickness} мм, рабочая ширина ${cfg.boards.working} мм` })
  } else L.push({ key: 'finish', name: 'Шпаклёвка и покраска', d0: st.dwEnd, d1: st.total, color: cfg.paint.color, note: '≈3 мм' })
  return L.map((l) => ({ ...l, mm: mm(Math.max(l.d0, 0), l.d1) || mm(l.d0, l.d1) }))
}

export default function Section3D({ model, cfg, ui, surfId }) {
  const layers = useMemo(() => layerList(model, cfg, surfId), [model, cfg, surfId])
  const st = model.stacks[surfId]
  const k = ui.scale
  const gap = ui.explode * 0.22
  const X = 0.8 // ширина образца (s)
  const Y = 0.7 // высота образца (t)

  const mats = useMemo(
    () => ({
      base: std({ map: foamTex() }),
      hangers: std({ color: '#b9bec4', metalness: 0.8, roughness: 0.35 }),
      profile: std({ color: '#b9bec4', metalness: 0.8, roughness: 0.35 }),
      wool: std({ map: woolTex(), roughness: 1 }),
      gkl1: std({ map: drywallTex(), color: '#d6d2c8' }),
      gkl2: std({ map: drywallTex(), color: '#c7cbc4' }),
      battens: std({ map: woodTex('pine'), color: '#d8c8a2' }),
      boards: std({ map: woodTex(cfg.boards.species), color: (COATINGS[cfg.boards.coating] || COATINGS.none).tint }),
      finish: std({ color: cfg.paint.color }),
      rubber: std({ color: '#1d1d1f' }),
    }),
    [cfg.boards.species, cfg.boards.coating, cfg.paint.color],
  )

  const ws = SURF_BY_ID[surfId]
  // смещение слоя при разнесении: накапливается по порядку; вата и профиль «живут» внутри каркаса — их разносим отдельно
  const order = layers.map((l) => l.key)
  const shiftOf = (key) => order.indexOf(key) * gap

  const geoms = useMemo(() => {
    const out = {}
    const pitch = cfg.frame.pitch / 100
    const hw = st.pw / 2
    const lines = []
    for (let p = 0.06; p < Y - 0.04; p += pitch) lines.push(p)
    const mk = () => new Builder(FRAME)
    const sc = (a) => a * k
    for (const l of layers) {
      const b = mk()
      const sh = shiftOf(l.key)
      const w0 = sc(l.d0) + sh
      const w1 = sc(l.d1) + sh
      if (l.key === 'base') b.prism(rect(0, X, 0, Y), w0, w1)
      else if (l.key === 'hangers') {
        // два ряда подвесов
        for (const s of [0.12, 0.42, 0.72]) for (const t of [0.12, 0.5]) {
          b.prism(rect(s - 0.025, s + 0.025, t - 0.025, t + 0.025), w0, w0 + sc(0.003))
          b.prism(rect(s - 0.01, s + 0.01, t - 0.01, t + 0.01), w0 + sc(0.003), w1 - sc(0.004))
          b.prism(rect(s - 0.025, s + 0.025, t - 0.007, t + 0.007), w1 - sc(0.004), w1)
        }
      } else if (l.key === 'profile') {
        const a = st.profA
        for (const t of [0.12, 0.5]) b.prism(rect(0.02, X - 0.02, t - hw, t + hw), sc(a[0]) + sh, sc(a[1]) + sh)
        if (st.profB) for (const s of [0.12, 0.42, 0.72]) b.prism(rect(s - hw, s + hw, 0.02, Y - 0.02), sc(st.profB[0]) + sh, sc(st.profB[1]) + sh)
      } else if (l.key === 'wool') {
        // вата лежит в полости между профилями и отодвигается вместе с каркасом
        b.prism(rect(0, X, 0, Y), w0, w1)
      } else if (l.key === 'gkl1' || l.key === 'gkl2') {
        const half = cfg.drywall.sheetW / 2
        const cut = l.key === 'gkl1' ? 0.4 : 0.4 + cfg.drywall.shift * 0.4
        b.prism(rect(0.002, Math.min(X, cut) - 0.002, 0, Y), w0, w1)
        if (cut < X - 0.01) b.prism(rect(cut + 0.002, X - 0.002, 0, Y), w0, w1)
      } else if (l.key === 'battens') {
        const bwid = cfg.battens.w / 2000
        const bp = cfg.battens.pitch / 100
        for (let s = 0.05; s < X - 0.03; s += bp) b.prism(rect(s - bwid, s + bwid, 0, Y), w0, w1)
      } else if (l.key === 'boards') {
        const ww = cfg.boards.working / 1000
        for (let t = 0; t < Y - 0.005; t += ww) b.prism(rect(0, X, t + 0.0007, Math.min(Y, t + ww) - 0.0007), w0, w1, undefined, false)
      } else if (l.key === 'finish') b.prism(rect(0, X, 0, Y), w0, w1)
      out[l.key] = b.geometry()
    }
    return out
  }, [layers, k, gap, st, cfg.frame.pitch, cfg.battens, cfg.boards.working, cfg.drywall.shift, cfg.drywall.sheetW])

  return (
    <group position={SECTION_ORIGIN}>
      {layers.map((l) => {
        if (ui.layersOff[l.key]) return null
        const mat = mats[l.key] || mats.base
        const x = ((l.d0 + l.d1) / 2) * k + shiftOf(l.key)
        return (
          <group key={l.key}>
            <mesh geometry={geoms[l.key]} material={mat} castShadow receiveShadow />
            <Html position={[x, Y + 0.06 + (order.indexOf(l.key) % 2) * 0.09, X / 2]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
              <div className="sec-label">
                <b>{l.name}</b>
                <span>{l.mm} мм · {l.note}</span>
              </div>
            </Html>
          </group>
        )
      })}
      {/* стрелка направления «внутрь комнаты» */}
      <Html position={[0, -0.08, X / 2]} center style={{ pointerEvents: 'none' }}>
        <div className="sec-label dim">{ws.name} · от основания внутрь комнаты →</div>
      </Html>
    </group>
  )
}
