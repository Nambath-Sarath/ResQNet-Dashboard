'use client'

/**
 * Audible alert engine using the Web Audio API.
 *
 * Generates distinct beep patterns for different event types so operators
 * can recognize the severity without looking at the screen (spec §15:
 * "Keep primary incident actions easy to find and large enough to operate
 * under stress" — audible cues help operators who may be on another tab
 * or focused on a different part of the dashboard).
 *
 * Patterns:
 *   - critical_new:     3 short high beeps (new CRITICAL incident)
 *   - displacement:     2 long low beeps (node moved beyond deployment ref)
 *   - offline:          1 long descending tone (gateway unreachable)
 *   - resolve:          2 short pleasant tones (incident resolved)
 *   - message:          1 short mid tone (new broadcast message)
 */

let audioCtx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    } catch {
      return null
    }
  }
  // Resume if suspended (browsers suspend until user gesture)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

type Tone = {
  freq: number
  duration: number
  delay: number // ms before this tone starts
  type?: OscillatorType
  volume?: number
}

const PATTERNS: Record<string, Tone[]> = {
  critical_new: [
    { freq: 880, duration: 0.15, delay: 0, type: 'square', volume: 0.3 },
    { freq: 880, duration: 0.15, delay: 200, type: 'square', volume: 0.3 },
    { freq: 1100, duration: 0.25, delay: 400, type: 'square', volume: 0.35 },
  ],
  displacement: [
    { freq: 220, duration: 0.5, delay: 0, type: 'sawtooth', volume: 0.3 },
    { freq: 180, duration: 0.6, delay: 600, type: 'sawtooth', volume: 0.3 },
  ],
  offline: [
    { freq: 440, duration: 0.3, delay: 0, type: 'sine', volume: 0.25 },
    { freq: 330, duration: 0.3, delay: 300, type: 'sine', volume: 0.25 },
    { freq: 220, duration: 0.5, delay: 600, type: 'sine', volume: 0.25 },
  ],
  resolve: [
    { freq: 660, duration: 0.15, delay: 0, type: 'sine', volume: 0.2 },
    { freq: 880, duration: 0.2, delay: 180, type: 'sine', volume: 0.2 },
  ],
  message: [
    { freq: 550, duration: 0.12, delay: 0, type: 'triangle', volume: 0.15 },
  ],
}

/**
 * Play a named alert pattern. No-op if the AudioContext can't be created
 * or the user hasn't interacted with the page yet (browser autoplay policy).
 */
export function playAlert(pattern: keyof typeof PATTERNS | string): void {
  const ctx = getCtx()
  if (!ctx) return
  const tones = PATTERNS[pattern]
  if (!tones) return

  for (const tone of tones) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = tone.type ?? 'sine'
    osc.frequency.value = tone.freq
    gain.gain.value = 0
    osc.connect(gain)
    gain.connect(ctx.destination)
    const startAt = ctx.currentTime + tone.delay / 1000
    const endAt = startAt + tone.duration
    // Envelope: quick attack, gentle decay
    gain.gain.setValueAtTime(0, startAt)
    gain.gain.linearRampToValueAtTime(tone.volume ?? 0.2, startAt + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, endAt)
    osc.start(startAt)
    osc.stop(endAt)
  }
}

/**
 * Test a single alert pattern (used by the settings UI).
 */
export function testAlert(pattern: string): void {
  playAlert(pattern)
}

/**
 * Unlock audio after a user gesture (call on first click/keydown).
 * Browsers block audio until the user has interacted with the page.
 */
export function unlockAudio(): void {
  getCtx()
}
