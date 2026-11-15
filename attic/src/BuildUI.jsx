import { useState } from 'react'
import { ACCENTS, BLANKETS, CATALOG, CATS } from './furn'

// пиктограммы предметов
const ICONS = {
  desk: (
    <svg viewBox="0 0 48 32"><rect x="3" y="8" width="42" height="5" rx="1" fill="#3a2a22" /><rect x="5" y="13" width="3" height="15" fill="#d2bb95" /><rect x="40" y="13" width="3" height="15" fill="#d2bb95" /><rect x="8" y="15" width="32" height="6" fill="#d2bb95" opacity=".6" /></svg>
  ),
  screen: (
    <svg viewBox="0 0 48 32"><rect x="3" y="3" width="42" height="3.5" rx="1.7" fill="#f1f1ee" stroke="#9aa" strokeWidth=".6" /><rect x="6" y="6.5" width="36" height="20" fill="#f3f3f0" stroke="#111" strokeWidth="1.6" /><rect x="20" y="27" width="8" height="1.6" rx=".8" fill="#ccc" /></svg>
  ),
  table: (
    <svg viewBox="0 0 48 32"><rect x="3" y="9" width="42" height="4" rx="1" fill="#5a3a2c" /><rect x="5" y="13" width="2.5" height="15" fill="#4a2f24" /><rect x="40" y="13" width="2.5" height="15" fill="#4a2f24" /><rect x="30" y="13" width="2" height="15" fill="#4a2f24" /></svg>
  ),
  dresser: (
    <svg viewBox="0 0 48 32"><rect x="12" y="3" width="24" height="26" rx="1" fill="#3a2a22" /><rect x="14" y="6" width="20" height="5" fill="#d2bb95" /><rect x="14" y="12" width="20" height="5" fill="#d2bb95" /><rect x="14" y="18" width="20" height="5" fill="#d2bb95" /><rect x="14" y="24" width="20" height="3" fill="#d2bb95" /></svg>
  ),
  bed: (
    <svg viewBox="0 0 48 32"><rect x="4" y="4" width="4" height="22" rx="1" fill="#85878a" /><rect x="8" y="16" width="36" height="9" rx="2" fill="#ebe5d8" /><rect x="14" y="14" width="30" height="6" rx="2" fill="#9b9a9c" /><rect x="10" y="12" width="9" height="5" rx="2" fill="#e6dccb" /></svg>
  ),
  tv: (
    <svg viewBox="0 0 48 32"><rect x="5" y="5" width="38" height="20" rx="1.5" fill="#0d0d0f" stroke="#4a4d54" /><rect x="7" y="7" width="34" height="16" fill="#1d2026" /><rect x="10" y="26" width="5" height="2" fill="#4a4d54" /><rect x="33" y="26" width="5" height="2" fill="#4a4d54" /></svg>
  ),
  chair: (
    <svg viewBox="0 0 48 32"><rect x="17" y="2" width="14" height="14" rx="4" fill="#1b1b1d" /><rect x="19" y="4" width="10" height="2" fill="#c0407f" /><rect x="14" y="16" width="20" height="5" rx="2" fill="#1b1b1d" /><rect x="23" y="21" width="2" height="6" fill="#999" /><path d="M10 29h28" stroke="#444" strokeWidth="2" /></svg>
  ),
}

const cm = (v) => Math.round(v * 100)

export default function BuildUI({ tool, setTool, setSelected, item, update, api, status, onClear, count }) {
  const [cat, setCat] = useState('all')
  const list = Object.entries(CATALOG).filter(([, c]) => cat === 'all' || c.cat === cat)
  const c = item ? CATALOG[item.type] : null

  return (
    <>
      <div className="dock">
        <div className="dock-top">
          <div className="tabs">
            {CATS.map(([k, label]) => (
              <button key={k} className={cat === k ? 'on' : ''} onClick={() => setCat(k)}>{label}</button>
            ))}
          </div>
          <div className="dock-hint">
            {tool ? <b>Ставим: {CATALOG[tool.type].name}</b> : 'Выберите предмет или щёлкните по расставленному'}
            <span> · стрелки — сдвиг (Alt — 1 см) · R — поворот 90° · Q/E — 15° · Ctrl — ставить ещё · Del — убрать · Esc — отмена</span>
          </div>
          {count > 0 && <button className="ghost small" onClick={onClear}>Убрать всё ({count})</button>}
        </div>
        <div className="cards">
          {list.map(([type, it]) => (
            <button
              key={type}
              className={'card-item' + (tool?.type === type ? ' on' : '')}
              onClick={() => {
                setSelected(null)
                setTool(tool?.type === type ? null : { type, props: {} })
              }}
            >
              <div className="ico">{ICONS[type]}</div>
              <div className="nm">{it.name}</div>
              <div className="sz">{it.dims || `${cm(it.w)}×${cm(it.d)}×${type === 'bed' ? 50 : cm(it.h)} см`}</div>
              <div className="sz dim2">{it.info}</div>
            </button>
          ))}
        </div>
      </div>

      {status && <div className="status">{status}</div>}

      {item && c && !tool && (
        <aside className="inspector">
          <h3>{c.name}</h3>
          <div className="sz">{c.dims || `${cm(c.w)} × ${cm(c.d)} × ${item.type === 'bed' ? '50 (спинка 110)' : cm(c.h)} см`}</div>
          <div className="btns">
            <button onClick={() => api.current?.rotate(-Math.PI / 12)} title="Q">⟲ 15°</button>
            <button onClick={() => api.current?.rotate(Math.PI / 12)} title="E">15° ⟳</button>
            <button onClick={() => api.current?.rotate(Math.PI / 2)} title="R">90°</button>
          </div>
          {c.variants && (
            <label className="field">
              <span>Отделка</span>
              <select value={item.v || 0} onChange={(e) => update(item.id, { v: +e.target.value })}>
                {c.variants.map((v, i) => <option key={v} value={i}>{v}</option>)}
              </select>
            </label>
          )}
          {item.type === 'bed' && (
            <div className="field"><span>Плед</span>
              <div className="sw-row">
                {BLANKETS.map(([col, n]) => (
                  <button key={col} title={n} className={'sw' + (item.blanket === col ? ' on' : '')} style={{ background: col }} onClick={() => update(item.id, { blanket: col })} />
                ))}
              </div>
            </div>
          )}
          {item.type === 'chair' && (
            <div className="field"><span>Цвет вставок</span>
              <div className="sw-row">
                {ACCENTS.map(([col, n]) => (
                  <button key={col} title={n} className={'sw' + (item.accent === col ? ' on' : '')} style={{ background: col }} onClick={() => update(item.id, { accent: col })} />
                ))}
              </div>
            </div>
          )}
          {item.type === 'screen' && (
            <label className="chk"><input type="checkbox" checked={!!item.open} onChange={(e) => update(item.id, { open: e.target.checked })} /> Полотно развёрнуто</label>
          )}
          {item.type === 'tv' && (
            <label className="chk"><input type="checkbox" checked={!!item.on} onChange={(e) => update(item.id, { on: e.target.checked })} /> Экран включён</label>
          )}
          <div className="btns">
            <button onClick={() => api.current?.duplicate()}>Копия</button>
            <button className="danger" onClick={() => api.current?.remove()} title="Del">Убрать</button>
          </div>
        </aside>
      )}
    </>
  )
}
