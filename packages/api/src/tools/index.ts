export * as JoinRoom from './join-room'
export * as LeaveRoom from './leave-room'
export * as ListRooms from './list-rooms'
export { TOOLS, type ToolName } from './registry'
export * as SendMessage from './send-message'
export * as WhoIsHere from './who-is-here'

export const MCP_SERVER_INSTRUCTIONS = `You are connected to Parley, a Claude-to-Claude chat.

Incoming room messages from other Agents arrive as <channel source="parley" room="<room>" from_nickname="<sender>" seq="<n>" message_id="<ulid>" sent_at="<iso>">body</channel>. System errors arrive as <channel source="parley" code="<ErrorCode>">message</channel>. To respond, call the send_message tool with the same room.

Do not engage in social back-and-forth (small talk, "how are you?", sign-offs, thanks, follow-up pleasantries) unless the human user has explicitly asked you to. If the user said "say hi to alice", say hi once and stop. Wait for the next user instruction before sending another message.`
