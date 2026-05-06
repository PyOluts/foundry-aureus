// =============================================================
// AUREUS — Debug Panel (Application V2)
// Показывает: текущий стейт AI, веса решений, историю тиков,
// кнопку для deterministic replay через custom seed
// =============================================================

import { MODULE_ID } from "../state/types.js";
import { StateManager } from "../state/stateManager.js";
import type { AureusState, Faction } from "../state/types.js";
import { TickManager } from "../core/tickManager.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// -------------------------------------------------------------
// Вспомогательная: считает веса AI для фракции (копия логики TickManager,
// но только для отображения — без side-эффектов)
// -------------------------------------------------------------
function computeAIWeights(faction: Faction, state: AureusState) {
  // Frontier: подсчитываем смежные вражеские и нейтральные ноды
  let enemyFrontier = 0;
  let neutralFrontier = 0;
  const visited = new Set<string>();

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
    attack:  +(faction.aggression * (enemyFrontier > 0 ? 1.5 : 0.1)).toFixed(3),
    expand:  +(faction.greed * (neutralFrontier > 0 ? 1.2 : 0.05)).toFixed(3),
    fortify: +(faction.caution * 0.8).toFixed(3),
    tax:     +(faction.caution * 0.5 + 0.2 + (faction.gold < 5 ? 2.0 : 0)).toFixed(3),
  };

  const total = Object.values(w).reduce((a, b) => a + b, 0);
  const pct = Object.fromEntries(
    Object.entries(w).map(([k, v]) => [k, `${((v / total) * 100).toFixed(1)}%`])
  );

  return { weights: w, percentages: pct, enemyFrontier, neutralFrontier };
}

// -------------------------------------------------------------
// Debug Panel Application
// -------------------------------------------------------------
export class AureusDebugPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    id: "aureus-debug-panel",
    classes: ["aureus-app"],
    tag: "div",
    window: {
      title: "Aureus — Debug Panel",
      resizable: true,
      minimizable: true,
    },
    position: {
      width: 500,
      height: 580,
    },
    actions: {
      runReplay:   AureusDebugPanel.onRunReplay,
      copyState:   AureusDebugPanel.onCopyState,
      printState:  AureusDebugPanel.onPrintState,
    },
  };

  static override PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/debug.hbs`,
    },
  };

  override async _prepareContext(): Promise<object> {
    const state = StateManager.getState();

    const factionDebug = Object.values(state.factions).map((f) => {
      const ai = computeAIWeights(f, state);
      return {
        id:    f.id,
        name:  f.name,
        color: f.color,
        gold:  f.gold,
        units: f.units,
        nodes: f.controlledNodes.length,
        aggression: f.aggression,
        caution:    f.caution,
        greed:      f.greed,
        weights: ai.weights,
        percentages: ai.percentages,
        enemyFrontier:   ai.enemyFrontier,
        neutralFrontier: ai.neutralFrontier,
      };
    });

    // Последние 5 тиков событий (для replay)
    const recentTicks = [...new Set(state.events.map((e) => e.tick))]
      .sort((a, b) => b - a)
      .slice(0, 5);

    return {
      tick: state.tick,
      factionDebug,
      recentTicks,
      stateJson: JSON.stringify(state, null, 2),
      totalNodes: Object.keys(state.nodes).length,
      totalEvents: state.events.length,
    };
  }

  // -----------------------------------------------------------
  // ACTIONS
  // -----------------------------------------------------------

  /** Детерминированный Replay: повторить тик N с тем же seed */
  static async onRunReplay(
    this: AureusDebugPanel,
    _event: MouseEvent,
    target: HTMLElement
  ): Promise<void> {
    const seedInput = (
      this.element?.querySelector<HTMLInputElement>("#aureus-debug-seed")
    );
    const seed = seedInput ? parseInt(seedInput.value, 10) : NaN;

    if (isNaN(seed)) {
      ui.notifications?.warn("[Aureus] Введите числовой seed для replay.");
      return;
    }

    TickManager.debugSeed = seed;
    Hooks.callAll("aureus.requestTick");
    ui.notifications?.info(`[Aureus] Replay tick запущен с seed=${seed}`);
  }

  /** Копирует JSON стейта в буфер обмена */
  static async onCopyState(this: AureusDebugPanel): Promise<void> {
    const state = StateManager.getState();
    await navigator.clipboard.writeText(JSON.stringify(state, null, 2));
    ui.notifications?.info("[Aureus] Стейт скопирован в буфер обмена.");
  }

  /** Выводит полный стейт в консоль браузера */
  static async onPrintState(this: AureusDebugPanel): Promise<void> {
    const state = StateManager.getState();
    console.group("[Aureus] Full World State");
    console.log("Tick:", state.tick);
    console.log("Factions:", state.factions);
    console.log("Nodes:", state.nodes);
    console.log("Events (last 10):", state.events.slice(-10));
    console.groupEnd();
    ui.notifications?.info("[Aureus] Стейт выведен в консоль (F12).");
  }
}
