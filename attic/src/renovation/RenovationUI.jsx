import { createContext, Fragment, useContext, useEffect, useMemo, useState } from 'react'
import { SURF, SURF_BY_ID, GROUP_NAMES, GROUP_LABEL, HANGER_TYPES, PROFILE_TYPES, WOOL_THICKNESSES, SPECIES, COATINGS, LABOR, MATERIALS, stagesFor } from './data'
import { fmtN } from './calc'
import { layerList } from './Section3D'
import { thicknessAtStage } from './stack'

const setIn = (obj, path, value) => {
  const [k, ...rest] = path.split('.')
  return { ...obj, [k]: rest.length ? setIn(obj[k] ?? {}, rest.join('.'), value) : value }
}
const getIn = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj)

const Ctx = createContext(null)

// Поля — на уровне модуля: иначе при каждом вводе они пересоздавались бы и терялся фокус
function Num({ label, path, step = 1, min = 0, unit, disabled }) {
  const { cfg, set } = useContext(Ctx)
  return (
    <label className="field">
      <span>{label}{unit ? `, ${unit}` : ''}</span>
      <input type="number" disabled={disabled} step={step} min={min} value={getIn(cfg, path)} onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) set(path, v) }} />
    </label>
  )
}
function Sel({ label, path, options, onPick }) {
  const { cfg, set } = useContext(Ctx)
  return (
    <label className="field wide">
      <span>{label}</span>
      <select value={getIn(cfg, path)} onChange={(e) => (onPick ? onPick(e.target.value) : set(path, e.target.value))}>
        {options.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
      </select>
    </label>
  )
}
function Seg({ value, options, onChange }) {
  return (
    <div className="seg full">
      {options.map(([k, n]) => <button key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{n}</button>)}
    </div>
  )
}
function Chk({ label, checked, onChange, disabled }) {
  return <label className="chk"><input type="checkbox" disabled={disabled} checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}</label>
}

const TABS = [
  ['stages', 'Этапы'],
  ['frame', 'Конструкция'],
  ['surf', 'Поверхности'],
  ['boards', 'Вагонка'],
  ['est', 'Смета'],
]

