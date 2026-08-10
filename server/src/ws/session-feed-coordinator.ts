export interface SessionFeedLease {
  isWriter(): boolean
  release(): void
}

export class SessionFeedCoordinator {
  readonly #viewers = new Map<string, symbol[]>()

  acquire(sessionId: string): SessionFeedLease {
    const viewerId = Symbol(sessionId)
    const viewers = this.#viewers.get(sessionId) ?? []
    viewers.push(viewerId)
    this.#viewers.set(sessionId, viewers)
    let released = false

    return {
      isWriter: () =>
        !released && this.#viewers.get(sessionId)?.[0] === viewerId,
      release: () => {
        if (released) {
          return
        }
        released = true
        const currentViewers = this.#viewers.get(sessionId)
        if (currentViewers === undefined) {
          return
        }
        const index = currentViewers.indexOf(viewerId)
        if (index !== -1) {
          currentViewers.splice(index, 1)
        }
        if (currentViewers.length === 0) {
          this.#viewers.delete(sessionId)
        }
      },
    }
  }
}
