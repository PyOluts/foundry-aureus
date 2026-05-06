var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { M as MODULE_ID, S as StateManager } from "./module-uU14mphR.mjs";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
function computeAIWeights(faction, state) {
  let enemyFrontier = 0;
  let neutralFrontier = 0;
  const visited = /* @__PURE__ */ new Set();
  for (const nodeId of faction.controlledNodes) {
    const node = state.nodes[nodeId];
    if (!node) continue;
    for (const nId of node.neighbors) {
      if (visited.has(nId)) continue;
      visited.add(nId);
      const neighbor = state.nodes[nId];
      if (!neighbor || neighbor.ownerId === faction.id) continue;
      if (neighbor.ownerId === null) neutralFrontier++;
      else enemyFrontier++;
    }
  }
  const w = {
    attack: +(faction.aggression * (enemyFrontier > 0 ? 1.5 : 0.1)).toFixed(3),
    expand: +(faction.greed * (neutralFrontier > 0 ? 1.2 : 0.05)).toFixed(3),
    fortify: +(faction.caution * 0.8).toFixed(3),
    tax: +(faction.caution * 0.5 + 0.2 + (faction.gold < 5 ? 2 : 0)).toFixed(3)
  };
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  const pct = Object.fromEntries(
    Object.entries(w).map(([k, v]) => [k, `${(v / total * 100).toFixed(1)}%`])
  );
  return { weights: w, percentages: pct, enemyFrontier, neutralFrontier };
}
const _AureusDebugPanel = class _AureusDebugPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  async _prepareContext() {
    const state = StateManager.getState();
    const factionDebug = Object.values(state.factions).map((f) => {
      const ai = computeAIWeights(f, state);
      return {
        id: f.id,
        name: f.name,
        color: f.color,
        gold: f.gold,
        units: f.units,
        nodes: f.controlledNodes.length,
        aggression: f.aggression,
        caution: f.caution,
        greed: f.greed,
        weights: ai.weights,
        percentages: ai.percentages,
        enemyFrontier: ai.enemyFrontier,
        neutralFrontier: ai.neutralFrontier
      };
    });
    const recentTicks = [...new Set(state.events.map((e) => e.tick))].sort((a, b) => b - a).slice(0, 5);
    return {
      tick: state.tick,
      factionDebug,
      recentTicks,
      stateJson: JSON.stringify(state, null, 2),
      totalNodes: Object.keys(state.nodes).length,
      totalEvents: state.events.length
    };
  }
  // -----------------------------------------------------------
  // ACTIONS
  // -----------------------------------------------------------
  /** Детерминированный Replay: повторить тик N с тем же seed */
  static async onRunReplay(_event, target) {
    var _a, _b, _c;
    const seedInput = (_a = this.element) == null ? void 0 : _a.querySelector("#aureus-debug-seed");
    const seed = seedInput ? parseInt(seedInput.value, 10) : NaN;
    if (isNaN(seed)) {
      (_b = ui.notifications) == null ? void 0 : _b.warn("[Aureus] Введите числовой seed для replay.");
      return;
    }
    const { TickManager } = await import("./tickManager-DtSdaFwA.mjs");
    TickManager.debugSeed = seed;
    Hooks.callAll("aureus.requestTick");
    (_c = ui.notifications) == null ? void 0 : _c.info(`[Aureus] Replay tick запущен с seed=${seed}`);
  }
  /** Копирует JSON стейта в буфер обмена */
  static async onCopyState() {
    var _a;
    const state = StateManager.getState();
    await navigator.clipboard.writeText(JSON.stringify(state, null, 2));
    (_a = ui.notifications) == null ? void 0 : _a.info("[Aureus] Стейт скопирован в буфер обмена.");
  }
  /** Выводит полный стейт в консоль браузера */
  static async onPrintState() {
    var _a;
    const state = StateManager.getState();
    console.group("[Aureus] Full World State");
    console.log("Tick:", state.tick);
    console.log("Factions:", state.factions);
    console.log("Nodes:", state.nodes);
    console.log("Events (last 10):", state.events.slice(-10));
    console.groupEnd();
    (_a = ui.notifications) == null ? void 0 : _a.info("[Aureus] Стейт выведен в консоль (F12).");
  }
};
__publicField(_AureusDebugPanel, "DEFAULT_OPTIONS", {
  id: "aureus-debug-panel",
  classes: ["aureus-app"],
  tag: "div",
  window: {
    title: "Aureus — Debug Panel",
    resizable: true,
    minimizable: true
  },
  position: {
    width: 500,
    height: 580
  },
  actions: {
    runReplay: _AureusDebugPanel.onRunReplay,
    copyState: _AureusDebugPanel.onCopyState,
    printState: _AureusDebugPanel.onPrintState
  }
});
__publicField(_AureusDebugPanel, "PARTS", {
  main: {
    template: `modules/${MODULE_ID}/templates/debug.hbs`
  }
});
let AureusDebugPanel = _AureusDebugPanel;
export {
  AureusDebugPanel
};
//# sourceMappingURL=debugPanel-k98iXUdo.mjs.map
