import * as THREE from 'three'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { SURF, SPECIES, COATINGS } from './data'
import { stagesFor } from './data'
import { Builder, frameMatrix, skinGeometry, outlinePoints } from './geom'
import { foamTex, woolTex, drywallTex, woodTex, plywoodTex } from './textures'

const rectAround = (axis, pos, lo, hi, hw) =>
  axis === 's' ? [[lo, pos - hw], [hi, pos - hw], [hi, pos + hw], [lo, pos + hw]] : [[pos - hw, lo], [pos + hw, lo], [pos + hw, hi], [pos - hw, hi]]

/* ---------- построение геометрии (по модели расчёта) ---------- */

const ROT90 = new THREE.Matrix4().makeRotationZ(Math.PI / 2)

/**
 * «Кожа» нужна только там, где после снятия натяжного потолка открывается новая поверхность:
 * сам потолок (фанера) и полоса удлинённых скатов и торцов над прежним уровнем. Стены остаются как есть — на них разметка по обоям.
 */
function skinOf(id, surf, model) {
  if (!model.raised) return null
  const { d0, d } = model
  const L = d.L
  if (id === 'ceiling') return skinGeometry(surf)
  if (id === 'slopeL' || id === 'slopeR') {
    const len = surf.bounds.t[1]
    const l0 = d0.slant
    const poly = id === 'slopeL' ? [[0, l0], [L, l0], [L, len], [0, len]] : [[0, 0], [L, 0], [L, len - l0], [0, len - l0]]
    return skinGeometry(surf, 0.0008, poly, false)
  }
  return skinGeometry(surf, 0.0008, [[-d0.cW / 2, d0.cH], [d0.cW / 2, d0.cH], [d.cW / 2, d.cH], [-d.cW / 2, d.cH]], false)
}

