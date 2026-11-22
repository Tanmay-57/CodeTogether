# Files

## Repository

- `package.json`, `pnpm-workspace.yaml`: pnpm workspace.
- `README.md`: architecture, setup, tests, deployment, limits.
- `render.yaml`, `apps/web/vercel.json`: deployment starting points.
- `.env.example`: server and web variables. TURN secrets stay on the server.

## `packages/shared`

Shared Zod schemas, event names, language extensions, limits, participant colors, and error copy. Both apps import this package so the socket contract is not duplicated.

## `apps/server`

- `src/server.ts` builds one HTTP server, Socket.IO, and the Yjs upgrade listener.
- `src/rooms/roomService.ts` owns membership, capacity, resume, expiry, and empty-room cleanup. A new person gets the first palette color still free in that room. Tests inject a clock and a manual scheduler.
- `src/realtime/handlers.ts` handles room events, authorized signaling, chat, and run requests.
- `src/run/codeRunner.ts` starts JavaScript, TypeScript, or Python from the shared document, accepts terminal input, and streams the output to the room. A run has no time limit.
- `src/chat/roomChat.ts` keeps up to 80 room messages in memory until the room ends.
- `src/collab/documentServer.ts` implements the y-websocket sync and awareness framing, reads a file for Run, and exposes document destruction.
- `src/collab/upgrade.ts` rejects `/yjs` connections without a valid ticket.
- `test/` covers ids, lifecycle, rate limits, socket rooms, signaling, and Yjs sync.

## `apps/web`

- `src/pages/LandingPage.vue` and `src/pages/RoomPage.vue` are the two routes.
- `src/components/room/WorkspaceShell.vue` composes the toolbar, editor, terminal, and call dock. The call fills the right column. Its width is dragged here.
- `src/components/room/TopBar.vue` shows the participant count and opens chat from a message icon.
- `src/components/call/VideoDock.vue` and `VideoTile.vue` draw the tiles. A name on a remote tile jumps to that caret and shows Typing.
- `src/composables/useRoom.ts`, `useCollaborativeEditor.ts`, `useWebRTC.ts`, `useLocalMedia.ts`, `useCodeExport.ts`, and `useCodeRun.ts` own the lifecycles. `useWebRTC.ts` sends a camera track that is turned on after the call has started.
- `src/lib/zip.ts` packs the room files. `src/lib/typing.ts` and `src/lib/filePresence.ts` feed the tile caption and the file-tab dots.
- `src/stores` hold serializable room, editor, connection, chat, run, and media flags. Media streams and peer connections stay in shallow refs.
- `src/monaco/environment.ts` registers the Monaco workers.
- `e2e/` is the Playwright coverage.
