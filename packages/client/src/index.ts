export type { HelloResult } from './Handshake'
export { CLIENT_VERSION, Handshake } from './Handshake'
export type { ParleyEvent } from './ParleyClient'
export { HandshakeFailedError, ParleyClient } from './ParleyClient'
export type { WsConfig } from './WsConnection'
export { WsConnection } from './WsConnection'

import { Layer } from 'effect'

import { Handshake } from './Handshake'
import { ParleyClient } from './ParleyClient'
import { WsConnection } from './WsConnection'

export const ClientLive = ParleyClient.Default.pipe(
  Layer.provideMerge(Handshake.Default),
  Layer.provideMerge(WsConnection.Default),
)