function buildAll(model, cfg) {
  const { stacks, surfaces, gen } = model
  const st = stacks.kneeL // параметры общих деталей (подвес, «краб», стык) одинаковы на всех поверхностях каркаса
  const bw = cfg.battens.w / 2000
  const idB = new Builder({ O: [0, 0, 0], ex: [1, 0, 0], ey: [0, 1, 0], n: [0, 0, 1] })
  // инстансы: подвес (металл + резина)
  const hM = new Builder({ O: [0, 0, 0], ex: [1, 0, 0], ey: [0, 1, 0], n: [0, 0, 1] })
  const rect = (cx, cy, w, h) => [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]]
  // Подвес («крокодил»): плита на основании → виброгаситель → П-образная скоба, в которую входит профиль.
  // Локально профиль идёт вдоль оси s; перемычка скобы лежит под профилем, две стойки охватывают его с боков.
  const pwF = st.pw || 0.06
  const phF = st.ph || 0.027
  const top = st.reach + phF + 0.004 // стойки скобы доходят до верха профиля
  hM.prism(rect(0, 0, 0.06, 0.05), 0, 0.004) // плита на основании
  hM.prism(rect(0, 0, 0.05, pwF + 0.02), st.reach - 0.006, st.reach - 0.001) // перемычка П: профиль лежит на ней
  for (const k of [-1, 1]) {
    // стойки П охватывают профиль с двух сторон и доходят до его верха
    hM.prism(rect(0, k * (pwF / 2 + 0.005), 0.05, 0.005), st.reach - 0.006, top)
    // отгибы стоек наружу — чтобы форма читалась и с плоскости
    hM.prism(rect(0, k * (pwF / 2 + 0.014), 0.05, 0.012), top - 0.004, top)
  }
  const hR = new Builder({ O: [0, 0, 0], ex: [1, 0, 0], ey: [0, 1, 0], n: [0, 0, 1] })
  hR.prism(rect(0, 0, 0.022, 0.022), 0.004, st.reach - 0.006) // виброгаситель между плитой и скобой
  const crab = new Builder({ O: [0, 0, 0], ex: [1, 0, 0], ey: [0, 1, 0], n: [0, 0, 1] })
  crab.prism(rect(0, 0, 0.045, 0.045), st.profA[1] - 0.002, st.profA[1] + 0.004)
  const joint = new Builder({ O: [0, 0, 0], ex: [1, 0, 0], ey: [0, 1, 0], n: [0, 0, 1] })
  joint.prism(rect(0, 0, 0.08, 0.07), st.profA[0] - 0.001, st.profA[1] + 0.001)
  const screw = new Builder({ O: [0, 0, 0], ex: [1, 0, 0], ey: [0, 1, 0], n: [0, 0, 1] })
  screw.prism(rect(0, 0, 0.007, 0.007), 0, 0.0012)

  const per = {}
  for (const s of SURF) {
    const surf = surfaces[s.id]
    const sst = stacks[s.id]
    const hw = sst.pw / 2
    const g = gen[s.id]
    const M = frameMatrix(surf)
    const mk = () => new Builder(surf)
    const pA = mk()
    const pB = mk()
    for (const p of g.profiles) {
      const b = p.level === 'A' ? pA : pB
      const dr = p.level === 'A' ? sst.profA : sst.profB
      b.prism(rectAround(p.axis, p.pos, p.lo, p.hi, hw), dr[0], dr[1])
    }
    const pAgeo = pA.geometry()
    const wool = mk()
    g.wool.forEach((poly) => wool.prism(poly, cfg.frame.airGap / 1000, cfg.frame.airGap / 1000 + g.woolT / 1000))
    const sheets = [mk(), mk()]
    for (let k = 0; k < cfg.drywall.layers; k++) g.sheets[k].forEach((sh) => sheets[k].prism(sh.poly, sst.dw[k][0], sst.dw[k][1]))
    const bat = mk()
    if (sst.battens) g.battens.forEach((b) => bat.prism(rectAround(b.axis, b.pos, b.lo, b.hi, bw), sst.battens[0], sst.battens[1], undefined, b.axis === 't'))
    const boards = mk()
    if (sst.boards) g.boards.forEach((b) => boards.prism(b.poly, sst.boards[0], sst.boards[1], b.num, b.axis === 't'))
    const rev = mk()
    g.reveals.forEach((r) => rev.prism(r.poly, 0, sst.total))

    const mat = (s2, t2) => M.clone().multiply(new THREE.Matrix4().makeTranslation(s2, t2, 0))
    per[s.id] = {
      skin: skinOf(s.id, surf, model),
      pA: pAgeo,
      pAEdges: new THREE.EdgesGeometry(pAgeo, 20),
      pB: pB.geometry(),
      wool: wool.geometry(),
      sheets: sheets.map((b) => b.geometry()),
      battens: bat.geometry(),
      boards: boards.geometry(),
      reveals: rev.geometry(),
      // подвес повёрнут вдоль «своего» профиля: ось t — на 90°
      hangers: g.hangers.map((h) => mat(h[0], h[1]).multiply(h[2] === 't' ? ROT90 : new THREE.Matrix4())),
      crabs: g.crabs.map(([a, b]) => mat(a, b)),
      joints: g.joints.map(([a, b]) => mat(a, b)),
      screws: [0, 1].map((k) => g.screws[k].map(([a, b]) => mat(a, b).multiply(new THREE.Matrix4().makeTranslation(0, 0, sst.dw[k]?.[1] ?? 0)))),
      outline: outlinePoints(surf),
    }
  }
  // новая стена с дверью: плоскость z = L, w отсчитывается от кабинета к залу
  let wallG = null
  if (model.wall) {
    const wl = model.wall
    const wd = wl.dims
    const frameSurf = { O: [0, 0, model.d.L], ex: [1, 0, 0], ey: [0, 1, 0], n: [0, 0, 1] }
    const mkW = () => new Builder(frameSurf)
    const frame = mkW()
    ;[...wl.tracks, ...wl.studs.map((s) => s.poly)].forEach((p) => frame.prism(p, wd.frameZ[0], wd.frameZ[1]))
    const tapeB = mkW()
    wl.tape.forEach((p) => tapeB.prism(p, wd.frameZ[0], wd.frameZ[1]))
    wl.pads.forEach(([x, y]) => tapeB.prism([[x - 0.03, y - 0.03], [x + 0.03, y - 0.03], [x + 0.03, y + 0.03], [x - 0.03, y + 0.03]], wd.frameZ[0], wd.frameZ[1]))
    const woolB = mkW()
    const w0 = wd.frameZ[0] + (wd.fd - wl.tw) / 2
    wl.wool.forEach((p) => woolB.prism(p, w0, w0 + wl.tw))
    const cab = []
    const hall = []
    for (let k = 0; k < wd.nl; k++) {
      const cb = mkW()
      const hb = mkW()
      wl.sheets.cab[k].forEach((sh) => cb.prism(sh.poly, ...wd.cabZ(k)))
      wl.sheets.hall[k].forEach((sh) => hb.prism(sh.poly, ...wd.hallZ(k)))
      cab.push(cb.geometry())
      hall.push(hb.geometry())
    }
    wallG = { frame: frame.geometry(), tape: tapeB.geometry(), wool: woolB.geometry(), cab, hall }
  }
  return { wallG, per, hanger: hM.geometry(), rubber: hR.geometry(), crab: crab.geometry(), joint: joint.geometry(), screw: screw.geometry() }
}

