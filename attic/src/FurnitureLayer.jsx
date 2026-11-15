import * as THREE from 'three'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { Model, defaultsOf } from './Furniture'
import { CATALOG, corners, pointInRect, rectOf, resolve, slopeMount, snap, snapToWalls, stored, uid, validate } from './furn'

const OK = '#3fd3a2'
const BAD = '#ff6b5a'
const PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const isTyping = (t) => t && ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)

function Outline({ item, ok, y = 0 }) {
  const c = corners(rectOf(item))
  const pts = [...c, c[0]].map((p) => [p.x, y + 0.012, p.z])
  // «носик» показывает, куда смотрит передняя сторона
  const [fx, fz] = [(c[2].x + c[3].x) / 2, (c[2].z + c[3].z) / 2]
  const tip = [item.x + (fx - item.x) * 1.35, y + 0.012, item.z + (fz - item.z) * 1.35]
  return (
    <group>
      <Line points={pts} color={ok ? OK : BAD} lineWidth={2.4} depthTest={false} renderOrder={20} />
      <Line points={[[fx, y + 0.012, fz], tip]} color={ok ? OK : BAD} lineWidth={2.4} depthTest={false} renderOrder={20} />
    </group>
  )
}

/**
 * Мебель: отрисовка и, в режиме «Мебель», расстановка мышью.
 * Работает на нативных событиях в фазе перехвата — иначе орбитальная камера утащит перетаскивание предмета.
 */
