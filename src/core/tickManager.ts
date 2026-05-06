// =============================================================
// AUREUS — Tick Manager (Вечер 2: полная реализация)
// Паттерн: Intent → Resolve → Apply
// =============================================================

import { StateManager, createSeededRandom } from "../state/stateManager.js";
import { broadcastTickEvents } from "./chatBroadcaster.js";
import { repaintMapNotes } from "./mapPainter.js";
import type {
  AureusState,
  Faction,
  MapNode,
  FactionIntent,
  ConflictResult,
  WorldEvent,
  ActionType,
} from "../state/types.js";

// =============================================================
// PHASE 1 — INTENTS (AI Engine)
// Каждая фракция выбирает ровно 1 действие за ход
// Приоритеты взвешены по personality (aggression, greed, caution)
// =============================================================

function generateIntents(
  state: AureusState,
  rand: () => number
): FactionIntent[] {
  const intents: FactionIntent[] = [];

  for (const faction of Object.values(state.factions)) {
    if (faction.units <= 0) {
      // Мёртвая фракция — только налоги (восстановление)
      intents.push({ factionId: faction.id, action: "tax", targetNodeId: null });
      continue;
    }

    const intent = chooseFactionIntent(faction, state, rand);
    intents.push(intent);

    console.debug(
      `[Aureus|AI] ${faction.name} → ${intent.action}` +
      (intent.targetNodeId ? ` → node:${intent.targetNodeId}` : "")
    );
  }

  return intents;
}

function chooseFactionIntent(
  faction: Faction,
  state: AureusState,
  rand: () => number
): FactionIntent {
  // Собираем соседей подконтрольных нод (фронт)
  const frontier = getFrontierNodes(faction, state);
  const enemyFrontier = frontier.filter(
    (n) => n.ownerId !== null && n.ownerId !== faction.id
  );
  const neutralFrontier = frontier.filter((n) => n.ownerId === null);

  // Взвешенный выбор действий по личности
  // Веса: attack(aggression), expand(greed, нейтралы), fortify(caution), tax(caution*0.5)
  const weights: Record<ActionType, number> = {
    attack: faction.aggression * (enemyFrontier.length > 0 ? 1.5 : 0.1),
    expand: faction.greed * (neutralFrontier.length > 0 ? 1.2 : 0.05),
    fortify: faction.caution * 0.8,
    tax: faction.caution * 0.5 + 0.2, // Минимальный базовый вес всегда есть
  };

  // Принудительная генерация дохода если совсем broke
  if (faction.gold < 5) {
    weights.tax += 2.0;
    weights.attack *= 0.3;
  }

  const action = weightedChoice(weights, rand);

  // Выбираем цель
  let targetNodeId: string | null = null;
  if (action === "attack" && enemyFrontier.length > 0) {
    // Атакуем наиболее слабого (у кого меньше соседей фракции = менее укреплён)
    const target = enemyFrontier[Math.floor(rand() * enemyFrontier.length)];
    targetNodeId = target.id;
  } else if (action === "expand" && neutralFrontier.length > 0) {
    const target = neutralFrontier[Math.floor(rand() * neutralFrontier.length)];
    targetNodeId = target.id;
  } else if (action === "fortify" && faction.controlledNodes.length > 0) {
    // Укрепляем случайную свою ноду
    targetNodeId =
      faction.controlledNodes[
        Math.floor(rand() * faction.controlledNodes.length)
      ];
  }

  // Если нужный тип недоступен — откатываемся на tax
  if (
    (action === "attack" && enemyFrontier.length === 0) ||
    (action === "expand" && neutralFrontier.length === 0)
  ) {
    return { factionId: faction.id, action: "tax", targetNodeId: null };
  }

  return { factionId: faction.id, action, targetNodeId };
}

/** Возвращает ноды-соседи от подконтрольной территории фракции */
function getFrontierNodes(faction: Faction, state: AureusState): MapNode[] {
  const visited = new Set<string>();
  const result: MapNode[] = [];

  for (const nodeId of faction.controlledNodes) {
    const node = state.nodes[nodeId];
    if (!node) continue;

    for (const neighborId of node.neighbors) {
      if (visited.has(neighborId)) continue;
      visited.add(neighborId);

      const neighbor = state.nodes[neighborId];
      if (neighbor && neighbor.ownerId !== faction.id) {
        result.push(neighbor);
      }
    }
  }
  return result;
}

/** Взвешенный рандомный выбор из объекта весов */
function weightedChoice(
  weights: Record<ActionType, number>,
  rand: () => number
): ActionType {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let roll = rand() * total;
  for (const [key, w] of Object.entries(weights)) {
    roll -= w;
    if (roll <= 0) return key as ActionType;
  }
  return "tax";
}

