"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Bot, ChevronRight, CircleHelp, Gauge, History, House, RotateCcw, Settings, ShieldCheck, Sparkles, Swords } from "lucide-react";
import { askStockfish, loadStockfish, type StockfishEngine } from "@/lib/engine";

const Chessboard = dynamic(
  () => import("react-chessboard").then((module) => module.Chessboard),
  { ssr: false, loading: () => <div className="board-loading">Loading board…</div> },
);

type Mover = "Player" | "Stockfish";
type MoveRecord = {
  moveNumber: number;
  san: string;
  fenAfter: string;
  mover: Mover;
};
type CoachMessage = MoveRecord & { text: string };
type BoardPiece = { square: string; type: string; owner: Mover };
type GameOutcome = { kind: "win" | "loss" | "draw"; title: string; detail: string };
type LegalTarget = { square: Square; capture: boolean };

const depths = [8, 12, 16, 20];

function boardSnapshot(game: Chess): BoardPiece[] {
  const files = "abcdefgh";
  return game.board().flatMap((row, rowIndex) =>
    row.flatMap((piece, colIndex) => {
      if (!piece) return [];
      return [{
        square: `${files[colIndex]}${8 - rowIndex}`,
        type: piece.type,
        owner: piece.color === "w" ? "Player" as const : "Stockfish" as const,
      }];
    }),
  );
}

function formatStatus(game: Chess, thinking: boolean, engineReady: boolean, engineError: string | null) {
  if (engineError) return "Engine unavailable";
  if (thinking) return "Stockfish is thinking";
  if (!engineReady) return "Starting Stockfish";
  if (game.isCheckmate()) return "Checkmate";
  if (game.isDraw()) return "Drawn position";
  return game.turn() === "w" ? "Your turn" : "Stockfish to move";
}

