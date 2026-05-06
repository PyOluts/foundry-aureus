// =============================================================
// AUREUS — State Manager
// Тонкий слой над world-level flags.
// Отвечает ТОЛЬКО за: getState / setState / validate / version check
// =============================================================

import {
  AureusState,
  Faction,
  MapNode,
  MODULE_ID,
  STATE_FLAG_KEY,
  STATE_VERSION,
  WORLD_LIMITS,
} from "./types.js";
import { createMockTopology } from "../core/topology.js";

// -------------------------------------------------------------
// Seed-based pseudo-random (Mulberry32 — быстрый и детерминированный)
// Используется для воспроизводимого дебага AI
// -------------------------------------------------------------
export function createSeededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0; s = s + 0x6d2b79f5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// -------------------------------------------------------------
// Default State — создается когда флаги пусты или битые
// -------------------------------------------------------------
function createDefaultState(): AureusState {
  return {
    version: STATE_VERSION,
    tick: 0,
    factions: {},
    nodes: {},
    events: [],
  };
}

// -------------------------------------------------------------
// Seed Data — 2 тестовые фракции для быстрого старта
// -------------------------------------------------------------
export function createSeedFactions(): Record<string, Faction> {
  const imperials: Faction = {
    id: "imperials",
    name: "Империя Солнца",
    color: "#f4a261",
    gold: 50,
    units: 10,
    aggression: 0.7,
    caution: 0.3,
    greed: 0.5,
    controlledNodes: [],
  };

  const voidCult: Faction = {
    id: "void-cult",
    name: "Культ Пустоты",
    color: "#6a0572",
    gold: 30,
    units: 8,
    aggression: 0.9,
    caution: 0.1,
    greed: 0.8,
    controlledNodes: [],
  };

  return {
    [imperials.id]: imperials,
    [voidCult.id]: voidCult,
  };
}

// -------------------------------------------------------------
// Validation & Migration
// -------------------------------------------------------------
function validate(raw: unknown): AureusState {
  // Fail-safe: если данные отсутствуют или версия несовместима
  if (
    !raw ||
    typeof raw !== "object" ||
    (raw as AureusState).version !== STATE_VERSION
  ) {
    console.warn(
      `[Aureus] State missing or version mismatch. Creating default state.`
    );
    return createDefaultState();
  }

  const state = raw as AureusState;

  // Защита от взрыва размеров
  const factionCount = Object.keys(state.factions ?? {}).length;
  const nodeCount = Object.keys(state.nodes ?? {}).length;

  if (factionCount > WORLD_LIMITS.MAX_FACTIONS) {
    console.warn(`[Aureus] Too many factions (${factionCount}). Trimming.`);
  }
  if (nodeCount > WORLD_LIMITS.MAX_NODES) {
    console.warn(`[Aureus] Too many nodes (${nodeCount}). Trimming.`);
  }

  // Обрезаем лог событий если разросся
  if (state.events?.length > WORLD_LIMITS.MAX_EVENTS) {
    state.events = state.events.slice(-WORLD_LIMITS.MAX_EVENTS);
  }

  return state;
}

// -------------------------------------------------------------
// StateManager — публичный API
// -------------------------------------------------------------
export class StateManager {
  private static _cache: AureusState | null = null;

  // --- READ ---
  static getState(): AureusState {
    if (this._cache) return this._cache;

    const raw = game.settings.get("aureus", "worldState");
    this._cache = validate(raw);
    return this._cache;
  }

  // --- WRITE (только в конце тика — батчинг) ---
  static async setState(state: AureusState): Promise<void> {
    // Обрезаем события перед записью
    const clean: AureusState = {
      ...state,
      events: state.events.slice(-WORLD_LIMITS.MAX_EVENTS),
    };

    // Обновляем кеш немедленно, чтобы UI не ждал round-trip
    this._cache = clean;

    await game.settings.set("aureus", "worldState", clean);
  }

  // --- RESET (для дебага) ---
  static async resetState(withSeedData = false): Promise<void> {
    const fresh = createDefaultState();
    if (withSeedData) {
      fresh.factions = createSeedFactions();
      fresh.nodes = createMockTopology();

      // Проставляем ноды фракциям (по ownerId)
      for (const node of Object.values(fresh.nodes)) {
        if (node.ownerId && fresh.factions[node.ownerId]) {
          fresh.factions[node.ownerId].controlledNodes.push(node.id);
        }
      }
    }
    await this.setState(fresh);
    console.info("[Aureus] State reset.", fresh);
  }

  // --- Инвалидируем кеш при внешнем обновлении (хук updateWorld) ---
  static invalidateCache(): void {
    this._cache = null;
  }
}
