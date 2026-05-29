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

    // An OTLP endpoint is configured, but no exporter dependency is wired yet. Warn
    // rather than installing a NodeSdk with an empty spanProcessor — that looks live
    // but silently exports nothing, which is worse than an honest no-op.
    yield* Effect.logWarning(
      'OTEL_EXPORTER_OTLP_ENDPOINT is set but trace export is not yet implemented',
    )

    return Layer.empty
  }),
)
