const STATIC_MIN_GAME_SIZE = 6;
const TASK_ASSET_VERSION = "20261121-22";

const state = {
  tasks: [],
  selected: [],
  index: 0,
  experience: "intermediate",
  collectorId: "",
  sessionId: "",
  startedAt: 0,
  taskStartedAt: 0,
  answers: [],
  isAdvancing: false,
  dynamic: false,
  gameId: "",
  liveTask: null,
  missingGame: null,
  handOrder: [],
  handManual: false,
  reactionStartedAt: 0,
  decisionMode: "",
  feedAdvance: null,
};

const $ = (id) => document.getElementById(id);
const suitNames = { w: "万", t: "条", b: "筒" };
const suitGlyphs = { w: "万", t: "条", b: "筒" };
const suitOrder = { w: 0, t: 1, b: 2 };
const meldNames = { peng: "碰", gang: "杠", chi: "吃" };
const experienceModes = {
  beginner: {
    label: "新手教学",
    summary: "固定教学局 · 规则讲解 · 有建议",
    hintsEnabled: true,
    tutorialEnabled: true,
    fixedDeal: true,
    collectionEligible: false,
  },
  intermediate: {
    label: "中等对局",
    summary: "随机牌局 · 建议与番型提示",
    hintsEnabled: true,
    tutorialEnabled: false,
    fixedDeal: false,
    collectionEligible: true,
  },
  advanced: {
    label: "高手对局",
    summary: "随机牌局 · 不显示建议和推理提示",
    hintsEnabled: false,
    tutorialEnabled: false,
    fixedDeal: false,
    collectionEligible: true,
  },
  unspecified: {
    label: "自由对局",
    summary: "随机牌局 · 保留基础提示",
    hintsEnabled: true,
    tutorialEnabled: false,
    fixedDeal: false,
    collectionEligible: false,
  },
};
const playerPositions = [
  { player: 2, position: "top", label: "对家", avatar: "对" },
  { player: 1, position: "right", label: "右家", avatar: "右" },
  { player: 3, position: "left", label: "左家", avatar: "左" },
  { player: 0, position: "self", label: "我", avatar: "我" },
];
let taskPoolPromise = null;
let taskPoolCount = 0;
let tileAssetPromise = null;

function makeId(prefix) {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return prefix + "-" + Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function tileLabel(tile) {
  return `${tile[0]}${suitNames[tile[1]] || tile[1]}`;
}

function tileImage(tile) {
  const source = `tiles_cn/${tile[1]}${tile[0]}.jpg?v=${TASK_ASSET_VERSION}`;
  return `
    <span class="tile-art">
      <span class="tile-fallback" aria-hidden="true">
        <b>${tile[0]}</b><small>${suitGlyphs[tile[1]] || tile[1]}</small>
      </span>
      <img class="tile-photo" src="${source}" data-src="${source}" data-retry-count="0"
        alt="" loading="eager" decoding="async" draggable="false">
    </span>
  `;
}

function modeFor(task = null) {
  const local = experienceModes[state.experience] || experienceModes.unspecified;
  return { ...local, ...(task?.mode || {}) };
}

function updateModeNote() {
  const mode = modeFor();
  $("modeNote").textContent = mode.summary;
  $("modeNote").dataset.mode = state.experience;
}

function bindTileImages(root = document) {
  root.querySelectorAll(".tile-photo").forEach((image) => {
    if (image.dataset.retryBound === "1") return;
    image.dataset.retryBound = "1";
    const art = image.closest(".tile-art");
    const handleError = () => {
      const retries = Number(image.dataset.retryCount || 0);
      if (retries < 2) {
        image.dataset.retryCount = String(retries + 1);
        art?.classList.add("image-retrying");
        window.setTimeout(() => {
          const source = image.dataset.src;
          image.src = `${source}${source.includes("?") ? "&" : "?"}retry=${retries + 1}`;
        }, 220 * (retries + 1));
        return;
      }
      image.classList.add("image-error");
      art?.classList.add("image-failed");
    };
    image.addEventListener("load", () => {
      image.classList.remove("image-error");
      art?.classList.remove("image-failed", "image-retrying");
    });
    image.addEventListener("error", handleError);
    if (image.complete && image.naturalWidth === 0) handleError();
  });
}

function miniTile(tile, className = "") {
  return `
    <span class="mini-tile suit-${tile[1]} ${className}" title="${tileLabel(tile)}" aria-label="${tileLabel(tile)}">
      ${tileImage(tile)}
    </span>
  `;
}

function playerByIndex(task, index) {
  return task.players.find((player) => player.player === index);
}

function renderMelds(player, compact = false) {
  return player.melds.map((meld) => `
    <span class="meld-chip">
      <b>${meldNames[meld.kind] || meld.kind}</b>
      ${meld.tiles.map((tile) => compact
        ? miniTile(tile, "meld-mini")
        : miniTile(tile)).join("")}
    </span>
  `).join("");
}

function renderRiver(player, position, label) {
  const dense = player.discards.length > 10 || player.melds.length >= 2 ? " dense" : "";
  const empty = player.discards.length === 0 && player.melds.length === 0 ? " empty" : "";
  const compactMelds = position === "left" || position === "right";
  const discards = player.discards.length
    ? player.discards.map((tile) => miniTile(tile)).join("")
    : `<span class="river-empty">尚未出牌</span>`;
  const melds = player.melds.length
    ? `<div class="river-melds${compactMelds ? " compact" : ""}">${player.melds.map((meld) => {
      const name = meldNames[meld.kind] || meld.kind;
      const labels = meld.tiles.map(tileLabel).join(" ");
      const counts = meld.tiles.reduce((result, tile) => {
        result[tile] = (result[tile] || 0) + 1;
        return result;
      }, {});
      const entries = Object.entries(counts);
      const summary = entries.length === 1
        ? `${tileLabel(entries[0][0])}×${entries[0][1]}`
        : labels;
      return compactMelds
        ? `<span class="river-meld compact-meld" title="${name}：${labels}"><b>${name}</b><em>${summary}</em></span>`
        : `<span class="river-meld"><b>${name}</b>${meld.tiles.map((tile) => miniTile(tile)).join("")}</span>`;
    }).join("")}</div>`
    : "";
  return `
    <div class="river river-${position}${dense}${empty}">
      <span class="river-label">${label} · ${player.discards.length} 张</span>
      ${melds}
      <div class="river-tiles">${discards}</div>
    </div>
  `;
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function selectStaticGame(tasks) {
  const groups = new Map();
  for (const task of tasks) {
    const key = task.gameIndex ?? task.seed ?? task.id.split("-").slice(0, 3).join("-");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  }
  const candidates = [...groups.values()]
    .filter((group) => group.length >= STATIC_MIN_GAME_SIZE)
    .map((group) => [...group].sort((left, right) => (left.turn ?? 0) - (right.turn ?? 0)));
  const pool = candidates.length ? candidates : [[...tasks]];
  return pool[Math.floor(Math.random() * pool.length)];
}

async function apiJson(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const detail = await response.json();
      message = detail.error || message;
    } catch {
      // Static GitHub Pages may return HTML for an unavailable API.
    }
    throw new Error(message);
  }
  return response.json();
}

