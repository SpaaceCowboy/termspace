export interface User {
  id: string
  username: string
  createdAt: number
}

export interface LoginInput {
  username: string
  password: string
  totp: string
}

export interface WsTicket {
  ticket: string
  expiresAt: number
}
