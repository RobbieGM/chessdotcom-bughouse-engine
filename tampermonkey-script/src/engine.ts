export default class Engine {
  // 1. your move
  // 2. go depth MIN_DEPTH (actual depth should be higher due to pondering)
  // 3. return best move
  // 4. go ponder
  // 5. opponent moves
  // 6. goto 1
  private static MIN_DEPTH = 10;
  private static PONDER_DEPTH_LIMIT = 25;
  private socket;
  private pondering = false;

  constructor() {
    this.socket = new WebSocket("ws://localhost:8080");
  }

  setFen(fen: string): void {
    this.socket.send(`position fen ${fen}`);
  }

  startPondering(): void {
    this.pondering = true;
    this.socket.send(`go ponder depth ${Engine.PONDER_DEPTH_LIMIT}`);
  }

  stopCalculation(): void {
    this.pondering = false;
    this.socket.send("stop");
  }

  calculateBestMove(): Promise<string> {
    return new Promise((res) => {
      const wasPondering = this.pondering;
      // If the engine was previously pondering, the stop command will yield one bestmove and the go depth command
      // will yield another. We only want the second one since it is guaranteed to be at least the min depth.
      let receivedBestMoveCommandFromPondering = false;
      const onMessage = ({ data }: MessageEvent<any>) => {
        if (typeof data != "string") return;
        const lines = data.split("\r\n");
        const bestMoveLine = lines.find((line) => line.startsWith("bestmove"));
        if (bestMoveLine == null) return;
        const bestMove = bestMoveLine.split(" ")[1];
        if (wasPondering) {
          if (receivedBestMoveCommandFromPondering) {
            resolveBestMove(bestMove);
          }
          // Else ignore best move since it came from pondering
          receivedBestMoveCommandFromPondering = true;
        } else {
          resolveBestMove(bestMove);
        }
      };
      const resolveBestMove = (bestMove: string) => {
        res(bestMove);
        this.socket.removeEventListener("message", onMessage);
      };
      this.socket.addEventListener("message", onMessage);
      // Stop any previous pondering
      this.stopCalculation();
      // Search and wait for next message starting with "bestmove"
      this.socket.send(`go depth ${Engine.MIN_DEPTH}`);
    });
  }
}
