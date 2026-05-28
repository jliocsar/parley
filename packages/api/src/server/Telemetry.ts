import * as NodeSdk from '@effect/opentelemetry/NodeSdk'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import { ServerConfig } from '../config'

export const TelemetryLive = Layer.unwrapEffect(
  Effect.gen(function*() {
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
