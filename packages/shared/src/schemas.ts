import { z } from 'zod'
import { ERROR_CODES } from './errors'
import { DEFAULT_LANGUAGE_ID, LANGUAGES } from './languages'
import { DEFAULT_LIMITS, ROOM_ID_PATTERN } from './limits'

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a display name.')
  .max(DEFAULT_LIMITS.displayNameMax, 'Display names can be at most 32 characters.')
  .refine((value) => !/[\u0000-\u001F\u007F]/.test(value), 'Display names cannot include control characters.')

export const roomIdSchema = z.string().regex(ROOM_ID_PATTERN, 'Enter a valid room code.')

export const languageIdSchema = z.enum(
  LANGUAGES.map((language) => language.id) as [string, ...string[]],
)

export const lockWordSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .refine((value) => !/[\u0000-\u001F\u007F]/.test(value), 'Lock words cannot include control characters.')

export const createRoomSchema = z.object({
  displayName: displayNameSchema,
  lock: lockWordSchema.optional(),
}).strict()

export const joinRoomSchema = z.object({
  roomId: roomIdSchema,
  displayName: displayNameSchema,
  resumeParticipantId: z.string().uuid().optional(),
  lock: lockWordSchema.optional(),
}).strict()

export const presenceUpdateSchema = z.object({
  camera: z.boolean(),
  microphone: z.boolean(),
}).strict()

export const sessionDescriptionSchema = z.object({
  type: z.enum(['offer', 'answer']),
  sdp: z.string().min(1).max(DEFAULT_LIMITS.maxSignalBytes),
}).strict()

export const iceCandidateSchema = z.object({
  candidate: z.string().max(DEFAULT_LIMITS.maxSignalBytes),
  sdpMid: z.string().nullable().optional(),
  sdpMLineIndex: z.number().int().nonnegative().nullable().optional(),
  usernameFragment: z.string().max(256).nullable().optional(),
}).strict()

export const webRtcOfferSchema = z.object({
  to: z.string().uuid(),
  description: sessionDescriptionSchema.refine((description) => description.type === 'offer'),
}).strict()

export const webRtcAnswerSchema = z.object({
  to: z.string().uuid(),
  description: sessionDescriptionSchema.refine((description) => description.type === 'answer'),
}).strict()

export const webRtcIceSchema = z.object({
  to: z.string().uuid(),
  candidate: iceCandidateSchema,
}).strict()

export const errorCodeSchema = z.enum([
  ERROR_CODES.INVALID_PAYLOAD,
  ERROR_CODES.ROOM_NOT_FOUND,
  ERROR_CODES.ROOM_EXPIRED,
  ERROR_CODES.ROOM_FULL,
  ERROR_CODES.NOT_A_MEMBER,
  ERROR_CODES.RATE_LIMITED,
  ERROR_CODES.RUN_IN_PROGRESS,
  ERROR_CODES.NO_ACTIVE_RUN,
  ERROR_CODES.ROOM_LOCKED,
])

export const connectionSchema = z.enum(['connected', 'reconnecting'])

export const publicParticipantSchema = z.object({
  id: z.string().uuid(),
  displayName: displayNameSchema,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  joinedAt: z.number(),
  camera: z.boolean(),
  microphone: z.boolean(),
  connection: connectionSchema,
})

export const publicRoomSchema = z.object({
  id: roomIdSchema,
  createdAt: z.number(),
  expiresAt: z.number(),
  lastActivityAt: z.number(),
  locked: z.boolean(),
  participants: z.array(publicParticipantSchema),
})

export const iceServerSchema = z.object({
  urls: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  username: z.string().optional(),
  credential: z.string().optional(),
})

export const joinAckDataSchema = z.object({
  room: publicRoomSchema,
  participant: publicParticipantSchema,
  ticket: z.string().min(16),
  iceServers: z.array(iceServerSchema),
  resumed: z.boolean(),
})

export const ackSchema = z.union([
  z.object({ ok: z.literal(true), data: joinAckDataSchema }).strict(),
  z.object({ ok: z.literal(false), code: errorCodeSchema }).strict(),
])

export const simpleAckSchema = z.union([
  z.object({ ok: z.literal(true) }).strict(),
  z.object({ ok: z.literal(false), code: errorCodeSchema }).strict(),
])

export const participantJoinedSchema = z.object({
  participant: publicParticipantSchema,
  resumed: z.boolean(),
}).strict()

export const participantLeftSchema = z.object({
  participantId: z.string().uuid(),
}).strict()

export const presenceUpdatedSchema = z.object({
  participantId: z.string().uuid(),
  camera: z.boolean(),
  microphone: z.boolean(),
  connection: connectionSchema,
}).strict()

export const roomExpiredSchema = z.object({
  roomId: roomIdSchema,
}).strict()

export const codeRunStreamSchema = z.enum(['stdout', 'stderr', 'system', 'stdin'])

export const codeInputSchema = z.object({
  text: z.string().max(4096),
}).strict()

export const codeRunSchema = z.object({
  fileId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
}).strict()

export const codeClearedSchema = z.object({}).strict()

export const chatSendSchema = z.object({
  text: z.string().trim().min(1).max(500),
}).strict()

export const chatMessageSchema = z.object({
  id: z.string().uuid(),
  participantId: z.string().uuid(),
  displayName: displayNameSchema,
  text: z.string().min(1).max(500),
  sentAt: z.number().int(),
}).strict()

export const chatStateSchema = z.object({
  messages: z.array(chatMessageSchema).max(80),
}).strict()

export const chatTypingSchema = z.object({}).strict()

export const chatTypingNoticeSchema = z.object({
  participantId: z.string().uuid(),
  displayName: displayNameSchema,
}).strict()

export const codeStartedSchema = z.object({
  runId: z.string().uuid(),
  language: z.string().min(1).max(32),
  startedBy: displayNameSchema,
}).strict()

export const codeOutputSchema = z.object({
  runId: z.string().uuid(),
  stream: codeRunStreamSchema,
  text: z.string().max(8192),
}).strict()

export const codeFinishedSchema = z.object({
  runId: z.string().uuid(),
  exitCode: z.number().int().nullable(),
  timedOut: z.boolean(),
}).strict()

export const codeLineSchema = z.object({
  stream: codeRunStreamSchema,
  text: z.string().max(8192),
}).strict()

export const codeStateSchema = z.object({
  runId: z.string().uuid(),
  running: z.boolean(),
  startedBy: displayNameSchema,
  lines: z.array(codeLineSchema).max(100_000),
}).strict()

export const defaultDocumentLanguage = DEFAULT_LANGUAGE_ID

export type CreateRoomPayload = z.infer<typeof createRoomSchema>
export type JoinRoomPayload = z.infer<typeof joinRoomSchema>
export type PresenceUpdatePayload = z.infer<typeof presenceUpdateSchema>
export type PublicParticipant = z.infer<typeof publicParticipantSchema>
export type PublicRoom = z.infer<typeof publicRoomSchema>
export type IceServerConfig = z.infer<typeof iceServerSchema>
export type JoinAckData = z.infer<typeof joinAckDataSchema>
export type ClientAck<T> = { ok: true; data: T } | { ok: false; code: z.infer<typeof errorCodeSchema> }
export type SimpleAck = z.infer<typeof simpleAckSchema>
