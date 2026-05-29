// low-level Server needed for setRequestHandler; McpServer migration is a separate effort
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { MCP_SERVER_INSTRUCTIONS } from '@parley/api/tools'
import { ParleyClient, type ParleyEvent } from '@parley/client'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as JSONSchema from 'effect/JSONSchema'
import * as Layer from 'effect/Layer'
import * as Runtime from 'effect/Runtime'
import * as Schema from 'effect/Schema'
import * as Stream from 'effect/Stream'
import { ChannelDelivery } from './ChannelDelivery'
import { type ToolName, TOOLS } from './tools/registry'

// MCP requires every tool's inputSchema to be a JSON-Schema object with `type: "object"`.
// `JSONSchema.make(Schema.Struct({}))` emits `{ anyOf: [{type:'object'},{type:'array'}] }` which
// MCP rejects. Normalise here so empty-arg tools get an explicit object shape.
// Accepts any schema — JSONSchema.make only reads the schema's AST, so the
// heterogeneous union of per-tool arg schemas from the registry is fine here.
const toInputSchema = (schema: Schema.Schema.AnyNoContext) => {
  const json = JSONSchema.make(schema) as unknown as Record<string, unknown>

  // The cast is sound because MCP only inspects `type` on the inputSchema, and
  // we only assert the shape after confirming `type === 'object'` — the decoded
  // `properties`/`required` JSON-Schema fields ride along untouched on `json`.
  return json.type === 'object'
    ? (json as { type: 'object' })
    : { type: 'object' as const, properties: {}, additionalProperties: false }
}

// Generated from the API registry — adding a tool there is the only edit needed.
const inputSchemas = Object.fromEntries(
  (Object.keys(TOOLS) as ToolName[]).map((key) => [key, toInputSchema(TOOLS[key].args)]),
) as Record<ToolName, ReturnType<typeof toInputSchema>>

const isToolName = (name: string): name is ToolName => name in TOOLS

const textContent = (value: unknown, isError = false) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  ...(isError ? { isError: true } : {}),
})

const exitToContent = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.match(exit, {
    onSuccess: (value) => textContent(value),
    onFailure: (cause) =>
      textContent(Cause.isFailType(cause) ? cause.error : { message: Cause.pretty(cause) }, true),
  })

export class McpServer extends Effect.Service<McpServer>()('McpServer', {
  accessors: true,
  dependencies: [ChannelDelivery.Default, ParleyClient.Default],
  scoped: Effect.gen(function*() {
    const channels = yield* ChannelDelivery
    const client = yield* ParleyClient
    const runtime = yield* Effect.runtime()

    // Invariant: a room.message is acked ONLY after channel delivery succeeds —
    // the ack is sequenced after deliverMessage via zipRight, so a delivery
    // failure short-circuits before the ack runs. system.error carries no seq
    // and is never acked.
    const deliverInbound = (event: ParleyEvent) => {
      switch (event._tag) {
        case 'room.message': {
          return channels.deliverMessage(event).pipe(
            Effect.zipRight(client.ack(event.room, event.seq)),
          )
        }

        case 'system.error': {
          return channels.deliverSystemError(event)
        }
      }
    }

    yield* Effect.forkScoped(Stream.runForEach(client.incoming, deliverInbound))

    const makeHandler = <A, AI, R, RI>(
      schema: { args: Schema.Schema<A, AI>; result: Schema.Schema<R, RI> },
      run: (args: A) => Effect.Effect<R, unknown>,
    ) => {
      const decode = Schema.decodeUnknown(schema.args)
      const encode = Schema.encodeSync(schema.result)
      return (args: Record<string, unknown>): Effect.Effect<unknown, unknown> =>
        decode(args).pipe(Effect.flatMap(run), Effect.map(encode))
    }

    const handlers: Record<
      ToolName,
      (args: Record<string, unknown>) => Effect.Effect<unknown, unknown>
    > = {
      join_room: makeHandler(TOOLS.join_room, (a) => client.joinRoom(a.room, a.nickname)),
      leave_room: makeHandler(TOOLS.leave_room, (a) => client.leaveRoom(a.room)),
      list_rooms: makeHandler(TOOLS.list_rooms, () => client.listRooms()),
      send_message: makeHandler(TOOLS.send_message, (a) => client.sendMessage(a.room, a.body)),
      who_is_here: makeHandler(TOOLS.who_is_here, (a) => client.whoIsHere(a.room)),
    }

    // eslint-disable-next-line @typescript-eslint/no-deprecated -- see import note
    const server = new Server(
      { name: 'parley', version: '0.0.0' },
      {
        capabilities: {
          tools: {},
          experimental: { 'claude/channel': {} },
        },
        instructions: MCP_SERVER_INSTRUCTIONS,
      },
    )

    yield* channels.register(server)

    // eslint-disable-next-line @typescript-eslint/require-await -- MCP SDK setRequestHandler expects an async handler signature
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: (Object.keys(TOOLS) as ToolName[]).map((key) => {
        const t = TOOLS[key]
        return {
          name: t.name,
          description: t.description,
          inputSchema: inputSchemas[key],
        }
      }),
    }))

    server.setRequestHandler(CallToolRequestSchema, async (req) => {
      const name = req.params.name

      if (!isToolName(name)) {
        return textContent({ code: 'UnknownTool', tool: name }, true)
      }

      const args = req.params.arguments ?? {}
      const exit = await Runtime.runPromiseExit(runtime)(handlers[name](args))
      return exitToContent(exit)
    })

    const transport = new StdioServerTransport()

    yield* Effect.acquireRelease(
      Effect.promise(() => server.connect(transport)),
      () => Effect.promise(() => server.close()),
    )

    return { server }
  }),
}) {}

export const McpLive = McpServer.Default.pipe(
  Layer.provideMerge(ChannelDelivery.Default),
  Layer.provideMerge(ParleyClient.Default),
)
