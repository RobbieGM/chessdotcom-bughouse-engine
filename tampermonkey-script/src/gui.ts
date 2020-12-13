import { h, render, FunctionComponent } from "preact";
import { useState } from "preact/hooks";
import { EventBus } from "light-event-bus";
import htm from "htm";
import { NonKingPiece } from "./chessboard";

const html = htm.bind(h);
export type ExpectedPiecesMap = Record<NonKingPiece, boolean>;
const PIECE_NAMES = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
} as const;

interface Props {
  onSittingStatusChange: (sitting: boolean) => void;
  onExpectedPiecesChange: (expectedPieces: ExpectedPiecesMap) => void;
}

const GUIComponent: FunctionComponent<Props> = ({
  onSittingStatusChange,
  onExpectedPiecesChange,
}) => {
  const [sitting, setSitting] = useState(false);
  const [expectedPiecesForOpponent, setExpectedPiecesForOpponent] = useState({
    p: true,
    n: false,
    b: false,
    r: false,
    q: false,
  });
  return html`<button
      onClick=${() => {
        onSittingStatusChange(!sitting);
        setSitting(!sitting);
      }}
    >
      ${sitting ? "Move" : "Sit"}
    </button>
    ${(["p", "n", "b", "r", "q"] as const).map(
      (piece) =>
        html`<label style="display: block; color: white"
          ><input
            type="checkbox"
            checked=${expectedPiecesForOpponent[piece]}
            onChange=${() => {
              const newExpectedPieces = {
                ...expectedPiecesForOpponent,
                [piece]: !expectedPiecesForOpponent[piece],
              };
              onExpectedPiecesChange(newExpectedPieces);
              setExpectedPiecesForOpponent(newExpectedPieces);
            }}
          />Expect ${PIECE_NAMES[piece]}</label
        >`
    )} ` as any;
};

export default class GUI {
  events = new EventBus<{
    sittingstatuschange: boolean;
    expectedpieceschange: ExpectedPiecesMap;
  }>();
  constructor() {
    const adContainer = document.getElementById("board-layout-ad")!;
    adContainer.style.display = "block";
    render(
      html`<${GUIComponent}
        onSittingStatusChange=${(sitting: boolean) =>
          this.events.publish("sittingstatuschange", sitting)}
        onExpectedPiecesChange=${(expectedPieces: ExpectedPiecesMap) =>
          this.events.publish("expectedpieceschange", expectedPieces)}
      />`,
      adContainer
    );
  }
}
