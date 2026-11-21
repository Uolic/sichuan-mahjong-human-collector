const SESSION_SIZE = 20;
const TASK_ASSET_VERSION = "20261121-6";

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
};

const $ = (id) => document.getElementById(id);
const suitNames = { w: "万", t: "条", b: "筒" };
const meldNames = { peng: "碰", gang: "杠", chi: "吃" };
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
  return `
    <img class="tile-photo" src="tiles_cn/${tile[1]}${tile[0]}.jpg?v=${TASK_ASSET_VERSION}"
      alt="" loading="eager" decoding="async" draggable="false">
  `;
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
  const discards = player.discards.length
    ? player.discards.map((tile) => miniTile(tile)).join("")
    : `<span class="river-empty">尚未出牌</span>`;
  const melds = player.melds.length
    ? `<div class="river-melds">${player.melds.map((meld) => `
        <span class="river-meld">
          <b>${meldNames[meld.kind] || meld.kind}</b>
          ${meld.tiles.map((tile) => miniTile(tile)).join("")}
        </span>
      `).join("")}</div>`
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

function show(screenId) {
  document.querySelectorAll(".screen").forEach((node) => node.classList.remove("active"));
  $(screenId).classList.add("active");
  document.body.dataset.screen = screenId;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderMeta(task) {
  const isTenpai = task.shanten <= 0;
  const ting = task.tingTiles && task.tingTiles.length
    ? `可听 ${task.tingTiles.length} 种`
    : isTenpai ? "已听牌" : "尚未听牌";
  const tingDetail = task.tingTiles && task.tingTiles.length
    ? task.tingTiles.map(tileLabel).join("、")
    : ting;
  $("meta").innerHTML = `
    <span class="stat missing"><span>定缺</span><strong>${task.missingSuitName || "未定"}</strong></span>
    <span class="stat"><span>向听</span><b>${task.shanten}</b></span>
    <span class="stat" title="${tingDetail}"><span>听牌</span><b>${ting}</b></span>
    <span class="stat"><span>桌面</span><b>${task.players.reduce((sum, player) => sum + player.discards.length, 0)} 张</b></span>
  `;
}

function renderTable(task) {
  const seats = playerPositions.map(({ player, position, label, avatar }) => {
    const data = playerByIndex(task, player);
    if (!data) return "";
    return `
      <div class="seat seat-${position}${player === 0 ? " self" : ""}"
        aria-label="${label}，${data.score} 分${data.melds.length ? `，${data.melds.length} 副露` : ""}">
        <span class="seat-avatar">${avatar}</span>
        <span class="seat-copy">
          <small>${data.score} 分${data.melds.length ? ` · ${data.melds.length}副露` : ""}</small>
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

  const me = playerByIndex(task, 0);
  $("myMelds").innerHTML = me && me.melds.length ? renderMelds(me, true) : "";
}

function renderQuestion() {
  const task = state.tasks[state.index];
  state.taskStartedAt = performance.now();
  state.selected = [];
  state.isAdvancing = false;
  $("progressTitle").textContent = `第 ${state.index + 1} / ${state.tasks.length} 手`;
  $("progressBar").style.width = `${((state.index + 1) / state.tasks.length) * 100}%`;
  $("wallRemaining").textContent = task.wallRemaining;
  renderMeta(task);
  renderTable(task);
  $("selectedLabel").textContent = "点一张手牌";
  $("confirm").disabled = true;
  const counts = {};
  task.hand.forEach((tile) => { counts[tile] = (counts[tile] || 0) + 1; });
  const used = {};
  $("hand").innerHTML = task.hand.map((tile, index) => {
    used[tile] = (used[tile] || 0) + 1;
    const duplicate = counts[tile] > 1 ? `<span class="tile-count">${used[tile]}</span>` : "";
    const missing = tile[1] === task.missingSuit ? " missing" : "";
    const order = counts[tile] > 1 ? `，第${used[tile]}张` : "";
    const aria = `${tileLabel(tile)}${order}${missing ? "，定缺牌" : ""}`;
    return `
      <button class="mahjong-tile${missing}" data-index="${index}" data-tile="${tile}" aria-label="${aria}" aria-pressed="false">
        <span class="tile-face">${tileImage(tile)}</span>
        ${duplicate}
      </button>
    `;
  }).join("");
  enableHandSorting();
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
  const isMissing = state.tasks[state.index].missingSuit === button.dataset.tile[1];
  $("selectedLabel").textContent = `已选 ${tileLabel(button.dataset.tile)}${isMissing ? " · 定缺" : ""}`;
  $("confirm").disabled = false;
}

async function recordAnswer(tile, skipped = false) {
  if (state.isAdvancing) return;
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

async function finish() {
  show("done");
  const elapsed = Math.round((performance.now() - state.startedAt) / 60000);
  $("summary").innerHTML = `
    <div><span>完成题目</span><b>${state.answers.filter((answer) => !answer.skipped).length}</b></div>
    <div><span>跳过题目</span><b>${state.answers.filter((answer) => answer.skipped).length}</b></div>
  `;
  const payload = {
    schema: "sichuan-human-choice-v1",
    sessionId: state.sessionId,
    collectorId: state.collectorId,
    experience: state.experience,
    consentVersion: "web-human-v1",
    consent: true,
    startedAt: new Date(Date.now() - elapsed * 60000).toISOString(),
    submittedAt: new Date().toISOString(),
    answers: state.answers,
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
          ? `牌桌已准备 · ${taskPoolCount} 个局面`
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
    const [payload] = await Promise.all([loadTaskPool(), preloadTileAssets()]);
    const requestedTaskId = new URLSearchParams(window.location.search).get("task");
    const requestedTask = requestedTaskId
      ? payload.tasks.find((task) => task.id === requestedTaskId)
      : null;
    state.startedAt = performance.now();
    state.tasks = requestedTask ? [requestedTask] : shuffle(payload.tasks).slice(0, SESSION_SIZE);
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
    startButton.textContent = "入座，开始 20 手";
  }
}

function init() {
  state.collectorId = localStorage.getItem("mahjongCollectorId") || makeId("anon");
  localStorage.setItem("mahjongCollectorId", state.collectorId);
  state.sessionId = makeId("session");
  $("collectorId").textContent = state.collectorId;
  $("consent").addEventListener("change", () => {
    const consented = $("consent").checked;
    $("start").classList.toggle("needs-consent", !consented);
    const status = $("startStatus");
    status.classList.remove("error");
    status.textContent = consented
      ? taskPoolCount ? `牌桌已准备 · ${taskPoolCount} 个局面` : "正在准备牌桌…"
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
  $("confirm").addEventListener("click", () => recordAnswer(state.selected[0]));
  $("skip").addEventListener("click", () => recordAnswer(null, true));
  $("exit").addEventListener("click", () => {
    if (confirm("退出后本轮答案不会提交，确定吗？")) show("welcome");
  });
  $("download").addEventListener("click", downloadPayload);
  $("again").addEventListener("click", () => {
    state.index = 0;
    state.answers = [];
    state.sessionId = makeId("session");
    show("welcome");
  });
  const runPreload = () => window.setTimeout(preloadTaskPool, 80);
  if ("requestIdleCallback" in window) requestIdleCallback(runPreload, { timeout: 900 });
  else runPreload();
  $("startStatus").textContent = "先勾选上面的匿名说明，再开始";
}

init();
