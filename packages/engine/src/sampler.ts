/**
 * Amostragem por timestamp: para cada instante pedido devolve o último frame
 * da fonte com timestamp ≤ t. Isso corrige o frame rate variável das gravações
 * de celular sem depender da contagem de frames.
 */

export interface TimedSample {
  readonly timestamp: number
  close(): void
}

export class TimestampSampler<S extends TimedSample> {
  private current: S | null = null
  private next: S | null = null
  private done = false
  private lastT = -Infinity

  /**
   * @param source gerador de frames em ordem de apresentação
   * @param base timestamp do primeiro frame (vira o tempo local zero)
   */
  constructor(
    private readonly source: AsyncIterator<S>,
    private readonly base = 0,
  ) {}

  /** Frame para o tempo local `t`. Os pedidos precisam ser não decrescentes. */
  async at(t: number): Promise<S | null> {
    if (t < this.lastT) throw new Error('TimestampSampler: tempos precisam ser não decrescentes')
    this.lastT = t
    const target = this.base + t + 1e-6

    if (!this.current) this.current = await this.pull()
    if (!this.next) this.next = await this.pull()
    while (this.next && this.next.timestamp <= target) {
      // Fecha o frame anterior na hora: VideoFrame retido é a principal causa de vazamento de memória.
      this.current?.close()
      this.current = this.next
      this.next = await this.pull()
    }
    return this.current
  }

  close(): void {
    this.current?.close()
    this.next?.close()
    this.current = this.next = null
    if (!this.done) {
      this.done = true
      void this.source.return?.()
    }
  }

  private async pull(): Promise<S | null> {
    if (this.done) return null
    const r = await this.source.next()
    if (r.done) {
      this.done = true
      return null
    }
    return r.value
  }
}
