import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const SPEED = 3 // м/с
const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight']
const isTyping = (t) => t && ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)

// настройки мыши орбитальной камеры: средняя кнопка освобождена под осмотр на месте
export const CC_BUTTONS = { left: 1, middle: 0, right: 2, wheel: 8 }

/**
 * Свободный полёт в редакторе: W/A/S/D — вперёд/влево/назад/вправо по взгляду,
 * Пробел — вверх, Shift — вниз. Зажатое колёсико — осмотреться вокруг текущего положения камеры.
 */
export default function EditorFly({ cc }) {
  const { gl } = useThree()
  const keys = useRef({})

  useEffect(() => {
    const el = gl.domElement
    const down = (e) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey || !KEYS.includes(e.code)) return
      keys.current[e.code] = true
      if (e.code === 'Space') {
        e.preventDefault()
        document.activeElement?.blur?.() // чтобы пробел не «нажимал» кнопку, на которой остался фокус
      }
    }
    const up = (e) => {
      keys.current[e.code] = false
    }
    const blur = () => (keys.current = {})

    let mid = null
    const pos = new THREE.Vector3()
    const tgt = new THREE.Vector3()
    const look = (dx, dy) => {
      const c = cc.current
      if (!c) return
      c.getPosition(pos)
      c.getTarget(tgt)
      const dir = tgt.clone().sub(pos)
      const dist = Math.min(6, Math.max(2, dir.length())) // новая точка вращения — перед камерой
      dir.normalize()
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), -dx * 0.004)
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize()
      const tilted = dir.clone().applyAxisAngle(right, -dy * 0.004)
      // не даём перевернуться через зенит; из строго вертикального положения можно только выходить
      if (Math.abs(tilted.y) < 0.985 || Math.abs(tilted.y) < Math.abs(dir.y)) dir.copy(tilted)
      c.setLookAt(pos.x, pos.y, pos.z, pos.x + dir.x * dist, pos.y + dir.y * dist, pos.z + dir.z * dist, false)
    }
    const pd = (e) => {
      if (e.button !== 1) return
      e.preventDefault()
      e.stopImmediatePropagation()
      mid = { x: e.clientX, y: e.clientY }
      try { el.setPointerCapture(e.pointerId) } catch { /* ok */ }
    }
    const pm = (e) => {
      if (!mid) return
      look(e.clientX - mid.x, e.clientY - mid.y)
      mid = { x: e.clientX, y: e.clientY }
    }
    const pu = (e) => {
      if (e.button === 1) mid = null
    }
    const noAutoscroll = (e) => e.button === 1 && e.preventDefault()

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    el.addEventListener('pointerdown', pd, true)
    el.addEventListener('mousedown', noAutoscroll)
    window.addEventListener('pointermove', pm)
    window.addEventListener('pointerup', pu)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      el.removeEventListener('pointerdown', pd, true)
      el.removeEventListener('mousedown', noAutoscroll)
      window.removeEventListener('pointermove', pm)
      window.removeEventListener('pointerup', pu)
    }
  }, [gl, cc])

  const p = useRef(new THREE.Vector3())
  const t = useRef(new THREE.Vector3())
  useFrame((_, rawDt) => {
    const c = cc.current
    const k = keys.current
    if (!c) return
    const fw = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0)
    const st = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0)
    const vy = (k.Space ? 1 : 0) - (k.ShiftLeft || k.ShiftRight ? 1 : 0)
    if (!fw && !st && !vy) return
    c.getPosition(p.current)
    c.getTarget(t.current)
    const dir = t.current.clone().sub(p.current).normalize()
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize()
    const mv = dir.multiplyScalar(fw).add(right.multiplyScalar(st)).add(new THREE.Vector3(0, vy, 0))
    mv.multiplyScalar(SPEED * Math.min(rawDt, 0.05))
    c.setLookAt(p.current.x + mv.x, p.current.y + mv.y, p.current.z + mv.z, t.current.x + mv.x, t.current.y + mv.y, t.current.z + mv.z, false)
  })

  return null
}