function show(screenId) {
  document.querySelectorAll(".screen").forEach((node) => node.classList.remove("active"));
  $(screenId).classList.add("active");
  document.body.dataset.screen = screenId;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderMissingSuit(observation) {
  state.missingGame = observation;
  const mode = modeFor(observation);
  $("missingModeKicker").textContent = `${mode.label} · 血战到底`;
  $("missingWall").textContent = observation.wallRemaining;
  const hand = sortedTiles(observation.hand);
  const counts = {};
  hand.forEach((tile) => { counts[tile] = (counts[tile] || 0) + 1; });
  const used = {};
  $("missingHand").innerHTML = hand.map((tile) => {
    used[tile] = (used[tile] || 0) + 1;
    const duplicate = counts[tile] > 1 ? `<span class="tile-count">${used[tile]}</span>` : "";
    return `
      <span class="mahjong-tile" aria-label="${tileLabel(tile)}">
        <span class="tile-face">${tileImage(tile)}</span>
        ${duplicate}
      </span>
    `;
  }).join("");
  bindTileImages($("missingHand"));
  document.querySelectorAll(".suit-choice").forEach((button) => {
    button.disabled = false;
    button.classList.remove("recommended");
    button.removeAttribute("data-recommend");
  });
  $("missingStatus").classList.remove("error");
  const dealInfo = observation.dealInfo;
  if (mode.hintsEnabled && dealInfo) {
    const distribution = ["w", "t", "b"]
      .map((suit) => `${suitNames[suit]}${dealInfo.suitCounts?.[suit] ?? 0}`)
      .join(" · ");
    $("missingStatus").textContent = dealInfo.skyShort
      ? `天缺！起手天然少${dealInfo.naturalMissingNames.join("、")}，三门分布：${distribution}`
      : `${mode.tutorialEnabled ? "教学局已准备好" : "洗牌完成"}，三门分布：${distribution}。`;
    const minimum = Math.min(
      ...["w", "t", "b"].map((suit) => Number(dealInfo.suitCounts?.[suit] ?? 0)),
    );
    document.querySelectorAll(".suit-choice").forEach((button) => {
      const count = Number(dealInfo.suitCounts?.[button.dataset.suit] ?? 0);
      if (count !== minimum) return;
      button.classList.add("recommended");
      button.dataset.recommend = mode.tutorialEnabled ? "教学推荐" : "参考";
    });
  } else {
    $("missingStatus").textContent = "请选择你的定缺花色；选定后开始连续打完整局。";
  }
  $("missingLesson").textContent = mode.tutorialEnabled
    ? observation.tutorialTip || "先看三门张数，张数最少的一门通常最适合定缺。"
    : mode.hintsEnabled
      ? "提示：定缺通常从张数最少的一门开始；定缺后整局不能更换。"
      : "";
}

function actionSummary(action) {
  const typeNames = { discard: "打出", peng: "碰", gang: "杠", hu: "胡牌" };
  const verb = typeNames[action.type] || action.type;
  const tile = action.tile ? ` ${tileLabel(action.tile)}` : "";
  return `${action.playerLabel || `P${action.player}`}${verb}${tile}`;
}

function renderMeta(task) {
  const mode = modeFor(task);
  if (!mode.hintsEnabled) {
    $("meta").classList.add("minimal");
    $("meta").innerHTML = `
      <span class="stat missing"><span>定缺</span><strong>${task.missingSuitName || "未定"}</strong></span>
      <span class="stat"><span>牌墙剩余</span><b>${task.wallRemaining} 张</b></span>
    `;
    return;
  }
  $("meta").classList.remove("minimal");
  const isTenpai = Number.isFinite(task.shanten) && task.shanten <= 0;
  const ting = task.tingTiles && task.tingTiles.length
    ? `可听 ${task.tingTiles.length} 种`
    : isTenpai ? "已听牌" : "尚未听牌";
  const tingDetail = task.tingTiles && task.tingTiles.length
    ? task.tingTiles.map(tileLabel).join("、")
    : ting;
  $("meta").innerHTML = `
    <span class="stat missing"><span>定缺</span><strong>${task.missingSuitName || "未定"}</strong></span>
    <span class="stat"><span>牌墙剩余</span><b>${task.wallRemaining} 张</b></span>
    <span class="stat"><span>向听</span><b>${task.shanten}</b></span>
    <span class="stat" title="${tingDetail}"><span>听牌</span><b>${ting}</b></span>
  `;
}

function renderPlayGuidance(task) {
  const mode = modeFor(task);
  $("playGuidance").classList.remove("error");
  if (!mode.hintsEnabled) {
    $("playGuidance").classList.add("hidden");
    $("playGuidance").innerHTML = "";
    return;
  }
  $("playGuidance").classList.remove("hidden");
  $("playGuidance").classList.toggle("tutorial", Boolean(mode.tutorialEnabled));
  const suggestion = task.suggestion;
  const fanTarget = task.fanOptions && task.fanOptions.length
    ? `可胡 ${task.fanOptions.slice(0, 2).map((item) => `${tileLabel(item.tile)}·${item.pattern}${item.fan}番`).join("、")}`
    : task.bestPlan
      ? `${task.bestPlan.name} ${task.bestPlan.fan}番 ×${task.bestPlan.multiplier}`
      : task.tingTiles?.length
        ? `听 ${task.tingTiles.length} 种`
        : "先按定缺和向听推进";
  $("playGuidance").innerHTML = `
    <div class="guide-main">
      <span>建议出牌</span>
      <strong>${suggestion ? tileLabel(suggestion.tile) : "自行判断"}</strong>
    </div>
    <div class="guide-plan">
      <span>${mode.tutorialEnabled ? "本步规则" : "目标牌型 / 可胡"}</span>
      <b>${mode.tutorialEnabled ? task.tutorialTip || "先打定缺牌，再保留连牌和对子。" : fanTarget}</b>
      <em>${mode.tutorialEnabled ? fanTarget : suggestion ? suggestion.reason || "兼顾牌型与风险" : ""}</em>
    </div>
  `;
}

function renderTable(task) {
  const seats = playerPositions.map(({ player, position, label, avatar }) => {
    const data = playerByIndex(task, player);
    if (!data) return "";
    const missing = data.missingSuitName ? ` · 缺${data.missingSuitName}` : "";
    return `
      <div class="seat seat-${position}${player === 0 ? " self" : ""}"
        aria-label="${label}，${data.score} 分${missing}${data.melds.length ? `，${data.melds.length} 副露` : ""}">
        <span class="seat-avatar">${avatar}</span>
        <span class="seat-copy">
          <small>${data.score} 分${missing}${data.melds.length ? ` · ${data.melds.length}副露` : ""}</small>
        </span>
      </div>
    `;
  }).join("");

  const rivers = [
    renderRiver(playerByIndex(task, 2), "top", "对家"),
    renderRiver(playerByIndex(task, 1), "right", "右家"),
    renderRiver(playerByIndex(task, 3), "left", "左家"),
    renderRiver(playerByIndex(task, 0), "bottom", "我"),
  ].join("");

  $("tableInfo").innerHTML = `
    ${seats}
    <div class="river-board">
      <div class="table-mark" aria-hidden="true">川<small>血战到底</small></div>
      ${rivers}
    </div>
  `;
  bindTileImages($("tableInfo"));

  const me = playerByIndex(task, 0);
  $("myMelds").innerHTML = me && me.melds.length ? renderMelds(me, true) : "";
}

function currentTask() {
  return state.dynamic ? state.liveTask : state.tasks[state.index];
}

function compareTiles(left, right) {
  const suitDiff = (suitOrder[left[1]] ?? 9) - (suitOrder[right[1]] ?? 9);
  if (suitDiff) return suitDiff;
  return Number(left[0]) - Number(right[0]);
}

function sortedTiles(tiles) {
  return [...tiles].sort(compareTiles);
}

function arrangedTiles(tiles) {
  if (!state.handManual || !state.handOrder.length) return sortedTiles(tiles);
  const available = {};
  tiles.forEach((tile) => { available[tile] = (available[tile] || 0) + 1; });
  const ordered = [];
  for (const tile of state.handOrder) {
    if (!available[tile]) continue;
    ordered.push(tile);
    available[tile] -= 1;
  }
  const remaining = [];
  tiles.forEach((tile) => {
    if (!available[tile]) return;
    remaining.push(tile);
    available[tile] -= 1;
  });
  remaining.sort(compareTiles).forEach((tile) => {
    let insertAt = ordered.length;
    const suit = suitOrder[tile[1]];
    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      if ((suitOrder[ordered[index][1]] ?? 9) <= suit) {
        insertAt = index + 1;
        break;
      }
    }
    ordered.splice(insertAt, 0, tile);
  });
  return ordered;
}

