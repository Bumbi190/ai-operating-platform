export interface BoundedQueueResult<T> {
  status: 'fulfilled' | 'failed' | 'cancelled'
  value?: T
  error?: unknown
}

interface PendingTask<T> {
  run(signal: AbortSignal): Promise<T>
  resolve(result: BoundedQueueResult<T>): void
}

/** A small FIFO scheduler. It bounds provider fan-out and makes cancellation explicit. */
export class BoundedTaskQueue<T> {
  private readonly pending: PendingTask<T>[] = []
  private readonly active = new Set<AbortController>()
  private cancelled = false

  constructor(private readonly concurrency = 2) {
    if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('concurrency must be >= 1')
  }

  enqueue(run: (signal: AbortSignal) => Promise<T>): Promise<BoundedQueueResult<T>> {
    if (this.cancelled) return Promise.resolve({ status: 'cancelled' })
    return new Promise(resolve => {
      this.pending.push({ run, resolve })
      this.pump()
    })
  }

  cancel(): void {
    if (this.cancelled) return
    this.cancelled = true
    for (const controller of this.active) controller.abort()
    for (const task of this.pending.splice(0)) task.resolve({ status: 'cancelled' })
  }

  private pump(): void {
    while (!this.cancelled && this.active.size < this.concurrency && this.pending.length) {
      const task = this.pending.shift()!
      const controller = new AbortController()
      this.active.add(controller)
      void task.run(controller.signal).then(
        value => task.resolve(this.cancelled ? { status: 'cancelled' } : { status: 'fulfilled', value }),
        error => task.resolve(
          this.cancelled || controller.signal.aborted
            ? { status: 'cancelled' }
            : { status: 'failed', error },
        ),
      ).finally(() => {
        this.active.delete(controller)
        this.pump()
      })
    }
  }
}
