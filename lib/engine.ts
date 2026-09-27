"use client";

export type EngineMessageEvent = { data?: string } | string;

export type StockfishEngine = {
  postMessage: (message: string) => void;
  onmessage: ((event: EngineMessageEvent) => void) | null;
  terminate?: () => void;
};

/**
 * Stockfish's browser build is served as a dedicated worker. Keeping the
 * worker URL in /public avoids bundling the Node entrypoint (which imports
 * fs), while the accompanying WASM binary stays entirely client-side.
 */
export function loadStockfish() {
  return new Promise<StockfishEngine>((resolve, reject) => {
    const worker = new Worker("/stockfish/stockfish-19-lite-single.js");
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new Error("Stockfish did not initialize."));
    }, 20_000);
    worker.onerror = () => {
      window.clearTimeout(timeout);
      worker.terminate();
      reject(new Error("Stockfish WASM could not be loaded."));
    };
    worker.onmessage = (event) => {
      if (event.data === "uciok") {
        window.clearTimeout(timeout);
        // `Worker` has the same message surface as our tiny engine adapter.
        resolve(worker as unknown as StockfishEngine);
      }
    };
    worker.postMessage("uci");
  });
}

export function askStockfish(engine: StockfishEngine, fen: string, depth: number) {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Stockfish took too long to answer."));
    }, 45_000);

    engine.onmessage = (event) => {
      const line = typeof event === "string" ? event : event.data || "";
      if (!line.startsWith("bestmove")) return;
      const bestMove = line.split(/\s+/)[1];
      if (!bestMove || bestMove === "(none)") {
        window.clearTimeout(timeout);
        settled = true;
        reject(new Error("Stockfish did not find a legal move."));
        return;
      }
      window.clearTimeout(timeout);
      settled = true;
      resolve(bestMove);
    };

    engine.postMessage("ucinewgame");
    engine.postMessage(`setoption name Skill Level value ${Math.max(0, Math.min(20, Math.round(depth)))} `);
    engine.postMessage(`position fen ${fen}`);
    engine.postMessage(`go depth ${depth}`);
  });
}
