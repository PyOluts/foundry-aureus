var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { S as StateManager, c as createSeededRandom, r as repaintMapNotes } from "./module-uU14mphR.mjs";
const EVENT_ICONS = {
  attack: "⚔️",
  expand: "🏳️",
  tax: "🪙",
  fortify: "🛡️",
  conflict_resolved: "🤝"
};
const SEVERITY_COLORS = {
  major: "#e8a045",
  critical: "#e05252"
};
async function broadcastTickEvents(events, factions, tick) {
  const notable = events.filter(
    (e) => e.severity === "major" || e.severity === "critical"
  );
  if (notable.length === 0) return;
  const icon = notable.some((e) => e.severity === "critical") ? "🔴" : "🟡";
  const headerColor = notable.some((e) => e.severity === "critical") ? SEVERITY_COLORS.critical : SEVERITY_COLORS.major;
  const rows = notable.map((e) => {
    const faction = factions[e.factionId];
    const factionColor = (faction == null ? void 0 : faction.color) ?? "#888";
    const factionName = (faction == null ? void 0 : faction.name) ?? e.factionId;
    return `
        <li style="margin: 4px 0; display:flex; gap:6px; align-items:baseline;">
          <span>${EVENT_ICONS[e.type] ?? "📋"}</span>
          <span style="color:${factionColor}; font-weight:600;">${factionName}</span>
          <span style="color:#c8c3bc;">${e.message}</span>
        </li>`;
  }).join("");
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
    flags: { [MODULE_ID_PLACEHOLDER]: { type: "tick-broadcast", tick } }
  });
}
const MODULE_ID_PLACEHOLDER = "aureus";
function generateIntents(state, rand) {
  const intents = [];
  for (const faction of Object.values(state.factions)) {
    if (faction.units <= 0) {
      intents.push({ factionId: faction.id, action: "tax", targetNodeId: null });
      continue;
    }
    const intent = chooseFactionIntent(faction, state, rand);
    intents.push(intent);
    console.debug(
      `[Aureus|AI] ${faction.name} → ${intent.action}` + (intent.targetNodeId ? ` → node:${intent.targetNodeId}` : "")
    );
  }
  return intents;
}
function chooseFactionIntent(faction, state, rand) {
  const frontier = getFrontierNodes(faction, state);
  const enemyFrontier = frontier.filter(
    (n) => n.ownerId !== null && n.ownerId !== faction.id
  );
  const neutralFrontier = frontier.filter((n) => n.ownerId === null);
  const weights = {
    attack: faction.aggression * (enemyFrontier.length > 0 ? 1.5 : 0.1),
    expand: faction.greed * (neutralFrontier.length > 0 ? 1.2 : 0.05),
    fortify: faction.caution * 0.8,
    tax: faction.caution * 0.5 + 0.2
    // Минимальный базовый вес всегда есть
  };
  if (faction.gold < 5) {
    weights.tax += 2;
    weights.attack *= 0.3;
  }
  const action = weightedChoice(weights, rand);
  let targetNodeId = null;
  if (action === "attack" && enemyFrontier.length > 0) {
    const target = enemyFrontier[Math.floor(rand() * enemyFrontier.length)];
    targetNodeId = target.id;
  } else if (action === "expand" && neutralFrontier.length > 0) {
    const target = neutralFrontier[Math.floor(rand() * neutralFrontier.length)];
    targetNodeId = target.id;
  } else if (action === "fortify" && faction.controlledNodes.length > 0) {
    targetNodeId = faction.controlledNodes[Math.floor(rand() * faction.controlledNodes.length)];
  }
  if (action === "attack" && enemyFrontier.length === 0 || action === "expand" && neutralFrontier.length === 0) {
    return { factionId: faction.id, action: "tax", targetNodeId: null };
  }
  return { factionId: faction.id, action, targetNodeId };
}
function getFrontierNodes(faction, state) {
  const visited = /* @__PURE__ */ new Set();
  const result = [];
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
function weightedChoice(weights, rand) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let roll = rand() * total;
  for (const [key, w] of Object.entries(weights)) {
    roll -= w;
    if (roll <= 0) return key;
  }
  return "tax";
}
function resolveConflicts(intents, state, rand) {
  const results = [];
  const attacksByTarget = /* @__PURE__ */ new Map();
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
    if (node.ownerId === null) {
      const winner = attackers[0];
      results.push({
        winnerId: winner.factionId,
        loserId: "neutral",
        nodeId,
        attackerLosses: 0,
        defenderLosses: 0
      });
      continue;
    }
    const attacker = attackers[0];
    const defenderFaction = state.factions[node.ownerId];
    const attackerFaction = state.factions[attacker.factionId];
    if (!defenderFaction || !attackerFaction) continue;
    if (attacker.factionId === node.ownerId) continue;
    const attackPower = attackerFaction.units * attackerFaction.aggression * (0.7 + rand() * 0.6);
    const defensePower = defenderFaction.units * (1 - defenderFaction.aggression) * (0.7 + rand() * 0.6);
    const attackerWins = attackPower > defensePower;
    const attackerLosses = Math.ceil(defensePower * 0.3);
    const defenderLosses = Math.ceil(attackPower * 0.3);
    results.push({
      winnerId: attackerWins ? attacker.factionId : node.ownerId,
      loserId: attackerWins ? node.ownerId : attacker.factionId,
      nodeId,
      attackerLosses,
      defenderLosses
    });
  }
  return results;
}
function applyResults(state, intents, conflicts, rand) {
  var _a;
  const newEvents = [];
  const tick = state.tick;
  const conflictNodeIds = new Set(conflicts.map((c) => c.nodeId));
  for (const conflict of conflicts) {
    const node = state.nodes[conflict.nodeId];
    if (!node) continue;
    const wasNeutral = conflict.loserId === "neutral";
    const attackerFaction = state.factions[conflict.winnerId];
    const defenderFaction = wasNeutral ? null : state.factions[conflict.loserId];
    if (!attackerFaction) continue;
    if (!wasNeutral) {
      attackerFaction.units = Math.max(
        0,
        attackerFaction.units - conflict.attackerLosses
      );
    }
    const attackerWins = conflict.winnerId !== node.ownerId;
    if (attackerWins) {
      if (defenderFaction) {
        defenderFaction.units = Math.max(
          0,
          defenderFaction.units - conflict.defenderLosses
        );
        defenderFaction.controlledNodes = defenderFaction.controlledNodes.filter(
          (id) => id !== conflict.nodeId
        );
      }
      node.ownerId = conflict.winnerId;
      attackerFaction.controlledNodes.push(conflict.nodeId);
      const severity = conflict.attackerLosses + conflict.defenderLosses > 5 ? "major" : "minor";
      newEvents.push(makeEvent(
        "attack",
        severity,
        conflict.winnerId,
        conflict.nodeId,
        tick,
        wasNeutral ? `${attackerFaction.name} занимает нейтральную ноду «${node.name}».` : `${attackerFaction.name} захватывает «${node.name}» у ${(defenderFaction == null ? void 0 : defenderFaction.name) ?? "???"}. Потери: нападающий −${conflict.attackerLosses}, защитник −${conflict.defenderLosses}.`
      ));
    } else {
      if (defenderFaction) {
        defenderFaction.units = Math.max(
          0,
          defenderFaction.units - conflict.defenderLosses
        );
      }
      const attFactionId = (_a = intents.find((i) => i.targetNodeId === conflict.nodeId)) == null ? void 0 : _a.factionId;
      const attFac = attFactionId ? state.factions[attFactionId] : void 0;
      if (attFac) attFac.units = Math.max(0, attFac.units - conflict.attackerLosses);
      newEvents.push(makeEvent(
        "conflict_resolved",
        "minor",
        conflict.loserId,
        conflict.nodeId,
        tick,
        `Атака на «${node.name}» отражена. Потери нападающего: −${conflict.attackerLosses}.`
      ));
    }
  }
  for (const intent of intents) {
    if (intent.action === "attack") continue;
    if (intent.action === "expand" && intent.targetNodeId && !conflictNodeIds.has(intent.targetNodeId)) {
      const node = state.nodes[intent.targetNodeId];
      const faction = state.factions[intent.factionId];
      if (!node || !faction || node.ownerId !== null) continue;
      node.ownerId = faction.id;
      faction.controlledNodes.push(node.id);
      newEvents.push(makeEvent(
        "expand",
        "minor",
        faction.id,
        node.id,
        tick,
        `${faction.name} расширяет владения, занимая «${node.name}».`
      ));
    }
    if (intent.action === "tax") {
      const faction = state.factions[intent.factionId];
      if (!faction) continue;
      const income = faction.controlledNodes.length * 2 + 3;
      faction.gold += income;
      newEvents.push(makeEvent(
        "tax",
        "minor",
        faction.id,
        null,
        tick,
        `${faction.name} собирает налоги: +${income} золота. (Итого: ${faction.gold})`
      ));
    }
    if (intent.action === "fortify") {
      const faction = state.factions[intent.factionId];
      if (!faction || faction.gold < 5) continue;
      faction.gold -= 5;
      faction.units += 3;
      newEvents.push(makeEvent(
        "fortify",
        "minor",
        faction.id,
        intent.targetNodeId,
        tick,
        `${faction.name} укрепляет позиции: −5 золота, +3 юнита.`
      ));
    }
  }
  for (const faction of Object.values(state.factions)) {
    const passiveIncome = Math.floor(faction.controlledNodes.length * 0.5);
    if (passiveIncome > 0) faction.gold += passiveIncome;
  }
  return newEvents;
}
function makeEvent(type, severity, factionId, targetNodeId, tick, message) {
  return {
    id: crypto.randomUUID(),
    type,
    severity,
    factionId,
    targetNodeId,
    message,
    tick,
    timestamp: Date.now()
  };
}
class TickManager {
  static async runTick() {
    if (this._isRunning) {
      console.warn("[Aureus] Tick skipped — already running.");
      return;
    }
    this._isRunning = true;
    try {
      const state = StateManager.getState();
      state.tick += 1;
      const seed = this.debugSeed ?? state.tick * 3735928559;
      const rand = createSeededRandom(seed);
      console.group(`[Aureus] === TICK ${state.tick} (seed: ${seed}) ===`);
      console.groupCollapsed("[Aureus] Phase 1: Generating intents...");
      const intents = generateIntents(state, rand);
      console.table(intents);
      console.groupEnd();
      console.groupCollapsed("[Aureus] Phase 2: Resolving conflicts...");
      const conflicts = resolveConflicts(intents, state, rand);
      console.table(conflicts);
      console.groupEnd();
      console.groupCollapsed("[Aureus] Phase 3: Applying results...");
      const newEvents = applyResults(state, intents, conflicts, rand);
      state.events.push(...newEvents);
      console.log(`Generated ${newEvents.length} events.`);
      console.groupEnd();
      console.groupEnd();
      await StateManager.setState(state);
      await broadcastTickEvents(newEvents, state.factions, state.tick);
      await repaintMapNotes(state);
      console.info(
        `[Aureus] Tick ${state.tick} complete. Intents: ${intents.length}, Conflicts: ${conflicts.length}, Events: ${newEvents.length}`
      );
    } finally {
      this._isRunning = false;
    }
  }
}
__publicField(TickManager, "_isRunning", false);
// Seed по умолчанию — based on tick (детерминированный replay)
// Можно перекрыть через window.Aureus.setDebugSeed()
__publicField(TickManager, "debugSeed", null);
export {
  TickManager
};
//# sourceMappingURL=tickManager-DtSdaFwA.mjs.map
