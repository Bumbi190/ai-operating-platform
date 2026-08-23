'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ATLAS_ORB_VISUAL_PARAMETERS,
  type AtlasOrbCompletionEvent,
  type AtlasOrbState,
} from '@/lib/atlas/orb-state'
import {
  ATLAS_ORB_DPR_CAP,
  resolveAtlasOrbQuality,
  type AtlasOrbQualityTier,
} from '@/lib/atlas/orb-quality'
import styles from './AtlasHomeVNext.module.css'

interface Particle {
  angle: number
  orbit: number
  speed: number
  size: number
  depth: number
  phase: number
}

interface AtlasOrbCanvasProps {
  state: AtlasOrbState
  audioLevel: number
  completionEvent: AtlasOrbCompletionEvent | null
  onFailure: () => void
}

function seededParticles(count: number): Particle[] {
  let seed = 0x6f6d6e69
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0xffffffff
  }
  return Array.from({ length: count }, () => ({
    angle: random() * Math.PI * 2,
    orbit: 0.28 + random() * 0.7,
    speed: 0.34 + random() * 0.9,
    size: 0.6 + random() * 1.8,
    depth: 0.36 + random() * 0.64,
    phase: random() * Math.PI * 2,
  }))
}

function browserQuality(): AtlasOrbQualityTier {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  const testCanvas = document.createElement('canvas')
  return resolveAtlasOrbQuality({
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    canvasSupported: !!testCanvas.getContext('2d'),
    viewportWidth: window.innerWidth,
    devicePixelRatio: window.devicePixelRatio || 1,
    hardwareConcurrency: navigator.hardwareConcurrency,
    saveData: connection?.saveData,
  })
}