function captureHandOrder() {
  state.handOrder = [...$("hand").querySelectorAll(".mahjong-tile")]
    .map((node) => node.dataset.tile);
  state.handManual = true;
}

function renderHand(task) {
  const tiles = arrangedTiles(task.hand);
  state.handOrder = [...tiles];
  const counts = {};
  tiles.forEach((tile) => { counts[tile] = (counts[tile] || 0) + 1; });
  const drawnCount = task.drawnTile ? counts[task.drawnTile] || 0 : 0;
  const used = {};
  $("hand").innerHTML = tiles.map((tile, index) => {
    used[tile] = (used[tile] || 0) + 1;
    const duplicate = counts[tile] > 1 ? `<span class="tile-count">${used[tile]}</span>` : "";
    const missing = tile[1] === task.missingSuit ? " missing" : "";
    const newlyDrawn = tile === task.drawnTile && used[tile] === drawnCount;
    const order = counts[tile] > 1 ? `，第${used[tile]}张` : "";
    const aria = `${tileLabel(tile)}${order}${missing ? "，定缺牌" : ""}${newlyDrawn ? "，新摸牌" : ""}`;
    return `
      <button class="mahjong-tile${missing}${newlyDrawn ? " newly-drawn" : ""}" data-index="${index}" data-tile="${tile}" title="${aria}" aria-label="${aria}" aria-pressed="false">
        <span class="tile-face">${tileImage(tile)}</span>
        ${duplicate}
        ${newlyDrawn ? `<span class="tile-new">新</span>` : ""}
      </button>
    `;
  }).join("");
  bindTileImages($("hand"));
  enableHandSorting();
}