/* ---------- мелкие компоненты ---------- */

function Inst({ geom, mat, matrices, onPick }) {
  const ref = useRef()
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    matrices.forEach((x, i) => m.setMatrixAt(i, x))
    m.instanceMatrix.needsUpdate = true
    m.count = matrices.length
    m.computeBoundingSphere?.()
  }, [matrices])
  if (!matrices.length) return null
  return <instancedMesh ref={ref} args={[geom, mat, matrices.length]} frustumCulled={false} castShadow onClick={onPick ? (e) => { e.stopPropagation(); onPick(e.instanceId) } : undefined} />
}

/** Плавное появление слоя: прозрачность материалов внутри группы. */
function Fade({ on, children }) {
  const g = useRef()
  const a = useRef(on ? 1 : 0)
  const dirty = useRef(true)
  useFrame((_, dt) => {
    const target = on ? 1 : 0
    const diff = target - a.current
    if (Math.abs(diff) < 0.002 && !dirty.current) return
    a.current = Math.abs(diff) < 0.004 ? target : a.current + diff * Math.min(1, dt * 7)
    dirty.current = Math.abs(target - a.current) > 0.002
    const al = a.current
    if (!g.current) return
    const vis = al > 0.02
    g.current.visible = vis
    g.current.traverse((o) => {
      // скрытый слой не должен перехватывать клики (raycast не учитывает visible)
      if (o.raycast) {
        o.userData.rc ??= o.raycast
        o.raycast = vis ? o.userData.rc : () => null
      }
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []
      ms.forEach((m) => {
        const base = m.userData.baseOpacity ?? (m.userData.baseOpacity = m.opacity)
        m.transparent = al < 0.995 || base < 1
        m.opacity = base * al
        m.depthWrite = al > 0.6
      })
    })
  })
  useEffect(() => {
    dirty.current = true
  }, [children])
  return <group ref={g} visible={on}>{children}</group>
}

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o })

/* ---------- основной компонент ---------- */

