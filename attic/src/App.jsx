import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { CameraControls, Grid } from '@react-three/drei'
import Room from './Room'
import { DEFAULTS, DEFAULT_COLORS, SURFACES, derive, fmt } from './params'
import { FLOORS } from './textures'

const VIEWS = {
  overview: { label: 'Обзор', pos: (d) => [d.W * 1.2, d.cH * 2.15, d.L + 3.3], tgt: (d) => [0, 0.85, d.L * 0.45] },
  photo: { label: 'Как на фото', pos: (d) => [0.05, 1.45, d.L - 0.2], tgt: (d) => [0, 1.15, 0] },
  window: { label: 'От окна', pos: (d) => [0, 1.5, 0.4], tgt: (d) => [0, 1.0, d.L] },
  plan: { label: 'План', pos: (d) => [0, d.L * 2.0, d.L / 2 + 0.01], tgt: (d) => [0, 0, d.L / 2] },
  section: { label: 'Разрез', pos: (d) => [0, 1.05, d.L + 6.5], tgt: (d) => [0, 1.05, d.L / 2] },
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
]

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
  const [p, setP] = useState(DEFAULTS)
  const d = useMemo(() => derive(p), [p])
  const [viewReq, setViewReq] = useState({ k: 'overview', n: 0 })
  const [mode, setMode] = useState('day')
  const [showDims, setShowDims] = useState(true)
  const [gloss, setGloss] = useState(true)
  const [colors, setColors] = useState(DEFAULT_COLORS)
  const [floorKey, setFloorKey] = useState('grey')
  const [hl, setHl] = useState(null)
  const [open, setOpen] = useState(true)
  const cc = useRef()

  useEffect(() => {
    let raf
    const go = () => {
      if (!cc.current) {
        raf = requestAnimationFrame(go)
        return
      }
      const v = VIEWS[viewReq.k]
      cc.current.setLookAt(...v.pos(d), ...v.tgt(d), viewReq.n > 0)
    }
    go()
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewReq])

  const total = Object.entries(d.areas)
    .filter(([k]) => k !== 'floor')
    .reduce((s, [, v]) => s + v, 0)

  return (
    <div className="app">
      <Canvas shadows dpr={[1, 2]} gl={{ stencil: true, antialias: true }} camera={{ fov: 55, near: 0.02, far: 100, position: [5.2, 4.5, 8.3] }}>
        <color attach="background" args={['#15181d']} />
        <Room d={d} colors={colors} floorKey={floorKey} mode={mode} gloss={gloss} showDims={showDims} hl={hl} setHl={setHl} />
        <Grid position={[0, -0.004, d.L / 2]} args={[30, 30]} cellSize={0.5} sectionSize={1} cellColor="#2a3038" sectionColor="#3a424d" fadeDistance={22} fadeStrength={1.5} infiniteGrid />
        <CameraControls ref={cc} makeDefault minDistance={0.2} maxDistance={25} dollyToCursor />
      </Canvas>

      <aside className={'panel' + (open ? '' : ' closed')}>
        <header>
          <div>
            <h1>Мансарда</h1>
            <p className="sub">
              {fmt(d.L)} × {fmt(d.W)} м · h {fmt(d.cH)} м
            </p>
          </div>
          <button className="ghost" onClick={() => setOpen(!open)} aria-label="Свернуть панель">
            {open ? '–' : '+'}
          </button>
        </header>

        {open && (
          <div className="body">
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
              <h2>Плоскости и площади</h2>
              <table>
                <tbody>
                  {Object.keys(SURFACES).map((k) => (
                    <tr key={k} className={hl === k ? 'hl' : ''} onMouseEnter={() => setHl(k)} onMouseLeave={() => setHl(null)}>
                      <td className="sw">
                        {k === 'floor' ? (
                          <span className="floor-dot" />
                        ) : (
                          <input type="color" value={colors[k]} onChange={(e) => setColors({ ...colors, [k]: e.target.value })} title="Цвет" />
                        )}
                      </td>
                      <td>
                        <div className="nm">{SURFACES[k]}</div>
                        <div className="sz">{d.sizes[k]}</div>
                      </td>
                      <td className="ar">{fmt(d.areas[k])} м²</td>
                    </tr>
                  ))}
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

      {hl && (
        <div className="tip">
          {SURFACES[hl]} · <b>{fmt(d.areas[hl])} м²</b>
        </div>
      )}
      <div className="hint">ЛКМ — вращать · ПКМ — сдвигать · колесо — приблизить</div>
    </div>
  )
}
