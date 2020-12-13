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
import GUI, { ExpectedPiecesMap } from "./gui";
import OpeningBook from "./opening-book";

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
  const book = new OpeningBook();
  let clientId = "";
  let username = "";
  ondragover = ondragenter = (e) => e.preventDefault();
  ondrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (file == null) {
      alert("Please provide a file.");
      return;
    }
    const reader = new FileReader();
    reader.readAsText(file);
    reader.onload = (loadEvent) => {
      if (!reader.result || typeof reader.result === "object") {
        alert("Failed to load file--is the file empty?");
        return;
      }
      localStorage.setItem("openingBook", reader.result);
      book.reload();
      alert(`Loaded book "${file.name}" successfully.`);
    };
  };
  const nextMessageId = (() => {
    let messageId = 100000;
    return () => {
      messageId++;
      return messageId.toString();
    };
  })();
  const engine = new Engine();
  const gui = new GUI();
  let sitting = false;
  let expectedPieces: ExpectedPiecesMap = {
    p: true,
    n: false,
    b: false,
    r: false,
    q: false,
  };
  gui.events.subscribe(
    "sittingstatuschange",
    (newSitting) => (sitting = newSitting)
  );
  gui.events.subscribe(
    "expectedpieceschange",
    (newExpectedPieces) => (expectedPieces = newExpectedPieces)
  );
  function waitToStopSitting() {
    if (!sitting) return Promise.resolve();
    return new Promise<void>((res) => {
      const { unsubscribe } = gui.events.subscribe(
        "sittingstatuschange",
        (s) => {
          if (!s) {
            res();
            unsubscribe();
          }
        }
      );
    });
  }
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
              userSide,
              data.data.game.seq as number
            );
          } else {
            onMyMove(data.data.game.moves as string, hand, userSide);
          }
        }
      }
    }
  }
  function getExpectedHandAddition(myColor: "white" | "black") {
    const colorAmbiguousExpectedHandAddition = (Object.keys(
      expectedPieces
    ) as Array<keyof ExpectedPiecesMap>)
      .filter((key) => expectedPieces[key])
      .join("");
    return myColor == "white"
      ? colorAmbiguousExpectedHandAddition.toLowerCase()
      : colorAmbiguousExpectedHandAddition.toUpperCase();
  }
  /**
   * @param moves Moves in chess.com format
   * @param ply Number of half-moves (ply) played so far
   */
  async function onOpponentMove(
    socket: WebSocket,
    moves: string,
    hand: string,
    myColor: "white" | "black",
    ply: number
  ) {
    const handWithExpectedPiecesForOpponent =
      hand + getExpectedHandAddition(myColor);
    const fen = getFEN(moves, handWithExpectedPiecesForOpponent);
    console.debug("Opponent moved received. FEN", fen);
    const bookMove = book.getOpeningMove(fen);
    if (bookMove) {
      console.debug("Playing book move", bookMove);
      sendMove(socket, algebraicMoveToChesscom(bookMove), ply);
      return;
    }
    engine.setFen(fen);
    // TODO hand could update during sit and engine wouldn't know
    await waitToStopSitting();
    const bestMove = await engine.calculateBestMove();
    console.debug("Playing", bestMove);
    sendMove(socket, algebraicMoveToChesscom(bestMove), ply);
  }

  function onMyMove(moves: string, hand: string, myColor: "white" | "black") {
    const handWithExpectedPiecesForOpponent =
      hand + getExpectedHandAddition(myColor);
    const fen = getFEN(moves, handWithExpectedPiecesForOpponent);
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
