import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { isDatabaseConfigured, query } from "@/lib/db";
import { buildCoachSystemPrompt, coachEndpoint, extractCoachText } from "@/lib/coach";
import { memoryStore } from "@/lib/memory-store";
import { getSettings } from "@/lib/settings-store";

type CoachBody = {
  gameId?: string;
  moveNumber?: number;
  san?: string;
  fenAfter?: string;
  mover?: "Player" | "Stockfish";
  pgn?: string;
  result?: string;
  snapshot?: unknown;
  moveHistory?: unknown;
};

function fallbackCommentary(enabled: boolean, hasCredentials: boolean) {
  if (!enabled) return null;
  if (!hasCredentials) return "Your coach is enabled, but it still needs an API key, model, and base URL in Settings.";
  return "The coach could not reach the configured model just now. Your move is still saved — check the provider URL and try another move.";
}

async function saveMove(userId: string, body: Required<Pick<CoachBody, "gameId" | "moveNumber" | "san" | "fenAfter" | "mover">> & Pick<CoachBody, "result">, commentary: string | null, pgn?: string) {
  if (isDatabaseConfigured()) {
    await query(
      "INSERT INTO moves (game_id, move_number, san, fen_after, mover, coach_commentary) SELECT $1, $2, $3, $4, $5, $6 WHERE EXISTS (SELECT 1 FROM games WHERE id = $1 AND user_id = $7)",
      [body.gameId, body.moveNumber, body.san, body.fenAfter, body.mover, commentary, userId],
    );
    if (pgn !== undefined) {
      await query(
        "UPDATE games SET pgn = $1, ended_at = CASE WHEN $4 IS NOT NULL THEN NOW() ELSE ended_at END, result = COALESCE($4, result) WHERE id = $2 AND user_id = $3 AND NOT EXISTS (SELECT 1 FROM moves WHERE game_id = $2 AND move_number > $5)",
        [pgn, body.gameId, userId, body.result || null, body.moveNumber],
      );
    }
    return;
  }
  if (!memoryStore.games.has(body.gameId)) {
    memoryStore.games.set(body.gameId, { id: body.gameId, userId, pgn: pgn || "", startedAt: new Date().toISOString() });
  }
  memoryStore.moves.push({ id: randomUUID(), ...body, coachCommentary: commentary } as typeof memoryStore.moves[number]);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CoachBody;
    if (!body.gameId || !body.san || !body.fenAfter || !body.mover || !body.moveNumber) {
      return NextResponse.json({ error: "A complete move record is required." }, { status: 400 });
    }
    const userId = await getCurrentUserId();
    const settings = await getSettings(userId);
    let commentary = fallbackCommentary(settings.enabled, Boolean(settings.apiBaseUrl && settings.apiKeyEncrypted && settings.modelName));

    if (settings.enabled && settings.apiBaseUrl && settings.apiKeyEncrypted && settings.modelName) {
      try {
        const endpoint = coachEndpoint(settings.apiBaseUrl);
        const apiKey = decryptSecret(settings.apiKeyEncrypted);
        if (!apiKey) throw new Error("The saved API key could not be decrypted.");
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20_000);
        const providerResponse = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: settings.modelName,
            temperature: settings.skillLevel === "Pro" ? 0.3 : 0.45,
            max_tokens: 240,
            messages: [
              { role: "system", content: buildCoachSystemPrompt(settings.skillLevel) },
              {
                role: "user",
                content: `Review the move that was just played. Do not give a next-move suggestion unless the player explicitly asked for a hint.\n\nMove record: ${JSON.stringify({ moveNumber: body.moveNumber, san: body.san, mover: body.mover, fenAfter: body.fenAfter })}\n\nBoard snapshot JSON: ${JSON.stringify(body.snapshot ?? [])}\n\nMove history JSON: ${JSON.stringify(body.moveHistory ?? [])}`,
              },
            ],
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!providerResponse.ok) throw new Error(`Coach provider returned ${providerResponse.status}.`);
        commentary = extractCoachText(await providerResponse.json()) || fallbackCommentary(true, true);
      } catch (error) {
        console.error("Coach request failed", error instanceof Error ? error.message : error);
        commentary = fallbackCommentary(true, true);
      }
    }

    await saveMove(userId, {
      gameId: body.gameId,
      moveNumber: body.moveNumber,
      san: body.san,
      fenAfter: body.fenAfter,
      mover: body.mover,
      result: body.result,
    }, commentary, body.pgn);

    return NextResponse.json({ commentary });
  } catch (error) {
    console.error("Unable to process coach move", error);
    return NextResponse.json({ error: "Move commentary could not be saved." }, { status: 500 });
  }
}
