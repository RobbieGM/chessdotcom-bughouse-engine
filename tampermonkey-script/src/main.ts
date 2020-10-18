// ==UserScript==
// @name         Chess.com bughouse engine
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  A bughouse engine for chess.com.
// @author       Robbie Moore
// @match        https://www.chess.com/live
// @run-at       document-start
// @grant        none
// ==/UserScript==

import { getFEN, algebraicMoveToChesscom } from "./chessboard";
import Engine from "./engine";

declare global {
  interface Window {
    OriginalWebSocket: typeof WebSocket;
  }
}
export {};

interface Player {
  id: number;
  uuid: string;
  /** Player username */
  uid: string;
  status: "playing"; // Not the only option, but the only known one
  userclass: string;
  lag: number;
  lagms: number;
  /** Game ID of the game this player is in */
  gid: number;
}

(function () {
  "use strict";
  console.log("Bughouse engine userscript initialized");
  let clientId = "";
  let username = "";
  const nextMessageId = (() => {
    let messageId = 100000;
    return () => {
      messageId++;
      return messageId.toString();
    };
  })();
  const engine = new Engine();
  window.OriginalWebSocket = window.WebSocket;
  const websockets: WebSocket[] = [];
  window.WebSocket = new Proxy(WebSocket, {
    construct(target, args) {
      const wsObject = new target(...(args as [string]));
      websockets.push(wsObject);
      if (websockets.length === 2) {
        setTimeout(onWebsocketInitialization, 50); // wait for onmessage to be set
      }
      return wsObject;
    },
  });
  function onWebsocketInitialization() {
    const cometSocket = websockets.find((ws) => ws.url.includes("cometd"));
    if (cometSocket != null) {
      listenToMainWebSocket(cometSocket);
    }
  }
  function listenToMainWebSocket(socket: WebSocket) {
    const originalMessageHandler = socket.onmessage;
    socket.onmessage = (event) => {
      const messages = JSON.parse(event.data);
      const returnValue = originalMessageHandler?.call(socket, event);
      messages.forEach((message: any) => onMessage(socket, message));
      return returnValue;
    };
  }
  /**
   * Called when the main websocket receives a message
   */
  function onMessage(socket: WebSocket, data: any) {
    if ("clientId" in data) {
      clientId = data.clientId;
    }
    if (
      data?.data?.game?.players &&
      "blackhand" in data.data.game &&
      "whitehand" in data.data.game
    ) {
      const players = data.data.game.players as [Player, Player];
      const myUsername = (document.querySelector(
        "#board-layout-player-bottom a[data-username]"
      ) as HTMLElement).dataset.username!;
      const indexOfUser = players.findIndex(
        (player) => player.uid === myUsername
      );
      if (indexOfUser !== -1) {
        username = players[indexOfUser].uid;
        const userSide = indexOfUser === 0 ? "white" : "black";
        const sideToMove = data.data.game.seq % 2 === 0 ? "white" : "black";
        const updateReason = data.data.game.reason as
          | "movemade" // opponent moved
          | "linkedgamesync" // pieces came from other board
          | undefined; // happens when game ended, but may for other reasons
        if (updateReason == "movemade") {
          const hand =
            (data.data.game.blackhand as string).toLowerCase() +
            (data.data.game.whitehand as string).toUpperCase();
          if (userSide === sideToMove) {
            onOpponentMove(
              socket,
              data.data.game.moves as string,
              hand,
              data.data.game.seq as number
            );
          } else {
            onMyMove(data.data.game.moves as string, hand);
          }
        }
      }
    }
  }
  /**
   * @param moves Moves in chess.com format
   * @param ply Number of half-moves (ply) played so far
   */
  async function onOpponentMove(
    socket: WebSocket,
    moves: string,
    hand: string,
    ply: number
  ) {
    const fen = getFEN(moves, hand);
    console.debug("Opponent moved received. FEN", fen);
    engine.setFen(fen);
    const bestMove = await engine.calculateBestMove();
    console.debug("Playing", bestMove);
    sendMove(socket, algebraicMoveToChesscom(bestMove), ply);
  }

  function onMyMove(moves: string, hand: string) {
    const fen = getFEN(moves, hand);
    console.debug("Own move received. FEN", fen);
    engine.setFen(fen);
    engine.startPondering();
  }
  /**
   * Makes a move on the current board.
   * @param socket Socket to send the move through
   * @param move The move to make, in chess.com format
   * @param ply Number of half-moves (ply) played so far before this move
   */
  function sendMove(socket: WebSocket, move: string, ply: number) {
    const gameId = parseInt(location.hash.slice("#g=".length));
    const data = [
      {
        channel: "/service/game",
        data: {
          move: {
            gid: gameId,
            move,
            seq: ply,
            uid: username,
          },
          sid: "gserv",
          tid: "Move",
        },
        id: nextMessageId(),
        clientId,
      },
    ];
    socket.send(JSON.stringify(data));
  }
})();
