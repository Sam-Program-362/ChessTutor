import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { isDatabaseConfigured, query } from "@/lib/db";
import { memoryStore } from "@/lib/memory-store";

export async function POST() {
  const userId = await getCurrentUserId();
  if (isDatabaseConfigured()) {
    const rows = await query<{ id: string }>(
      "INSERT INTO games (user_id, pgn) VALUES ($1, $2) RETURNING id",
      [userId, ""],
    );
    if (rows[0]?.id) return NextResponse.json({ gameId: rows[0].id });
  }

  const gameId = randomUUID();
  memoryStore.games.set(gameId, {
    id: gameId,
    userId,
    pgn: "",
    startedAt: new Date().toISOString(),
  });
  return NextResponse.json({ gameId });
}
