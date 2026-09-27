import type { SkillLevel } from "./coach";

export type MemorySettings = {
  userId: string;
  enabled: boolean;
  apiBaseUrl: string;
  apiKeyEncrypted: string;
  modelName: string;
  skillLevel: SkillLevel;
};

export type MemoryGame = {
  id: string;
  userId: string;
  pgn: string;
  startedAt: string;
};

export type MemoryMove = {
  id: string;
  gameId: string;
  moveNumber: number;
  san: string;
  fenAfter: string;
  mover: "Player" | "Stockfish";
  coachCommentary: string | null;
};

type MemoryStore = {
  settings: Map<string, MemorySettings>;
  games: Map<string, MemoryGame>;
  moves: MemoryMove[];
};

const globalForStore = globalThis as typeof globalThis & { __chessTutorStore?: MemoryStore };

export const memoryStore: MemoryStore =
  globalForStore.__chessTutorStore || {
    settings: new Map(),
    games: new Map(),
    moves: [],
  };

globalForStore.__chessTutorStore = memoryStore;