function renderQuestion() {
  const task = currentTask();
  if (!task) return;
  const mode = modeFor(task);
  state.taskStartedAt = performance.now();
  state.selected = [];
  state.isAdvancing = false;
  $("progressTitle").textContent = state.dynamic
    ? `本局第 ${task.turn || 1} 手`
    : `本局关键手 ${state.index + 1} / ${state.tasks.length}`;
  $("gameModeKicker").textContent = `${mode.label} · 血战到底`;
  $("progressBar").style.width = state.dynamic
    ? `${Math.min(100, Math.max(5, (1 - task.wallRemaining / 56) * 100))}%`
    : `${((state.index + 1) / state.tasks.length) * 100}%`;
  $("wallRemaining").textContent = task.wallRemaining;
  renderMeta(task);
  renderPlayGuidance(task);
  renderTable(task);
  $("selectedLabel").textContent = task.drawnTile ? `新摸 ${tileLabel(task.drawnTile)}` : "点一张手牌";
  $("confirm").disabled = true;
  $("confirm").textContent = "打出这张";
  state.feedAdvance = null;
  $("skip").disabled = false;
  $("skip").classList.toggle("hidden", state.dynamic);
  document.querySelector(".actions").classList.toggle("dynamic", state.dynamic);
  renderHand(task);
}

function enableHandSorting() {
  const hand = $("hand");
  let drag = null;
  let suppressClickUntil = 0;

  const clearDocumentListeners = () => {
    document.removeEventListener("pointermove", moveTile);
    document.removeEventListener("pointerup", endDrag);
    document.removeEventListener("pointercancel", endDrag);
  };

  const finishDrag = (moved) => {
    if (!drag) return;
    drag.tile.classList.remove("dragging");
    hand.classList.remove("sorting");
    if (drag.placeholder?.parentNode) drag.placeholder.replaceWith(drag.tile);
    for (const property of ["position", "left", "top", "width", "height", "z-index", "margin", "transform"]) {
      drag.tile.style.removeProperty(property);
    }
    if (moved) {
      suppressClickUntil = performance.now() + 300;
      captureHandOrder();
      navigator.vibrate?.(18);
    }
    drag = null;
    clearDocumentListeners();
  };

  const endDrag = (event) => {
    if (!drag || (event?.pointerId != null && event.pointerId !== drag.pointerId)) return;
    finishDrag(drag.moved);
  };

  const beginVisualDrag = (event) => {
    const rect = drag.tile.getBoundingClientRect();
    drag.offsetX = event.clientX - rect.left;
    drag.offsetY = event.clientY - rect.top;
    drag.placeholder = document.createElement("span");
    drag.placeholder.className = "tile-placeholder";
    drag.placeholder.setAttribute("aria-hidden", "true");
    drag.tile.before(drag.placeholder);
    document.body.appendChild(drag.tile);
    Object.assign(drag.tile.style, {
      position: "fixed",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      margin: "0",
      zIndex: "100",
    });
    drag.tile.classList.add("dragging");
    hand.classList.add("sorting");
    navigator.vibrate?.(10);
  };

  const moveTile = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 7) return;
    event.preventDefault();
    if (!drag.moved) {
      drag.moved = true;
      beginVisualDrag(event);
    }
    drag.tile.style.left = `${event.clientX - drag.offsetX}px`;
    drag.tile.style.top = `${event.clientY - drag.offsetY}px`;

    const candidates = document.elementsFromPoint(event.clientX, event.clientY);
    const target = candidates.find((element) => {
      const tile = element.closest?.(".mahjong-tile");
      return tile && tile !== drag.tile && hand.contains(tile);
    })?.closest(".mahjong-tile");
    if (!target) return;

    const rect = target.getBoundingClientRect();
    if (event.clientY < rect.top) target.before(drag.placeholder);
    else if (event.clientY > rect.bottom) target.after(drag.placeholder);
    else if (event.clientX > rect.left + rect.width / 2) target.after(drag.placeholder);
    else target.before(drag.placeholder);
  };

  hand.querySelectorAll(".mahjong-tile").forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      if (state.isAdvancing || event.button !== 0 || drag) return;
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        tile: button,
        moved: false,
      };
      document.addEventListener("pointermove", moveTile, { passive: false });
      document.addEventListener("pointerup", endDrag);
      document.addEventListener("pointercancel", endDrag);
    });
    button.addEventListener("click", (event) => {
      if (performance.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      selectTile(button);
    });
  });

}

function selectTile(button) {
  if (state.isAdvancing) return;
  document.querySelectorAll(".mahjong-tile").forEach((node) => {
    node.classList.remove("selected");
    node.setAttribute("aria-pressed", "false");
  });
  button.classList.add("selected");
  button.setAttribute("aria-pressed", "true");
  navigator.vibrate?.(12);
  state.selected = [button.dataset.tile];
  const isMissing = currentTask().missingSuit === button.dataset.tile[1];
  $("selectedLabel").textContent = `已选 ${tileLabel(button.dataset.tile)}${isMissing ? " · 定缺" : ""}`;
  $("confirm").disabled = false;
}

async function recordAnswer(tile, skipped = false) {
  if (state.isAdvancing) return;
  if (state.dynamic) {
    await recordDynamicAnswer(tile);
    return;
  }
  state.isAdvancing = true;
  $("confirm").disabled = true;
  $("skip").disabled = true;
  const selectedTile = document.querySelector(".mahjong-tile.selected");
  if (selectedTile && !skipped) {
    navigator.vibrate?.([16, 24, 28]);
    selectedTile.classList.add("discarding");
    await new Promise((resolve) => setTimeout(resolve, 220));
  }
  const task = state.tasks[state.index];
  state.answers.push({
    taskId: task.id,
    chosenTile: skipped ? null : tile,
    skipped,
    responseMs: Math.max(0, Math.round(performance.now() - state.taskStartedAt)),
  });
  state.index += 1;
  if (state.index >= state.tasks.length) finish();
  else {
    $("skip").disabled = false;
    renderQuestion();
  }
}

