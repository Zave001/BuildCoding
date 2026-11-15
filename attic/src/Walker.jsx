import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { EYE, R, R_CROUCH, pushOut, xRange, maxEye, hatchSeg, utilHeight } from './walk'

export { walkSegments, doorList } from './walk'
const CROUCH = 1.05
const FOV = 72
const REACH = 1.45 // дальность взаимодействия с дверью, м

const isTyping = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')

export default function Walker({ d, segs, furn, doors, hatchOpen, utility, onLock, onNear, onInteract }) {
  const { camera, gl } = useThree()
  const keys = useRef({})
  const yaw = useRef(0)
  const pitch = useRef(0)
  const eye = useRef(EYE)
  const vel = useRef(new THREE.Vector2())
  const pos = useRef({ x: 0, z: 0 })
  const phase = useRef(0)
  const nearId = useRef(null)
  const nearKey = useRef(null)

  // последние значения — в ref, чтобы слушатели клавиш не пересоздавались
  const live = useRef({})
  const all = segs.concat(furn)
  live.current = { d, all, allHatch: all.concat([hatchSeg(d)]), hatchOpen, utility, doors, onNear, onInteract }

  // старт: если камера уже внутри кабинета — оттуда, иначе у двери, лицом к купе
  useEffect(() => {
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    let { x, z } = camera.position
    const inside = Math.abs(x) < d.W / 2 - R && z > R && z < d.zEnd - R && camera.position.y > 0 && camera.position.y < d.cH
    if (!inside) {
      x = 0.1
      z = d.L + 0.45
      dir.set(0.05, -0.1, 1)
    }
    const p = { x, z }
    pushOut(p, live.current.all)
    pos.current = p
    dir.normalize()
    yaw.current = Math.atan2(-dir.x, -dir.z)
    pitch.current = Math.max(-0.6, Math.min(0.6, Math.asin(dir.y)))
    const fov = camera.fov
    camera.fov = FOV
    camera.updateProjectionMatrix()
    return () => {
      camera.fov = fov
      camera.updateProjectionMatrix()
      onNear(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const el = gl.domElement
    const look = (mx, my, k) => {
      yaw.current -= mx * k
      pitch.current = Math.max(-1.45, Math.min(1.45, pitch.current - my * k))
    }
    const interact = () => {
      if (nearId.current) live.current.onInteract(nearId.current)
    }
    const down = (e) => {
      if (isTyping(e.target)) return
      keys.current[e.code] = true
      if (e.code === 'KeyE' && !e.repeat) interact()
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault()
    }
    const up = (e) => {
      keys.current[e.code] = false
    }
    const move = (e) => {
      if (document.pointerLockElement === el) look(e.movementX, e.movementY, 0.0022)
      else if (e.buttons & 1) look(e.movementX, e.movementY, 0.004) // запасной вариант без захвата мыши
    }
    const click = () => {
      if (document.pointerLockElement !== el) el.requestPointerLock?.()?.catch?.(() => {})
      else interact() // в захваченном режиме щелчок — «использовать»
    }
    const lockChange = () => onLock(document.pointerLockElement === el)
    const blur = () => (keys.current = {})
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerlockchange', lockChange)
    el.addEventListener('click', click)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerlockchange', lockChange)
      el.removeEventListener('click', click)
      if (document.pointerLockElement === el) document.exitPointerLock()
      onLock(false)
    }
  }, [gl, onLock])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const k = keys.current
    const L = live.current
    if (k.ArrowLeft) yaw.current += 1.8 * dt
    if (k.ArrowRight) yaw.current -= 1.8 * dt
    if (k.ArrowUp) pitch.current = Math.min(1.45, pitch.current + 1.2 * dt)
    if (k.ArrowDown) pitch.current = Math.max(-1.45, pitch.current - 1.2 * dt)

    const fw = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0)
    const st = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0)
    const crouch = k.KeyC || k.ControlLeft
    const speed = (k.ShiftLeft || k.ShiftRight ? 3.0 : 1.5) * (crouch ? 0.55 : 1)
    const sy = Math.sin(yaw.current)
    const cy = Math.cos(yaw.current)
    const want = new THREE.Vector2(-sy * fw + cy * st, -cy * fw - sy * st)
    if (want.lengthSq() > 1) want.normalize()
    want.multiplyScalar(speed)
    vel.current.lerp(want, Math.min(1, dt * 10))

    // подсобка за боковым перекрытием: внутри потолок скошен — глаза опускаются, ползём на корточках
    const inU = L.utility && pos.current.x < -L.d.W / 2 + 0.02
    const stance = crouch ? CROUCH : EYE
    const eyeTarget = inU ? Math.max(0.42, Math.min(stance, utilHeight(L.d, pos.current.x) - 0.14)) : Math.min(stance, Math.max(0.5, maxEye(L.d, pos.current.x, pos.current.z)))
    eye.current += (eyeTarget - eye.current) * Math.min(1, dt * 8)
    const p = { x: pos.current.x + vel.current.x * dt, z: pos.current.z + vel.current.y * dt }
    if (inU) {
      // глубже, чем позволяет скат при самой низкой посадке (0,42 м), не пролезть
      const lo = -(L.d.W / 2 + L.d.utilDepth * (1 - (0.42 + 0.14) / L.d.kH))
      p.x = Math.max(lo, Math.min(-L.d.W / 2 + 0.3, p.x))
    } else {
      const [xlo, xhi] = xRange(L.d, eye.current, p.z)
      p.x = Math.max(xlo, Math.min(xhi, p.x))
    }
    // дверь в подсобку: проходима, если открыта и мы пригнулись (или уже внутри)
    const gate = L.utility && L.hatchOpen && (crouch || pos.current.x < -L.d.W / 2 + 0.02)
    pushOut(p, gate ? L.all : L.allHatch, crouch || inU ? R_CROUCH : R)
    pos.current = p

    const v = vel.current.length()
    phase.current += dt * v * 5.2

    /* --- ближайшая дверь --- */
    const lx = -sy
    const lz = -cy
    let best = null
    let bd = Infinity
    for (const dr of L.doors) {
      const dx = dr.x - p.x
      const dz = dr.z - p.z
      const dist = Math.hypot(dx, dz)
      if (dist < (dr.reach || REACH) && dist < bd && (dist < 0.7 || (dx * lx + dz * lz) / (dist || 1) > 0.15)) {
        best = dr
        bd = dist
      }
    }
    const key = best ? best.id + (best.open ? ':o' : ':c') : null
    if (key !== nearKey.current) {
      nearKey.current = key
      L.onNear(best)
    }
    nearId.current = best ? best.id : null

    camera.position.set(p.x, eye.current + (v > 0.1 ? Math.sin(phase.current) * 0.012 : 0), p.z)
    camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ')
  })

  return null
}
