// =============================================================
// AUREUS — Все интерфейсы и типы данных
// =============================================================

export const MODULE_ID = "aureus";
export const STATE_FLAG_KEY = "state";
export const STATE_VERSION = 1;

// Ограничения мира (защита от краша)
export const WORLD_LIMITS = {
  MAX_FACTIONS: 20,
  MAX_NODES: 200,
  MAX_EVENTS: 50,
} as const;

// -------------------------------------------------------------
// Faction — базовая единица симуляции
// -------------------------------------------------------------
export interface Faction {
  id: string;
  name: string;
  color: string; // hex, например "#e63946"

  // Ресурсы
  gold: number;
  units: number; // "армия"

  // Личность (влияет на вес действий AI)
  aggression: number; // 0–1
  caution: number;    // 0–1
  greed: number;      // 0–1

  // Список нод, которыми владеет фракция (массив noteId)
  controlledNodes: string[];
}

// -------------------------------------------------------------
// MapNode — точка интереса на карте
// -------------------------------------------------------------
export interface MapNode {
  id: string;       // Совпадает с Foundry Note._id
  name: string;
  ownerId: string | null; // Faction.id или null (нейтраль)
  neighbors: string[];    // Список смежных MapNode.id (явный граф)
}

// -------------------------------------------------------------
// WorldEvent — одна запись в логе событий
// -------------------------------------------------------------
export type EventType =
  | "attack"
  | "expand"
  | "tax"
  | "fortify"
  | "conflict_resolved";

export type EventSeverity = "minor" | "major" | "critical";

export interface WorldEvent {
  id: string;
  type: EventType;
  severity: EventSeverity;
  factionId: string;
  targetNodeId: string | null;
  message: string; // Человекочитаемая строка для Newsfeed
  tick: number;    // Номер хода, когда произошло событие
  timestamp: number; // Date.now()
}

// -------------------------------------------------------------
// AureusState — единый корень хранилища
// -------------------------------------------------------------
export interface AureusState {
  version: number; // Для будущих миграций
  tick: number;    // Текущий номер хода
  factions: Record<string, Faction>;
  nodes: Record<string, MapNode>;
  events: WorldEvent[]; // Срезается до WORLD_LIMITS.MAX_EVENTS
}

// -------------------------------------------------------------
// Tick Engine Types (Intent / Resolve / Apply)
// -------------------------------------------------------------
export type ActionType = "attack" | "expand" | "tax" | "fortify";

export interface FactionIntent {
  factionId: string;
  action: ActionType;
  targetNodeId: string | null;
}

export interface ConflictResult {
  winnerId: string;
  loserId: string;
  nodeId: string;
  attackerLosses: number;
  defenderLosses: number;
}

export interface TickResult {
  intents: FactionIntent[];
  conflicts: ConflictResult[];
  events: WorldEvent[];
  nextState: AureusState;
}
