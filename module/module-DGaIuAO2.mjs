var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
const MODULE_ID = "aureus";
const STATE_VERSION = 1;
const WORLD_LIMITS = {
  MAX_FACTIONS: 20,
  MAX_NODES: 200,
  MAX_EVENTS: 50
};
function createMockTopology() {
  const nodes = [
    { id: "node-a", name: "Столица", ownerId: "imperials", neighbors: ["node-b", "node-c"] },
    { id: "node-b", name: "Торговый порт", ownerId: null, neighbors: ["node-a", "node-d"] },
    { id: "node-c", name: "Горный перевал", ownerId: null, neighbors: ["node-a", "node-d", "node-e"] },
    { id: "node-d", name: "Древние руины", ownerId: "void-cult", neighbors: ["node-b", "node-c", "node-e"] },
    { id: "node-e", name: "Тёмный лес", ownerId: null, neighbors: ["node-c", "node-d"] }
  ];
  return Object.fromEntries(nodes.map((n) => [n.id, n]));
}
function createSeededRandom(seed) {
  let s = seed;
  return () => {
    s |= 0;
    s = s + 1831565813 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function createDefaultState() {
  return {
    version: STATE_VERSION,
    tick: 0,
    factions: {},
    nodes: {},
    events: []
  };
}
function createSeedFactions() {
  const imperials = {
    id: "imperials",
    name: "Империя Солнца",
    color: "#f4a261",
    gold: 50,
    units: 10,
    aggression: 0.7,
    caution: 0.3,
    greed: 0.5,
    controlledNodes: []
  };
  const voidCult = {
    id: "void-cult",
    name: "Культ Пустоты",
    color: "#6a0572",
    gold: 30,
    units: 8,
    aggression: 0.9,
    caution: 0.1,
    greed: 0.8,
    controlledNodes: []
  };
  return {
    [imperials.id]: imperials,
    [voidCult.id]: voidCult
  };
}
function validate(raw) {
  var _a;
  if (!raw || typeof raw !== "object" || raw.version !== STATE_VERSION) {
    console.warn(
      `[Aureus] State missing or version mismatch. Creating default state.`
    );
    return createDefaultState();
  }
  const state = raw;
  const factionCount = Object.keys(state.factions ?? {}).length;
  const nodeCount = Object.keys(state.nodes ?? {}).length;
  if (factionCount > WORLD_LIMITS.MAX_FACTIONS) {
    console.warn(`[Aureus] Too many factions (${factionCount}). Trimming.`);
  }
  if (nodeCount > WORLD_LIMITS.MAX_NODES) {
    console.warn(`[Aureus] Too many nodes (${nodeCount}). Trimming.`);
  }
  if (((_a = state.events) == null ? void 0 : _a.length) > WORLD_LIMITS.MAX_EVENTS) {
    state.events = state.events.slice(-50);
  }
  return state;
}
class StateManager {
  // --- READ ---
  static getState() {
    if (this._cache) return this._cache;
    const raw = game.settings.get("aureus", "worldState");
    this._cache = validate(raw);
    return this._cache;
  }
  // --- WRITE (только в конце тика — батчинг) ---
  static async setState(state) {
    const clean = {
      ...state,
      events: state.events.slice(-50)
    };
    this._cache = clean;
    await game.settings.set("aureus", "worldState", clean);
  }
  // --- RESET (для дебага) ---
  static async resetState(withSeedData = false) {
    const fresh = createDefaultState();
    if (withSeedData) {
      fresh.factions = createSeedFactions();
      fresh.nodes = createMockTopology();
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
  static invalidateCache() {
    this._cache = null;
  }
}
__publicField(StateManager, "_cache", null);
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const _AureusDashboard = class _AureusDashboard extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor() {
    super(...arguments);
    // Локальный кеш для защиты от перерендеров
    __publicField(this, "_state", null);
  }
  // -----------------------------------------------------------
  // Подготовка данных для шаблона
  // -----------------------------------------------------------
  async _prepareContext() {
    const state = StateManager.getState();
    this._state = state;
    const factions = Object.values(state.factions).map((f) => ({
      ...f,
      nodeCount: f.controlledNodes.length
    }));
    const events = [...state.events].reverse().slice(0, 15);
    const totalNodes = Object.keys(state.nodes).length;
    const claimedNodes = Object.values(state.nodes).filter((n) => n.ownerId !== null).length;
    const neutralNodeCount = totalNodes - claimedNodes;
    return {
      tick: state.tick,
      factions,
      events,
      factionCount: factions.length,
      nodeCount: totalNodes,
      neutralNodeCount
    };
  }
  // -----------------------------------------------------------
  // Рендер (только по явному вызову или хуку, не авто)
  // -----------------------------------------------------------
  async render(options) {
    return super.render(options);
  }
  // -----------------------------------------------------------
  // ACTIONS
  // -----------------------------------------------------------
  static async onNextTurn() {
    Hooks.callAll("aureus.requestTick");
  }
  static async onOpenDebug() {
    Hooks.callAll("aureus.openDebug");
  }
  static async onResetState() {
    var _a;
    const confirmed = await Dialog.confirm({
      title: "Сброс стейта",
      content: "<p>Сбросить всё состояние мира до начального? Это необратимо.</p>"
    });
    if (!confirmed) return;
    await StateManager.resetState(true);
    (_a = ui.notifications) == null ? void 0 : _a.info("[Aureus] Стейт сброшен. Seed-фракции загружены.");
    await this.render();
  }
  static async onAdjustGold(event, target) {
    const factionId = target.dataset["factionId"];
    const delta = Number(target.dataset["delta"]);
    if (!factionId || isNaN(delta)) return;
    const state = StateManager.getState();
    const faction = state.factions[factionId];
    if (!faction) return;
    faction.gold = Math.max(0, faction.gold + delta);
    await StateManager.setState(state);
    await this.render();
  }
  static async onAdjustUnits(event, target) {
    const factionId = target.dataset["factionId"];
    const delta = Number(target.dataset["delta"]);
    if (!factionId || isNaN(delta)) return;
    const state = StateManager.getState();
    const faction = state.factions[factionId];
    if (!faction) return;
    faction.units = Math.max(0, faction.units + delta);
    await StateManager.setState(state);
    await this.render();
  }
  // -----------------------------------------------------------
  // Публичный метод для внешнего обновления (вызывается после тика)
  // -----------------------------------------------------------
  async refresh() {
    StateManager.invalidateCache();
    await this.render();
  }
};
__publicField(_AureusDashboard, "DEFAULT_OPTIONS", {
  id: "aureus-dashboard",
  classes: ["aureus-app"],
  tag: "div",
  window: {
    title: "Aureus — Симулятор Мира",
    resizable: true,
    minimizable: true
  },
  position: {
    width: 620,
    height: 700
  },
  actions: {
    nextTurn: _AureusDashboard.onNextTurn,
    resetState: _AureusDashboard.onResetState,
    adjustGold: _AureusDashboard.onAdjustGold,
    adjustUnits: _AureusDashboard.onAdjustUnits,
    openDebug: _AureusDashboard.onOpenDebug
  }
});
__publicField(_AureusDashboard, "PARTS", {
  main: {
    template: `modules/${MODULE_ID}/templates/dashboard.hbs`
  }
});
let AureusDashboard = _AureusDashboard;
async function repaintMapNotes(state) {
  var _a, _b;
  const scene = (_a = game.scenes) == null ? void 0 : _a.active;
  if (!scene) return;
  const notes = ((_b = scene.notes) == null ? void 0 : _b.contents) ?? [];
  if (notes.length === 0) return;
  const updates = [];
  for (const note of notes) {
    const noteId = note.id;
    if (!noteId) continue;
    const mapNode = state.nodes[noteId];
    if (!mapNode) continue;
    const owner = mapNode.ownerId ? state.factions[mapNode.ownerId] : null;
    const tint = owner ? owner.color : null;
    updates.push({
      _id: noteId,
      "flags.aureus.ownerId": mapNode.ownerId,
      "texture.tint": tint
    });
  }
  if (updates.length > 0) {
    await scene.updateEmbeddedDocuments("Note", updates);
    console.debug(`[Aureus|MapPainter] Updated ${updates.length} map notes.`);
  }
}
function registerHoverPreview(getState) {
  Hooks.on("hoverNote", (note, hovered) => {
    var _a;
    if (!hovered) return;
    const noteId = note.id;
    if (!noteId) return;
    const state = getState();
    const mapNode = state.nodes[noteId];
    if (!mapNode) return;
    const owner = mapNode.ownerId ? state.factions[mapNode.ownerId] : void 0;
    const ownerLabel = owner ? `<span style="color:${owner.color};font-weight:600;">${owner.name}</span>` : `<span style="color:#6b6880;">Нейтральная территория</span>`;
    (_a = ui.notifications) == null ? void 0 : _a.info(
      `🏰 <strong>${mapNode.name}</strong> — ${ownerLabel}`,
      { permanent: false, localize: false, console: false }
    );
  });
}
function registerMapHooks(getState) {
  Hooks.on("canvasReady", () => {
    repaintMapNotes(getState());
  });
  registerHoverPreview(getState);
  console.info("[Aureus|MapPainter] Map hooks registered.");
}
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
const tickManager = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  TickManager
}, Symbol.toStringTag, { value: "Module" }));
let _dashboard = null;
let _debugPanel = null;
Hooks.once("init", () => {
  console.log(`[Aureus] Initializing module v${MODULE_ID}...`);
  game.settings.register("aureus", "worldState", {
    name: "Aureus World State",
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });
  loadTemplates([
    `modules/${MODULE_ID}/templates/dashboard.hbs`,
    `modules/${MODULE_ID}/templates/debug.hbs`
  ]);
  Handlebars.registerHelper("eventIcon", (type) => {
    const icons = {
      attack: "⚔",
      expand: "🏳",
      tax: "🪙",
      fortify: "🛡",
      conflict_resolved: "🤝"
    };
    return icons[type] ?? "📋";
  });
  Hooks.on("getSceneControlButtons", (controls) => {
    let tokenControls;
    if (Array.isArray(controls)) {
      tokenControls = controls.find((c) => c.name === "token" || c.name === "tokens");
    } else {
      tokenControls = controls.tokens || controls.token;
    }
    if (tokenControls && tokenControls.tools) {
      const btn = {
        name: "aureus",
        title: "Aureus — Симулятор Мира",
        icon: "fas fa-globe",
        visible: true,
        button: true,
        // Кнопка не залипает
        onClick: () => openDashboard()
      };
      if (Array.isArray(tokenControls.tools)) {
        tokenControls.tools.push(btn);
      } else {
        tokenControls.tools.aureus = btn;
      }
    }
  });
});
Hooks.once("ready", async () => {
  const state = StateManager.getState();
  if (Object.keys(state.factions).length === 0) {
    console.info("[Aureus] No state found. Loading seed data...");
    state.factions = createSeedFactions();
    state.nodes = createMockTopology();
    for (const node of Object.values(state.nodes)) {
      if (node.ownerId && state.factions[node.ownerId]) {
        state.factions[node.ownerId].controlledNodes.push(node.id);
      }
    }
    await StateManager.setState(state);
    console.info("[Aureus] Seed data loaded.", state);
  }
  Hooks.on("aureus.requestTick", async () => {
    await TickManager.runTick();
    _dashboard == null ? void 0 : _dashboard.refresh();
    TickManager.debugSeed = null;
  });
  Hooks.on("updateSetting", (setting) => {
    if (setting.key === "aureus.worldState") {
      StateManager.invalidateCache();
      _dashboard == null ? void 0 : _dashboard.refresh();
    }
  });
  Hooks.on("aureus.openDebug", () => openDebugPanel());
  registerMapHooks(() => StateManager.getState());
  console.log("[Aureus] Ready.");
});
window.Aureus = {
  openDashboard: () => openDashboard(),
  openDebugPanel: () => openDebugPanel(),
  getState: () => StateManager.getState(),
  resetState: (withSeedData = true) => StateManager.resetState(withSeedData),
  /** Установить seed для следующего тика (deterministic replay). Пример: Aureus.setDebugSeed(42) */
  setDebugSeed: async (seed) => {
    const { TickManager: TickManager2 } = await Promise.resolve().then(() => tickManager);
    TickManager2.debugSeed = seed;
    console.info(`[Aureus] Debug seed set to ${seed}. Next tick will use it.`);
  }
};
function openDashboard() {
  if (!_dashboard) {
    _dashboard = new AureusDashboard();
  }
  _dashboard.render({ force: true });
}
async function openDebugPanel() {
  if (!_debugPanel) {
    const { AureusDebugPanel } = await import("./debugPanel-S1h6Bopq.mjs");
    _debugPanel = new AureusDebugPanel();
  }
  _debugPanel.render({ force: true });
}
export {
  MODULE_ID as M,
  StateManager as S,
  TickManager as T
};
//# sourceMappingURL=module-DGaIuAO2.mjs.map