export default function RenovationUI({ ren, setRen, model, d, sel, setSel, onReset }) {
  const { cfg, ui } = ren
  const stages = useMemo(() => stagesFor(cfg), [cfg.finish, cfg.drywall.layers])
  const stage = Math.min(ren.stage, stages.length - 1)
  const set = (path, v) => setRen((r) => ({ ...r, cfg: setIn(r.cfg, path, v) }))
  const setUi = (patch) => setRen((r) => ({ ...r, ui: { ...r.ui, ...patch } }))
  const goStage = (n) => setRen((r) => ({ ...r, stage: Math.max(0, Math.min(stages.length - 1, n)), ui: { ...r.ui, playing: false } }))

  // воспроизведение шкалы этапов
  useEffect(() => {
    if (!ui.playing) return
    const t = setInterval(() => {
      setRen((r) => {
        const n = stagesFor(r.cfg).length
        if (r.stage >= n - 1) return { ...r, ui: { ...r.ui, playing: false } }
        return { ...r, stage: r.stage + 1 }
      })
    }, 1700)
    return () => clearInterval(t)
  }, [ui.playing])

  const money = (v) => Math.round(v).toLocaleString('ru-RU') + ' ' + cfg.currency
  const T = Math.max(0, ...Object.values(model.thick))
  const stageT = Math.max(...Object.values(thicknessAtStage(cfg, stage, ui.frameOnly).T))
  const warnN = model.warnings.length

  /* ---------- вкладка «Этапы» ---------- */
  const TabStages = () => (
    <>
      <section>
        <h2>Чистовая отделка</h2>
        <Seg value={cfg.finish} options={[['boards', 'Вагонка-штиль'], ['paint', 'ГКЛ под покраску']]} onChange={(v) => set('finish', v)} />
        {cfg.finish === 'boards' && (
          <>
            <small className="note">Крепление вагонки на стенах и скатах</small>
            <Seg value={cfg.mount} options={[['battens', 'На обрешётку'], ['direct', 'Прямо на ГКЛ (по профилям)']]} onChange={(v) => set('mount', v)} />
          </>
        )}
        <div className="row"><span className="lbl">Слоёв ГКЛ</span><Seg value={String(cfg.drywall.layers)} options={[['1', '1'], ['2', '2']]} onChange={(v) => set('drywall.layers', +v)} /></div>
      </section>
      <section>
        <h2>Этапы ремонта</h2>
        <ol className="stages">
          {stages.map((s, i) => (
            <li key={s.key} className={(i === stage ? 'cur ' : '') + (i < stage ? 'done' : '')} onClick={() => goStage(i)}>
              <span className="n">{i}</span>
              <div><b>{s.name}</b><small>{s.hint}</small></div>
            </li>
          ))}
        </ol>
      </section>
      <section>
        <h2>Показать</h2>
        <div className="col">
          <Chk label="Только каркас (без остальных слоёв)" checked={!!ui.frameOnly} onChange={(v) => setUi({ frameOnly: v })} />
          <Chk label="Точки крепления подвесов" checked={!!ui.points} onChange={(v) => setUi({ points: v })} />
          <Chk label="Саморезы ГКЛ" checked={!!ui.screws} onChange={(v) => setUi({ screws: v })} />
          <Chk label="Контуры «было / стало»" checked={!!ui.contours} onChange={(v) => setUi({ contours: v })} />
          <Chk label="Электрика (демо)" checked={cfg.electric.show} onChange={(v) => set('electric.show', v)} />
        </div>
      </section>
      <section>
        <h2>Потолок и режимы</h2>
        <small className="note">Под натяжным потолком {cfg.ceiling.gap} мм пространства, выше — фанера. После снятия натяжного потолка основание потолка — фанера.</small>
        <Seg value={cfg.ceiling.mode} options={[['frame', 'Профиль + ГКЛ'], ['plywood', 'На фанеру: рейки + вагонка']]} onChange={(v) => set('ceiling.mode', v)} />
        {cfg.ceiling.mode === 'plywood' && cfg.finish !== 'boards' && <small className="note neg">Режим «на фанеру» работает только при отделке вагонкой — сейчас потолок собирается на профиле.</small>}
        <div className="grid">
          <Num label="Пространство под натяжным потолком" path="ceiling.gap" unit="мм" />
        </div>
        <div className="col">
          <Chk label="Демонтировать натяжной потолок (основание — фанера выше)" checked={cfg.ceiling.removeStretch} onChange={(v) => set('ceiling.removeStretch', v)} />
          <Chk label="Батарея выносится наружу после ремонта (без ниши в отделке)" checked={cfg.radiatorOut} onChange={(v) => set('radiatorOut', v)} />
          <Chk label="Не обрабатывать потолок (сохранить высоту)" checked={cfg.surfaces.ceiling.enabled === false} onChange={(v) => set('surfaces.ceiling.enabled', !v)} />
          <Chk label="Показывать ремонт и учитывать его в режимах «Редактор», «Мебель», «Прогулка»" checked={ui.apply !== false} onChange={(v) => setUi({ apply: v })} />
        </div>
      </section>
    </>
  )

  /* ---------- вкладка «Конструкция» ---------- */
  const layers = layerList(model, cfg, ui.surface)
  const dm = model.dims
  const TabFrame = () => (
    <>
      <section>
        <h2>Подвесы и каркас</h2>
        <Seg value={cfg.frame.scheme} options={[['one', 'Одноуровневый'], ['two', 'Двухуровневый']]} onChange={(v) => set('frame.scheme', v)} />
        <div className="grid">
          <Sel label="Тип подвеса" path="frame.hangerType" options={Object.entries(HANGER_TYPES).map(([k, v]) => [k, v.name])} onPick={(k) => setRen((r) => ({ ...r, cfg: setIn(setIn(r.cfg, 'frame.hangerType', k), 'frame.reach', HANGER_TYPES[k].reach) }))} />
          <Sel label="Тип профиля" path="frame.profileType" options={Object.entries(PROFILE_TYPES).map(([k, v]) => [k, v.name])} />
          <Num label="Вынос подвеса (стена → профиль)" path="frame.reach" unit="мм" />
          <Num label="Воздушный зазор до ваты" path="frame.airGap" unit="мм" />
          <Num label="Шаг профиля" path="frame.pitch" unit="см" />
          <Num label="Отступ от края" path="frame.edge" unit="см" />
          <Num label="Длина профиля" path="frame.stock" unit="м" step={0.5} />
          <Num label="Запас на профиль" path="frame.waste" unit="%" />
        </div>
        <Seg value={cfg.frame.dir} options={[['along', 'Основной профиль вдоль'], ['across', 'Основной профиль поперёк']]} onChange={(v) => set('frame.dir', v)} />
        <small className="note">Полость каркаса: {fmtN(model.stacks.kneeL.frameDepth * 1000, 0)} мм. {cfg.frame.scheme === 'one' ? 'В одноуровневой схеме ряды подвесов совпадают с профилем.' : ''}</small>
      </section>
      {['walls', 'slopes', 'ceiling'].map((g) => (
        <section key={g}>
          <h2>Подвесы: {GROUP_NAMES[g].toLowerCase()}</h2>
          <div className="grid">
            <Num label="Шаг вдоль профиля" path={`hangers.${g}.step`} unit="см" />
            <Num label="Расстояние между рядами" path={`hangers.${g}.row`} unit="см" disabled={cfg.frame.scheme === 'one'} />
            <Num label="Отступ от края" path={`hangers.${g}.margin`} unit="см" />
          </div>
        </section>
      ))}
      <section>
        <h2>Гипсокартон</h2>
        <div className="grid">
          <Num label="Толщина листа" path="drywall.thickness" unit="мм" step={0.5} />
          <Num label="Смещение швов 2-го слоя" path="drywall.shift" unit="м" step={0.05} />
          <Num label="Лист: длина" path="drywall.sheetL" unit="м" step={0.1} />
          <Num label="Лист: ширина" path="drywall.sheetW" unit="м" step={0.1} />
          <Num label="Запас" path="drywall.waste" unit="%" />
        </div>
        <Seg value={cfg.drywall.orient} options={[['along', 'Листы длинной стороной вдоль'], ['across', 'Листы поперёк']]} onChange={(v) => set('drywall.orient', v)} />
        <div className="row tight">
          <Chk label="Скрыть слой 1" checked={cfg.drywall.hide1} onChange={(v) => set('drywall.hide1', v)} />
          <Chk label="Скрыть слой 2" checked={cfg.drywall.hide2} disabled={cfg.drywall.layers < 2} onChange={(v) => set('drywall.hide2', v)} />
        </div>
      </section>
      <section>
        <h2>Деревянная обрешётка</h2>
        <div className="grid">
          <Num label="Ширина рейки" path="battens.w" unit="мм" />
          <Num label="Толщина рейки" path="battens.t" unit="мм" />
          <Num label="Шаг обрешётки" path="battens.pitch" unit="см" />
          <Num label="Длина рейки" path="battens.stock" unit="м" step={0.5} />
          <Num label="Запас" path="battens.waste" unit="%" />
        </div>
      </section>
      <section>
        <h2>Минеральная вата (общие)</h2>
        <div className="grid">
          <Num label="Плотность" path="wool.density" unit="кг/м³" />
          <Num label="Объём упаковки" path="wool.packVol" unit="м³" step={0.01} />
          <Num label="Плита: длина" path="wool.plateL" unit="м" step={0.1} />
          <Num label="Плита: ширина" path="wool.plateW" unit="м" step={0.1} />
        </div>
      </section>
      <section>
        <h2>Состав конструкции — {SURF_BY_ID[ui.surface].name.toLowerCase()}</h2>
        <table className="lay">
          <tbody>
            {layers.map((l) => (
              <tr key={l.key}><td><i style={{ background: l.color }} /></td><td>{l.name}<small>{l.note}</small></td><td className="ar">{fmtN(l.mm, 1)} мм<small>до {Math.round(l.d1 * 1000)} мм</small></td></tr>
            ))}
            <tr className="sum"><td /><td>Итоговая толщина</td><td className="ar">{fmtN(T * 1000, 0)} мм</td></tr>
          </tbody>
        </table>
        <div className="row tight">
          <Chk label="Показать в разрезе (3D)" checked={!!ui.section} onChange={(v) => setUi({ section: v })} />
        </div>
        {ui.section && (
          <div className="grid">
            <label className="field wide"><span>Разнесение слоёв: {Math.round(ui.explode * 100)}%</span><input type="range" min="0" max="1" step="0.05" value={ui.explode} onChange={(e) => setUi({ explode: +e.target.value })} /></label>
            <label className="field wide"><span>Масштаб толщин ×{ui.scale}</span><input type="range" min="1" max="10" step="1" value={ui.scale} onChange={(e) => setUi({ scale: +e.target.value })} /></label>
            <div className="field wide">
              {layers.map((l) => <Chk key={l.key} label={l.name} checked={!ui.layersOff[l.key]} onChange={(v) => setUi({ layersOff: { ...ui.layersOff, [l.key]: !v } })} />)}
            </div>
          </div>
        )}
      </section>
      <section>
        <h2>Потеря полезного пространства</h2>
        <table className="lay">
          <thead><tr><td /><td className="ar">было</td><td className="ar">стало</td><td className="ar">потеря</td></tr></thead>
          <tbody>
            <tr><td>Ширина, м</td><td className="ar">{fmtN(dm.old.W, 2)}</td><td className="ar">{fmtN(dm.nw.W, 2)}</td><td className="ar neg">−{fmtN(dm.loss.W, 2)}</td></tr>
            <tr><td>Длина, м</td><td className="ar">{fmtN(dm.old.L, 2)}</td><td className="ar">{fmtN(dm.nw.L, 2)}</td><td className="ar neg">−{fmtN(dm.loss.L, 2)}</td></tr>
            <tr><td>Площадь пола, м²</td><td className="ar">{fmtN(dm.old.area, 2)}</td><td className="ar">{fmtN(dm.nw.area, 2)}</td><td className="ar neg">−{fmtN(dm.loss.area, 2)}</td></tr>
            <tr><td>Высота потолка, м</td><td className="ar">{fmtN(dm.old.ceil, 2)}</td><td className="ar">{fmtN(dm.nw.ceil, 2)}</td><td className={'ar ' + (dm.loss.ceil < 0 ? 'pos' : 'neg')}>{dm.loss.ceil < 0 ? '+' : '−'}{fmtN(Math.abs(dm.loss.ceil), 2)}</td></tr>
            <tr><td>Боковая стена, м</td><td className="ar">{fmtN(dm.old.knee, 2)}</td><td className="ar">{fmtN(dm.nw.knee, 2)}</td><td className="ar neg">−{fmtN(dm.loss.knee, 2)}</td></tr>
          </tbody>
        </table>
        <small className="note">Исходная модель здания не меняется: слои добавляются внутрь.</small>
      </section>
    </>
  )

  /* ---------- вкладка «Поверхности» ---------- */
  const ss = model.surfaceStats.find((x) => x.id === ui.surface)
  const TabSurf = () => (
    <>
      <section>
        <h2>Поверхности кабинета</h2>
        <div className="surfs">
          {SURF.map((s) => {
            const c = cfg.surfaces[s.id]
            const custom = !WOOL_THICKNESSES.includes(c.woolT)
            return (
              <div key={s.id} className={'surf' + (ui.surface === s.id ? ' cur' : '')} onClick={() => { setUi({ surface: s.id }); setSel((x) => ({ ...x, surface: s.id })) }}>
                <b>{s.name}</b>
                <div className="row tight" onClick={(e) => e.stopPropagation()}>
                  <Chk label={s.id === 'ceiling' ? 'Обшивать и шумоизолировать (выкл. — высота сохраняется)' : 'Выполнять ремонт этой поверхности'} checked={c.enabled !== false} onChange={(v) => set(`surfaces.${s.id}.enabled`, v)} />
                </div>
                <div className="row tight" onClick={(e) => e.stopPropagation()}>
                  <Chk label="Установить минеральную вату" disabled={c.enabled === false} checked={c.wool} onChange={(v) => set(`surfaces.${s.id}.wool`, v)} />
                </div>
                {c.wool && c.enabled !== false && (
                  <div className="row tight" onClick={(e) => e.stopPropagation()}>
                    {WOOL_THICKNESSES.map((t) => <button key={t} className={'mini' + (c.woolT === t ? ' on' : '')} onClick={() => set(`surfaces.${s.id}.woolT`, t)}>{t}</button>)}
                    <input className="mini-in" type="number" min="10" value={custom ? c.woolT : ''} placeholder="своя" onChange={(e) => { const v = parseFloat(e.target.value); if (v > 0) set(`surfaces.${s.id}.woolT`, v) }} />
                    <span>мм</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className="row tight">
          <button className="small" onClick={() => SURF.forEach((s) => set(`surfaces.${s.id}.wool`, true))}>Вата везде</button>
          <button className="small" onClick={() => SURF.forEach((s) => set(`surfaces.${s.id}.wool`, false))}>Без ваты</button>
        </div>
      </section>
      <section>
        <h2>{SURF_BY_ID[ui.surface].name}</h2>
        <table className="lay"><tbody>
          <tr><td>Площадь (без проёмов)</td><td className="ar">{fmtN(ss.area, 2)} м²</td></tr>
          <tr><td>Подвесов</td><td className="ar">{ss.hangers} шт</td></tr>
          <tr><td>Профиль</td><td className="ar">{fmtN(ss.profLen, 1)} м</td></tr>
          <tr><td>Вата</td><td className="ar">{ss.wool ? `${ss.wool} мм` : 'нет'}</td></tr>
          <tr><td>Листов ГКЛ</td><td className="ar">{ss.sheets.join(' + ')}</td></tr>
          {cfg.finish === 'boards' && <><tr><td>Рейки</td><td className="ar">{fmtN(ss.battens, 1)} м</td></tr><tr><td>Досок</td><td className="ar">{ss.boards} шт</td></tr></>}
        </tbody></table>
      </section>
    </>
  )

  /* ---------- вкладка «Вагонка» ---------- */
  const [filter, setFilter] = useState('all')
  const bm = model.board
  const pieces = bm.pieces.filter((p) => filter === 'all' || p.surf === filter)
  const TabBoards = () => (
    <>
      {cfg.finish !== 'boards' && <div className="warn">Выбрана отделка «ГКЛ под покраску». Вагонка не используется — переключите отделку на вкладке «Этапы».</div>}
      <section>
        <h2>Направление укладки</h2>
        <Seg value={cfg.boardDir} options={[['horizontal', 'Горизонтальная'], ['vertical', 'Вертикальная']]} onChange={(v) => set('boardDir', v)} />
        <small className="note">Рейки обрешётки всегда перпендикулярны доскам и перестраиваются вместе с направлением.</small>
      </section>
      <section>
        <h2>Материал</h2>
        <div className="grid">
          <Num label="Рабочая ширина" path="boards.working" unit="мм" />
          <Num label="Полная ширина" path="boards.full" unit="мм" />
          <Num label="Толщина" path="boards.thickness" unit="мм" />
          <Num label="Запас на подрезку" path="boards.waste" unit="%" />
          <Sel label="Порода" path="boards.species" options={Object.entries(SPECIES).map(([k, v]) => [k, v.name])} />
          <Sel label="Покрытие" path="boards.coating" options={Object.entries(COATINGS).map(([k, v]) => [k, v.name])} />
          <label className="field wide"><span>Длины досок в продаже, м (через запятую)</span>
            <input defaultValue={cfg.boards.stocks.join(', ')} onBlur={(e) => { const a = e.target.value.split(/[,;\s]+/).map((x) => parseFloat(x.replace(',', '.'))).filter((x) => x > 0.3).sort((x, y) => x - y); if (a.length) set('boards.stocks', a) }} />
          </label>
          <label className="field wide"><span>Цвет окраски ГКЛ</span><input type="color" value={cfg.paint.color} onChange={(e) => set('paint.color', e.target.value)} /></label>
        </div>
      </section>
      {cfg.finish === 'boards' && (
        <>
          <section>
            <h2>Ведомость закупки</h2>
            <table className="lay">
              <thead><tr><td>Длина доски</td><td className="ar">нужно</td><td className="ar">к покупке</td></tr></thead>
              <tbody>
                {bm.purchase.map((r) => <tr key={r.len}><td>{fmtN(r.len, 2)} м</td><td className="ar">{r.net} шт</td><td className="ar">{r.count} шт</td></tr>)}
                <tr className="sum"><td>Итого</td><td className="ar">{bm.purchase.reduce((s, r) => s + r.net, 0)} шт</td><td className="ar">{bm.purchase.reduce((s, r) => s + r.count, 0)} шт</td></tr>
              </tbody>
            </table>
            <small className="note">Всего кусков {bm.pieces.length}, площадь покрытия {fmtN(bm.area, 1)} м², закупка {fmtN(bm.purchaseLen, 0)} пог. м. Куски упакованы в доски с повторным использованием остатков, стыки приходятся на рейки.</small>
          </section>
          <section>
            <h2>Доски ({pieces.length})</h2>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="sel-in">
              <option value="all">Все поверхности</option>
              {SURF.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div className="btable">
              <table>
                <thead><tr><td>№</td><td>Длина</td><td>Шир.</td><td>Заготовка</td><td>Примечание</td></tr></thead>
                <tbody>
                  {pieces.slice(0, 400).map((p) => (
                    <tr key={p.num} className={sel.board === p.num ? 'hl' : ''} onClick={() => setSel((x) => ({ ...x, board: p.num }))}>
                      <td>{p.num}</td><td>{fmtN(p.len, 2)}</td><td>{Math.round(p.width * 1000)}</td><td>{fmtN(p.stock, 1)}{p.offcut ? ' (обрезок)' : ''}</td><td>{p.notes.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  )

  /* ---------- вкладка «Смета» ---------- */
  const [open, setOpen] = useState(null)
  const est = model.estimate
  const groups = ['frame', 'wool', 'gkl', 'battens', 'boards', 'paint', 'extra']
  const setPrice = (id, k, v) => setRen((r) => ({ ...r, cfg: { ...r.cfg, prices: { ...r.cfg.prices, [id]: { ...(r.cfg.prices[id] || {}), [k]: v } } } }))
  const TabEst = () => (
    <>
      <section>
        <div className="grid">
          <label className="field"><span>Валюта</span><input value={cfg.currency} onChange={(e) => set('currency', e.target.value)} /></label>
          <label className="field"><span>Цена вагонки за пог. м</span><input type="number" value={cfg.prices.boardRate?.price ?? MATERIALS.boardRate.price} onChange={(e) => setPrice('boardRate', 'price', parseFloat(e.target.value) || 0)} /></label>
        </div>
      </section>
      {groups.map((g) => {
        const rows = est.rows.filter((r) => (g === 'extra' ? r.extra : r.group === g && !r.extra))
        if (!rows.length) return null
        return (
          <section key={g}>
            <h2>{GROUP_LABEL[g]} · {money(rows.reduce((s, r) => s + r.cost, 0))}</h2>
            <table className="est">
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.id}>
                    <tr onClick={() => setOpen(open === r.id ? null : r.id)} className={open === r.id ? 'open' : ''}>
                      <td>{r.name}<small>{r.note}</small></td>
                      <td className="ar">{fmtN(r.net, r.net < 10 ? 2 : 0)}<small>{fmtN(r.qty, r.qty < 10 ? 2 : 0)} {r.unit}</small></td>
                      <td className="ar">{r.packs}<small>{r.packSize !== 1 ? `×${fmtN(r.packSize, 1)} ${r.unit}` : r.unit}</small></td>
                      <td className="ar">{money(r.cost)}<small>{money(r.price)}</small></td>
                    </tr>
                    {open === r.id && !r.board && (
                      <tr key={r.id + 'e'} className="edit"><td colSpan="4">
                        <div className="grid">
                          <label className="field"><span>Цена за упаковку</span><input type="number" value={cfg.prices[r.id]?.price ?? MATERIALS[r.id].price} onChange={(e) => setPrice(r.id, 'price', parseFloat(e.target.value) || 0)} /></label>
                          <label className="field"><span>В упаковке</span><input type="number" value={cfg.prices[r.id]?.packSize ?? r.packSize} onChange={(e) => setPrice(r.id, 'packSize', parseFloat(e.target.value) || 1)} /></label>
                          <label className="field"><span>Запас, %</span><input type="number" value={cfg.prices[r.id]?.waste ?? r.waste} onChange={(e) => setPrice(r.id, 'waste', parseFloat(e.target.value) || 0)} /></label>
                          <label className="field"><span>Единица</span><input value={cfg.prices[r.id]?.unit ?? r.unit} onChange={(e) => setPrice(r.id, 'unit', e.target.value)} /></label>
                        </div>
                      </td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </section>
        )
      })}
      <section>
        <h2>{GROUP_LABEL.labor}</h2>
        <Chk label="Включить работы в итог" checked={cfg.labor.include} onChange={(v) => set('labor.include', v)} />
        <table className="est"><tbody>
          {est.labor.map((l) => (
            <tr key={l.id}>
              <td>{l.name}<small>{fmtN(l.qty, 1)} {l.unit}</small></td>
              <td className="ar"><input className="mini-in wide" type="number" value={l.rate} onChange={(e) => set(`labor.rates.${l.id}`, parseFloat(e.target.value) || 0)} /><small>{cfg.currency}/{l.unit}</small></td>
              <td className="ar">{money(l.cost)}</td>
            </tr>
          ))}
        </tbody></table>
      </section>
      <section>
        <table className="lay total"><tbody>
          <tr><td>Материалы</td><td className="ar">{money(est.mainCost)}</td></tr>
          <tr><td>Дополнительные материалы</td><td className="ar">{money(est.extraCost)}</td></tr>
          <tr><td>Работы мастеров</td><td className="ar">{cfg.labor.include ? money(est.laborTotal) : 'не включены'}</td></tr>
          <tr className="sum"><td>Итого</td><td className="ar">{money(est.total)}</td></tr>
        </tbody></table>
        <small className="note">Цены демонстрационные. Чистый расход, расход с запасом и число упаковок указаны отдельно; округления только при выводе.</small>
      </section>
    </>
  )

  /* ---------- вкладка предупреждений ---------- */
  const [wOpen, setWOpen] = useState(false)

  const compact = ui.compact
  return (
    <Ctx.Provider value={{ cfg, set }}>
      <aside className={'rpanel' + (compact ? ' compact' : '')}>
        <header>
          <div>
            <h1>Ремонт кабинета</h1>
            <p className="sub">{stages[stage].name} · установлено {fmtN(stageT * 1000, 0)} из {fmtN(T * 1000, 0)} мм</p>
          </div>
          <button className="ghost" onClick={() => setUi({ compact: !compact })} aria-label="Свернуть">{compact ? '+' : '–'}</button>
        </header>
        {!compact && (
          <>
            <nav className="tabs rtabs">
              {TABS.map(([k, n]) => <button key={k} className={ui.tab === k ? 'on' : ''} onClick={() => setUi({ tab: k })}>{n}</button>)}
            </nav>
            <div className="body">
              {ui.tab === 'stages' && TabStages()}
              {ui.tab === 'frame' && TabFrame()}
              {ui.tab === 'surf' && TabSurf()}
              {ui.tab === 'boards' && TabBoards()}
              {ui.tab === 'est' && TabEst()}
              <div className={'warnbox' + (warnN ? '' : ' ok')}>
                <button className="ghost wb" onClick={() => setWOpen(!wOpen)}>Проверки и предупреждения ({warnN}) {wOpen ? '▾' : '▸'}</button>
                {wOpen && <ul>{model.warnings.map((w, i) => <li key={i}>{w}</li>)}{model.info.map((w, i) => <li key={'i' + i} className="inf">{w}</li>)}</ul>}
              </div>
              <button className="ghost reset" onClick={onReset}>Сбросить настройки ремонта</button>
            </div>
          </>
        )}
      </aside>

      <div className="rtimeline">
        <div className="tl-btns">
          <button onClick={() => goStage(0)} title="С начала">⏮</button>
          <button onClick={() => goStage(stage - 1)} title="Предыдущий этап">◀</button>
          <button className={ui.playing ? 'on' : ''} onClick={() => setRen((r) => ({ ...r, stage: r.stage >= stages.length - 1 && !r.ui.playing ? 0 : r.stage, ui: { ...r.ui, playing: !r.ui.playing } }))} title="Воспроизвести / пауза">{ui.playing ? '⏸ Пауза' : '▶ Воспроизвести'}</button>
          <button onClick={() => goStage(stage + 1)} title="Следующий этап">▶</button>
        </div>
        <div className="tl-track">
          <input type="range" min="0" max={stages.length - 1} step="1" value={stage} onChange={(e) => goStage(+e.target.value)} />
          <div className="ticks">{stages.map((s, i) => <span key={s.key} className={i <= stage ? 'on' : ''} onClick={() => goStage(i)} title={s.name} />)}</div>
        </div>
        <div className="tl-info"><b>Этап {stage} из {stages.length - 1}: {stages[stage].name}</b><small>{stages[stage].hint}</small></div>
      </div>

      {sel.hanger && !sel.board && (() => {
        const { surf, line } = sel.hanger
        const g = model.gen[surf]
        if (!g) return null
        const hs = g.hangers.filter((h) => h[3] === line)
        const pcs = g.profiles.filter((p) => p.lineId === line)
        const axis = hs[0]?.[2]
        const gaps = []
        for (let i = 1; i < hs.length; i++) gaps.push(Math.hypot(hs[i][0] - hs[i - 1][0], hs[i][1] - hs[i - 1][1]))
        const real = gaps.filter((x) => x < 1.2) // разрывы у проёмов — не шаг
        return (
          <aside className="rinfo">
            <h3>Подвес → профиль</h3>
            <div className="sz">{SURF_BY_ID[surf].name}</div>
            <table className="lay"><tbody>
              <tr><td>Подвесов в ряду</td><td className="ar">{hs.length}</td></tr>
              <tr><td>Шаг по ряду</td><td className="ar">{real.length ? `${fmtN(Math.min(...real) * 100, 0)}–${fmtN(Math.max(...real) * 100, 0)} см` : '—'}</td></tr>
              <tr><td>Длина профиля в ряду</td><td className="ar">{fmtN(pcs.reduce((s2, p) => s2 + p.hi - p.lo, 0), 2)} м</td></tr>
              <tr><td>Кусков профиля</td><td className="ar">{pcs.length}</td></tr>
              <tr><td>Ось П-скобы</td><td className="ar">{axis === 's' ? 'вдоль s' : 'вдоль t'}</td></tr>
            </tbody></table>
            <small className="note">Все подвесы ряда держат один профиль: профиль входит в П-образную скобу и фиксируется саморезом. Подсвечены подвесы и профиль этого ряда.</small>
            <button className="small" onClick={() => setSel((x) => ({ ...x, hanger: null }))}>Снять выделение</button>
          </aside>
        )
      })()}
      {sel.board && (() => {
        const p = bm.pieces.find((x) => x.num === sel.board)
        if (!p) return null
        return (
          <aside className="rinfo">
            <h3>Доска {p.num}</h3>
            <div className="sz">{SURF.find((s) => s.id === p.surf).name}</div>
            <table className="lay"><tbody>
              <tr><td>Длина</td><td className="ar">{fmtN(p.len, 2)} м</td></tr>
              <tr><td>Рабочая ширина</td><td className="ar">{Math.round(p.width * 1000)} мм</td></tr>
              <tr><td>Толщина</td><td className="ar">{cfg.boards.thickness} мм</td></tr>
              <tr><td>Заготовка</td><td className="ar">{fmtN(p.stock, 1)} м{p.offcut ? ' (обрезок)' : ''}</td></tr>
              <tr><td>Направление</td><td className="ar">{p.axis === 's' ? 'горизонтально' : 'вертикально'}</td></tr>
            </tbody></table>
            {p.notes.length > 0 && <small className="note">{p.notes.join(', ')}</small>}
            <button className="small" onClick={() => setSel((x) => ({ ...x, board: null }))}>Закрыть</button>
          </aside>
        )
      })()}
    </Ctx.Provider>
  )
}
