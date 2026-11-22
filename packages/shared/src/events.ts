export const ClientEvents = {
  RoomCreate: 'room:create',
  RoomJoin: 'room:join',
  RoomLeave: 'room:leave',
  PresenceUpdate: 'presence:update',
  WebRtcOffer: 'webrtc:offer',
  WebRtcAnswer: 'webrtc:answer',
  WebRtcIceCandidate: 'webrtc:ice-candidate',
  CodeRun: 'code:run',
  CodeStop: 'code:stop',
  CodeInput: 'code:input',
  CodeClear: 'code:clear',
  ChatSend: 'chat:send',
  ChatTyping: 'chat:typing',
} as const

export const ServerEvents = {
  RoomState: 'room:state',
  ParticipantJoined: 'participant:joined',
  ParticipantLeft: 'participant:left',
  PresenceUpdated: 'presence:updated',
  RoomExpired: 'room:expired',
  CodeStarted: 'code:started',
  CodeOutput: 'code:output',
  CodeFinished: 'code:finished',
  CodeState: 'code:state',
  CodeCleared: 'code:cleared',
  ChatMessage: 'chat:message',
  ChatState: 'chat:state',
  ChatTyping: 'chat:typing',
} as const

export const YJS_PATH_PREFIX = '/yjs'
export const CODE_TEXT_KEY = 'code'
export const META_MAP_KEY = 'meta'
export const LANGUAGE_META_KEY = 'language'
export const FILES_MAP_KEY = 'files'
export const NOTES_KEY = 'notes'
export const MAIN_FILE_ID = 'main'
