// Gera assets/trilha-leve.wav: um loop de 12 s com acordes dedilhados (domínio público, feito aqui).
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const sampleRate = 22050
const seconds = 12
const n = sampleRate * seconds
const out = new Float32Array(n)
const midi = (m) => 440 * 2 ** ((m - 69) / 12)
// C – Am – F – G, 3 s cada, arpejos em colcheias a 80 bpm
const chords = [
  [60, 64, 67, 72],
  [57, 60, 64, 69],
  [53, 57, 60, 65],
  [55, 59, 62, 67],
]
const step = 0.375
for (let c = 0; c < chords.length; c++) {
  const base = c * 3
  for (let k = 0; k < 8; k++) {
    const note = chords[c][k % 4]
    const start = base + k * step
    const f = midi(note)
    for (let i = 0; i < sampleRate * 2.5; i++) {
      const t = i / sampleRate
      const idx = (Math.round(start * sampleRate) + i) % n // dá a volta: loop sem emenda
      const env = Math.exp(-t * 3) * Math.min(1, t * 200)
      out[idx] += 0.12 * env * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t))
    }
  }
  // baixo
  const f = midi(chords[c][0] - 24)
  for (let i = 0; i < sampleRate * 3; i++) {
    const t = i / sampleRate
    const idx = Math.round(base * sampleRate) + i
    out[idx] += 0.18 * Math.sin(2 * Math.PI * f * t) * Math.min(1, t * 20, (3 - t) * 20)
  }
}

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
writeFileSync(fileURLToPath(new URL('../assets/trilha-leve.wav', import.meta.url)), data)
console.log('assets/trilha-leve.wav gerado')