export default function Renovation3D({ d, model, cfg, ui, stage, inRen = true, sel, onSurface, onBoard, onHanger }) {
  const keys = useMemo(() => stagesFor(cfg).map((s) => s.key), [cfg.finish, cfg.drywall.layers])
  const idx = Math.min(stage, keys.length - 1)
  const prep = idx >= 1 // с первого рабочего этапа натяжной потолок снят
  const frameOnly = ui.frameOnly
  const reached = (k) => {
    const i = keys.indexOf(k)
    if (i < 0 || idx < i) return false
    if (frameOnly && ['wool', 'gkl1', 'gkl2', 'putty', 'battens', 'boards', 'done'].includes(k)) return false
    return true
  }
  const geo = useMemo(() => buildAll(model, cfg), [model, cfg])
  const M = useMemo(() => {
    const sp = SPECIES[cfg.boards.species] || SPECIES.spruce
    const coat = COATINGS[cfg.boards.coating] || COATINGS.none
    return {
      foam: std({ map: foamTex(), roughness: 0.95 }),
      ply: std({ map: plywoodTex(), roughness: 0.85 }),
      ghost: new THREE.LineBasicMaterial({ color: '#ffb547', transparent: true, opacity: 1 }),
      wool: std({ map: woolTex(), roughness: 1 }),
      steel: std({ color: '#c9cdd2', roughness: 0.4, metalness: 0.45, side: THREE.DoubleSide }),
      rubber: std({ color: '#3a3a3e', roughness: 0.9, side: THREE.DoubleSide }),
      // подвес: светлая оцинковка (металл без карты окружения выглядел бы чёрным)
      hanger: std({ color: '#e4e7ea', roughness: 0.45, metalness: 0.05, emissive: '#2b2f33', side: THREE.DoubleSide }),
      dot: new THREE.MeshBasicMaterial({ color: '#ff5a3c', depthTest: false, transparent: true }),
      dw1: std({ map: drywallTex(), color: '#d6d2c8', roughness: 0.92 }),
      dw2: std({ map: drywallTex(), color: '#c7cbc4', roughness: 0.92 }),
      screw: std({ color: '#3a3d42', roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide }),
      batten: std({ map: woodTex('pine'), color: '#f3ead6', roughness: 0.85 }),
      board: std({ map: woodTex(cfg.boards.species), color: coat.tint, roughness: 1 - coat.gloss * 0.6 }),
      trim: std({ color: '#f1f1ee', roughness: 0.5 }),
      sel: new THREE.MeshStandardMaterial({ color: '#ffb547', emissive: '#ff9a1f', emissiveIntensity: 0.9, roughness: 0.5 }),
    }
  }, [cfg.boards.species, cfg.boards.coating])
  // слой «финишного» ГКЛ: окраска при шпаклёвке/покраске
  const lastSheet = cfg.drywall.layers === 2 ? 'dw2' : 'dw1'
  const paintOn = cfg.finish === 'paint' && reached('putty')
  const paintDone = cfg.finish === 'paint' && reached('done')
  useEffect(() => {
    const m = M[lastSheet]
    m.color.set(paintDone ? cfg.paint.color : paintOn ? '#ebe8e0' : lastSheet === 'dw2' ? '#c7cbc4' : '#d6d2c8')
    m.roughness = paintDone ? 0.7 : 0.92
  }, [M, lastSheet, paintOn, paintDone, cfg.paint.color])

  const revMat = useMemo(() => {
    const finished = cfg.finish === 'boards' ? reached('boards') : paintDone
    return finished ? (cfg.finish === 'boards' ? M.board : std({ color: cfg.paint.color, roughness: 0.7 })) : M.dw1
  }, [M, cfg.finish, cfg.paint.color, idx, paintDone])

  const showAll = reached('hangers')

  // ----- подсветка выбранной доски -----
  const selBoard = useMemo(() => {
    if (!sel.board) return null
    const sid = sel.board.split('-')[0]
    const code = SURF.find((s) => s.code === sid)
    if (!code) return null
    const b = model.gen[code.id].boards.find((x) => x.num === sel.board)
    if (!b) return null
    const bd = new Builder(model.surfaces[code.id])
    bd.prism(b.poly, model.stacks[code.id].boards[0] - 0.002, model.stacks[code.id].boards[1] + 0.003, undefined, b.axis === 't')
    return bd.geometry()
  }, [sel.board, model])

  // выбранный подвес: подсвечиваем весь ряд — его подвесы и профиль, к которому они крепятся
  const selLine = useMemo(() => {
    if (!sel.hanger) return null
    const { surf, line } = sel.hanger
    const g = model.gen[surf]
    if (!g) return null
    const stS = model.stacks[surf]
    const b = new Builder(model.surfaces[surf])
    g.profiles.filter((p) => p.lineId === line).forEach((p) => b.prism(rectAround(p.axis, p.pos, p.lo, p.hi, stS.pw / 2 + 0.002), stS.profA[0] - 0.002, stS.profA[1] + 0.002))
    const mats = g.hangers.map((h, i) => (h[3] === line ? geo.per[surf].hangers[i] : null)).filter(Boolean)
    return { geom: b.geometry(), mats }
  }, [sel.hanger, model, geo])

  const ownerAt = (geom, face) => {
    const o = geom.userData.owners
    for (const r of o) if (face >= r.start && face < r.start + r.count) return r.id
    return null
  }

  return (
    <group>
      {SURF.map((s) => {
        const p = geo.per[s.id]
        // открывшаяся после снятия натяжного потолка фанера (потолок и полосы выше прежнего уровня)
        const skinEl = p.skin ? (
          <Fade on={prep}>
            <mesh geometry={p.skin} material={M.ply} receiveShadow />
          </Fade>
        ) : null
        if (!model.enabled[s.id]) return <group key={s.id}>{skinEl}</group> // не обрабатывается: остаётся как есть
        return (
          <group key={s.id}>
            {skinEl}
            <Fade on={reached('hangers')}>
              <Inst geom={geo.hanger} mat={M.hanger} matrices={p.hangers} onPick={inRen ? (i) => onHanger(s.id, model.gen[s.id].hangers[i][3]) : undefined} />
              <Inst geom={geo.rubber} mat={M.rubber} matrices={p.hangers} />
            </Fade>
            {/* до установки профиля — «призрак» линии профиля: показывает, какие подвесы к какому ряду относятся */}
            <Fade on={reached('hangers') && !reached('profile')}>
              <lineSegments geometry={p.pAEdges} material={M.ghost} />
            </Fade>
            <Fade on={reached('profile')}>
              <mesh geometry={p.pA} material={M.steel} castShadow receiveShadow />
              <mesh geometry={p.pB} material={M.steel} castShadow receiveShadow />
              <Inst geom={geo.crab} mat={M.steel} matrices={p.crabs} />
              <Inst geom={geo.joint} mat={M.steel} matrices={p.joints} />
            </Fade>
            <Fade on={reached('wool')}>
              <mesh geometry={p.wool} material={M.wool} receiveShadow />
            </Fade>
            <Fade on={reached('gkl1') && !cfg.drywall.hide1}>
              <mesh geometry={p.sheets[0]} material={M.dw1} receiveShadow />
              {inRen && ui.screws && <Inst geom={geo.screw} mat={M.screw} matrices={p.screws[0]} />}
            </Fade>
            <Fade on={cfg.drywall.layers === 2 && reached('gkl2') && !cfg.drywall.hide2}>
              <mesh geometry={p.sheets[1]} material={M.dw2} receiveShadow />
              {inRen && ui.screws && <Inst geom={geo.screw} mat={M.screw} matrices={p.screws[1]} />}
            </Fade>
            <Fade on={reached('gkl1')}>
              <mesh geometry={p.reveals} material={revMat} receiveShadow />
            </Fade>
            <Fade on={cfg.finish === 'boards' && reached('battens')}>
              <mesh geometry={p.battens} material={M.batten} castShadow receiveShadow />
            </Fade>
            <Fade on={cfg.finish === 'boards' && reached('boards')}>
              <mesh
                geometry={p.boards}
                material={M.board}
                castShadow
                receiveShadow
                onClick={(e) => {
                  if (!inRen) return
                  e.stopPropagation()
                  const n = ownerAt(p.boards, Math.floor(e.faceIndex))
                  if (n) onBoard(n)
                }}
              />
            </Fade>
            {/* точки крепления поверх всех слоёв */}
            {inRen && ui.points && showAll && <Inst geom={geo.screw} mat={M.dot} matrices={p.hangers.map((m2) => m2.clone().scale(new THREE.Vector3(2.4, 2.4, 6)))} />}
          </group>
        )
      })}

      {/* новая стена с дверью: каркас → вата → ГКЛ с двух сторон (подвесов у неё нет) */}
      {geo.wallG && (
        <group>
          <Fade on={reached('profile')}>
            <mesh geometry={geo.wallG.frame} material={M.steel} castShadow receiveShadow />
            <mesh geometry={geo.wallG.tape} material={M.rubber} />
          </Fade>
          <Fade on={reached('wool') && cfg.wall.woolOn !== false}>
            <mesh geometry={geo.wallG.wool} material={M.wool} receiveShadow />
          </Fade>
          {geo.wallG.cab.map((g, k) => (
            <Fade key={'wk' + k} on={k === 0 ? reached('gkl1') && !cfg.drywall.hide1 : reached('gkl2') && !cfg.drywall.hide2}>
              <mesh geometry={g} material={k === 0 ? M.dw1 : M[lastSheet]} receiveShadow castShadow />
              <mesh geometry={geo.wallG.hall[k]} material={k === 0 ? M.dw1 : M[lastSheet]} receiveShadow castShadow />
            </Fade>
          ))}
        </group>
      )}
      {inRen && selBoard && <mesh geometry={selBoard} material={M.sel} />}
      {inRen && selLine && (
        <group>
          <mesh geometry={selLine.geom} material={M.sel} />
          <Inst geom={geo.hanger} mat={M.sel} matrices={selLine.mats} />
        </group>
      )}
      {inRen && sel.surface && <Line points={geo.per[sel.surface].outline.concat([geo.per[sel.surface].outline[0]])} color="#ffb547" lineWidth={3} depthTest={false} renderOrder={30} />}

      <Extras d={d} model={model} cfg={cfg} ui={ui} inRen={inRen} reachedDone={reached('done')} M={M} />
    </group>
  )
}