export function AtlasOrbCanvas({ state, audioLevel, completionEvent, onFailure }: AtlasOrbCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stateRef = useRef(state)
  const audioLevelRef = useRef(audioLevel)
  const completionStartedRef = useRef<number | null>(null)
  const particlesRef = useRef(seededParticles(48))
  const [quality, setQuality] = useState<AtlasOrbQualityTier>('fallback')

  stateRef.current = state
  audioLevelRef.current = audioLevel

  useEffect(() => {
    if (completionEvent) completionStartedRef.current = performance.now()
  }, [completionEvent])

  useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateQuality = () => setQuality(browserQuality())
    updateQuality()
    window.addEventListener('resize', updateQuality, { passive: true })
    motionQuery.addEventListener('change', updateQuality)
    return () => {
      window.removeEventListener('resize', updateQuality)
      motionQuery.removeEventListener('change', updateQuality)
    }
  }, [])

  useEffect(() => {
    if (quality === 'fallback' || quality === 'reduced') return
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) {
      onFailure()
      return
    }

    let width = 0
    let height = 0
    let frame = 0
    let running = false
    let intersecting = true
    let previousTime = performance.now()

    const resize = () => {
      const bounds = canvas.getBoundingClientRect()
      width = Math.max(1, bounds.width)
      height = Math.max(1, bounds.height)
      const dpr = Math.min(window.devicePixelRatio || 1, ATLAS_ORB_DPR_CAP[quality])
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const draw = (now: number) => {
      if (!running) return
      const delta = Math.min(34, now - previousTime)
      previousTime = now
      context.clearRect(0, 0, width, height)

      const visual = ATLAS_ORB_VISUAL_PARAMETERS[stateRef.current]
      const cx = width / 2
      const cy = height / 2
      const radius = Math.min(width, height) * 0.31
      const audio = stateRef.current === 'speaking' ? audioLevelRef.current : 0
      const time = now / 1000
      const particleScale = quality === 'balanced' ? 0.62 : 1
      const particleCount = Math.max(6, Math.round(visual.particleBudget * particleScale))

      const aura = context.createRadialGradient(cx, cy, radius * 0.18, cx, cy, radius * (1.5 + audio * 0.18))
      aura.addColorStop(0, `rgba(91, 240, 255, ${0.07 + visual.energy * 0.05 + audio * 0.1})`)
      aura.addColorStop(0.46, `rgba(25, 153, 224, ${0.045 + visual.blue * 0.03})`)
      aura.addColorStop(0.75, `rgba(102, 78, 255, ${0.018 + visual.violet * 0.022})`)
      aura.addColorStop(1, 'rgba(0, 0, 0, 0)')
      context.fillStyle = aura
      context.fillRect(0, 0, width, height)

      context.save()
      context.translate(cx, cy)
      context.rotate(-0.16)
      for (let ring = 0; ring < 4; ring += 1) {
        const ringRadius = radius * (1.08 + ring * 0.18)
        context.beginPath()
        context.ellipse(0, 0, ringRadius, ringRadius * (0.48 + ring * 0.06), 0, 0, Math.PI * 2)
        context.strokeStyle = `rgba(${ring % 2 ? '99, 102, 241' : '34, 211, 238'}, ${0.055 + visual.energy * 0.025 - ring * 0.008})`
        context.lineWidth = 0.75
        context.stroke()
      }
      context.restore()

      const particles = particlesRef.current
      for (let index = 0; index < particleCount; index += 1) {
        const particle = particles[index]
        particle.angle += delta * 0.00022 * particle.speed * visual.orbitSpeed
        const wobble = Math.sin(time * 0.7 + particle.phase) * radius * 0.04
        const orbit = radius * (0.74 + particle.orbit * 0.85) + wobble
        const x = cx + Math.cos(particle.angle) * orbit
        const y = cy + Math.sin(particle.angle) * orbit * (0.58 + particle.depth * 0.28)
        const alpha = (0.12 + particle.depth * 0.42) * (0.62 + visual.energy * 0.38)
        context.beginPath()
        context.arc(x, y, particle.size * (0.78 + audio * 0.28), 0, Math.PI * 2)
        context.fillStyle = index % 5 === 0
          ? `rgba(150, 122, 255, ${alpha * visual.violet})`
          : `rgba(103, 232, 249, ${alpha * visual.cyan})`
        context.shadowBlur = 7 + visual.energy * 5
        context.shadowColor = index % 5 === 0 ? '#7457ff' : '#22d3ee'
        context.fill()
      }
      context.shadowBlur = 0

      if (stateRef.current === 'listening') {
        const sweep = (time * 0.42) % 1
        context.beginPath()
        context.arc(cx, cy, radius * (0.74 + sweep * 0.52), 0, Math.PI * 2)
        context.strokeStyle = `rgba(94, 234, 212, ${(1 - sweep) * 0.22})`
        context.lineWidth = 1
        context.stroke()
      }

      const completionStarted = completionStartedRef.current
      if (completionStarted !== null) {
        const progress = (now - completionStarted) / 1150
        if (progress < 1) {
          const eased = 1 - Math.pow(1 - progress, 3)
          context.beginPath()
          context.arc(cx, cy, radius * (0.9 + eased * 0.78), 0, Math.PI * 2)
          context.strokeStyle = `rgba(104, 255, 214, ${(1 - progress) * 0.62})`
          context.lineWidth = 1.4
          context.stroke()
        } else {
          completionStartedRef.current = null
        }
      }

      frame = requestAnimationFrame(draw)
    }

    const syncLifecycle = () => {
      const shouldRun = !document.hidden && intersecting
      if (shouldRun && !running) {
        running = true
        previousTime = performance.now()
        frame = requestAnimationFrame(draw)
      } else if (!shouldRun && running) {
        running = false
        cancelAnimationFrame(frame)
      }
    }

    const resizeObserver = new ResizeObserver(resize)
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting
      syncLifecycle()
    }, { rootMargin: '80px' })
    const visibilityHandler = () => syncLifecycle()

    resize()
    resizeObserver.observe(canvas)
    intersectionObserver.observe(canvas)
    document.addEventListener('visibilitychange', visibilityHandler)
    syncLifecycle()

    return () => {
      running = false
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      document.removeEventListener('visibilitychange', visibilityHandler)
      context.clearRect(0, 0, width, height)
    }
  }, [onFailure, quality])

  if (quality === 'fallback' || quality === 'reduced') return null

  return (
    <canvas
      ref={canvasRef}
      className={styles.orbCanvas}
      data-quality={quality}
      aria-hidden="true"
    />
  )
}
