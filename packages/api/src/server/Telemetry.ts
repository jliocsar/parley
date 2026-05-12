import { NodeSdk } from '@effect/opentelemetry'
import { Effect, Layer, Option } from 'effect'

import { ServerConfig } from '../config'

export const TelemetryLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const config = yield* ServerConfig

    if (Option.isNone(config.otlpEndpoint)) {
      return Layer.empty
    }

    return NodeSdk.layer(() => ({
      resource: { serviceName: 'parley-server' },
      spanProcessor: [],
    }))
  }),
)
