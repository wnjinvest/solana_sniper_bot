/**
 * app/api/settings/route.ts
 *
 * GET  /api/settings  — leest de huidige .env waarden van de bot
 * POST /api/settings  — schrijft één of meerdere sleutels naar de .env
 */

import { NextResponse } from 'next/server';
import fs   from 'fs';
import path from 'path';

const ENV_PATH = path.resolve('/opt/claude/stb/.env');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parseer een .env bestand naar een key-value object */
function parseEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const key   = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    result[key] = value;
  }
  return result;
}

/** Vervang de waarde van één sleutel in de .env inhoud.
 *  Als de sleutel nog niet bestaat wordt hij aan het einde toegevoegd. */
function setEnvValue(content: string, key: string, value: string): string {
  const regex = new RegExp(`^(${escapeRegex(key)}=).*$`, 'm');
  if (regex.test(content)) {
    return content.replace(regex, `${key}=${value}`);
  }
  return content.trimEnd() + `\n${key}=${value}\n`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── GET /api/settings ─────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  try {
    const content = fs.readFileSync(ENV_PATH, 'utf8');
    const values  = parseEnv(content);
    return NextResponse.json(values);
  } catch (err) {
    return NextResponse.json(
      { error: `Kon .env niet lezen: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

// ── POST /api/settings ────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON body' }, { status: 400 });
  }

  // Ondersteun zowel één sleutel { key, value } als meerdere { updates: [...] }
  const updates: Array<{ key: string; value: string }> = [];

  if (
    typeof body === 'object' && body !== null &&
    'key' in body && typeof (body as Record<string, unknown>).key === 'string'
  ) {
    const b = body as { key: string; value: string };
    updates.push({ key: b.key, value: String(b.value ?? '') });
  } else if (
    typeof body === 'object' && body !== null &&
    'updates' in body && Array.isArray((body as Record<string, unknown>).updates)
  ) {
    const b = body as { updates: Array<{ key: string; value: string }> };
    updates.push(...b.updates.map((u) => ({ key: u.key, value: String(u.value ?? '') })));
  } else {
    return NextResponse.json({ error: 'Verwacht { key, value } of { updates: [...] }' }, { status: 400 });
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'Geen updates opgegeven' }, { status: 400 });
  }

  // Valideer sleutels (alleen hoofdletters, cijfers en underscores)
  const invalidKey = updates.find((u) => !/^[A-Z0-9_]+$/.test(u.key));
  if (invalidKey) {
    return NextResponse.json(
      { error: `Ongeldige sleutelnaam: "${invalidKey.key}"` },
      { status: 400 }
    );
  }

  try {
    let content = fs.readFileSync(ENV_PATH, 'utf8');
    for (const { key, value } of updates) {
      content = setEnvValue(content, key, value);
    }
    fs.writeFileSync(ENV_PATH, content, 'utf8');

    return NextResponse.json({ ok: true, updated: updates.map((u) => u.key) });
  } catch (err) {
    return NextResponse.json(
      { error: `Kon .env niet schrijven: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
