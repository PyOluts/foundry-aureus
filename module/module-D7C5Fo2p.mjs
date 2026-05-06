var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
const MODULE_ID = "aureus";
const STATE_FLAG_KEY = "state";
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
    var _a;
    if (this._cache) return this._cache;
    const world = game.world;
    const raw = (_a = world.getFlag) == null ? void 0 : _a.call(world, MODULE_ID, STATE_FLAG_KEY);
    this._cache = validate(raw);
    return this._cache;
  }
  // --- WRITE (только в конце тика — батчинг) ---
  static async setState(state) {
    var _a, _b;
    const clean = {
      ...state,
      events: state.events.slice(-50)
    };
    this._cache = clean;
    await ((_b = (_a = game.world).setFlag) == null ? void 0 : _b.call(_a, MODULE_ID, STATE_FLAG_KEY, clean));
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
let _dashboard = null;
let _debugPanel = null;
Hooks.once("init", () => {
  console.log(`[Aureus] Initializing module v${MODULE_ID}...`);
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
      tokenControls.tools.push({
        name: "aureus",
        title: "Aureus — Симулятор Мира",
        icon: "fas fa-globe",
        visible: true,
        button: true,
        // Кнопка не залипает
        onClick: () => openDashboard()
      });
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
    const { TickManager } = await import("./tickManager--X7skUnh.mjs");
    await TickManager.runTick();
    _dashboard == null ? void 0 : _dashboard.refresh();
    TickManager.debugSeed = null;
  });
  Hooks.on("updateWorld", () => {
    StateManager.invalidateCache();
    _dashboard == null ? void 0 : _dashboard.refresh();
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
    const { TickManager } = await import("./tickManager--X7skUnh.mjs");
    TickManager.debugSeed = seed;
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
    const { AureusDebugPanel } = await import("./debugPanel-DYzYYxv9.mjs");
    _debugPanel = new AureusDebugPanel();
  }
  _debugPanel.render({ force: true });
}
export {
  MODULE_ID as M,
  StateManager as S,
  createSeededRandom as c,
  repaintMapNotes as r
};
//# sourceMappingURL=module-D7C5Fo2p.mjs.map
