import { isDatabaseConfigured, query } from "./db";
import { memoryStore, type MemorySettings } from "./memory-store";
import type { SkillLevel } from "./coach";

export type StoredSettings = {
  id?: string;
  userId: string;
  enabled: boolean;
  apiBaseUrl: string;
  apiKeyEncrypted: string;
  modelName: string;
  skillLevel: SkillLevel;
};

export const defaultSettings = (userId: string): StoredSettings => ({
  userId,
  enabled: false,
  apiBaseUrl: "",
  apiKeyEncrypted: "",
  modelName: "",
  skillLevel: "Intermediate",
});

export async function getSettings(userId: string): Promise<StoredSettings> {
  if (!isDatabaseConfigured()) {
    const saved = memoryStore.settings.get(userId);
    return saved ? { ...saved } : defaultSettings(userId);
  }

  const rows = await query<{
    id: string;
    user_id: string;
    enabled: boolean;
    api_base_url: string;
    api_key_encrypted: string;
    model_name: string;
    skill_level: SkillLevel;
  }>(
    "SELECT id, user_id, enabled, api_base_url, api_key_encrypted, model_name, skill_level FROM ai_settings WHERE user_id = $1 LIMIT 1",
    [userId],
  );
  const row = rows[0];
  if (!row) return defaultSettings(userId);
  return {
    id: row.id,
    userId: row.user_id,
    enabled: row.enabled,
    apiBaseUrl: row.api_base_url,
    apiKeyEncrypted: row.api_key_encrypted,
    modelName: row.model_name,
    skillLevel: row.skill_level,
  };
}

export async function saveSettings(settings: StoredSettings) {
  if (!isDatabaseConfigured()) {
    memoryStore.settings.set(settings.userId, settings as MemorySettings);
    return settings;
  }

  const rows = await query<{ id: string }>(
    `INSERT INTO ai_settings (user_id, api_base_url, api_key_encrypted, model_name, skill_level, enabled)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       api_base_url = EXCLUDED.api_base_url,
       api_key_encrypted = EXCLUDED.api_key_encrypted,
       model_name = EXCLUDED.model_name,
       skill_level = EXCLUDED.skill_level,
       enabled = EXCLUDED.enabled,
       updated_at = NOW()
     RETURNING id`,
    [settings.userId, settings.apiBaseUrl, settings.apiKeyEncrypted, settings.modelName, settings.skillLevel, settings.enabled],
  );
  return { ...settings, id: rows[0]?.id || settings.id };
}