// =============================================================
// PHASE 2 — RESOLVE (чистая математика, без мутаций стейта)
// Обрабатываем конфликты когда ≥2 фракции атакуют одну ноду
// или одна атакует другую
// =============================================================

function resolveConflicts(
  intents: FactionIntent[],
  state: AureusState,
  rand: () => number
): ConflictResult[] {
  const results: ConflictResult[] = [];

  // Группируем атаки по целям
  const attacksByTarget = new Map<string, FactionIntent[]>();
  for (const intent of intents) {
    if (intent.action === "attack" && intent.targetNodeId) {
      const list = attacksByTarget.get(intent.targetNodeId) ?? [];
      list.push(intent);
      attacksByTarget.set(intent.targetNodeId, list);
    }
  }

  for (const [nodeId, attackers] of attacksByTarget.entries()) {
    const node = state.nodes[nodeId];
    if (!node) continue;

    // Если нода нейтральная — первый нападающий побеждает без потерь
    if (node.ownerId === null) {
      const winner = attackers[0];
      results.push({
        winnerId: winner.factionId,
        loserId: "neutral",
        nodeId,
        attackerLosses: 0,
        defenderLosses: 0,
      });
      continue;
    }

    // Берём первого атакующего, остальные — тоже несут потери но без конкретного результата
    const attacker = attackers[0];
    const defenderFaction = state.factions[node.ownerId];
    const attackerFaction = state.factions[attacker.factionId];

    if (!defenderFaction || !attackerFaction) continue;
    if (attacker.factionId === node.ownerId) continue; // Нельзя атаковать себя

    // Боевая математика
    const attackPower =
      attackerFaction.units * attackerFaction.aggression * (0.7 + rand() * 0.6);
    const defensePower =
      defenderFaction.units * (1 - defenderFaction.aggression) * (0.7 + rand() * 0.6);

    const attackerWins = attackPower > defensePower;
    const attackerLosses = Math.ceil(defensePower * 0.3);
    const defenderLosses = Math.ceil(attackPower * 0.3);

    results.push({
      winnerId: attackerWins ? attacker.factionId : node.ownerId,
      loserId: attackerWins ? node.ownerId : attacker.factionId,
      nodeId,
      attackerLosses,
      defenderLosses,
    });
  }

  return results;
}

// =============================================================
// PHASE 3 — APPLY (мутируем стейт и батчим запись)
// =============================================================

function applyResults(
  state: AureusState,
  intents: FactionIntent[],
  conflicts: ConflictResult[],
  rand: () => number
): WorldEvent[] {
  const newEvents: WorldEvent[] = [];
  const tick = state.tick;

  // --- Применяем результаты боёв ---
  const conflictNodeIds = new Set(conflicts.map((c) => c.nodeId));
  for (const conflict of conflicts) {
    const node = state.nodes[conflict.nodeId];
    if (!node) continue;

    const wasNeutral = conflict.loserId === "neutral";
    const attackerFaction = state.factions[conflict.winnerId];
    const defenderFaction = wasNeutral ? null : state.factions[conflict.loserId];

    if (!attackerFaction) continue;

    // Применяем потери обеим сторонам
    if (!wasNeutral) {
      attackerFaction.units = Math.max(
        0,
        attackerFaction.units - conflict.attackerLosses
      );
    }

    const attackerWins = conflict.winnerId !== node.ownerId;

    if (attackerWins) {
      // Снимаем ноду у защитника
      if (defenderFaction) {
        defenderFaction.units = Math.max(
          0,
          defenderFaction.units - conflict.defenderLosses
        );
        defenderFaction.controlledNodes = defenderFaction.controlledNodes.filter(
          (id) => id !== conflict.nodeId
        );
      }
      // Передаём ноду победителю
      node.ownerId = conflict.winnerId;
      attackerFaction.controlledNodes.push(conflict.nodeId);

      const severity =
        conflict.attackerLosses + conflict.defenderLosses > 5
          ? "major"
          : "minor";
      newEvents.push(makeEvent("attack", severity, conflict.winnerId, conflict.nodeId, tick,
        wasNeutral
          ? `${attackerFaction.name} занимает нейтральную ноду «${node.name}».`
          : `${attackerFaction.name} захватывает «${node.name}» у ${defenderFaction?.name ?? "???"}. Потери: нападающий −${conflict.attackerLosses}, защитник −${conflict.defenderLosses}.`
      ));
    } else {
      // Атака отбита
      if (defenderFaction) {
        defenderFaction.units = Math.max(
          0,
          defenderFaction.units - conflict.defenderLosses
        );
      }
      const attFactionId = intents.find((i) => i.targetNodeId === conflict.nodeId)?.factionId;
      const attFac = attFactionId ? state.factions[attFactionId] : undefined;
      if (attFac) attFac.units = Math.max(0, attFac.units - conflict.attackerLosses);

      newEvents.push(makeEvent("conflict_resolved", "minor", conflict.loserId, conflict.nodeId, tick,
        `Атака на «${node.name}» отражена. Потери нападающего: −${conflict.attackerLosses}.`
      ));
    }
  }

  // --- Применяем не-боевые действия ---
  for (const intent of intents) {
    if (intent.action === "attack") continue; // Уже обработано
    if (intent.action === "expand" && intent.targetNodeId && !conflictNodeIds.has(intent.targetNodeId)) {
      // Экспансия на нейтраль (не было конфликта)
      const node = state.nodes[intent.targetNodeId];
      const faction = state.factions[intent.factionId];
      if (!node || !faction || node.ownerId !== null) continue;

      node.ownerId = faction.id;
      faction.controlledNodes.push(node.id);
      newEvents.push(makeEvent("expand", "minor", faction.id, node.id, tick,
        `${faction.name} расширяет владения, занимая «${node.name}».`
      ));
    }

    if (intent.action === "tax") {
      const faction = state.factions[intent.factionId];
      if (!faction) continue;
      // Золото = количество нод * 2 + базовый 3
      const income = faction.controlledNodes.length * 2 + 3;
      faction.gold += income;
      newEvents.push(makeEvent("tax", "minor", faction.id, null, tick,
        `${faction.name} собирает налоги: +${income} золота. (Итого: ${faction.gold})`
      ));
    }

    if (intent.action === "fortify") {
      const faction = state.factions[intent.factionId];
      if (!faction || faction.gold < 5) continue;
      // Стоимость укрепления — 5 золота, прирост войск — 3
      faction.gold -= 5;
      faction.units += 3;
      newEvents.push(makeEvent("fortify", "minor", faction.id, intent.targetNodeId, tick,
        `${faction.name} укрепляет позиции: −5 золота, +3 юнита.`
      ));
    }
  }

  // --- Пассивный прирост золота от нод всем фракциям (baseline economy) ---
  // Уже учтён в tax-action. Дополнительно — небольшая пассивная добыча.
  for (const faction of Object.values(state.factions)) {
    const passiveIncome = Math.floor(faction.controlledNodes.length * 0.5);
    if (passiveIncome > 0) faction.gold += passiveIncome;
  }

  return newEvents;
}

