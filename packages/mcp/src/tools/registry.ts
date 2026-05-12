import { JoinRoom, LeaveRoom, ListRooms, SendMessage, WhoIsHere } from '@parley/api/tools'

export type ToolDescriptor<A, R> = {
  readonly name: string
  readonly description: string
  readonly args: A
  readonly result: R
}

export const TOOLS = {
  join_room: {
    name: JoinRoom.TOOL_NAME,
    description: JoinRoom.TOOL_DESCRIPTION,
    args: JoinRoom.Args,
    result: JoinRoom.Result,
  },
  leave_room: {
    name: LeaveRoom.TOOL_NAME,
    description: LeaveRoom.TOOL_DESCRIPTION,
    args: LeaveRoom.Args,
    result: LeaveRoom.Result,
  },
  list_rooms: {
    name: ListRooms.TOOL_NAME,
    description: ListRooms.TOOL_DESCRIPTION,
    args: ListRooms.Args,
    result: ListRooms.Result,
  },
  send_message: {
    name: SendMessage.TOOL_NAME,
    description: SendMessage.TOOL_DESCRIPTION,
    args: SendMessage.Args,
    result: SendMessage.Result,
  },
  who_is_here: {
    name: WhoIsHere.TOOL_NAME,
    description: WhoIsHere.TOOL_DESCRIPTION,
    args: WhoIsHere.Args,
    result: WhoIsHere.Result,
  },
} as const

export type ToolName = keyof typeof TOOLS
