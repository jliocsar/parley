import { Layer } from 'effect'
import { TelemetryLive } from './server/Telemetry'
import { WsServer } from './server/WsServer'
import { CryptoService } from './services/Crypto'
import { Db } from './services/Db'
import { FanoutService } from './services/FanoutService'
import { MembershipRegistry } from './services/MembershipRegistry'
import { NicknameGenerator } from './services/NicknameGenerator'
import { RateLimiter } from './services/RateLimiter'
import { RoomRepo } from './services/RoomRepo'
import { SessionRegistry } from './services/SessionRegistry'
import { TokenRepo } from './services/TokenRepo'
import { TokenService } from './services/TokenService'

export const InfrastructureLive = Layer.mergeAll(Db.Default, CryptoService.Default, TelemetryLive)

export const RepoLive = Layer.mergeAll(RoomRepo.Default, TokenRepo.Default)

export const DomainLive = Layer.mergeAll(
  TokenService.Default,
  SessionRegistry.Default,
  MembershipRegistry.Default,
  FanoutService.Default,
  RateLimiter.Default,
  NicknameGenerator.Default,
)

export const ServerLive = WsServer.Default.pipe(
  Layer.provideMerge(DomainLive),
  Layer.provideMerge(RepoLive),
  Layer.provideMerge(InfrastructureLive),
)

export const AdminLive = Layer.mergeAll(TokenService.Default, RoomRepo.Default).pipe(
  Layer.provideMerge(RepoLive),
  Layer.provideMerge(InfrastructureLive),
)