async function recordDynamicAnswer(tile) {
  if (state.isAdvancing || !state.gameId) return;
  state.isAdvancing = true;
  $("confirm").disabled = true;
  $("skip").disabled = true;
  const selectedTile = document.querySelector(".mahjong-tile.selected");
  const responseMs = Math.max(0, Math.round(performance.now() - state.taskStartedAt));
  if (selectedTile) {
    navigator.vibrate?.([16, 24, 28]);
    selectedTile.classList.add("discarding");
    await new Promise((resolve) => setTimeout(resolve, 220));
  }
  try {
    const result = await apiJson("/api/game/action", {
      gameId: state.gameId,
      collectorId: state.collectorId,
      chosenTile: tile,
      responseMs,
    });
    state.answers.push({ chosenTile: tile, responseMs });
    navigator.vibrate?.(14);
    handleDynamicObservation(result.observation);
  } catch (error) {
    state.isAdvancing = false;
    selectedTile?.classList.remove("discarding");
    $("confirm").disabled = !state.selected.length;
    $("skip").disabled = false;
    $("playGuidance").classList.remove("hidden");
    $("playGuidance").classList.add("error");
    $("playGuidance").innerHTML = `<div class="guide-main"><span>出牌失败</span><strong>${error.message}</strong></div>`;
  }
}

function finishDynamicObservation(observation) {
  state.isAdvancing = false;
  if (observation.gameOver) {
    finishDynamicGame(observation);
    return;
  }
  if (observation.phase === "reaction" && observation.reaction) {
    showReactionPrompt(observation.reaction);
    return;
  }
  if (observation.phase === "win" && observation.win) {
    showWinPrompt(observation.win);
    return;
  }
  renderQuestion();
  if (observation.mustDiscard) {
    $("selectedLabel").textContent = "碰杠完成，请打一张";
  }
}

function showAiTurnFeed(actions, next) {
  $("reactionOverlay").classList.add("hidden");
  if (!actions || !actions.length) {
    next();
    return;
  }
  state.isAdvancing = true;
  $("aiTurnOverlay").classList.remove("hidden");
  $("aiActionList").innerHTML = "";
  $("skip").classList.add("hidden");
  document.querySelector(".actions").classList.add("dynamic");
  const button = $("confirm");
  button.disabled = true;
  let index = 0;
  let locked = true;
  const emphasize = (action) => {
    document.querySelectorAll(".action-emphasis").forEach((node) => {
      node.classList.remove("action-emphasis");
    });
    const position = { 0: "self", 1: "right", 2: "top", 3: "left" }[action.player];
    const riverPosition = position === "self" ? "bottom" : position;
    document.querySelector(`.seat-${position}`)?.classList.add("action-emphasis");
    document.querySelector(`.river-${riverPosition}`)?.classList.add("action-emphasis");
  };
  const showCurrent = () => {
    if (index >= actions.length) {
      button.disabled = false;
      button.textContent = "继续出牌";
      $("aiActionNow").innerHTML = `<strong>全部行动已看完，轮到你继续</strong>`;
      return;
    }
    const action = actions[index];
    const typeNames = { discard: "打出", peng: "碰", gang: "杠", hu: "胡牌" };
    const glyphs = { discard: "出", peng: "碰", gang: "杠", hu: "胡" };
    const tileCount = action.type === "peng" ? 3 : action.type === "gang" ? 4 : 1;
    const detail = `${action.playerLabel || `P${action.player}`} ${typeNames[action.type] || action.type}${action.tile ? ` ${tileLabel(action.tile)}` : ""}`;
    emphasize(action);
    $("aiActionNow").innerHTML = `
      <span class="action-avatar">${action.playerLabel?.slice(0, 1) || "家"}</span>
      <span class="action-copy"><b>${action.playerLabel || `P${action.player}`}</b><strong>${typeNames[action.type] || action.type}</strong></span>
      ${action.tile ? `<span class="action-tiles">${Array.from({ length: tileCount }, () => miniTile(action.tile)).join("")}</span>` : `<span class="action-glyph">${glyphs[action.type] || "动"}</span>`}
      <span class="action-step">${index + 1}/${actions.length}</span>
    `;
    bindTileImages($("aiActionNow"));
    const history = actions.slice(0, index + 1).map((item, itemIndex) => {
      const text = `${item.playerLabel || `P${item.player}`}${typeNames[item.type] || item.type}${item.tile ? ` ${tileLabel(item.tile)}` : ""}`;
      return `<div class="ai-action${itemIndex === index ? " current" : ""}"><b>${itemIndex + 1}</b><strong>${text}</strong></div>`;
    }).join("");
    $("aiActionList").innerHTML = history;
    button.disabled = true;
    locked = true;
    button.textContent = `下一条 ${index + 1}/${actions.length}`;
    window.setTimeout(() => {
      locked = false;
      button.disabled = false;
      button.textContent = index + 1 < actions.length
        ? `下一条 ${index + 2}/${actions.length}`
        : "继续出牌";
    }, 650);
  };
  state.feedAdvance = () => {
    if (locked) return;
    index += 1;
    if (index >= actions.length) {
      $("aiTurnOverlay").classList.add("hidden");
      state.feedAdvance = null;
      document.querySelectorAll(".action-emphasis").forEach((node) => {
        node.classList.remove("action-emphasis");
      });
      next();
      return;
    }
    showCurrent();
  };
  showCurrent();
}

