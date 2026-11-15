import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { CameraControls, Grid } from '@react-three/drei'
import * as THREE from 'three'
import Room from './Room'
import Walker, { walkSegments, doorList } from './Walker'
import FurnitureLayer from './FurnitureLayer'
import BuildUI from './BuildUI'
import EditorFly, { CC_BUTTONS } from './Fly'
import { DEFAULT_CFG, mergeCfg } from './renovation/data'
import { computeRenovation } from './renovation/calc'
import { renState, demoReached } from './renovation/stack'
import { stagesFor } from './renovation/data'
import Renovation3D from './renovation/Renovation3D'
import Section3D, { SECTION_ORIGIN } from './renovation/Section3D'
import RenovationUI from './renovation/RenovationUI'
import Vent3D from './vent/Vent3D'
import VentUI from './vent/VentUI'
import { resolve, furnSegments, screenList } from './furn'
import { DEFAULTS, DEFAULT_COLORS, SURFACES, derive, fmt, K, roomZones } from './params'
import { FLOORS } from './textures'

const VIEWS = {
  overview: { label: 'Обзор', pos: (d) => [d.xE + 0.3, 8.6, d.zEnd + 5.2], tgt: (d) => [0, 0.4, d.zEnd * 0.42] },
  outside: { label: 'Снаружи', pos: (d) => [-d.xE - 5.5, 6.2, -5.5], tgt: (d) => [0, 0.6, d.zEnd * 0.35] },
  photo: { label: 'Кабинет', pos: (d) => [0.05, 1.45, d.L - 0.2], tgt: (d) => [0, 1.15, 0] },
  photo2: { label: 'Спальня', pos: (d) => [0.1, 1.45, d.L + K.doorWallT + 0.1], tgt: (d) => [0.1, 1.0, d.zG] },
  back: { label: 'Кухня', pos: (d) => [-0.6, 1.5, d.zG + 0.35], tgt: (d) => [0.1, 1.05, d.zEnd] },
  back2: { label: 'К купе', pos: (d) => [0.6, 1.5, d.zEnd - 0.35], tgt: (d) => [-0.3, 1.0, d.zG] },
  hatch: { label: 'Подсобка', pos: (d) => [-0.2, 0.95, (d.hz0 + d.hz1) / 2 + 0.2], tgt: (d) => [-d.W / 2, 0.62, (d.hz0 + d.hz1) / 2] },
  vent: { label: 'Вентиляция', pos: () => [-5.6, 3.4, 9.6], tgt: () => [-2.9, 0.5, 5.2] },
  window: { label: 'От окна', pos: (d) => [0, 1.5, 0.4], tgt: (d) => [0, 1.0, d.zG] },
  facade2: { label: 'Торец', pos: (d) => [-d.xE * 0.75, 2.3, d.zEnd + 7.2], tgt: (d) => [0, 0.9, d.zEnd] },
  facade: { label: 'Фасад', pos: (d) => [d.xE * 0.75, 2.3, -7.2], tgt: (d) => [0, 0.9, 0] },
  plan: { label: 'План', pos: (d) => [0, d.zEnd * 1.55, d.zEnd / 2 + 0.01], tgt: (d) => [0, 0, d.zEnd / 2] },
  section: { label: 'Разрез', pos: (d) => [0, 1.05, d.zEnd + 7.5], tgt: (d) => [0, 1.05, d.zEnd / 2] },
}

const FIELDS = [
  ['Габариты', [
    ['L', 'Длина (окно → дверь)'],
    ['W', 'Ширина (бок → бок)'],
    ['kH', 'Боковое перекрытие'],
    ['cW', 'Перекрытие потолка'],
    ['cH', 'Высота потолка'],
  ]],
  ['Окно', [
    ['winW', 'Ширина'],
    ['winH', 'Высота'],
    ['winSill', 'От пола до низа'],
    ['winSections', 'Секций', 1],
  ]],
  ['Дверь', [
    ['doorW', 'Ширина'],
    ['doorH', 'Высота'],
    ['doorX', 'Смещение от центра'],
  ]],
  ['Дверь в подсобку', [
    ['hatchOff', 'От санузла'],
    ['hatchY', 'От пола до низа'],
    ['hatchW', 'Ширина'],
    ['hatchH', 'Высота'],
  ]],
  ['Продолжение (спальня)', [
    ['L2', 'Длина до купе'],
    ['cabW', 'Санузел: ширина'],
    ['cabP', 'Санузел: выступ'],
    ['cabD', 'Санузел: за стеклом'],
    ['L3', 'Кухня: длина'],
    ['stL', 'Лестница: длина'],
    ['stW', 'Лестница: ширина'],
  ]],
]

