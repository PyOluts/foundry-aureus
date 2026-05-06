// =============================================================
// AUREUS — Dashboard (Application V2)
// ГМ-панель с кнопкой Next Turn, списком фракций и Event Log
// =============================================================

import { MODULE_ID } from "../state/types.js";
import { StateManager } from "../state/stateManager.js";
import type { AureusState, Faction, WorldEvent } from "../state/types.js";

// Foundry ApplicationV2 доступен глобально в рантайме
const { ApplicationV2, HandlebarsApplicationMixin } =
  foundry.applications.api;

export class AureusDashboard extends HandlebarsApplicationMixin(ApplicationV2) {
  // Локальный кеш для защиты от перерендеров
  private _state: AureusState | null = null;

  static override DEFAULT_OPTIONS = {
    id: "aureus-dashboard",
    classes: ["aureus-app"],
    tag: "div",
    window: {
      title: "Aureus — Симулятор Мира",
      resizable: true,
      minimizable: true,
    },
    position: {
      width: 620,
      height: 700,
    },
    actions: {
      nextTurn:    AureusDashboard.onNextTurn,
      resetState:  AureusDashboard.onResetState,
      adjustGold:  AureusDashboard.onAdjustGold,
      adjustUnits: AureusDashboard.onAdjustUnits,
      openDebug:   AureusDashboard.onOpenDebug,
    },
  };

  static override PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/dashboard.hbs`,
    },
  };

  // -----------------------------------------------------------
  // Подготовка данных для шаблона
  // -----------------------------------------------------------
  override async _prepareContext(): Promise<object> {
    const state = StateManager.getState();
    this._state = state;

    const factions = Object.values(state.factions).map((f: Faction) => ({
      ...f,
      nodeCount: f.controlledNodes.length,
    }));

    const events = [...state.events]
      .reverse() // Новые — сверху
      .slice(0, 15);

    const totalNodes = Object.keys(state.nodes).length;
    const claimedNodes = Object.values(state.nodes).filter((n) => n.ownerId !== null).length;
    const neutralNodeCount = totalNodes - claimedNodes;

    return {
      tick: state.tick,
      factions,
      events,
      factionCount: factions.length,
      nodeCount: totalNodes,
      neutralNodeCount,
    };
  }

  // -----------------------------------------------------------
  // Рендер (только по явному вызову или хуку, не авто)
  // -----------------------------------------------------------
  override async render(options?: object): Promise<this> {
    return super.render(options);
  }

  // -----------------------------------------------------------
  // ACTIONS
  // -----------------------------------------------------------

  static async onNextTurn(this: AureusDashboard): Promise<void> {
    // TickManager будет вызван по событию, чтобы не создавать циклическую зависимость
    Hooks.callAll("aureus.requestTick");
  }

  static async onOpenDebug(this: AureusDashboard): Promise<void> {
    Hooks.callAll("aureus.openDebug");
  }

  static async onResetState(this: AureusDashboard): Promise<void> {
    const confirmed = await Dialog.confirm({
      title: "Сброс стейта",
      content: "<p>Сбросить всё состояние мира до начального? Это необратимо.</p>",
    });
    if (!confirmed) return;

    await StateManager.resetState(true);
    ui.notifications?.info("[Aureus] Стейт сброшен. Seed-фракции загружены.");
    await this.render();
  }

  static async onAdjustGold(
    this: AureusDashboard,
    event: MouseEvent,
    target: HTMLElement
  ): Promise<void> {
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

  static async onAdjustUnits(
    this: AureusDashboard,
    event: MouseEvent,
    target: HTMLElement
  ): Promise<void> {
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
  async refresh(): Promise<void> {
    StateManager.invalidateCache();
    await this.render();
  }
}

// Severity -> CSS-класс для Newsfeed
export function severityClass(severity: WorldEvent["severity"]): string {
  return { minor: "text-muted", major: "text-warning", critical: "text-danger" }[severity];
}