function handleDynamicObservation(observation) {
  state.liveTask = observation;
  const actions = (observation.recentActions || []).filter(
    (action) => !(action.player === 0 && action.type === "discard"),
  );
  if (actions.length) {
    showAiTurnFeed(actions, () => finishDynamicObservation(observation));
  } else {
    finishDynamicObservation(observation);
  }
}

function showReactionPrompt(reaction) {
  state.isAdvancing = false;
  state.decisionMode = "reaction";
  state.reactionStartedAt = performance.now();
  $("aiTurnOverlay").classList.add("hidden");
  $("reactionOverlay").classList.remove("hidden");
  $("reactionTitle").textContent = `${reaction.discarderLabel}打出 ${tileLabel(reaction.tile)}`;
  const mode = modeFor(currentTask());
  $("reactionText").innerHTML = `
    <span class="reaction-tile">${miniTile(reaction.tile)}</span>
    <span>
      你可以选择${reaction.options.includes("gang") ? "杠或" : ""}碰这张牌，也可以直接过。
      ${mode.tutorialEnabled ? "<br><b>教学：</b>碰或杠以后，你还要亲手补打一张。" : ""}
    </span>
  `;
  bindTileImages($("reactionText"));
  const peng = $("reactionPeng");
  const gang = $("reactionGang");
  const hu = $("reactionHu");
  const pass = $("reactionPass");
  peng.classList.toggle("hidden", !reaction.options.includes("peng"));
  gang.classList.toggle("hidden", !reaction.options.includes("gang"));
  hu.classList.add("hidden");
  for (const button of [peng, gang, pass]) button.disabled = false;
}

function showWinPrompt(win) {
  state.isAdvancing = false;
  state.decisionMode = "win";
  state.reactionStartedAt = performance.now();
  $("aiTurnOverlay").classList.add("hidden");
  $("reactionOverlay").classList.remove("hidden");
  const mine = (win.details || []).find((detail) => detail.player === 0) || win.details?.[0];
  const mode = modeFor(currentTask());
  $("reactionTitle").textContent = win.source === "self_draw" ? "可以自摸胡牌" : `可以胡 ${tileLabel(win.tile)}`;
  $("reactionText").innerHTML = `
    ${win.tile ? `<span class="reaction-tile">${miniTile(win.tile)}</span>` : ""}
    <span>
      ${mode.hintsEnabled && mine ? `
        <strong>${mine.pattern || "平胡"}</strong> · ${mine.fan || 1}番 × ${mine.multiplier || 1}倍
        ${mine.labels?.length ? `<br>${mine.labels.join(" · ")}` : ""}
        <br>本局基础分 ${mine.points || 1} 分，是否现在胡牌？
      ` : "你已经满足胡牌条件，是否现在胡牌？"}
      ${mode.tutorialEnabled ? "<br><b>教学：</b>选“胡”结束你的牌局，选“过”则继续打这一张。" : ""}
    </span>
  `;
  bindTileImages($("reactionText"));
  $("reactionPeng").classList.add("hidden");
  $("reactionGang").classList.add("hidden");
  $("reactionHu").classList.remove("hidden");
  $("reactionHu").disabled = false;
  $("reactionPass").disabled = false;
}

async function chooseReaction(action) {
  if (state.isAdvancing) return;
  state.isAdvancing = true;
  for (const id of ["reactionPeng", "reactionGang", "reactionHu", "reactionPass"]) $(id).disabled = true;
  try {
    const endpoint = state.decisionMode === "win" ? "/api/game/hu" : "/api/game/reaction";
    const result = await apiJson(endpoint, {
      gameId: state.gameId,
      collectorId: state.collectorId,
      action,
      responseMs: Math.max(0, Math.round(performance.now() - state.reactionStartedAt)),
    });
    $("reactionOverlay").classList.add("hidden");
    state.decisionMode = "";
    handleDynamicObservation(result.observation);
  } catch (error) {
    for (const id of ["reactionPeng", "reactionGang", "reactionHu", "reactionPass"]) $(id).disabled = false;
    $("reactionText").innerHTML = `<span class="error">${error.message}</span>`;
    state.isAdvancing = false;
  }
}

function finishDynamicGame(observation) {
  show("done");
  const mode = modeFor(observation);
  const tutorial = Boolean(mode.tutorialEnabled);
  const collectionEligible = Boolean(mode.collectionEligible);
  const decisionsThisGame = state.answers.length;
  state.answers = [];
  const scores = Object.entries(observation.summary?.scores || {})
    .map(([player, score]) => `<div><span>P${player}</span><b>${score} 分</b></div>`)
    .join("");
  const winners = observation.summary?.winners || [];
  $("doneKicker").textContent = tutorial ? "本局结算 · 教学" : "本局结算";
  $("doneTitle").textContent = "本局打完了";
  $("doneText").textContent = tutorial
    ? `本局教学完成，共出牌 ${decisionsThisGame} 次。本次练习不计入正式采集，下一局会重新计数。`
    : collectionEligible
      ? `本局已单独保存，共出牌 ${decisionsThisGame} 次；下一局会重新计数，不累计到本页。`
      : `本局共出牌 ${decisionsThisGame} 次。本模式不计入正式采集，下一局会重新计数。`;
  $("summary").innerHTML = `
    ${scores}
    <div style="grid-column:1/-1">
      <span>本局结果</span>
      <b>${winners.length ? `${winners.map((player) => `P${player}`).join("、")} 胡牌` : "流局"} · ${observation.summary?.rounds || observation.turn} 手</b>
    </div>
    <div style="grid-column:1/-1">
      <span>数据状态</span>
      <b>${tutorial ? "教学练习 · 不计入采集" : collectionEligible ? "中等/高手正式采集" : "自由模式 · 不计入采集"}</b>
    </div>
  `;
  $("nextMode").classList.toggle("hidden", !tutorial);
  $("download").classList.add("hidden");
  $("again").textContent = tutorial ? "再练一次" : "再打一局";
  window.lastPayload = observation;
}

