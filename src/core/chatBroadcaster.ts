// =============================================================
// AUREUS — Chat Broadcaster
// Транслирует major/critical события в чат Foundry VTT
// Вызывается из TickManager после Apply-фазы
// =============================================================

import type { WorldEvent, Faction } from "../state/types.js";

// Иконки по типу события (для читаемости в чате)
const EVENT_ICONS: Record<string, string> = {
  attack:            "⚔️",
  expand:            "🏳️",
  tax:               "🪙",
  fortify:           "🛡️",
  conflict_resolved: "🤝",
};

const SEVERITY_COLORS: Record<WorldEvent["severity"], string> = {
  minor:    "#6b6880",
  major:    "#e8a045",
  critical: "#e05252",
};

// -------------------------------------------------------------
// Основной метод — вызывается в конце каждого тика
// Публикует в чат только major и critical события
// -------------------------------------------------------------
export async function broadcastTickEvents(
  events: WorldEvent[],
  factions: Record<string, Faction>,
  tick: number
): Promise<void> {
  const notable = events.filter(
    (e) => e.severity === "major" || e.severity === "critical"
  );

  if (notable.length === 0) return;

  // Собираем все notable-события в одно сообщение чата (не спамим по одному)
  const icon = notable.some((e) => e.severity === "critical") ? "🔴" : "🟡";
  const headerColor = notable.some((e) => e.severity === "critical")
    ? SEVERITY_COLORS.critical
    : SEVERITY_COLORS.major;

  const rows = notable
    .map((e) => {
      const faction = factions[e.factionId];
      const factionColor = faction?.color ?? "#888";
      const factionName = faction?.name ?? e.factionId;
      return `
        <li style="margin: 4px 0; display:flex; gap:6px; align-items:baseline;">
          <span>${EVENT_ICONS[e.type] ?? "📋"}</span>
          <span style="color:${factionColor}; font-weight:600;">${factionName}</span>
          <span style="color:#c8c3bc;">${e.message}</span>
        </li>`;
    })
    .join("");

  const content = `
    <div style="
      background: #13131e;
      border: 1px solid ${headerColor};
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 12px;
      font-family: 'Inter', sans-serif;
    ">
      <div style="
        color: ${headerColor};
        font-weight: 700;
        font-size: 11px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        margin-bottom: 6px;
      ">
        ${icon} Aureus — Ход ${tick}
      </div>
      <ul style="list-style:none; padding:0; margin:0;">
        ${rows}
      </ul>
    </div>`;

  await ChatMessage.create({
    content,
    // whisper: [] → виден всем; для GM-only: ChatMessage.getWhisperRecipients("GM")
    speaker: { alias: "Симулятор Мира" },
    flags: { [MODULE_ID_PLACEHOLDER]: { type: "tick-broadcast", tick } },
  });
}

// Константа MODULE_ID дублируется здесь чтобы не создавать циклический импорт
// (types.ts → chatBroadcaster ← tickManager → types.ts)
const MODULE_ID_PLACEHOLDER = "aureus";