export default function FurnitureLayer({ d, sc, nav, items, setItems, tool, setTool, selected, setSelected, setStatus, api }) {
  const { gl, camera } = useThree()
  const build = nav === 'build'
  const root = useRef()
  const [drag, setDrag] = useState(null)
  const [ghost, setGhost] = useState(null)
  const rotRef = useRef(0)

  const live = useMemo(() => {
    if (!drag) return items
    return items.map((it) =>
      it.id === drag.id ? { ...it, parent: null, x: drag.x, z: drag.z, rot: drag.rot, floatY: drag.y, my: drag.my ?? it.my, ang: drag.ang ?? it.ang } : it,
    )
  }, [items, drag])
  const placed = useMemo(() => resolve(live), [live])

  // всё, что нужно обработчикам, — в ref, чтобы не перевешивать слушатели
  const S = useRef({})
  S.current = { d, sc, build, items, placed, tool, selected, setItems, setTool, setSelected, setStatus, drag, ghost }

  useEffect(() => {
    if (!build) {
      setGhost(null)
      setDrag(null)
      setStatus('')
    }
  }, [build])
  useEffect(() => {
    if (!tool) setGhost(null)
    else rotRef.current = 0
  }, [tool])

  useEffect(() => {
    const el = gl.domElement
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    let dragState = null
    let down = null

    const setRay = (e) => {
      const r = el.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
    }
    const pick = () => {
      if (!root.current) return null
      const hits = ray.intersectObjects(root.current.children, true)
      for (const h of hits) {
        let o = h.object
        while (o && !(o.userData && o.userData.furnId)) o = o.parent
        if (o) return { id: o.userData.furnId, point: h.point }
      }
      return null
    }
    const onPlane = (y) => {
      PLANE.constant = -y
      const p = new THREE.Vector3()
      return ray.ray.intersectPlane(PLANE, p) ? p : null
    }
    const place = (cat, cand) => {
      const s = S.current
      const x = cat.onSurface ? snap(cand.x, 0.01) : snap(cand.x)
      const z = cat.onSurface ? snap(cand.z, 0.01) : snap(cand.z)
      if (cat.onSurface) return { ...cand, x, z }
      const w = snapToWalls(cat, x, z, cand.rot, s.d)
      return { ...cand, ...w }
    }

    // Экран: ищем точку на плоскости ската под курсором — предмет «прилипает» к скату и повторяет его наклон.
    // Если курсор вне скатов (над полом или потолком), берём ближайший скат и ведём по нему.
    const slopeCand = (type) => {
      const { d } = S.current
      const hw = CATALOG[type].w / 2
      let best = null
      for (const side of [-1, 1]) {
        const pl = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(side * d.rise, d.run, 0).normalize(), new THREE.Vector3(side * d.W / 2, d.kH, 0))
        const q = new THREE.Vector3()
        if (ray.ray.intersectPlane(pl, q) && q.x * side > 0 && Math.abs(q.x) >= d.cW / 2 - 0.05 && Math.abs(q.x) <= d.W / 2) {
          const t = q.distanceTo(camera.position)
          if (!best || t < best.t) best = { q, side, t }
        }
      }
      let z
      let tx
      let side
      if (best) {
        ;({ side } = best)
        tx = Math.abs(best.q.x)
        z = best.q.z
      } else {
        const fl = onPlane(0)
        if (!fl) return null
        side = fl.x < 0 ? -1 : 1
        tx = Math.abs(fl.x)
        z = fl.z
      }
      z = Math.max(hw, Math.min(d.zEnd - hw, snap(z)))
      return { type, z, ...slopeMount(d, tx, side, z) }
    }

    const ghostAt = () => {
      const s = S.current
      const cat = CATALOG[s.tool.type]
      if (cat.slope) {
        const c = slopeCand(s.tool.type)
        if (!c) return null
        const res = validate(c, s.placed, s.d, s.sc)
        return { ...c, y: 0, ok: res.ok, reason: res.reason, res }
      }
      let pt = null
      if (cat.onSurface) {
        // ищем верх стола/комода под курсором
        let best = Infinity
        for (const p of s.placed) {
          const pc = CATALOG[p.type]
          if (!pc.support || p.parentId != null) continue
          const q = onPlane(pc.topH)
          if (q && pointInRect(q.x, q.z, rectOf(p))) {
            const t = q.distanceTo(camera.position)
            if (t < best) {
              best = t
              pt = q
            }
          }
        }
      }
      if (!pt) pt = onPlane(0)
      if (!pt) return null
      const cand = place(cat, { type: s.tool.type, x: pt.x, z: pt.z, rot: rotRef.current })
      const res = validate(cand, s.placed, s.d, s.sc)
      return { ...cand, y: res.y || 0, ok: res.ok, reason: res.reason, res }
    }

    const onDown = (e) => {
      const s = S.current
      if (!s.build || e.button !== 0) return
      setRay(e)
      if (s.tool) {
        down = { x: e.clientX, y: e.clientY }
        return
      }
      const hit = pick()
      if (hit) {
        e.stopImmediatePropagation()
        e.preventDefault()
        const it = s.placed.find((p) => p.id === hit.id)
        s.setSelected(it.id)
        dragState = { id: it.id, planeY: hit.point.y, offX: it.x - hit.point.x, offZ: it.z - hit.point.z, px: e.clientX, py: e.clientY, moved: false, rot: it.rot, type: it.type, baseY: it.y || 0 }
        try { el.setPointerCapture(e.pointerId) } catch { /* без захвата тоже работает */ }
      } else down = { x: e.clientX, y: e.clientY }
    }

    const onMove = (e) => {
      const s = S.current
      if (!s.build) return
      setRay(e)
      if (dragState) {
        const ds = dragState
        if (!ds.moved && Math.hypot(e.clientX - ds.px, e.clientY - ds.py) < 4) return
        ds.moved = true
        const cat = CATALOG[ds.type]
        let c
        if (cat.slope) {
          c = slopeCand(ds.type)
          if (!c) return
        } else {
          const pt = onPlane(ds.planeY)
          if (!pt) return
          c = place(cat, { type: ds.type, x: pt.x + ds.offX, z: pt.z + ds.offZ, rot: ds.rot })
        }
        const res = validate(c, s.placed, s.d, s.sc, ds.id)
        const next = { id: ds.id, x: c.x, z: c.z, rot: c.rot, y: cat.slope ? 0 : res.ok ? res.y || 0 : ds.baseY, my: c.my, ang: c.ang, ok: res.ok, reason: res.reason, res }
        ds.last = next
        setDrag(next)
        s.setStatus(res.ok ? '' : res.reason)
        return
      }
      if (s.tool) {
        const g = ghostAt()
        setGhost(g)
        s.setStatus(g && !g.ok ? g.reason : '')
        return
      }
      const hit = pick()
      el.style.cursor = hit ? 'grab' : ''
    }

    const onUp = (e) => {
      const s = S.current
      if (!s.build) return
      if (dragState) {
        const ds = dragState
        dragState = null
        try { el.releasePointerCapture(e.pointerId) } catch { /* ok */ }
        const last = ds.last
        if (ds.moved && last) {
          if (last.ok) {
            s.setItems((l) => l.map((it) => (it.id === ds.id ? stored(it, { type: ds.type, x: last.x, z: last.z, rot: last.rot, my: last.my, ang: last.ang }, last.res) : it)))
          } else s.setStatus('Не поставить: ' + last.reason)
        }
        setDrag(null)
        return
      }
      if (!down || e.button !== 0) return
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5
      down = null
      if (moved) return
      setRay(e)
      if (s.tool) {
        const g = ghostAt()
        if (!g) return
        if (!g.ok) {
          s.setStatus('Не поставить: ' + g.reason)
          return
        }
        const id = uid()
        const item = stored({ id, type: s.tool.type, ...defaultsOf(s.tool.type), ...(s.tool.props || {}) }, g, g.res)
        s.setItems((l) => [...l, item])
        s.setSelected(id)
        if (!e.ctrlKey && !e.shiftKey) {
          s.setTool(null)
          setGhost(null)
        }
        s.setStatus('')
      } else s.setSelected(null)
    }

    el.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      el.style.cursor = ''
    }
  }, [gl, camera])

  /* ---------- действия над выбранным предметом и клавиши ---------- */

  useEffect(() => {
    const act = {
      rotate(delta) {
        const s = S.current
        if (s.tool) {
          if (CATALOG[s.tool.type].slope) return
          rotRef.current += delta
          setGhost((g) => (g ? { ...g, rot: rotRef.current } : g))
          return
        }
        const it = s.placed.find((p) => p.id === s.selected)
        if (!it || CATALOG[it.type].slope) return // экран закреплён на скате, поворачивать нечего
        const cand = { type: it.type, x: it.x, z: it.z, rot: it.rot + delta }
        const res = validate(cand, s.placed, s.d, s.sc, it.id)
        if (res.ok) s.setItems((l) => l.map((i) => (i.id === it.id ? stored(i, cand, res) : i)))
        else s.setStatus('Не повернуть: ' + res.reason)
      },
      move(vx, vz, step) {
        const s = S.current
        if (s.tool) return
        const it = s.placed.find((p) => p.id === s.selected)
        if (!it) return
        const cat = CATALOG[it.type]
        let cand
        if (cat.slope) {
          // на скате: вдоль комнаты — по z, поперёк — вверх/вниз по скату
          const side = it.x < 0 ? -1 : 1
          const tx = Math.abs(it.x) + Math.sin(it.ang || 0) * 0.045 + side * vx * step
          const hw = cat.w / 2
          cand = { type: it.type, z: Math.max(hw, Math.min(s.d.zEnd - hw, it.z + vz * step)), ...slopeMount(s.d, tx, side, it.z + vz * step) }
        } else cand = { type: it.type, x: it.x + vx * step, z: it.z + vz * step, rot: it.rot }
        let res = validate(cand, s.placed, s.d, s.sc, it.id)
        if (!res.ok && !cat.slope && !cat.onSurface) {
          // шаг мог не дойти до стены на пару сантиметров — пробуем прижать
          const w = snapToWalls(cat, cand.x, cand.z, cand.rot, s.d, 0.06)
          const r2 = validate({ ...cand, ...w }, s.placed, s.d, s.sc, it.id)
          if (r2.ok) {
            cand = { ...cand, ...w }
            res = r2
          }
        }
        if (res.ok) {
          s.setItems((l) => l.map((i) => (i.id === it.id ? stored(i, cand, res) : i)))
          s.setStatus('')
        } else s.setStatus('Не сдвинуть: ' + res.reason)
      },
      remove() {
        const s = S.current
        if (!s.selected) return
        s.setItems((l) => l.filter((i) => i.id !== s.selected && i.parent !== s.selected))
        s.setSelected(null)
      },
      duplicate() {
        const s = S.current
        const it = s.items.find((i) => i.id === s.selected)
        if (!it) return
        const { id, x, z, rot, parent, lx, lz, lr, floatY, ...props } = it
        s.setSelected(null)
        s.setTool({ type: it.type, props })
      },
    }
    api.current = act
    const onKey = (e) => {
      const s = S.current
      if (!s.build || isTyping(e.target)) return
      if (e.code.startsWith('Arrow')) {
        // стрелки двигают выбранный предмет относительно взгляда камеры; Alt — мелкий шаг 1 см
        const f = new THREE.Vector3()
        camera.getWorldDirection(f)
        f.y = 0
        if (f.lengthSq() < 1e-6) f.set(0, 0, -1)
        f.normalize()
        const r = new THREE.Vector3(-f.z, 0, f.x)
        const v = e.code === 'ArrowUp' ? f : e.code === 'ArrowDown' ? f.clone().negate() : e.code === 'ArrowRight' ? r : r.clone().negate()
        act.move(Math.abs(v.x) > Math.abs(v.z) ? Math.sign(v.x) : 0, Math.abs(v.x) > Math.abs(v.z) ? 0 : Math.sign(v.z), e.altKey ? 0.01 : 0.05)
      } else if (e.code === 'KeyR') act.rotate(Math.PI / 2)
      else if (e.code === 'KeyQ') act.rotate(-Math.PI / 12)
      else if (e.code === 'KeyE') act.rotate(Math.PI / 12)
      else if (e.code === 'Delete' || e.code === 'Backspace') act.remove()
      else if (e.code === 'Escape') (s.tool ? s.setTool(null) : s.setSelected(null))
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [api, camera])

  const sel = build && !tool ? placed.find((p) => p.id === selected) : null
  const ghostItem = ghost && tool ? { id: 'ghost', type: tool.type, ...defaultsOf(tool.type), ...(tool.props || {}), x: ghost.x, z: ghost.z, rot: ghost.rot, my: ghost.my, ang: ghost.ang } : null

  return (
    <group>
      <group ref={root}>
        {placed.map((it) => (
          <group key={it.id} position={[it.x, it.y, it.z]} rotation={[0, it.rot, 0]} userData={{ furnId: it.id }}>
            <Model item={it} />
          </group>
        ))}
      </group>
      {sel && <Outline item={sel} ok={drag ? drag.ok : true} y={sel.y} />}
      {ghostItem && (
        <group>
          <group position={[ghost.x, ghost.y, ghost.z]} rotation={[0, ghost.rot, 0]}>
            <Model item={ghostItem} />
          </group>
          <Outline item={ghostItem} ok={ghost.ok} y={ghost.y} />
        </group>
      )}
    </group>
  )
}