async function finish() {
  show("done");
  $("nextMode").classList.add("hidden");
  $("again").textContent = "再答一轮";
  const answersThisGame = [...state.answers];
  state.answers = [];
  const elapsed = Math.round((performance.now() - state.startedAt) / 60000);
  $("summary").innerHTML = `
    <div><span>本局完成</span><b>${answersThisGame.filter((answer) => !answer.skipped).length}</b></div>
    <div><span>本局跳过</span><b>${answersThisGame.filter((answer) => answer.skipped).length}</b></div>
  `;
  const mode = modeFor();
  if (mode.tutorialEnabled) {
    $("doneKicker").textContent = "本局结算 · 教学";
    $("doneTitle").textContent = "本局打完了";
    $("doneText").textContent = "新手教学完成。本次练习不计入正式采集，下一步去中等局实战。";
    $("summary").innerHTML += `
      <div style="grid-column:1/-1">
        <span>数据状态</span>
        <b>教学练习 · 不计入采集</b>
      </div>
    `;
    $("nextMode").classList.remove("hidden");
    $("download").classList.add("hidden");
    return;
  }
  $("doneKicker").textContent = "本局结算";
  $("doneTitle").textContent = "本局打完了";
  const payload = {
    schema: "sichuan-human-choice-v1",
    sessionId: state.sessionId,
    collectorId: state.collectorId,
    experience: state.experience,
    consentVersion: "web-human-v1",
    consent: true,
    startedAt: new Date(Date.now() - elapsed * 60000).toISOString(),
    submittedAt: new Date().toISOString(),
    answers: answersThisGame,
  };
  window.lastPayload = payload;
  try {
    const response = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    $("doneText").textContent = `已提交，匿名采集编号 ${state.collectorId}。`;
    $("summary").innerHTML += `<div style="grid-column:1/-1"><span>服务器回执</span><b>${result.receipt || "OK"}</b></div>`;
  } catch (error) {
    $("doneText").innerHTML = `<span class="error">当前页面没有数据接收服务。</span><br>请下载结果并发给项目负责人。`;
    $("download").classList.remove("hidden");
  }
}

function downloadPayload() {
  const payload = window.lastPayload;
  if (!payload) return;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const file = new File([blob], `${state.collectorId}-${state.sessionId}.json`, { type: "application/json" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: "四川麻将出牌采集结果" });
    return;
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}

function setLoading(visible, title = "正在洗牌", text = "第一次进入需要准备牌桌，请稍等几秒。") {
  $("loadingTitle").textContent = title;
  $("loadingText").textContent = text;
  $("loadingOverlay").classList.toggle("hidden", !visible);
}

async function fetchTaskPayload(path) {
  const response = await fetch(`${path}?v=${TASK_ASSET_VERSION}`, { cache: "force-cache" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload.tasks) || payload.tasks.length === 0) {
    throw new Error("题池为空");
  }
  return payload;
}

function loadTaskPool() {
  if (!taskPoolPromise) {
    taskPoolPromise = fetchTaskPayload("./tasks_ui.json")
      .catch(() => fetchTaskPayload("./tasks.json"));
  }
  return taskPoolPromise;
}

function preloadTileAssets() {
  if (!tileAssetPromise) {
    const urls = [];
    for (const suit of ["w", "t", "b"]) {
      for (let number = 1; number <= 9; number += 1) {
        urls.push(`tiles_cn/${suit}${number}.jpg?v=${TASK_ASSET_VERSION}`);
      }
    }
    let nextIndex = 0;
    const loadOne = (url, attempt = 1) => new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(true);
      image.onerror = () => {
        if (attempt < 2) {
          setTimeout(() => loadOne(url, attempt + 1).then(resolve), 350);
        } else {
          resolve(false);
        }
      };
      image.src = url;
    });
    const worker = async () => {
      while (nextIndex < urls.length) {
        const url = urls[nextIndex];
        nextIndex += 1;
        await loadOne(url);
      }
    };
    tileAssetPromise = Promise.all(Array.from({ length: 4 }, worker));
  }
  return tileAssetPromise;
}

function preloadTaskPool() {
  loadTaskPool()
    .then((payload) => {
      taskPoolCount = payload.tasks.length;
      if ($("welcome").classList.contains("active")) {
        $("startStatus").classList.remove("error");
        $("startStatus").textContent = $("consent").checked
          ? "牌桌已准备 · 可开始连续一局"
          : "先勾选上面的匿名说明，再开始";
      }
    })
    .catch(() => {
      taskPoolPromise = null;
      if ($("welcome").classList.contains("active")) {
        $("startStatus").classList.add("error");
        $("startStatus").textContent = "题池暂时没有加载成功，点开始会自动重试。";
      }
    });
  preloadTileAssets();
}

async function startLiveGame() {
  const result = await apiJson("/api/game/new", {
    collectorId: state.collectorId,
    experience: state.experience,
    consent: true,
    consentVersion: "web-human-v1",
  });
  return result.observation;
}

async function chooseMissingSuit(suit) {
  if (!state.missingGame || state.isAdvancing) return;
  state.isAdvancing = true;
  document.querySelectorAll(".suit-choice").forEach((button) => {
    button.disabled = true;
  });
  $("missingStatus").classList.remove("error");
  $("missingStatus").textContent = "正在按定缺发牌…";
  setLoading(true, "正在定缺", "确定缺门后，三名 AI 会坐回牌桌。");
  try {
    const result = await apiJson("/api/game/missing-suit", {
      gameId: state.missingGame.gameId,
      collectorId: state.collectorId,
      suit,
    });
    state.dynamic = true;
    state.gameId = state.missingGame.gameId;
    state.liveTask = result.observation;
    state.tasks = [state.liveTask];
    state.index = 0;
    state.handOrder = [];
    state.handManual = false;
    state.startedAt = performance.now();
    show("quiz");
    renderQuestion();
  } catch (error) {
    $("missingStatus").classList.add("error");
    $("missingStatus").textContent = `定缺失败：${error.message}`;
    document.querySelectorAll(".suit-choice").forEach((button) => {
      button.disabled = false;
    });
  } finally {
    state.isAdvancing = false;
    setLoading(false);
  }
}

