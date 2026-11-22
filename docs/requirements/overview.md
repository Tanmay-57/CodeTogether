# Requirements

## Product

- Anonymous create and join by code or link.
- Several shared files, remote cursors in distinct colors, and optional audio and video.
- Copy and download without an account. Download uses the open tab's name. Download all packs the room's files.
- Desktop editing first, with a usable narrow layout. Chat opens from a message icon on every width.
- JavaScript and Python can be run from the shared document. TypeScript runs when this server's Node can strip types. Other languages stay in the editor. The run happens on the server machine with a 64 KB output limit. It stays running until the program exits, someone stops it, or the room ends. It is not a sandbox.
- An optional lock word, room chat, and line notes last only as long as the room.

## Persistence

Rooms, membership, tickets, and Yjs documents are in memory. Nothing is written to MongoDB or disk. Download does not read a database. When the empty-room timer or the expiry timer fires, membership and the document are removed. A later explicit save feature would need its own retention policy. It is not implemented.

## Security

- Room ids come from 9 random bytes encoded as base64url.
- Join and create payloads are validated with Zod on the server.
- Later events use the server-assigned socket membership, not a client-supplied room id.
- Yjs upgrades require a live ticket for that room and participant.
- Signaling checks membership, target membership, SDP type, and size.
- Production CORS and the Yjs origin check use `CLIENT_ORIGIN`.
- Names are rendered as text.
- Logs redact tickets, SDP, and credentials.
- Room creation and signaling are rate limited inside the process.

## Limits

Defaults live in `packages/shared/src/limits.ts` and can be overridden with the environment variables in `.env.example`.

## Out of scope

Saving a document after the room ends, calls larger than four, a sandbox around Run, roles, an SFU, Redis, and multiple server instances.
