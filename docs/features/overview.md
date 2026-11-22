# Features

## Landing

Use case: a visitor understands the product, sees that no account is required, and either creates a room or joins with a code.

The page collects a display name, validates it locally, and does not navigate on an invalid name or room code. Create calls the server. Join by code only stores the name and opens `/room/:roomId`. A faint grid and copper shapes sit behind the page and shift with the pointer. The form and heading stay still. The editor preview types a short function, then a second caret named Lin types the next line, and that loop repeats. The preview card leans slightly with the pointer, and the feature cards lift on hover. If the browser requests reduced motion, the background stays put and the preview shows the finished snippet without typing.

Files: `apps/web/src/pages/LandingPage.vue`.

## Rooms

Use case: people share one room without accounts.

The server creates a 12-character room id, assigns a participant UUID, and returns a Yjs ticket that is not put in the URL. Display names are labels. Capacity is 4. A disconnect starts a 20-second resume window. An empty room is deleted after 2 minutes. Activity extends expiry up to a 12-hour hard cap. There is no host. Create can set a lock word. The link still contains only the room code, and joining requires that word. The word is remembered in the browser session so a refresh can rejoin.

Files: `apps/server/src/rooms/roomService.ts`, `apps/web/src/pages/RoomPage.vue`, `apps/web/src/composables/useRoom.ts`.

## Pre-join

Use case: the person confirms their name and optionally previews the camera before anyone receives media.

`getUserMedia` runs only after a camera or microphone toggle. Peer connections are created only after Join. A denied or missing device does not block joining with devices off. Refresh of an existing workspace rejoins the document with both devices off.

Files: `apps/web/src/components/room/PreJoinPanel.vue`, `apps/web/src/composables/useLocalMedia.ts`.

## Editor and export

Use case: the group writes one or more files and takes the text with them.

Monaco is loaded directly, pinned to 0.50.0 for y-monaco 0.1.6. The room starts with one shared file, `main.js` unless the language extension differs. More files can be added with +. A new tab uses the language selected in the dropdown, so Python creates `file-2.py`. The file list is shared. Each person can look at a different file. Each file keeps its own Monaco model and binding, and switching files changes the model in place. A color dot on a tab shows someone else who has that file open. Language follows the file that is open. Font size and theme are local. Format runs Monaco's format action for JavaScript, TypeScript, HTML, CSS, and JSON, and explains itself for the other languages.

Download saves the open tab under its own name, such as `main.js` or `notes.md`. The zip control is icon-only. Hovering it says "Download all files as a zip", and the archive is named `codetogether-<room code>.zip`. The files inside use their tab names. Open, and dropping a file onto the editor, adds a new shared file instead of wiping the one that is open. A known extension sets the language. Anything else is plain text. A file larger than 512 KB, or one that contains a null byte, is refused. Files added with + or Open can be closed. The first file stays. Copy and download report failure if the browser blocks them.

Files: `apps/web/src/components/editor/CollaborativeEditor.vue`, `apps/web/src/composables/useCodeExport.ts`, `packages/shared/src/languages.ts`.

## Collaborative editing

Use case: two people type at once and a third person sees the current text.

Socket.IO does not carry document updates. The Yjs client connects to `/yjs/:roomId` with the join ticket. The editor stays read-only until the provider emits `sync`. Cursors use awareness and do not change `Y.Text`. Each remote caret shows that person's display name. A new person receives the first of the eight palette colors that nobody else in the room is using, so carets in a room stay distinct. Someone who resumes keeps the color they already had. While their caret moves, the caption on their video tile says Typing for about 1.5 seconds. When the room ends, the server destroys the document.

Clicking another person's name on their video tile scrolls the editor to that caret and switches to the file they are in. Clicking a line number opens a short note, at most 280 characters. Notes live in the document and disappear with the room. Closing a file removes the notes on that file.

Files: `apps/server/src/collab/documentServer.ts`, `apps/server/src/collab/upgrade.ts`, `apps/web/src/composables/useCollaborativeEditor.ts`, `apps/web/src/components/editor/CollaborativeEditor.vue`.

## Chat

Use case: someone wants to write to the room without turning on a microphone.

A message icon in the top bar, on every screen width, opens the chat in a small panel under the icon. Clicking the icon again closes it. A dot appears on the icon when a message arrives while the panel is closed, and a short quiet tone plays for a message from someone else. Replayed history and your own messages stay silent, and so does the tone when reduced motion is requested. While a draft is non-empty, the browser sends an empty typing pulse at most once a second. The open panel says who is typing for about 1.5 seconds. The draft text is not sent. Messages are kept in memory for the room, at most 80, replayed to someone who joins, and deleted when the room ends. A message is at most 500 characters, and one person can send 20 in 10 seconds.

Files: `apps/server/src/chat/roomChat.ts`, `apps/web/src/components/room/ChatPanel.vue`, `apps/web/src/components/room/TopBar.vue`.

## Run

Use case: someone runs the open JavaScript, TypeScript, or Python file and everyone in the room sees the output.

Run reads the file the server already stores. The client does not send a separate program. JavaScript uses the server's Node. TypeScript uses that Node when it can strip types, and otherwise writes one line that it cannot. Python uses `python`, or `py -3` on Windows when that is what is installed. Other languages write one line in the terminal and do not start a process. Ctrl+Enter runs the open file, and the Run button stays. While a program is running, click the terminal and type. Enter sends that line, which covers `readline` and Python `input()`. The up arrow recalls the last line sent from this browser. Ctrl+C stops the run. Clear output empties the terminal for everyone and leaves a running program alone. Copy output copies the terminal text. The terminal's top edge can be dragged taller. The height starts at 144px, stays at least 96px, and is remembered as `codetogether.terminalHeight`. One run per room, six runs per minute, and 64 KB of output. Stop and the end of the room kill the process. There is no time limit. Logs record the room, language, and exit code, not the source or the output.

Files: `apps/server/src/run/codeRunner.ts`, `apps/web/src/components/room/TerminalPanel.vue`, `apps/web/src/composables/useCodeRun.ts`.

## Audio and video

Use case: a room of up to four people can talk. The mesh is the initial design, not a claim that every network will connect.

Existing members offer to a new member. Signals are unicast and rejected unless both sockets are in the same room. Mute and camera use track state and presence. A call can start with the camera off. Turning it on later replaces the video track and sets that connection to send. If a negotiation is already in progress, the new offer is sent once the connection is stable again. The other person's tile adds that video to the stream it is already showing. One person can share their screen into the same mesh, and the screen picture is preferred over the camera. Leave call stops tracks and closes peer connections. Leave room also leaves the document session. A short chime plays when someone enters, and it stays silent when the browser asks for reduced motion.

Names are on the video tiles. There is no separate participant list. The count in the top bar stays. Tiles keep a 16:9 frame and letterbox the picture, and extra tiles scroll inside the call block. A border sits under that block. On a wide window the call fills the right column, and extra tiles scroll inside it. The column can be dragged from its left edge. The width starts at 320px, stays between 280px and half the viewport, and is remembered in localStorage as `codetogether.panelWidth`. Below a wide window the call is a 240px strip above the editor, and extra tiles scroll inside that strip.

Cross-network calls need TURN. The app says so in the call panel and the README. STUN alone is the default.

Files: `apps/web/src/composables/useWebRTC.ts`, `apps/web/src/components/call/VideoDock.vue`, `apps/server/src/realtime/handlers.ts`.
