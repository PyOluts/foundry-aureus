// =============================================================
// AUREUS — Map Painter
// Перекрашивает Map Notes в цвет владельца-фракции.
// Привязывается к хуку после каждого тика и при открытии сцены.
// =============================================================

import type { AureusState, Faction } from "../state/types.js";

// Foundry Note Document — ссылаемся через глобальный namespace
// чтобы не ломать tree-shaking

// -------------------------------------------------------------
// Основной метод: синхронизирует все ноты на текущей сцене
// с состоянием Aureus
// -------------------------------------------------------------
export async function repaintMapNotes(state: AureusState): Promise<void> {
  const scene = (game as Game).scenes?.active;
  if (!scene) return;

  // Получаем все ноты текущей сцены
  const notes = scene.notes?.contents ?? [];
  if (notes.length === 0) return;

  const updates: Array<{ _id: string; "flags.aureus.ownerId": string | null; "texture.tint": string | null }> = [];

  for (const note of notes) {
    const noteId = note.id;
    if (!noteId) continue;

    // Ищем MapNode с таким же id
    const mapNode = state.nodes[noteId];
    if (!mapNode) continue; // Нота не связана с Aureus — пропускаем

    const owner = mapNode.ownerId ? state.factions[mapNode.ownerId] : null;
    const tint = owner ? owner.color : null; // null → сбрасывает тинт к дефолту

    updates.push({
      _id: noteId,
      "flags.aureus.ownerId": mapNode.ownerId,
      "texture.tint": tint,
    });
  }

  if (updates.length > 0) {
    // Batch update — один запрос к БД вместо N
    await scene.updateEmbeddedDocuments("Note", updates);
    console.debug(`[Aureus|MapPainter] Updated ${updates.length} map notes.`);
  }
}

// -------------------------------------------------------------
// Hover Preview Tooltip (вызывается из хука hoverNote)
// Показывает имя владельца при наведении на ноту
// -------------------------------------------------------------
export function registerHoverPreview(getState: () => AureusState): void {
  Hooks.on("hoverNote", (note: Note, hovered: boolean) => {
    if (!hovered) return;

    const noteId = note.id;
    if (!noteId) return;

    const state = getState();
    const mapNode = state.nodes[noteId];
    if (!mapNode) return;

    const owner: Faction | undefined = mapNode.ownerId
      ? state.factions[mapNode.ownerId]
      : undefined;

    const ownerLabel = owner
      ? `<span style="color:${owner.color};font-weight:600;">${owner.name}</span>`
      : `<span style="color:#6b6880;">Нейтральная территория</span>`;

    // Выводим краткий тултип через ui.notifications (не захламляет чат)
    ui.notifications?.info(
      `🏰 <strong>${mapNode.name}</strong> — ${ownerLabel}`,
      { permanent: false, localize: false, console: false }
    );
  });
}

// -------------------------------------------------------------
// Инициализация хуков карты
// Вызывается один раз из module.ts в блоке ready
// -------------------------------------------------------------
export function registerMapHooks(getState: () => AureusState): void {
  // Перекрашиваем при открытии/активации сцены
  Hooks.on("canvasReady", () => {
    repaintMapNotes(getState());
  });

  // Hover-тултип
  registerHoverPreview(getState);

  console.info("[Aureus|MapPainter] Map hooks registered.");
}
