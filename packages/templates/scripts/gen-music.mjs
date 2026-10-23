// Gera as trilhas de exemplo (domínio público, feitas aqui):
// - trilha-leve.wav: loop de 12 s com acordes dedilhados (C – Am – F – G, 80 bpm)
// - trilha-animada.wav: loop de 8 s mais rápido, com bumbo e chimbal (G – D – Em – C, 120 bpm)
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const sampleRate = 22050
const midi = (m) => 440 * 2 ** ((m - 69) / 12)

function render({ seconds, chords, chordSeconds, step, notesPerChord, decay, gain, drums }) {
  const n = sampleRate * seconds
  const out = new Float32Array(n)
  const add = (idx, v) => (out[idx % n] += v) // dá a volta: loop sem emenda
  for (let c = 0; c < chords.length; c++) {
    const base = c * chordSeconds
    for (let k = 0; k < notesPerChord; k++) {
      const f = midi(chords[c][k % 4])
      const start = Math.round((base + k * step) * sampleRate)
      for (let i = 0; i < sampleRate * 2.5; i++) {
        const t = i / sampleRate
        const env = Math.exp(-t * decay) * Math.min(1, t * 200)
        add(start + i, gain * env * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t)))
      }
    }
    // baixo
    const fb = midi(chords[c][0] - 24)
    for (let i = 0; i < sampleRate * chordSeconds; i++) {
      const t = i / sampleRate
      add(Math.round(base * sampleRate) + i, 0.18 * Math.sin(2 * Math.PI * fb * t) * Math.min(1, t * 20, (chordSeconds - t) * 20))
    }
  }
  if (drums) {
    const beat = 60 / drums.bpm
    let seed = 1
    const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
    for (let b = 0; b * beat < seconds; b++) {
      const start = Math.round(b * beat * sampleRate)
      // bumbo: seno com queda de afinação
      for (let i = 0; i < sampleRate * 0.25; i++) {
        const t = i / sampleRate
        add(start + i, 0.35 * Math.exp(-t * 18) * Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-t * 30)) * t))
      }
      // chimbal no contratempo
      const off = start + Math.round((beat / 2) * sampleRate)
      for (let i = 0; i < sampleRate * 0.05; i++) add(off + i, 0.06 * Math.exp((-i / sampleRate) * 90) * noise())
    }
  }
  return out
}

function writeWav(name, out) {
  const n = out.length
  const data = Buffer.alloc(44 + n * 2)
  data.write('RIFF', 0)
  data.writeUInt32LE(36 + n * 2, 4)
  data.write('WAVEfmt ', 8)
  data.writeUInt32LE(16, 16)
  data.writeUInt16LE(1, 20)
  data.writeUInt16LE(1, 22)
  data.writeUInt32LE(sampleRate, 24)
  data.writeUInt32LE(sampleRate * 2, 28)
  data.writeUInt16LE(2, 32)
  data.writeUInt16LE(16, 34)
  data.write('data', 36)
  data.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out[i])) * 32767), 44 + i * 2)
  writeFileSync(fileURLToPath(new URL(`../assets/${name}`, import.meta.url)), data)
  console.log(`assets/${name} gerado`)
}

writeWav(
  'trilha-leve.wav',
  render({
    seconds: 12,
    chords: [[60, 64, 67, 72], [57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67]],
    chordSeconds: 3,
    step: 0.375,
    notesPerChord: 8,
    decay: 3,
    gain: 0.12,
  }),
)
writeWav(
  'trilha-animada.wav',
  render({
    seconds: 8,
    chords: [[67, 71, 74, 79], [62, 66, 69, 74], [64, 67, 71, 76], [60, 64, 67, 72]],
    chordSeconds: 2,
    step: 0.25,
    notesPerChord: 8,
    decay: 5,
    gain: 0.1,
    drums: { bpm: 120 },
  }),
)