async function start() {
  state.experience = $("experience").value;
  const startButton = $("start");
  const status = $("startStatus");
  startButton.disabled = true;
  startButton.textContent = "正在准备牌桌…";
  status.classList.remove("error");
  status.textContent = "正在加载题池并洗牌";
  setLoading(true);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  try {
    const [liveObservation] = await Promise.all([startLiveGame(), preloadTileAssets()]);
    state.dynamic = true;
    state.gameId = liveObservation.gameId;
    state.liveTask = null;
    state.missingGame = liveObservation;
    state.answers = [];
    status.textContent = "";
    setLoading(false);
    show("missingSuit");
    renderMissingSuit(liveObservation);
    return;
  } catch (liveError) {
    console.info("连续牌局服务不可用，切换为牌谱演示。", liveError);
  }

  try {
    const [payload] = await Promise.all([loadTaskPool(), preloadTileAssets()]);
    const requestedTaskId = new URLSearchParams(window.location.search).get("task");
    const requestedTask = requestedTaskId
      ? payload.tasks.find((task) => task.id === requestedTaskId)
      : null;
    state.dynamic = false;
    state.gameId = "";
    state.missingGame = null;
    state.handOrder = [];
    state.handManual = false;
    state.startedAt = performance.now();
    state.tasks = requestedTask ? [requestedTask] : selectStaticGame(payload.tasks);
    state.index = 0;
    state.answers = [];
    status.textContent = "";
    show("quiz");
    renderQuestion();
  } catch (error) {
    taskPoolPromise = null;
    status.classList.add("error");
    status.textContent = `进入失败：${error.message}。请检查网络后重试。`;
  } finally {
    setLoading(false);
    startButton.disabled = false;
    startButton.textContent = "入座，开始一局";
  }
}

function init() {
  state.collectorId = localStorage.getItem("mahjongCollectorId") || makeId("anon");
  localStorage.setItem("mahjongCollectorId", state.collectorId);
  state.sessionId = makeId("session");
  $("collectorId").textContent = state.collectorId;
  state.experience = $("experience").value;
  updateModeNote();
  $("experience").addEventListener("change", () => {
    state.experience = $("experience").value;
    updateModeNote();
  });
  $("consent").addEventListener("change", () => {
    const consented = $("consent").checked;
    $("start").classList.toggle("needs-consent", !consented);
    const status = $("startStatus");
    status.classList.remove("error");
    status.textContent = consented
      ? taskPoolCount ? "牌桌已准备 · 可开始连续一局" : "正在准备牌桌…"
      : "先勾选上面的匿名说明，再开始";
    if (consented) preloadTaskPool();
  });
  $("start").addEventListener("click", () => {
    if (!$("consent").checked) {
      const status = $("startStatus");
      status.classList.add("error");
      status.textContent = "请先勾选匿名说明，再点开始";
      $("consent").focus();
      return;
    }
    start();
  });
  $("confirm").addEventListener("click", () => {
    if (state.feedAdvance) {
      state.feedAdvance();
      return;
    }
    recordAnswer(state.selected[0]);
  });
  $("skip").addEventListener("click", () => recordAnswer(null, true));
  $("sortHand").addEventListener("click", () => {
    const task = currentTask();
    if (!task) return;
    state.handManual = false;
    state.handOrder = [];
    state.selected = [];
    renderHand(task);
    $("confirm").disabled = true;
    $("selectedLabel").textContent = "已按万、条、筒自动理牌";
  });
  $("reactionPeng").addEventListener("click", () => chooseReaction("peng"));
  $("reactionGang").addEventListener("click", () => chooseReaction("gang"));
  $("reactionHu").addEventListener("click", () => chooseReaction("hu"));
  $("reactionPass").addEventListener("click", () => chooseReaction("pass"));
  document.querySelectorAll(".suit-choice").forEach((button) => {
    button.addEventListener("click", () => chooseMissingSuit(button.dataset.suit));
  });
  $("exit").addEventListener("click", () => {
    if (confirm("退出后本局不会保存，确定吗？")) show("welcome");
  });
  $("missingExit").addEventListener("click", () => {
    state.missingGame = null;
    state.gameId = "";
    state.dynamic = false;
    show("welcome");
  });
  $("download").addEventListener("click", downloadPayload);
  $("nextMode").addEventListener("click", () => {
    state.index = 0;
    state.answers = [];
    state.dynamic = false;
    state.gameId = "";
    state.liveTask = null;
    state.missingGame = null;
    state.handOrder = [];
    state.handManual = false;
    state.sessionId = makeId("session");
    $("experience").value = "intermediate";
    state.experience = "intermediate";
    updateModeNote();
    start();
  });
  $("again").addEventListener("click", () => {
    state.index = 0;
    state.answers = [];
    state.dynamic = false;
    state.gameId = "";
    state.liveTask = null;
    state.missingGame = null;
    state.handOrder = [];
    state.handManual = false;
    state.sessionId = makeId("session");
    $("nextMode").classList.add("hidden");
    show("welcome");
  });
  const runPreload = () => window.setTimeout(preloadTaskPool, 80);
  if ("requestIdleCallback" in window) requestIdleCallback(runPreload, { timeout: 900 });
  else runPreload();
  $("startStatus").textContent = "先勾选上面的匿名说明，再开始";
}

init();
