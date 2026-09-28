import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { getSettings, saveSettings } from "@/lib/settings-store";
import type { SkillLevel } from "@/lib/coach";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const skills: SkillLevel[] = ["Beginner", "Intermediate", "Pro"];

function publicSettings(settings: Awaited<ReturnType<typeof getSettings>>) {
  return {
    enabled: settings.enabled,
    apiBaseUrl: settings.apiBaseUrl,
    modelName: settings.modelName,
    skillLevel: settings.skillLevel,
    hasApiKey: Boolean(settings.apiKeyEncrypted),
  };
}

export async function GET() {
  const userId = await getCurrentUserId();
  const settings = await getSettings(userId);
  return NextResponse.json(publicSettings(settings), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      enabled?: boolean;
      apiBaseUrl?: string;
      apiKey?: string;
      modelName?: string;
      skillLevel?: SkillLevel;
    };
    const userId = await getCurrentUserId();
    const existing = await getSettings(userId);
    const skillLevel = skills.includes(body.skillLevel as SkillLevel)
      ? (body.skillLevel as SkillLevel)
      : existing.skillLevel;
    const apiBaseUrl = String(body.apiBaseUrl ?? "").trim();
    if (apiBaseUrl) {
      try {
        const url = new URL(apiBaseUrl);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      } catch {
        return NextResponse.json({ error: "Enter a valid HTTP or HTTPS API base URL." }, { status: 400 });
      }
    }

    const rawKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const saved = await saveSettings({
      ...existing,
      userId,
      enabled: Boolean(body.enabled),
      apiBaseUrl,
      apiKeyEncrypted: rawKey ? encryptSecret(rawKey) : existing.apiKeyEncrypted,
      modelName: String(body.modelName ?? "").trim(),
      skillLevel,
    });
    return NextResponse.json(publicSettings(saved), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Unable to save ChessTutor settings", error);
    return NextResponse.json({ error: "Settings could not be saved." }, { status: 500 });
  }
}
