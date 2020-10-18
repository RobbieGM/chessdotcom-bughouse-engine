const { execFile } = require("child_process");
const { Server } = require("ws");

const engineProcess = execFile("./fairy-stockfish-largeboard_x86-64.exe");
const wss = new Server({ port: 8080 });

const sendToEngine = (...messages) =>
  engineProcess.stdin.write(messages.join("\n") + "\n");

const latencyMs = 98; // mean chess.com time in ms for premoves

sendToEngine(
  "uci",
  "setoption name UCI_Variant value bughouse",
  `setoption name Move Overhead value ${latencyMs}`
);

engineProcess.stdout.on("data", (message) => {
  wss.clients.forEach((ws) => {
    console.debug("to clients", message);
    ws.send(message.toString());
  });
});

wss.on("connection", (ws) => {
  ws.on("message", (message) => {
    console.debug("to engine", message);
    sendToEngine(message);
  });
});
