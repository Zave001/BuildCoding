import { useState } from 'react'
import { Ctx, Num, Sel, Seg, Chk, setIn } from '../renovation/RenovationUI'
import { fmtN } from '../renovation/calc'
import { GROUP_LABEL } from '../renovation/data'
import { SYSTEMS, INTAKES, SUPPLY_POS, EXTRACTS, EXIT_KINDS } from './vent'

const FAQ = [
  ['Обязательна ли вытяжка, если можно открывать окно?', 'Нет. Можно приток без вытяжки (воздух уходит через зазор под дверью или переточную решётку) либо проветривание окном. Но открытое окно у трассы приносит шум: звукоизоляция теряется. Нормы для частного дома механическую вытяжку не требуют, но воздухообмен нужен.'],
  ['Нужен ли рекуператор?', 'Не обязательно. Он нужен ради экономии тепла и влажности. Для одного кабинета проще и тише акустический клапан или бризер при закрытых окнах.'],
  ['Можно ли брать воздух из торца у купе?', 'Можно: выберите «Торец кухни» в разделе «Забор воздуха». Но оба торца обращены к дороге, шум у входа выше, чем на левом скате, поэтому нужны глушитель и защита от снега.'],
]

export default function VentUI({ ren, setRen, model }) {
  const { cfg } = ren
  const v = cfg.vent
  const set = (path, val) => setRen((r) => ({ ...r, cfg: setIn(r.cfg, path, val) }))
  const [open, setOpen] = useState(null)
  const [compact, setCompact] = useState(false)
  const vm = model.vent
  const sys = SYSTEMS[v.system]
  const money = (x) => Math.round(x).toLocaleString('ru-RU') + ' ' + cfg.currency
  const rows = model.estimate.rows.filter((r) => r.group === 'vent')
  const sum = rows.reduce((s, r) => s + r.cost, 0)
  const noWarnings = vm ? vm.warnings.filter((w) => !w.includes('акустическая цепочка')) : []

  return (
    <Ctx.Provider value={{ cfg, set }}>
      <aside className={'rpanel vpanel' + (compact ? ' compact' : '')}>
        <header>
          <div>
            <h1>Вентиляция кабинета</h1>
            <p className="sub">{sys.name} · {v.enabled ? `шум у решётки ≈ ${vm ? fmtN(vm.total, 0) : '—'} дБА` : 'выключена'}</p>
          </div>
          <button className="ghost" onClick={() => setCompact(!compact)} aria-label="Свернуть">{compact ? '+' : '–'}</button>
        </header>
        {!compact && (
          <div className="body">
            <section>
              <div className="col">
                <Chk label="Проектировать вентиляцию" checked={v.enabled} onChange={(x) => set('vent.enabled', x)} />
                <Chk label="Показывать каналы в сцене" checked={v.show} onChange={(x) => set('vent.show', x)} />
                <Chk label="Сдвигать проходы, если попадают на профиль/подвес/рейку" checked={v.auto} onChange={(x) => set('vent.auto', x)} />
              </div>
              <small className="note">Подсобка слева — сторона, противоположная дороге. Блок и каналы в ней, проходы в кабинет — через левую боковую стену гильзами через все слои ремонта.</small>
            </section>

            <section>
              <h2>Вопросы</h2>
              <div className="faq">
                {FAQ.map(([q, a], i) => (
                  <div key={q}>
                    <button className="ghost wb" onClick={() => setOpen(open === i ? null : i)}>{q} {open === i ? '▾' : '▸'}</button>
                    {open === i && <small className="note">{a}</small>}
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2>Система</h2>
              <div className="syscards">
                {model.ventCompare.map((c) => (
                  <button key={c.key} className={'syscard' + (v.system === c.key ? ' on' : '')} onClick={() => set('vent.system', c.key)}>
                    <b>{c.sys.name}</b>
                    <span className="desc">{c.sys.desc}</span>
                    <span className="meta">
                      <i>≈ {fmtN(c.noise, 0)} дБА</i>
                      <i>{money(c.cost)}</i>
                      <i>{c.penetrations} проход.</i>
                      {c.sys.recovery > 0 && <i>тепло {Math.round(c.sys.recovery * 100)}%</i>}
                    </span>
                    <span className="pc">
                      <em>+ {c.sys.pros.join(' · ')}</em>
                      <em className="neg">− {c.sys.cons.join(' · ')}</em>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h2>Существующая вытяжка санузла</h2>
              <Chk label="На левой стене уже есть вытяжка из санузла (высоко)" checked={!!v.existing?.enabled} onChange={(x) => set('vent.existing.enabled', x)} />
              {v.existing?.enabled && (
                <>
                  <div className="grid">
                    <Num label="Диаметр канала" path="vent.existing.duct" unit="мм" />
                    <Num label="Высота канала" path="vent.existing.h" unit="м" step={0.05} />
                  </div>
                  <Chk label="В канале вентилятор (выключается вручную)" checked={!!v.existing.fan} onChange={(x) => set('vent.existing.fan', x)} />
                  <Seg value={v.existing.exit} options={Object.entries(EXIT_KINDS)} onChange={(x) => set('vent.existing.exit', x)} />
                  <small className="note">Канал учитывается в сцене и проверках: для клапана и бризера он служит выходом воздуха (через зазор двери) только пока вентилятор включён; подключать к нему рекуператор не рекомендуется; забор должен стоять не ближе 2 м к его выбросу.</small>
                </>
              )}
            </section>

            {v.system !== 'window' && (
              <>
                <section>
                  <h2>Забор воздуха</h2>
                  <Seg value={v.intake} options={Object.entries(INTAKES).map(([k, x]) => [k, x.short])} onChange={(x) => set('vent.intake', x)} />
                  <small className="note">{INTAKES[v.intake].name}</small>
                </section>
                <section>
                  <h2>Приток в кабинет (левая стена)</h2>
                  <Seg value={v.supplyPos} options={Object.entries(SUPPLY_POS).map(([k, x]) => [k, x.name])} onChange={(x) => set('vent.supplyPos', x)} />
                </section>
                <section>
                  <h2>Вытяжка</h2>
                  <Seg value={sys.extract ? v.extract : 'none'} options={Object.entries(EXTRACTS).map(([k, x]) => [k, x.name.split(' (')[0]])} onChange={(x) => sys.extract && set('vent.extract', x)} />
                  <small className="note">{sys.extract ? EXTRACTS[v.extract].name : 'У выбранной системы своей вытяжки нет — воздух уходит через зазор двери.'}</small>
                </section>
                <section>
                  <h2>Параметры</h2>
                  <div className="grid">
                    <Num label="Расход" path="vent.flow" unit="м³/ч" />
                    <Sel label="Диаметр канала" path="vent.duct" options={[[100, '100 мм'], [125, '125 мм'], [160, '160 мм']]} onPick={(x) => set('vent.duct', +x)} />
                    <Num label="Длина глушителя" path="vent.silencer" unit="м" step={0.1} />
                    <Num label="Решётка притока: длина" path="vent.grille.w" unit="м" step={0.05} />
                    <Num label="Решётка притока: высота" path="vent.grille.h" unit="м" step={0.05} />
                    <Num label="Блок: положение по z" path="vent.unitZ" unit="м" step={0.1} disabled={!sys.unit || sys.wall} />
                    <Num label="Блок: от стены" path="vent.unitT" unit="м" step={0.05} disabled={!sys.unit || sys.wall} />
                    <Num label="Забор на скате: z" path="vent.intakeZ" unit="м" step={0.1} disabled={v.intake !== 'slope'} />
                    <Num label="Выброс на скате: z" path="vent.exhaustZ" unit="м" step={0.1} disabled={!sys.extract} />
                    <Num label="Колпаки от стены" path="vent.hoodT" unit="м" step={0.05} />
                  </div>
                </section>
              </>
            )}

            <section>
              <h2>Шумовая цепочка (ориентировочно)</h2>
              <div className="grid">
                <Num label="Шум у фасада (дорога)" path="vent.noise.facade" unit="дБА" />
                <Num label="У забора на скате" path="vent.noise.outdoor" unit="дБА" />
                <Num label="У забора в торце" path="vent.noise.outdoorEnd" unit="дБА" />
                <Num label="Окно ослабляет" path="vent.noise.windowDb" unit="дБ" />
                <Num label="Потери глушителя" path="vent.noise.silDb" unit="дБ" />
                <Num label="Потери акуст. канала" path="vent.noise.flexDb" unit="дБ/м" step={0.5} />
                <Num label="Потери в блоке" path="vent.noise.unitDb" unit="дБ" />
                <Num label="Цель в кабинете" path="vent.noise.target" unit="дБА" />
              </div>
              {vm && (
                <table className="lay">
                  <tbody>
                    {vm.chain.map((c) => (
                      <tr key={c.n} className={c.total ? 'sum' : ''}><td>{c.n}</td><td className={'ar ' + (c.total ? (c.v > v.noise.target ? 'neg' : 'pos') : '')}>{fmtN(c.v, 0)} дБА</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
              <small className="note">Цифры шума — оценка по введённым данным, а не акустический расчёт. {vm && vm.vDuct > 0 ? `Скорость в канале ${fmtN(vm.vDuct, 1)} м/с, в решётке ${fmtN(vm.vGrille, 1)} м/с.` : ''}</small>
            </section>

            <section>
              <h2>Сравнение систем (при текущем заборе и притоке)</h2>
              <table className="lay cmp">
                <thead><tr><td>Система</td><td className="ar">дБА</td><td className="ar">Цена</td><td className="ar">Пред.</td></tr></thead>
                <tbody>
                  {model.ventCompare.map((c) => (
                    <tr key={c.key} className={v.system === c.key ? 'sum' : ''} onClick={() => set('vent.system', c.key)}>
                      <td>{c.sys.short}</td>
                      <td className={'ar ' + (c.noise > v.noise.target ? 'neg' : 'pos')}>{fmtN(c.noise, 0)}</td>
                      <td className="ar">{money(c.cost)}</td>
                      <td className="ar">{c.warnings}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {vm && (noWarnings.length > 0 || vm.info.length > 0) && (
              <div className="warnbox">
                <ul>
                  {noWarnings.map((w, i) => <li key={i}>{w}</li>)}
                  {vm.info.map((w, i) => <li key={'i' + i} className="inf">{w}</li>)}
                </ul>
              </div>
            )}

            {rows.length > 0 && (
              <section>
                <h2>{GROUP_LABEL.vent} · {money(sum)}</h2>
                <table className="est">
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>{r.name}<small>{r.note}</small></td>
                        <td className="ar">{fmtN(r.net, r.net < 10 ? 1 : 0)} {r.unit}</td>
                        <td className="ar">{money(r.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <small className="note">Цены демонстрационные, редактируются на вкладке «Смета» в блоке «Ремонт».</small>
              </section>
            )}
          </div>
        )}
      </aside>
    </Ctx.Provider>
  )
}