/* ---------- плинтус, углы, наличники, электрика, контуры сравнения ---------- */

function Extras({ d, model, cfg, ui, inRen, reachedDone, M }) {
  const { stacks, dims, thick, enabled } = model
  const Tw = thick.windowWall
  const Td = thick.doorWall
  const sec = dims.section
  const L = d.L
  const len = L - Tw - Td
  const trims = useMemo(() => {
    if (!reachedDone) return []
    const out = []
    const zc = Tw + len / 2
    // уголки (ромбы вдоль z) по внутренним углам сечения — там, где обработаны обе соседние поверхности
    const edges = ['kneeL', 'slopeL', 'ceiling', 'slopeR', 'kneeR']
    for (let i = 1; i <= 4; i++) if (enabled[edges[i - 1]] && enabled[edges[i]]) out.push({ k: 'c' + i, pos: [sec[i][0], sec[i][1], zc], rot: [0, 0, Math.PI / 4], size: [0.032, 0.032, len] })
    const hY = 0.035
    if (enabled.kneeL) out.push({ k: 'pl', pos: [sec[0][0] + 0.007, hY, zc], rot: [0, 0, 0], size: [0.014, 0.07, len] })
    if (enabled.kneeR) out.push({ k: 'pr', pos: [sec[5][0] - 0.007, hY, zc], rot: [0, 0, 0], size: [0.014, 0.07, len] })
    const wx = sec[5][0] - sec[0][0]
    if (enabled.windowWall) out.push({ k: 'pw', pos: [0, hY, Tw + 0.007], rot: [0, 0, 0], size: [wx, 0.07, 0.014] })
    const dl = d.doorX - d.doorW / 2
    const dr = d.doorX + d.doorW / 2
    const x0 = sec[0][0]
    const x1 = sec[5][0]
    if (enabled.doorWall) {
      if (dl > x0) out.push({ k: 'pd1', pos: [(x0 + dl) / 2, hY, L - Td - 0.007], rot: [0, 0, 0], size: [dl - x0, 0.07, 0.014] })
      if (dr < x1) out.push({ k: 'pd2', pos: [(dr + x1) / 2, hY, L - Td - 0.007], rot: [0, 0, 0], size: [x1 - dr, 0.07, 0.014] })
    }
    const wy0 = d.winSill
    const wy1 = d.winSill + d.winH
    const tw = 0.07
    if (enabled.windowWall) {
      out.push({ k: 'wt', pos: [0, wy1 + tw / 2, Tw + 0.006], size: [d.winW + 2 * tw, tw, 0.012], rot: [0, 0, 0] })
      out.push({ k: 'wl', pos: [-d.winW / 2 - tw / 2, (wy0 + wy1) / 2, Tw + 0.006], size: [tw, d.winH, 0.012], rot: [0, 0, 0] })
      out.push({ k: 'wr', pos: [d.winW / 2 + tw / 2, (wy0 + wy1) / 2, Tw + 0.006], size: [tw, d.winH, 0.012], rot: [0, 0, 0] })
    }
    if (enabled.doorWall) {
      out.push({ k: 'dt', pos: [d.doorX, d.doorH + tw / 2, L - Td - 0.006], size: [d.doorW + 2 * tw, tw, 0.012], rot: [0, 0, 0] })
      out.push({ k: 'dl', pos: [d.doorX - d.doorW / 2 - tw / 2, d.doorH / 2, L - Td - 0.006], size: [tw, d.doorH, 0.012], rot: [0, 0, 0] })
      out.push({ k: 'dr', pos: [d.doorX + d.doorW / 2 + tw / 2, d.doorH / 2, L - Td - 0.006], size: [tw, d.doorH, 0.012], rot: [0, 0, 0] })
    }
    return out
  }, [reachedDone, model])

  const sh = inRen && ui.contours
  const contour = (poly, z, color) => <Line points={[...poly, poly[0]].map(([x, y]) => [x, y, z])} color={color} lineWidth={2.5} depthTest={false} renderOrder={25} />
  const orig = [[-d.W / 2, 0], [-d.W / 2, d.kH], [-d.cW / 2, d.cH], [d.cW / 2, d.cH], [d.W / 2, d.kH], [d.W / 2, 0]]
  const floorRect = (x0, x1, z0, z1, y, c) => <Line points={[[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [x0, y, z0]]} color={c} lineWidth={2.5} depthTest={false} renderOrder={25} />

  // электрика
  const elec = inRen && cfg.electric.show ? model.elec : null
  const Mmap = (surfId) => frameMatrix(model.surfaces[surfId])
  const ePos = (surfId, s, t, w) => new THREE.Vector3(s, t, w).applyMatrix4(Mmap(surfId)).toArray()
  const cableDepthOf = (id) => (cfg.electric.route === 'batten' && stacks[id].battens ? (stacks[id].battens[0] + stacks[id].battens[1]) / 2 : stacks[id].reach / 2)

  return (
    <group>
      {trims.map((t) => (
        <mesh key={t.k} position={t.pos} rotation={t.rot} material={M.trim} castShadow>
          <boxGeometry args={t.size} />
        </mesh>
      ))}
      {sh && (
        <group>
          {contour(orig, L / 2, '#ff6b5a')}
          {contour(sec.map((p) => [p[0], p[1]]), L / 2, '#3fd3a2')}
          {floorRect(-d.W / 2, d.W / 2, 0, L, 0.015, '#ff6b5a')}
          {floorRect(sec[0][0], sec[5][0], Tw, L - Td, 0.02, '#3fd3a2')}
        </group>
      )}
      {elec && (
        <group>
          {elec.devices.map((dv) => (
            <mesh key={dv.id} position={ePos(dv.surf, dv.s, dv.t, stacks[dv.surf].total + 0.006)}>
              <boxGeometry args={[dv.size, dv.size, 0.012]} />
              <meshBasicMaterial color={dv.hits.length ? '#ff4d4d' : dv.type === 'light' ? '#ffd24d' : '#3fd3a2'} depthTest={false} transparent opacity={0.95} />
            </mesh>
          ))}
          {elec.cables.map((c) => (
            <Line key={c.id} points={c.pts.map(([a, b]) => ePos(c.surf, a, b, cableDepthOf(c.surf)))} color={c.hits.length ? '#ff4d4d' : '#4da3ff'} lineWidth={3} depthTest={false} renderOrder={26} />
          ))}
        </group>
      )}
    </group>
  )
}
