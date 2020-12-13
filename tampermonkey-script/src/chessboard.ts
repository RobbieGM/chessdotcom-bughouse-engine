import Chess, { ChessInstance, Square } from "chess.js";
import type { Chess as ChessType } from "chess.js";

export type NonKingPiece = "p" | "n" | "b" | "r" | "q";

/** Characters */
const SQUARE_CHARACTERS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?";
const DROP_CHARACTERS: Record<string, NonKingPiece> = {
  "=": "p",
  "-": "n",
  "+": "b",
  "*": "r",
  "&": "q",
};

function squareCharacterToAlgebraicSquare(squareCharacter: string) {
  const index = SQUARE_CHARACTERS.indexOf(squareCharacter);
  const file = "abcdefgh".charAt(index % 8);
  const rank = Math.floor(index / 8) + 1;
  return `${file}${rank}`;
}

function algebraicSquareToCharacter(algebraicSquare: string) {
  const [file, rank] = algebraicSquare;
  const fileIndex = "abcdefgh".indexOf(file);
  const rankIndex = parseInt(rank) - 1;
  const index = fileIndex + rankIndex * 8;
  return SQUARE_CHARACTERS[index];
}

/**
 * Converts algebraic move in the form "{from}{to}" e.g. "e2e4" to chess.com move format.
 */
export function algebraicMoveToChesscom(algebraicMove: string): string {
  const isDrop = algebraicMove.charAt(1) === "@";
  const isPromotion = algebraicMove.length === 5;
  const from = algebraicMove.slice(0, 2);
  const to = algebraicMove.slice(2, 4);
  if (isDrop) {
    const piece = algebraicMove.charAt(0).toLowerCase() as NonKingPiece;
    const [dropCharacter] = Object.entries(DROP_CHARACTERS).find(
      ([, value]) => value == piece
    )!;
    return `${dropCharacter}${algebraicSquareToCharacter(to)}`;
  }
  if (isPromotion) {
    const promoteTo = algebraicMove.charAt(4).toLowerCase();
    const direction =
      "abcdefgh".indexOf(to.charAt(0)) - "abcdefgh".indexOf(from.charAt(0));
    const [promotionCharacter] = Object.entries(PROMOTION_CHARACTERS).find(
      ([, value]) => value.direction === direction && value.to === promoteTo
    )!;
    return `${algebraicSquareToCharacter(from)}${promotionCharacter}`;
  }
  return `${algebraicSquareToCharacter(from)}${algebraicSquareToCharacter(to)}`;
}

const TOWARD_A_FILE = -1;
const STRAIGHT = 0;
const TOWARD_H_FILE = 1;

interface PromotionCharacterData {
  to: Exclude<NonKingPiece, "p">;
  /** pawn capturing direction or direct promotion without changing files */
  direction: typeof TOWARD_A_FILE | typeof STRAIGHT | typeof TOWARD_H_FILE;
}

const PROMOTION_CHARACTERS: Record<string, PromotionCharacterData> = {
  "~": { to: "q", direction: STRAIGHT },
  "}": { to: "q", direction: TOWARD_H_FILE },
  "{": { to: "q", direction: TOWARD_A_FILE },
  "^": { to: "n", direction: STRAIGHT },
  ")": { to: "n", direction: TOWARD_H_FILE },
  "(": { to: "n", direction: TOWARD_A_FILE },
  "#": { to: "b", direction: STRAIGHT },
  // prettier-ignore
  "$": { to: "b", direction: TOWARD_H_FILE },
  "@": { to: "b", direction: TOWARD_A_FILE },
  // prettier-ignore
  "_": { to: "r", direction: STRAIGHT },
  "]": { to: "r", direction: TOWARD_H_FILE },
  "[": { to: "r", direction: TOWARD_A_FILE },
};

function applyMove(board: ChessInstance, move: string) {
  const [firstChar, secondChar] = move;
  const isDrop = firstChar in DROP_CHARACTERS;
  const isPromotion = secondChar in PROMOTION_CHARACTERS;
  if (isDrop) {
    board.put(
      { type: DROP_CHARACTERS[firstChar], color: board.turn() },
      squareCharacterToAlgebraicSquare(secondChar) as Square
    );
    let [
      // eslint-disable-next-line prefer-const
      piecePlacement,
      sideToMove,
      // eslint-disable-next-line prefer-const
      castling,
      enPassantTarget,
      halfmoveClock,
      fullmoveNumber,
    ] = board.fen().split(" ");
    sideToMove = sideToMove === "w" ? "b" : "w";
    enPassantTarget = "-";
    halfmoveClock = (parseInt(halfmoveClock) + 1).toString();
    if (sideToMove === "w") {
      fullmoveNumber = (parseInt(fullmoveNumber) + 1).toString();
    }
    const fenWithSideToMoveSwapped = [
      piecePlacement,
      sideToMove,
      castling,
      enPassantTarget,
      halfmoveClock,
      fullmoveNumber,
    ].join(" ");
    board.load(fenWithSideToMoveSwapped);
  } else if (isPromotion) {
    const from = squareCharacterToAlgebraicSquare(firstChar) as Square;
    const fromFile = from.charAt(0);
    const fromRank = from.charAt(1);
    const { to: promotion, direction } = PROMOTION_CHARACTERS[secondChar];
    const toFile = "abcdefgh"["abcdefgh".indexOf(fromFile) + direction];
    const toRank = fromRank === "7" ? "8" : "1";
    board.move({ from, to: `${toFile}${toRank}` as Square, promotion });
  } else {
    const from = squareCharacterToAlgebraicSquare(firstChar);
    const to = squareCharacterToAlgebraicSquare(secondChar);
    board.move(`${from}${to}`, { sloppy: true });
  }
}

/**
 * Converts a move string in chess.com format to a FEN
 * @param moves Move string in chess.com format
 */
export function getFEN(moves: string, hand: string): string {
  const board = new ((Chess as unknown) as typeof ChessType)();
  const movesArray = moves.match(/.{1,2}/g) ?? [];
  movesArray.forEach((move) => applyMove(board, move));
  const fenWithoutHand = board.fen();
  // replaces only the first occurrence of a non-spaced string with that string plus [hand]
  const fenWithHand = fenWithoutHand.replace(/([a-zA-Z0-9/]+)/, `$1[${hand}]`);
  return fenWithHand;
}
