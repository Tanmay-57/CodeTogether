# Changes

This is the initial implementation of the approved architecture.

- Added a pnpm workspace with `@codetogether/shared`, `@codetogether/server`, and `@codetogether/web`.
- Document sync uses `y-websocket` 3.x on `/yjs`, not `y-socket.io`.
- Rooms are ephemeral. MongoDB is not installed.
- WebRTC is a four-person mesh with Socket.IO signaling.
- Monaco is pinned to 0.50.0 to match y-monaco 0.1.6.
- Tests cover room lifecycle, authorization, Yjs convergence, and the browser journeys that do not require a camera.
- Deployment files target a static web host plus one long-lived Node service. A public URL was not published because hosting credentials are not part of this workspace.

## Editor, terminal, and call additions

- A room can hold several shared files. Download all packs the files.
- Room chat, line notes, and an optional lock word last only as long as the room. The lock word is not part of the link.
- Ctrl+Enter runs the open file. The terminal can clear output, copy it, and recall the last input line.
- TypeScript runs when this machine's Node can strip types. Screen sharing stays inside the four-person mesh. A join plays a short chime unless reduced motion is requested.
- The document is still discarded when the room ends. The call is still capped at four. Programs still run on the server machine.

## Terminal input

- A running JavaScript or Python program reads what is typed in the terminal itself. There is no time limit; Stop, Ctrl+C, or the end of the room ends the run.
- The terminal can be dragged taller from its top edge, and the height is kept in localStorage.

## Shared run

- JavaScript and Python in the shared document can be run from the editor. The output streams to a terminal everyone in the room sees.
- Other languages do not start a process. A run is limited to 64 KB of output, and only one run is active in a room.

## Presence and landing polish

- Remote carets show the participant's display name. The caption on that person's video tile says Typing for about 1.5 seconds after their caret moves.
- The desktop call column can be dragged wider and keeps that width in localStorage.
- The landing page background shifts with the pointer and stays still when reduced motion is requested.

## Files, panels, and cursors

- Open, and dropping a file onto the editor, adds a shared file. A known extension sets the language. Anything else is plain text. A file larger than 512 KB, or one with a null byte, is refused. Files added with + or Open can be closed. The first file stays.
- Each file keeps its own Monaco model and binding. Switching files changes the model in place, so remote carets stay on the file they belong to.
- The participant list was removed in the section below.

## Call, chat, downloads, and caret colors

- Download saves the open tab under its own name. The zip button stays icon-only and shows "Download all files as a zip" on hover. The files inside the zip already use their tab names.
- Call tiles keep a 16:9 frame and letterbox the picture. On a wide window the call fills the right column, and extra tiles scroll inside it. On a narrow window the call stays a 240px strip.
- Turning the camera on after the call has started sets that connection to send. If a negotiation is already in progress, the offer goes out when the connection is stable. The other tile adds the video to the stream it is already showing.
- Names stay on the video tiles. Clicking another person's name jumps to their caret. There is no participant list. The count in the top bar stays.
- A message icon opens the room chat in a panel under the icon and closes it on a second click. A dot shows when a message arrives while the panel is closed.
- A new person gets the first palette color nobody else in the room is using. Carets read that color. The room still holds four people.