// =============================================================
// Вспомогательные функции
// =============================================================

function makeEvent(
  type: WorldEvent["type"],
  severity: WorldEvent["severity"],
  factionId: string,
  targetNodeId: string | null,
  tick: number,
  message: string
): WorldEvent {
  return {
    id: crypto.randomUUID(),
    type,
    severity,
    factionId,
    targetNodeId,
    message,
    tick,
    timestamp: Date.now(),
  };
}

// =============================================================
// TICK MANAGER — публичный API
// =============================================================

export class TickManager {
  private static _isRunning = false;
  // Seed по умолчанию — based on tick (детерминированный replay)
  // Можно перекрыть через window.Aureus.setDebugSeed()
  static debugSeed: number | null = null;

  static async runTick(): Promise<void> {
    if (this._isRunning) {
      console.warn("[Aureus] Tick skipped — already running.");
      return;
    }
    this._isRunning = true;

    try {
      const state = StateManager.getState();
      state.tick += 1;

      // Seed: дебаг-seed > tick-based seed (для воспроизводимости)
      const seed = this.debugSeed ?? state.tick * 0xdeadbeef;
      const rand = createSeededRandom(seed);

      console.group(`[Aureus] === TICK ${state.tick} (seed: ${seed}) ===`);

      // --- Phase 1: Intents ---
      console.groupCollapsed("[Aureus] Phase 1: Generating intents...");
      const intents = generateIntents(state, rand);
      console.table(intents);
      console.groupEnd();

      // --- Phase 2: Resolve ---
      console.groupCollapsed("[Aureus] Phase 2: Resolving conflicts...");
      const conflicts = resolveConflicts(intents, state, rand);
      console.table(conflicts);
      console.groupEnd();

      // --- Phase 3: Apply ---
      console.groupCollapsed("[Aureus] Phase 3: Applying results...");
      const newEvents = applyResults(state, intents, conflicts, rand);
      state.events.push(...newEvents);
      console.log(`Generated ${newEvents.length} events.`);
      console.groupEnd();

      console.groupEnd();

      // --- Batch Write ---
      await StateManager.setState(state);

      // --- Post-Tick: Chat + Map (Вечер 3) ---
      // Транслируем major/critical события в чат
      await broadcastTickEvents(newEvents, state.factions, state.tick);

      // Перекрашиваем ноты на активной карте
      await repaintMapNotes(state);

      console.info(
        `[Aureus] Tick ${state.tick} complete. ` +
        `Intents: ${intents.length}, Conflicts: ${conflicts.length}, Events: ${newEvents.length}`
      );
    } finally {
      this._isRunning = false;
    }
  }
}