const ROOFS = { off: 'Нет', half: 'Половина', full: 'Целиком' }

// начальное состояние можно задать в адресе: #view=facade&roof=full&nav=walk
// все настройки запоминаются в localStorage (как и мебель)
const SAVE_KEY = 'attic-settings-v1'
const SAVED = (() => {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}
  } catch {
    return {}
  }
})()

// настройки ремонта хранятся отдельно от настроек мансарды
const REN_KEY = 'attic-renovation-v1'
const REN_UI = { apply: true, tab: 'stages', surface: 'kneeL', explode: 0.6, scale: 3, layersOff: {}, compact: false, playing: false, points: false, screws: false, contours: false, frameOnly: false, section: false }
const loadRen = () => {
  let saved = {}
  try {
    saved = JSON.parse(localStorage.getItem(REN_KEY)) || {}
  } catch { /* первый запуск */ }
  return { cfg: mergeCfg(saved.cfg), stage: saved.stage ?? 99, ui: { ...REN_UI, ...saved.ui, playing: false } }
}

const HASH = new URLSearchParams(typeof location !== 'undefined' ? location.hash.slice(1) : '')

function NumberField({ label, value, onChange, step = 0.01 }) {
  const [text, setText] = useState(String(value).replace('.', ','))
  useEffect(() => setText(String(value).replace('.', ',')), [value])
  return (
    <label className="field">
      <span>{label}</span>
      <input
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const v = parseFloat(e.target.value.replace(',', '.'))
          if (!Number.isNaN(v)) onChange(step === 1 ? Math.max(1, Math.min(6, Math.round(v))) : v)
        }}
        onBlur={() => setText(String(value).replace('.', ','))}
      />
    </label>
  )
}

