import type { IncomingMessage, Server as HttpServer } from 'node:http'
import type { Duplex } from 'node:stream'

import type { ServerFrame } from '@termspace/contracts'
import WebSocket, { WebSocketServer, type RawData } from 'ws'

import { encodeServerFrame } from './frame-codec.js'
import type { TicketStore } from './ticket-store.js'
import { authorizeWebSocketUpgrade } from './upgrade-auth.js'

interface WebSocketConnectionPort {
  close(): void
  handleText(payload: string): Promise<void>
}

interface GatewayTransport {
  sendBinary(data: Buffer): void
  sendFrame(frame: ServerFrame): void
}

interface WebSocketGatewayOptions {
  readonly allowedOrigin: string
  readonly createConnection: (
    transport: GatewayTransport,
    userId: string,
  ) => WebSocketConnectionPort
  readonly onError: (error: unknown) => void
  readonly tickets: TicketStore
}

export class WebSocketGatewayServer {
  readonly #httpServer: HttpServer
  readonly #options: WebSocketGatewayOptions
  readonly #webSocketServer = new WebSocketServer({
    clientTracking: false,
    maxPayload: 128 * 1_024,
    noServer: true,
  })
  #started = false

  constructor(httpServer: HttpServer, options: WebSocketGatewayOptions) {
    this.#httpServer = httpServer
    this.#options = options
  }

  start(): void {
    if (this.#started) {
      return
    }
    this.#started = true
    this.#httpServer.on('upgrade', this.#handleUpgrade)
  }

  close(): void {
    if (!this.#started) {
      return
    }
    this.#started = false
    this.#httpServer.off('upgrade', this.#handleUpgrade)
    this.#webSocketServer.close()
  }

  readonly #handleUpgrade = (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): void => {
    const authorization = authorizeWebSocketUpgrade(
      { origin: request.headers.origin, url: request.url },
      this.#options.allowedOrigin,
      this.#options.tickets,
    )
    if (!authorization.ok) {
      const statusCode =
        authorization.reason === 'not_found'
          ? 404
          : authorization.reason === 'origin_rejected'
            ? 403
            : 401
      rejectUpgrade(socket, statusCode)
      return
    }

    this.#webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      const transport = createTransport(webSocket)
      const connection = this.#options.createConnection(
        transport,
        authorization.userId,
      )
      let queue = Promise.resolve()

      webSocket.on('message', (data, isBinary) => {
        if (isBinary) {
          transport.sendFrame({
            t: 'error',
            sid: null,
            code: 'validation_failed',
            message: 'Client frames must be JSON text.',
          })
          return
        }
        const payload = rawDataToString(data)
        queue = queue
          .then(() => connection.handleText(payload))
          .catch(this.#options.onError)
      })
      webSocket.on('close', () => connection.close())
      webSocket.on('error', this.#options.onError)
    })
  }
}

function createTransport(webSocket: WebSocket): GatewayTransport {
  return {
    sendBinary: (data) => {
      if (webSocket.readyState === WebSocket.OPEN) {
        webSocket.send(data, { binary: true })
      }
    },
    sendFrame: (frame) => {
      if (webSocket.readyState === WebSocket.OPEN) {
        webSocket.send(encodeServerFrame(frame))
      }
    },
  }
}

function rawDataToString(data: RawData): string {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf8')
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8')
  }
  return data.toString('utf8')
}

function rejectUpgrade(socket: Duplex, statusCode: 401 | 403 | 404): void {
  const status =
    statusCode === 404
      ? 'Not Found'
      : statusCode === 403
        ? 'Forbidden'
        : 'Unauthorized'
  socket.end(
    `HTTP/1.1 ${statusCode} ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
  )
}