export default function ChessTutorApp() {
  const gameRef = useRef(new Chess());
  const engineRef = useRef<StockfishEngine | null>(null);
  const historyRef = useRef<MoveRecord[]>([]);
  const versionRef = useRef(0);
  const mountedRef = useRef(true);
  const [position, setPosition] = useState("start");
  const [moves, setMoves] = useState<MoveRecord[]>([]);
  const [coachMessages, setCoachMessages] = useState<CoachMessage[]>([]);
  const [gameId, setGameId] = useState<string | null>(null);
  const [depth, setDepth] = useState(12);
  const [thinking, setThinking] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [coachEnabled, setCoachEnabled] = useState(false);
  const [pendingCoach, setPendingCoach] = useState(0);
  const [gameOutcome, setGameOutcome] = useState<GameOutcome | null>(null);
  const [resultDismissed, setResultDismissed] = useState(false);
  const [legalMovesEnabled, setLegalMovesEnabled] = useState(true);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalTargets, setLegalTargets] = useState<LegalTarget[]>([]);
  const [captureSquare, setCaptureSquare] = useState<Square | null>(null);
  const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startGame = useCallback(async () => {
    versionRef.current += 1;
    const freshGame = new Chess();
    gameRef.current = freshGame;
    historyRef.current = [];
    setPosition(freshGame.fen());
    setGameId(null);
    setMoves([]);
    setCoachMessages([]);
    setThinking(false);
    setGameOutcome(null);
    setResultDismissed(false);
    setSelectedSquare(null);
    setLegalTargets([]);
    setCaptureSquare(null);
    try {
      const response = await fetch("/api/games", { method: "POST" });
      if (!response.ok) throw new Error("Unable to create game");
      const data = (await response.json()) as { gameId?: string };
      if (mountedRef.current) setGameId(data.gameId || null);
    } catch {
      // The board is still playable offline; move persistence will use its
      // local preview path if no Neon connection is configured.
      if (mountedRef.current) setGameId(crypto.randomUUID());
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void startGame();
    const savedHighlights = window.localStorage.getItem("chessTutor.legalMoveHighlights");
    setLegalMovesEnabled(savedHighlights !== "false");
    fetch("/api/settings")
      .then((response) => response.json())
      .then((data: { enabled?: boolean }) => {
        if (mountedRef.current) setCoachEnabled(Boolean(data.enabled));
      })
      .catch(() => undefined);
    return () => {
      mountedRef.current = false;
      engineRef.current?.terminate?.();
      if (captureTimerRef.current) clearTimeout(captureTimerRef.current);
    };
  }, [startGame]);

  useEffect(() => {
    let active = true;
    loadStockfish()
      .then((engine) => {
        if (!active) {
          engine.terminate?.();
          return;
        }
        engineRef.current = engine;
        engine.postMessage("uci");
        engine.postMessage("isready");
        setEngineReady(true);
      })
      .catch((error) => {
        if (active) setEngineError(error instanceof Error ? error.message : "Could not load Stockfish");
      });
    return () => {
      active = false;
    };
  }, []);

  const persistMove = useCallback(async (record: MoveRecord, game: Chess) => {
    const activeGameId = gameId || gameIdRefFallback.current;
    if (!activeGameId) return;
    setPendingCoach((count) => count + 1);
    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: activeGameId,
          moveNumber: record.moveNumber,
          san: record.san,
          fenAfter: record.fenAfter,
          mover: record.mover,
          result: game.isGameOver() ? (game.isCheckmate() ? (record.mover === "Player" ? "Player win" : "Stockfish win") : "Draw") : undefined,
          pgn: game.pgn(),
          snapshot: boardSnapshot(game),
          moveHistory: historyRef.current,
        }),
      });
      if (!response.ok) throw new Error("Move save failed");
      const result = (await response.json()) as { commentary?: string | null };
      if (result.commentary && mountedRef.current) {
        setCoachMessages((current) => [...current, { ...record, text: result.commentary as string }]);
      }
    } catch {
      if (coachEnabled && mountedRef.current) {
        setCoachMessages((current) => [...current, {
          ...record,
          text: "Your move was played, but the coach service is not reachable right now. Check Settings or continue the game.",
        }]);
      }
    } finally {
      if (mountedRef.current) setPendingCoach((count) => Math.max(0, count - 1));
    }
  }, [coachEnabled, gameId]);

  const addRecord = useCallback((record: MoveRecord, game: Chess) => {
    historyRef.current = [...historyRef.current, record];
    setMoves((current) => [...current, record]);
    setPosition(game.fen());
    void persistMove(record, game);
  }, [persistMove]);

  const flashCapture = useCallback((square: Square) => {
    if (captureTimerRef.current) clearTimeout(captureTimerRef.current);
    setCaptureSquare(square);
    captureTimerRef.current = setTimeout(() => setCaptureSquare(null), 480);
  }, []);

  const showLegalMoves = useCallback((square: string) => {
    if (!legalMovesEnabled || thinking || gameRef.current.turn() !== "w" || gameRef.current.isGameOver()) return;
    const selected = square as Square;
    const piece = gameRef.current.get(selected);
    if (!piece || piece.color !== "w") {
      setSelectedSquare(null);
      setLegalTargets([]);
      return;
    }
    const targets = gameRef.current.moves({ square: selected, verbose: true }).map((move) => ({
      square: move.to,
      capture: Boolean(move.captured),
    }));
    setSelectedSquare(selected);
    setLegalTargets(targets);
  }, [legalMovesEnabled, thinking]);

  const finishGame = useCallback((outcome: GameOutcome) => {
    setGameOutcome(outcome);
    setResultDismissed(false);
    setSelectedSquare(null);
    setLegalTargets([]);
  }, []);

  const playStockfish = useCallback(async (requestVersion: number) => {
    const engine = engineRef.current;
    if (!engine) {
      setThinking(false);
      setEngineError("Stockfish is still loading. Try the move again in a moment.");
      return;
    }
    try {
      const uci = await askStockfish(engine, gameRef.current.fen(), depth);
      if (versionRef.current !== requestVersion || gameRef.current.turn() !== "b") return;
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promotion = uci.slice(4, 5) as "q" | "r" | "b" | "n" | undefined;
      const game = gameRef.current;
      const wasCapture = Boolean(game.get(to as Square));
      const move = game.move({ from, to, ...(promotion ? { promotion } : {}) });
      if (wasCapture || move.captured) flashCapture(to as Square);
      const record: MoveRecord = {
        moveNumber: historyRef.current.length + 1,
        san: move.san,
        fenAfter: game.fen(),
        mover: "Stockfish",
      };
      addRecord(record, game);
      if (game.isGameOver()) {
        finishGame(game.isCheckmate()
          ? { kind: "loss", title: "Checkmate", detail: "Stockfish wins this one. Review the game, then try a new line." }
          : { kind: "draw", title: "Draw", detail: "A balanced finish. Neither side could force the win." });
      }
    } catch {
      if (mountedRef.current) setEngineError("Stockfish could not complete that move. Try again.");
    } finally {
      if (mountedRef.current) setThinking(false);
    }
  }, [addRecord, depth, finishGame, flashCapture]);

  const onPieceDrop = useCallback((sourceSquare: string, targetSquare: string) => {
    if (thinking || !engineReady || gameRef.current.turn() !== "w" || gameRef.current.isGameOver()) return false;
    const game = gameRef.current;
    const wasCapture = Boolean(game.get(targetSquare as Square));
    let move;
    try {
      move = game.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
    } catch {
      return false;
    }
    if (!move) return false;
    setSelectedSquare(null);
    setLegalTargets([]);
    if (wasCapture || move.captured) flashCapture(targetSquare as Square);
    const record: MoveRecord = {
      moveNumber: historyRef.current.length + 1,
      san: move.san,
      fenAfter: game.fen(),
      mover: "Player",
    };
    addRecord(record, game);
    if (game.isGameOver()) {
      finishGame(game.isCheckmate()
        ? { kind: "win", title: "Victory!", detail: "Checkmate. You found the winning finish." }
        : { kind: "draw", title: "Draw", detail: "A balanced finish. Neither side could force the win." });
      return true;
    }
    setThinking(true);
    const requestVersion = versionRef.current;
    void playStockfish(requestVersion);
    return true;
  }, [addRecord, engineReady, finishGame, flashCapture, playStockfish, thinking]);

  const movePairs = useMemo(() => {
    const pairs: Array<{ number: number; white?: string; black?: string; latest?: boolean }> = [];
    moves.forEach((move, index) => {
      const number = Math.floor(index / 2) + 1;
      let pair = pairs[pairs.length - 1];
      if (!pair || pair.number !== number) {
        pair = { number };
        pairs.push(pair);
      }
      if (move.mover === "Player") pair.white = move.san;
      else pair.black = move.san;
      pair.latest = index === moves.length - 1;
    });
    return pairs;
  }, [moves]);

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (legalMovesEnabled && selectedSquare) {
      styles[selectedSquare] = { boxShadow: "inset 0 0 0 4px rgba(117, 231, 183, .88)", backgroundColor: "rgba(117, 231, 183, .22)" };
      legalTargets.forEach((target) => {
        styles[target.square] = target.capture
          ? { background: "radial-gradient(circle, transparent 57%, rgba(117, 231, 183, .9) 59%, rgba(117, 231, 183, .9) 69%, transparent 71%)" }
          : { background: "radial-gradient(circle, rgba(20, 38, 45, .55) 0 16%, rgba(117, 231, 183, .82) 17% 24%, transparent 26%)" };
      });
    }
    if (captureSquare) {
      styles[captureSquare] = { ...styles[captureSquare], animation: "capture-flash 480ms ease-out", boxShadow: "inset 0 0 0 6px rgba(255, 190, 92, .95)" };
    }
    return styles;
  }, [captureSquare, legalMovesEnabled, legalTargets, selectedSquare]);

  const onSquareClick = useCallback((square: string) => {
    if (selectedSquare && legalTargets.some((target) => target.square === square)) {
      onPieceDrop(selectedSquare, square);
      return;
    }
    showLegalMoves(square);
  }, [legalTargets, onPieceDrop, selectedSquare, showLegalMoves]);

  const status = formatStatus(gameRef.current, thinking, engineReady, engineError);
  const latestComment = coachMessages[coachMessages.length - 1];
  const resultText = gameOutcome?.title || (gameRef.current.isCheck() && !thinking ? "Check — find your response" : null);

  return (
    <div className={`app-shell ${gameOutcome?.kind === "loss" ? "game-lost" : ""}`}>
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">♞</span>
          <span><span className="brand-name">ChessTutor</span><span className="brand-subtitle">Practice with purpose</span></span>
        </Link>
        <nav className="nav" aria-label="Primary navigation">
          <div className="nav-label">Workspace</div>
          <Link className="nav-link active" href="/"><House />Practice room</Link>
          <Link className="nav-link" href="/"><History />Game history</Link>
          <Link className="nav-link" href="/settings"><Settings />Settings</Link>
        </nav>
        <div className="sidebar-spacer" />
        <div className="engine-card">
          <div className="engine-card-top"><span>Opponent engine</span><Gauge size={14} /></div>
          <div className="engine-status"><span className={`status-dot ${engineReady ? "" : "loading"}`} />{engineReady ? "Stockfish WASM ready" : "Loading local engine"}</div>
        </div>
        <div className="sidebar-foot">
          <div className="avatar">AM</div>
          <div className="user-copy"><strong>Alex Morgan</strong><span>Local player</span></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><ChevronRight size={13} /><strong>Practice room</strong></div>
          <div className="topbar-right"><span className="kicker"><span className="kicker-dot" /> Local-first training</span><Link className="icon-btn" href="/settings" aria-label="Open settings"><Settings /></Link></div>
        </header>

        <div className="content-wrap">
          <div className="page-intro">
            <div>
              <div className="eyebrow">Daily practice / White to play</div>
              <h1 className="page-title">Play a thoughtful game.</h1>
              <p className="page-description">A quiet board, a strong opponent, and just enough guidance to help you see more in every position.</p>
            </div>
            <button className="button button-soft" onClick={() => void startGame()}><RotateCcw />New game</button>
          </div>

          <div className="game-layout">
            <section>
              <div className="board-card">
                <div className="opponent-row">
                  <div className="player-id"><div className="piece-badge dark">♟</div><div><strong>Stockfish</strong><span>Computer opponent</span></div></div>
                  <div className="depth-control"><span className="select-label">Depth</span><select className="select-control" value={depth} onChange={(event) => setDepth(Number(event.target.value))} aria-label="Stockfish search depth">{depths.map((value) => <option key={value} value={value}>{value} ply</option>)}</select></div>
                </div>
                <div className="board-frame">
                  <Chessboard
                    position={position}
                    onPieceDrop={onPieceDrop}
                    onPieceDragBegin={(_, square) => showLegalMoves(square)}
                    onSquareClick={onSquareClick}
                    boardOrientation="white"
                    arePiecesDraggable={!thinking && engineReady && !gameOutcome}
                    animationDuration={230}
                    customSquareStyles={squareStyles}
                    customDarkSquareStyle={{ backgroundColor: "#496675" }}
                    customLightSquareStyle={{ backgroundColor: "#c5cdd1" }}
                    customBoardStyle={{ borderRadius: "3px" }}
                  />
                </div>
                <div className="player-row">
                  <div className="player-id"><div className="piece-badge">♙</div><div><strong>You</strong><span>White pieces</span></div></div>
                  <span className="engine-badge"><span className="status-dot" />{status}</span>
                </div>
                <div className="board-footer"><div className="turn-indicator"><span className={`status-dot ${thinking ? "loading" : ""}`} />{status}</div><span className="move-count">{moves.length ? `Move ${Math.ceil(moves.length / 2)} · ${moves.length} ply` : "Opening position"}</span></div>
                {resultText && <div className="result-banner"><Swords size={14} />{resultText}</div>}
              </div>

              <div className="move-tray">
                <div className="move-tray-title"><span>Move history</span><strong>{moves.length ? `${moves.length} moves` : "No moves yet"}</strong></div>
                {movePairs.length ? <div className="moves-list">{movePairs.map((pair) => <span className={`move-chip ${pair.latest ? "latest" : ""}`} key={pair.number}><b>{pair.number}.</b>{pair.white || "…"}{pair.black && <span>{pair.black}</span>}</span>)}</div> : <div className="moves-list"><span className="move-chip">Your first move starts the lesson</span></div>}
              </div>
            </section>

            <aside className="coach-card">
              <div className="coach-header">
                <div className="coach-heading"><div className="coach-orb"><Sparkles /></div><div><h2>AI Coach</h2><p>Context on the move you just played</p></div></div>
                <span className={`coach-state ${coachEnabled ? "on" : ""}`}><span className="status-dot" />{coachEnabled ? "Enabled" : "Off"}</span>
              </div>
              <div className="chat-feed">
                <div className="chat-message">
                  <div className="message-avatar"><Bot size={15} /></div>
                  <div className="message-body"><div className="message-meta">ChessTutor <time>Welcome</time></div><p className="message-text">I’ll explain the ideas behind each position. Ask me for a hint whenever you want a concrete suggestion — otherwise, I’ll keep the next move to myself.</p></div>
                </div>
                {coachMessages.map((message) => <div className="chat-message" key={`${message.moveNumber}-${message.mover}-${message.san}`}><div className="message-avatar"><Bot size={15} /></div><div className="message-body"><div className="message-meta">Move {message.moveNumber} <time>{message.mover}</time></div><span className="message-move">{message.san}</span><p className="message-text">{message.text}</p></div></div>)}
                {pendingCoach > 0 && <div className="chat-message thinking-message"><div className="message-avatar"><Sparkles size={14} /></div><div className="message-body"><div className="message-meta">ChessTutor</div><p className="message-text">Reviewing the position…</p></div></div>}
                {!coachEnabled && coachMessages.length === 0 && <div className="chat-empty"><CircleHelp /><span>Turn on the AI Coach in Settings to get move-by-move commentary from your own model.</span></div>}
              </div>
              <div className="coach-input-note"><ShieldCheck /><span>Your board context is sent only when the coach is enabled. API keys stay on the server.</span><Link href="/settings" className="icon-btn" aria-label="Configure AI Coach"><Settings /></Link></div>
            </aside>
          </div>
        </div>
      </main>

      {gameOutcome && !resultDismissed && <div className={`game-result-overlay result-${gameOutcome.kind}`} role="dialog" aria-modal="true" aria-labelledby="game-result-title">
        {gameOutcome.kind === "win" && <div className="confetti" aria-hidden="true">{Array.from({ length: 28 }, (_, index) => <i key={index} />)}</div>}
        <div className="game-result-modal">
          <span className="result-icon" aria-hidden="true">{gameOutcome.kind === "win" ? "♛" : gameOutcome.kind === "loss" ? "♟" : "½"}</span>
          <span className="result-kicker">Game complete</span>
          <h2 id="game-result-title">{gameOutcome.title}</h2>
          <p>{gameOutcome.detail}</p>
          <div className="result-actions">
            <button className="button button-quiet" onClick={() => setResultDismissed(true)}>Review board</button>
            <button className="button button-primary" onClick={() => void startGame()}><RotateCcw />Play again</button>
          </div>
        </div>
      </div>}
    </div>
  );
}

// This ref gives a move a stable id even during the first render while the
// serverless game creation request is in flight.
const gameIdRefFallback = { current: "" };
if (!gameIdRefFallback.current && typeof crypto !== "undefined") gameIdRefFallback.current = crypto.randomUUID();