export default function App() {
  const [p, setP] = useState({ ...DEFAULTS, ...SAVED.p })
  const d = useMemo(() => derive(p), [p])
  const [viewReq, setViewReq] = useState({ k: VIEWS[HASH.get('view')] ? HASH.get('view') : 'overview', n: 0 })
  const [mode, setMode] = useState(SAVED.mode || 'day')
  const [showDims, setShowDims] = useState(SAVED.showDims ?? true)
  const [gloss, setGloss] = useState(SAVED.gloss ?? true)
  const [colors, setColors] = useState({ ...DEFAULT_COLORS, ...SAVED.colors })
  const [floorKey, setFloorKey] = useState(FLOORS[SAVED.floorKey] ? SAVED.floorKey : 'grey')
  const [hl, setHl] = useState(null)
  const [open, setOpen] = useState(SAVED.open ?? true)
  const [nav, setNav] = useState(['walk', 'build', 'renovation', 'vent'].includes(HASH.get('nav')) ? HASH.get('nav') : 'edit') // edit | build | walk | renovation
  const [near, setNear] = useState(null)
  const [items, setItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('attic-furniture-v1') || '[]')
    } catch {
      return []
    }
  })
  const [ren, setRen] = useState(() => {
    const r = loadRen()
    return HASH.get('stage') ? { ...r, stage: +HASH.get('stage') } : r
  })
  const [rsel, setRsel] = useState({ surface: null, board: null })
  useEffect(() => {
    try {
      localStorage.setItem(REN_KEY, JSON.stringify({ cfg: ren.cfg, stage: ren.stage, ui: { ...ren.ui, playing: false } }))
    } catch { /* без хранилища тоже работает */ }
  }, [ren])
  // ремонт виден во всех режимах (если не выключено), а коллизии берут толщины слоёв текущего этапа
  const showRen = nav === 'renovation' || nav === 'vent' || ren.ui.apply !== false
  const rmodel = useMemo(() => (showRen ? computeRenovation(d, ren.cfg) : null), [d, ren.cfg, showRen])
  const rinfo = useMemo(() => (showRen ? renState(d, ren.cfg, ren.stage, ren.ui.frameOnly) : null), [d, ren.cfg, ren.stage, ren.ui.frameOnly, showRen])
  const ventUnit = rmodel?.vent && ren.cfg.vent.enabled ? rmodel.vent.unitRect : null
  const dr = useMemo(() => (rinfo || ventUnit ? { ...d, ...(rinfo ? { ren: rinfo } : {}), ...(ventUnit ? { ventUnit } : {}) } : d), [d, rinfo, ventUnit])
  const [tool, setTool] = useState(null)
  const [selected, setSelected] = useState(null)
  const [status, setStatus] = useState('')
  const furnApi = useRef(null)
  useEffect(() => {
    try {
      localStorage.setItem('attic-furniture-v1', JSON.stringify(items))
    } catch { /* без хранилища тоже работает */ }
  }, [items])
  const updateItem = (id, patch) => setItems((l) => l.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  const [locked, setLocked] = useState(false)
  const [scene, setScene] = useState({
    doorWall: true, doorOpen: true, slideOpen: true, cabOpen: true, hatchOpen: false, roof: 'half', utility: true, facade: true,
    ...SAVED.scene,
    ...(ROOFS[HASH.get('roof')] ? { roof: HASH.get('roof') } : {}),
  })
  useEffect(() => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ p, mode, showDims, gloss, colors, floorKey, open, scene }))
    } catch { /* без хранилища тоже работает */ }
  }, [p, mode, showDims, gloss, colors, floorKey, open, scene])
  const sc = (k, v) => setScene((x) => ({ ...x, [k]: v }))
  const cc = useRef()
  const three = useRef(null)
  const fromPose = useRef(null)
  const segs = useMemo(() => walkSegments(dr, scene), [dr, scene])
  const zones = useMemo(() => roomZones(d, scene.doorWall), [d, scene.doorWall])
  const placed = useMemo(() => resolve(items), [items])
  const furnSegs = useMemo(() => furnSegments(placed), [placed])
  const doors = useMemo(() => [...doorList(d, scene), ...screenList(placed)], [d, scene, placed])
  const toggleDoor = useCallback((id) => {
    if (String(id).startsWith('screen:')) {
      const sid = id.slice(7)
      setItems((l) => l.map((i) => (i.id === sid ? { ...i, open: !i.open } : i)))
      return
    }
    const key = { entry: 'doorOpen', slide: 'slideOpen', cabin: 'cabOpen', hatch: 'hatchOpen' }[id]
    if (key) setScene((x) => ({ ...x, [key]: !x[key] }))
  }, [])

  const navRef = useRef(nav)
  navRef.current = nav
  const goBuild = useCallback(() => {
    if (navRef.current === 'walk') return
    setNav((m) => (m === 'build' ? 'edit' : 'build'))
    setTool(null)
    setSelected(null)
    setStatus('')
  }, [])
  const toggleNav = useCallback(() => {
    if (navRef.current === 'walk') {
      // запоминаем, откуда смотрели, чтобы редактор плавно «вылетел» из этой точки к обзору
      const cam = three.current?.camera
      if (cam) {
        const dir = new THREE.Vector3()
        cam.getWorldDirection(dir)
        fromPose.current = [...cam.position.toArray(), ...cam.position.clone().addScaledVector(dir, 1.5).toArray()]
      }
      setViewReq((r) => ({ k: 'overview', n: r.n + 1 }))
      setNav('edit')
    } else {
      setHl(null)
      setTool(null)
      setSelected(null)
      setNav('walk')
    }
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return
      if (e.code === 'KeyM' && !e.repeat) toggleNav()
      if (e.code === 'KeyB' && !e.repeat) goBuild()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleNav, goBuild])

  useEffect(() => {
    let raf
    const go = () => {
      if (!cc.current) {
        raf = requestAnimationFrame(go)
        return
      }
      const v = VIEWS[viewReq.k]
      if (fromPose.current) {
        cc.current.setLookAt(...fromPose.current, false)
        fromPose.current = null
      }
      cc.current.setLookAt(...v.pos(d), ...v.tgt(d), viewReq.n > 0)
    }
    go()
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewReq])

  const prevSection = useRef(null)
  // режим «Разрез» — камера к образцу конструкции, выход — обратно к обзору
  useEffect(() => {
    if (nav !== 'renovation') return undefined
    const was = prevSection.current
    prevSection.current = ren.ui.section
    if (was === ren.ui.section || (was === null && !ren.ui.section)) return undefined
    if (!ren.ui.section) {
      setViewReq((r) => ({ k: 'overview', n: r.n + 1 }))
      return undefined
    }
    let raf
    const go = () => {
      if (!cc.current) {
        raf = requestAnimationFrame(go)
        return
      }
      cc.current.setLookAt(SECTION_ORIGIN[0] + 1.9, SECTION_ORIGIN[1] + 0.9, SECTION_ORIGIN[2] + 2.6, SECTION_ORIGIN[0] + 0.55, SECTION_ORIGIN[1] + 0.3, SECTION_ORIGIN[2] + 0.4, true)
    }
    go()
    return () => cancelAnimationFrame(raf)
  }, [ren.ui.section, nav])

  const total = Object.entries(d.areas)
    .filter(([k]) => k !== 'floor')
    .reduce((s, [, v]) => s + v, 0)

  return (
    <div className="app">
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ stencil: true, antialias: true }}
        camera={{ fov: 55, near: 0.02, far: 120, position: [8, 7, 15] }}
        onCreated={(st) => (three.current = st)}
      >
        <color attach="background" args={['#15181d']} />
        <Room
          d={d}
          colors={colors}
          floorKey={floorKey}
          mode={mode}
          gloss={gloss}
          showDims={showDims && nav !== 'walk' && nav !== 'renovation' && nav !== 'vent'}
          hl={hl}
          setHl={setHl}
          view={{ ...scene, interactive: nav === 'edit', ceilCut: showRen && demoReached(ren.cfg, ren.stage) && ren.cfg.ceiling.removeStretch && ren.cfg.ceiling.gap > 0, radHide: showRen && demoReached(ren.cfg, ren.stage) && ren.cfg.radiatorOut }}
        />
        {rmodel && (
          <Renovation3D
            d={d}
            model={rmodel}
            cfg={ren.cfg}
            ui={ren.ui}
            stage={ren.stage}
            inRen={nav === 'renovation'}
            sel={rsel}
            onSurface={(id) => { setRsel((x) => ({ ...x, surface: id })); setRen((r) => ({ ...r, ui: { ...r.ui, surface: id } })) }}
            onBoard={(n) => setRsel((x) => ({ ...x, board: n }))}
            onHanger={(surf, line) => setRsel((x) => ({ ...x, hanger: { surf, line } }))}
          />
        )}
        {rmodel?.vent && ren.cfg.vent.show && <Vent3D vent={rmodel.vent} cfg={ren.cfg} labels={nav === 'renovation' || nav === 'vent'} />}
        {nav === 'renovation' && rmodel && ren.ui.section && <Section3D model={rmodel} cfg={ren.cfg} ui={ren.ui} surfId={ren.ui.surface} />}
        <FurnitureLayer
          d={dr}
          sc={scene}
          nav={nav}
          items={items}
          setItems={setItems}
          tool={tool}
          setTool={setTool}
          selected={selected}
          setSelected={setSelected}
          setStatus={setStatus}
          api={furnApi}
        />
        {/* сетка — на уровне площадки лестницы, чтобы не перечёркивать лестничный проём */}
        <Grid position={[0, -K.stairDrop - 0.01, d.zEnd / 2]} args={[30, 30]} cellSize={0.5} sectionSize={1} cellColor="#2a3038" sectionColor="#3a424d" fadeDistance={30} fadeStrength={1.5} infiniteGrid />
        {nav !== 'walk' ? (
          <>
            <CameraControls ref={cc} makeDefault minDistance={0.2} maxDistance={40} dollyToCursor mouseButtons={CC_BUTTONS} />
            <EditorFly cc={cc} />
          </>
        ) : (
          <Walker d={dr} segs={segs} furn={furnSegs} doors={doors} hatchOpen={scene.hatchOpen} utility={scene.utility} onLock={setLocked} onNear={setNear} onInteract={toggleDoor} />
        )}
      </Canvas>

      <div className="modes">
        <button className={nav === 'edit' ? 'on' : ''} onClick={() => { if (nav === 'walk') toggleNav(); else if (nav === 'build') goBuild(); else if (nav === 'renovation' || nav === 'vent') setNav('edit') }}>Редактор</button>
        <button className={nav === 'build' ? 'on' : ''} onClick={() => { if (nav === 'edit') goBuild(); else if (nav === 'walk') { toggleNav(); setTimeout(goBuild, 0) } }}>Мебель</button>
        <button className={nav === 'renovation' ? 'on' : ''} onClick={() => { if (nav === 'walk') { toggleNav(); setTimeout(() => setNav('renovation'), 0) } else setNav(nav === 'renovation' ? 'edit' : 'renovation'); setTool(null); setSelected(null) }}>Ремонт</button>
        <button className={nav === 'vent' ? 'on' : ''} onClick={() => { if (nav === 'walk') { toggleNav(); setTimeout(() => setNav('vent'), 0) } else setNav(nav === 'vent' ? 'edit' : 'vent'); setTool(null); setSelected(null); if (nav !== 'vent') setViewReq((r) => ({ k: 'vent', n: r.n + 1 })) }}>Вентиляция</button>
        <button className={nav === 'walk' ? 'on' : ''} onClick={() => nav !== 'walk' && toggleNav()}>Прогулка</button>
      </div>

      {nav === 'vent' && rmodel && <VentUI ren={ren} setRen={setRen} model={rmodel} />}
      {nav === 'renovation' && rmodel && (
        <RenovationUI
          ren={ren}
          setRen={setRen}
          model={rmodel}
          d={d}
          sel={rsel}
          setSel={setRsel}
          onReset={() => { setRen({ cfg: mergeCfg(), stage: 99, ui: { ...REN_UI } }); setRsel({ surface: null, board: null }) }}
        />
      )}
      <aside className={'panel' + (open ? '' : ' closed') + (nav === 'walk' && locked ? ' hidden' : '') + ((nav === 'renovation' || nav === 'vent') ? ' hidden' : '')}>
        <header>
          <div>
            <h1>Мансарда · {fmt(d.total.area)} м²</h1>
            <p className="sub">
              {fmt(d.total.length)} × {fmt(d.W)} м · h {fmt(d.cH)} м · {d.total.rooms.length} помещения
            </p>
          </div>
          <button className="ghost" onClick={() => setOpen(!open)} aria-label="Свернуть панель">
            {open ? '–' : '+'}
          </button>
        </header>

        {open && (
          <div className="body">
            <section>
              <h2>Помещения</h2>
              <table>
                <tbody>
                  {d.total.rooms.map((r) => (
                    <tr key={r.name}>
                      <td>
                        <div className="nm">{r.name}</div>
                        <div className="sz">{r.size} м</div>
                      </td>
                      <td className="ar">{fmt(r.area)} м²</td>
                    </tr>
                  ))}
                  <tr className="sum">
                    <td><div className="nm">Всего</div><div className="sz">{fmt(d.total.length)} × {fmt(d.W)} × {fmt(d.cH)} м</div></td>
                    <td className="ar">{fmt(d.total.area)} м²</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section>
              <h2>Вид</h2>
              <div className="views">
                {Object.entries(VIEWS).map(([k, v]) => (
                  <button key={k} className={viewReq.k === k ? 'on' : ''} onClick={() => setViewReq((r) => ({ k, n: r.n + 1 }))}>
                    {v.label}
                  </button>
                ))}
              </div>
              <div className="row">
                <div className="seg">
                  <button className={mode === 'day' ? 'on' : ''} onClick={() => setMode('day')}>День</button>
                  <button className={mode === 'evening' ? 'on' : ''} onClick={() => setMode('evening')}>Вечер</button>
                </div>
                <label className="chk">
                  <input type="checkbox" checked={showDims} onChange={(e) => setShowDims(e.target.checked)} /> Размеры
                </label>
                <label className="chk">
                  <input type="checkbox" checked={gloss} onChange={(e) => setGloss(e.target.checked)} /> Глянец
                </label>
              </div>
            </section>

            <section>
              <h2>Стены, кровля, подсобки</h2>
              <div className="row tight">
                <label className="chk">
                  <input type="checkbox" checked={scene.doorWall} onChange={(e) => sc('doorWall', e.target.checked)} /> Стена с дверью
                </label>
                <label className="chk">
                  <input type="checkbox" checked={scene.doorOpen} disabled={!scene.doorWall} onChange={(e) => sc('doorOpen', e.target.checked)} /> Дверь открыта
                </label>
                <label className="chk">
                  <input type="checkbox" checked={scene.slideOpen} onChange={(e) => sc('slideOpen', e.target.checked)} /> Купе открыто
                </label>
                <label className="chk">
                  <input type="checkbox" checked={scene.hatchOpen} disabled={!scene.utility} onChange={(e) => sc('hatchOpen', e.target.checked)} /> Дверь в подсобку открыта
                </label>
                <label className="chk">
                  <input type="checkbox" checked={scene.cabOpen} onChange={(e) => sc('cabOpen', e.target.checked)} /> Дверь санузла открыта
                </label>
              </div>
              <div className="row">
                <span className="lbl">Кровля</span>
                <div className="seg">
                  {Object.entries(ROOFS).map(([k, v]) => (
                    <button key={k} className={scene.roof === k ? 'on' : ''} onClick={() => sc('roof', k)}>{v}</button>
                  ))}
                </div>
              </div>
              <div className="row">
                <label className="chk">
                  <input type="checkbox" checked={scene.utility} onChange={(e) => sc('utility', e.target.checked)} /> Подсобки
                </label>
                <label className="chk">
                  <input type="checkbox" checked={scene.facade} onChange={(e) => sc('facade', e.target.checked)} /> Фасад
                </label>
              </div>
              <div className="totals">
                <span>Спальня: пол <b>{fmt(d.ext.floor)} м²</b> · объём <b>{fmt(d.ext.volume)} м³</b></span>
                <span className="inline-color">
                  <input type="color" value={colors.backRoom} onChange={(e) => setColors({ ...colors, backRoom: e.target.value })} title="Цвет стен кухни" />
                  Стены кухни
                </span>
                <span>Кухня: пол <b>{fmt(d.ext.back)} м²</b> · объём <b>{fmt(d.ext.backVolume)} м³</b></span>
                <span>Подсобки: 2 × <b>{fmt(d.utilDepth)} × {fmt(d.kH)} м</b> · <b>{fmt(d.ext.utilVol)} м³</b></span>
                <span>Кровля (до разреза): <b>≈ {fmt(d.ext.roof, 0)} м²</b></span>
              </div>
            </section>

            <section>
              <h2>Плоскости и площади по зонам</h2>
              <table>
                <tbody>
                  {zones.flatMap((zn) => {
                    const types = ['knee', 'slope', 'ceiling', 'floor', ...(zn.areas.windowWall ? ['windowWall'] : []), ...(zn.areas.doorWall ? ['doorWall'] : [])]
                    return [
                      <tr key={'h' + zn.key} className="zone-h">
                        <td colSpan="3">{zn.name} <small>z {fmt(zn.z0)}–{fmt(zn.z1)} м</small></td>
                      </tr>,
                      ...types.map((k) => {
                        const key = ['windowWall', 'doorWall'].includes(k) ? k : `${k}:${zn.key}`
                        const colorKey = zn.key === 'kitchen' && (k === 'knee' || k === 'slope') ? 'backRoom' : k
                        return (
                          <tr key={zn.key + k} className={hl === key ? 'hl' : ''} onMouseEnter={() => setHl(key)} onMouseLeave={() => setHl(null)}>
                            <td className="sw">
                              {k === 'floor' ? (
                                <span className="floor-dot" />
                              ) : (
                                <input type="color" value={colors[colorKey]} onChange={(e) => setColors({ ...colors, [colorKey]: e.target.value })} title="Цвет" />
                              )}
                            </td>
                            <td>
                              <div className="nm">{SURFACES[k]}</div>
                              <div className="sz">{zn.sizes[k] || d.sizes[k]}</div>
                            </td>
                            <td className="ar">{fmt(zn.areas[k])} м²</td>
                          </tr>
                        )
                      }),
                    ]
                  })}
                </tbody>
              </table>
              <label className="field wide">
                <span>Покрытие пола</span>
                <select value={floorKey} onChange={(e) => setFloorKey(e.target.value)}>
                  {Object.entries(FLOORS).map(([k, f]) => (
                    <option key={k} value={k}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="totals">
                <span>Стены + перекрытия: <b>{fmt(total)} м²</b></span>
                <span>Объём: <b>{fmt(d.volume)} м³</b></span>
                <span>Скат: <b>{fmt(d.slant)} м · {d.angle.toFixed(1).replace('.', ',')}°</b></span>
              </div>
            </section>

            {FIELDS.map(([title, list]) => (
              <details key={title} open={title === 'Габариты'}>
                <summary>{title}, м</summary>
                <div className="grid">
                  {list.map(([key, label, step]) => (
                    <NumberField key={key} label={label} value={p[key]} step={step} onChange={(v) => setP({ ...p, [key]: v })} />
                  ))}
                </div>
                {title === 'Дверь' && (
                  <label className="slider">
                    <span>Смещение от центра: <b>{fmt(p.doorX)} м</b></span>
                    <input
                      type="range"
                      min={-(p.W / 2 - p.doorW / 2)}
                      max={p.W / 2 - p.doorW / 2}
                      step="0.01"
                      value={p.doorX}
                      onChange={(e) => setP({ ...p, doorX: parseFloat(e.target.value) })}
                    />
                  </label>
                )}
              </details>
            ))}

            {d.warnings.length > 0 && (
              <div className="warn">
                {d.warnings.map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </div>
            )}
            <button className="ghost reset" onClick={() => { setP(DEFAULTS); setColors(DEFAULT_COLORS); setFloorKey('grey') }}>
              Сбросить к исходным размерам
            </button>
          </div>
        )}
      </aside>

      {hl && nav === 'edit' && (
        <div className="tip">
          {(() => {
            const [t, zk] = hl.includes(':') ? hl.split(':') : [hl, null]
            const zn = zk ? zones.find((q) => q.key === zk) : null
            return (
              <>
                {SURFACES[t]}{zn ? ` · ${zn.name}` : ''} · <b>{fmt(zn ? zn.areas[t] : d.areas[t])} м²</b>
              </>
            )
          })()}
        </div>
      )}

      {nav === 'build' && (
        <BuildUI
          tool={tool}
          setTool={setTool}
          setSelected={setSelected}
          item={placed.find((p) => p.id === selected)}
          update={updateItem}
          api={furnApi}
          status={status}
          count={items.length}
          onClear={() => { setItems([]); setSelected(null) }}
        />
      )}

      {rinfo && nav !== 'renovation' && (
        <div className="ren-chip">
          Ремонт: {stagesFor(ren.cfg)[Math.min(ren.stage, stagesFor(ren.cfg).length - 1)].name} · кабинет {(rinfo.xr - rinfo.xl).toFixed(2).replace('.', ',')} × {(rinfo.zHi - rinfo.zLo).toFixed(2).replace('.', ',')} м, потолок {rinfo.ceilH.toFixed(2).replace('.', ',')} м
        </div>
      )}
      {nav === 'walk' && locked && near && (
        <div className="prompt">
          <kbd>E</kbd>{' '}
          {near.kind === 'screen' ? (near.open ? 'Свернуть' : 'Развернуть') : near.open ? 'Закрыть' : 'Открыть'} {near.name}
        </div>
      )}

      {nav === 'walk' && !locked && (
        <div className="walk-start" onClick={() => three.current?.gl.domElement.requestPointerLock?.()?.catch?.(() => {})}>
          <div className="card">
            <b>Нажмите, чтобы осмотреться</b>
            <div className="keys">
              <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> ходьба</span>
              <span>мышь — осмотр</span>
              <span><kbd>Shift</kbd> быстрее</span>
              <span><kbd>C</kbd> пригнуться</span>
              <span><kbd>Esc</kbd> отпустить мышь</span>
              <span><kbd>E</kbd> / щелчок — дверь</span>
              <span><kbd>M</kbd> редактор</span>
            </div>
          </div>
        </div>
      )}
      {nav === 'walk' && locked && <div className="cross" />}

      <div className="hint">
        {nav === 'edit'
          ? 'ЛКМ — вращать · ПКМ — сдвигать · колесо — приблизить · WASD / Пробел / Shift — полёт · колёсико зажато — осмотр · B — мебель · M — прогулка'
          : nav === 'build'
            ? 'ЛКМ по предмету — переместить · стрелки — сдвиг (Alt — 1 см) · WASD / Пробел / Shift — полёт · колёсико зажато — осмотр · B — выйти'
            : 'WASD — ходьба · мышь — осмотр · E — двери · Shift — быстрее · C — пригнуться · Esc — мышь · M — редактор'}
      </div>
    </div>
  )
}
