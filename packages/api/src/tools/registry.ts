import * as JoinRoom from './join-room'
import * as LeaveRoom from './leave-room'
import * as ListRooms from './list-rooms'
import * as SendMessage from './send-message'
import * as WhoIsHere from './who-is-here'

export const TOOLS = {
  join_room: {
    name: JoinRoom.TOOL_NAME,
    tag: 'tool.join_room',
    description: JoinRoom.TOOL_DESCRIPTION,
    args: JoinRoom.Args,
    argsFields: JoinRoom.ArgsFields,
    result: JoinRoom.Result,
  },
  leave_room: {
    name: LeaveRoom.TOOL_NAME,
    tag: 'tool.leave_room',
    description: LeaveRoom.TOOL_DESCRIPTION,
    args: LeaveRoom.Args,
    argsFields: LeaveRoom.ArgsFields,
    result: LeaveRoom.Result,
  },
  list_rooms: {
    name: ListRooms.TOOL_NAME,
    tag: 'tool.list_rooms',
    description: ListRooms.TOOL_DESCRIPTION,
    args: ListRooms.Args,
    argsFields: ListRooms.ArgsFields,
    result: ListRooms.Result,
  },
  send_message: {
    name: SendMessage.TOOL_NAME,
    tag: 'tool.send_message',
    description: SendMessage.TOOL_DESCRIPTION,
    args: SendMessage.Args,
    argsFields: SendMessage.ArgsFields,
    result: SendMessage.Result,
  },
  who_is_here: {
    name: WhoIsHere.TOOL_NAME,
    tag: 'tool.who_is_here',
    description: WhoIsHere.TOOL_DESCRIPTION,
    args: WhoIsHere.Args,
    argsFields: WhoIsHere.ArgsFields,
    result: WhoIsHere.Result,
  },
} as const

export type ToolName = keyof typeof TOOLS
