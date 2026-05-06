// =============================================================
// AUREUS — Topology Helpers
// Работа с графом нод: поиск соседей, проверки достижимости
// =============================================================

import { MapNode, AureusState } from "../state/types.js";

// Получить список соседних нод для данной ноды
export function getNeighbors(nodeId: string, state: AureusState): MapNode[] {
  const node = state.nodes[nodeId];
  if (!node) return [];
  return node.neighbors
    .map((nId) => state.nodes[nId])
    .filter(Boolean);
}

// Получить все ноды, которыми владеет конкретная фракция
export function getControlledNodes(
  factionId: string,
  state: AureusState
): MapNode[] {
  return Object.values(state.nodes).filter((n) => n.ownerId === factionId);
}

// Получить нейтральные ноды, смежные с фракцией (для Expand)
export function getNeutralNeighbors(
  factionId: string,
  state: AureusState
): MapNode[] {
  const controlled = getControlledNodes(factionId, state);
  const neutral = new Set<string>();

  for (const node of controlled) {
    for (const neighborId of node.neighbors) {
      const neighbor = state.nodes[neighborId];
      if (neighbor && neighbor.ownerId === null) {
        neutral.add(neighborId);
      }
    }
  }

  return [...neutral].map((id) => state.nodes[id]).filter(Boolean);
}

// Получить вражеские ноды, смежные с фракцией (для Attack)
export function getEnemyNeighbors(
  factionId: string,
  state: AureusState
): MapNode[] {
  const controlled = getControlledNodes(factionId, state);
  const enemies = new Map<string, MapNode>();

  for (const node of controlled) {
    for (const neighborId of node.neighbors) {
      const neighbor = state.nodes[neighborId];
      if (neighbor && neighbor.ownerId && neighbor.ownerId !== factionId) {
        enemies.set(neighborId, neighbor);
      }
    }
  }

  return [...enemies.values()];
}

// Создать тестовую (mock) топологию для разработки без реальной карты
export function createMockTopology(): Record<string, MapNode> {
  const nodes: MapNode[] = [
    { id: "node-a", name: "Столица",     ownerId: "imperials", neighbors: ["node-b", "node-c"] },
    { id: "node-b", name: "Торговый порт", ownerId: null,       neighbors: ["node-a", "node-d"] },
    { id: "node-c", name: "Горный перевал", ownerId: null,      neighbors: ["node-a", "node-d", "node-e"] },
    { id: "node-d", name: "Древние руины",  ownerId: "void-cult", neighbors: ["node-b", "node-c", "node-e"] },
    { id: "node-e", name: "Тёмный лес",   ownerId: null,        neighbors: ["node-c", "node-d"] },
  ];

  return Object.fromEntries(nodes.map((n) => [n.id, n]));
}
