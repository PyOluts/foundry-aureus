// =============================================================
// AUREUS — Точка входа модуля
// Регистрация хуков Foundry и инициализация модуля
// =============================================================

import { MODULE_ID } from "./state/types.js";
import { StateManager, createSeedFactions } from "./state/stateManager.js";
import { createMockTopology } from "./core/topology.js";
import { AureusDashboard } from "./ui/dashboard.js";
import { registerMapHooks } from "./core/mapPainter.js";

// Импортируем стили (Vite их соберёт в styles/aureus.css)
import "./styles/aureus.css";

// Глобальные ссылки на окна
let _dashboard: AureusDashboard | null = null;
let _debugPanel: import("./ui/debugPanel.js").AureusDebugPanel | null = null;

// ---------------------------------------------------------------
// INIT — регистрация настроек и шаблонов
// ---------------------------------------------------------------
Hooks.once("init", () => {
  console.log(`[Aureus] Initializing module v${MODULE_ID}...`);

  // Предзагрузка Handlebars-шаблонов
  loadTemplates([
    `modules/${MODULE_ID}/templates/dashboard.hbs`,
    `modules/${MODULE_ID}/templates/debug.hbs`,
  ]);

  // Хелпер: иконка типа события для шаблона
  Handlebars.registerHelper("eventIcon", (type: string) => {
    const icons: Record<string, string> = {
      attack: "⚔",
      expand: "🏳",
      tax: "🪙",
      fortify: "🛡",
      conflict_resolved: "🤝",
    };
    return icons[type] ?? "📋";
  });

  // Кнопка открытия Dashboard в боковой панели
  Hooks.on("getSceneControlButtons", (controls: any) => {
    // Поддержка и старых версий (Array), и новых V13+ (Object)
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
        button: true, // Кнопка не залипает
        onClick: () => openDashboard(),
      });
    }
  });
});

// ---------------------------------------------------------------
// READY — первичная инициализация стейта
// ---------------------------------------------------------------
Hooks.once("ready", async () => {
  // Если стейт пустой — загружаем seed данные (фракции + mock топология)
  const state = StateManager.getState();
  if (Object.keys(state.factions).length === 0) {
    console.info("[Aureus] No state found. Loading seed data...");
    state.factions = createSeedFactions();
    state.nodes = createMockTopology();

    // Проставляем ноды фракциям (по ownerId)
    for (const node of Object.values(state.nodes)) {
      if (node.ownerId && state.factions[node.ownerId]) {
        state.factions[node.ownerId].controlledNodes.push(node.id);
      }
    }
    await StateManager.setState(state);
    console.info("[Aureus] Seed data loaded.", state);
  }

  // Слушаем запрос тика от Dashboard
  Hooks.on("aureus.requestTick", async () => {
    const { TickManager } = await import("./core/tickManager.js");
    await TickManager.runTick();
    _dashboard?.refresh();
    // Сбрасываем разовый дебаг-seed после использования
    TickManager.debugSeed = null;
  });

  // Сбрасываем кеш стейта при обновлении мира другим клиентом
  Hooks.on("updateWorld", () => {
    StateManager.invalidateCache();
    _dashboard?.refresh();
  });

  // Слушаем открытие Debug Panel
  Hooks.on("aureus.openDebug", () => openDebugPanel());

  // Регистрируем хуки карты (Вечер 3)
  registerMapHooks(() => StateManager.getState());

  console.log("[Aureus] Ready.");
});

// ---------------------------------------------------------------
// Регистрация глобального доступа (для дебага в консоли браузера)
// ---------------------------------------------------------------
(window as unknown as Record<string, unknown>).Aureus = {
  openDashboard: () => openDashboard(),
  openDebugPanel: () => openDebugPanel(),
  getState: () => StateManager.getState(),
  resetState: (withSeedData = true) => StateManager.resetState(withSeedData),
  /** Установить seed для следующего тика (deterministic replay). Пример: Aureus.setDebugSeed(42) */
  setDebugSeed: async (seed: number) => {
    const { TickManager } = await import("./core/tickManager.js");
    TickManager.debugSeed = seed;
    console.info(`[Aureus] Debug seed set to ${seed}. Next tick will use it.`);
  },
};

function openDashboard(): void {
  if (!_dashboard) {
    _dashboard = new AureusDashboard();
  }
  _dashboard.render({ force: true });
}

async function openDebugPanel(): Promise<void> {
  if (!_debugPanel) {
    const { AureusDebugPanel } = await import("./ui/debugPanel.js");
    _debugPanel = new AureusDebugPanel();
  }
  _debugPanel.render({ force: true });
}
