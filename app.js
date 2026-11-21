const SESSION_SIZE = 20;

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
const chineseNumbers = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const playerPositions = [
  { player: 2, position: "top", label: "对家", avatar: "对" },
  { player: 1, position: "right", label: "右家", avatar: "右" },
  { player: 3, position: "left", label: "左家", avatar: "左" },
  { player: 0, position: "self", label: "我", avatar: "你" },
];

function makeId(prefix) {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return prefix + "-" + Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function tileLabel(tile) {
  return `${tile[0]}${suitNames[tile[1]] || tile[1]}`;
}

const dotLayouts = {
  2: [[50, 42], [50, 98]],
  3: [[30, 42], [50, 70], [70, 98]],
  4: [[32, 48], [68, 48], [32, 92], [68, 92]],
  5: [[31, 42], [69, 42], [50, 70], [31, 98], [69, 98]],
  6: [[32, 38], [68, 38], [32, 70], [68, 70], [32, 102], [68, 102]],
  7: [[24, 32], [50, 32], [76, 32], [32, 68], [68, 68], [32, 104], [68, 104]],
  8: [[31, 28], [69, 28], [31, 55], [69, 55], [31, 82], [69, 82], [31, 109], [69, 109]],
  9: [[24, 30], [50, 30], [76, 30], [24, 68], [50, 68], [76, 68], [24, 106], [50, 106], [76, 106]],
};

const bambooLayouts = {
  2: [[50, 42]],
  3: [[50, 30], [39, 85], [61, 85]],
  4: [[31, 38], [69, 38], [31, 82], [69, 82]],
  5: [[34, 28], [66, 28], [50, 56], [34, 96], [66, 96]],
  6: [[30, 28], [70, 28], [30, 62], [70, 62], [30, 96], [70, 96]],
  7: [[24, 27], [50, 27], [76, 27], [36, 65], [64, 65], [36, 102], [64, 102]],
  8: [[31, 24], [69, 24], [31, 50], [69, 50], [31, 76], [69, 76], [31, 102], [69, 102]],
  9: [[24, 24], [50, 24], [76, 24], [24, 63], [50, 63], [76, 63], [24, 102], [50, 102], [76, 102]],
};

function dotFace(number) {
  const colors = ["#b73531", "#18734f", "#256c94"];
  if (number === 1) {
    return `
      <g transform="translate(50 70)">
        <circle r="30" fill="#f4ead4" stroke="#235f82" stroke-width="4"/>
        <circle r="21" fill="#f7f0df" stroke="#b63431" stroke-width="5"/>
        <circle r="11" fill="none" stroke="#1f7652" stroke-width="4"/>
        <circle r="4" fill="#245f83"/>
      </g>
    `;
  }
  return dotLayouts[number].map(([x, y], index) => {
    const color = colors[index % colors.length];
    return `
      <g transform="translate(${x} ${y})">
        <circle r="10" fill="#f5ecd9" stroke="${color}" stroke-width="3"/>
        <circle r="4.5" fill="${color}"/>
        <circle cx="-2.8" cy="-2.8" r="1.2" fill="#fff8e9" opacity=".9"/>
      </g>
    `;
  }).join("");
}

function bambooBar(x, y, color, angle = 0) {
  return `
    <g transform="translate(${x} ${y}) rotate(${angle})">
      <rect x="-4.2" y="-14" width="8.4" height="28" rx="4" fill="${color}"/>
      <rect x="-4.2" y="-3.5" width="8.4" height="4" rx="2" fill="#f2dfb8" opacity=".7"/>
      <circle cy="0" r="1.2" fill="#f8edcf"/>
    </g>
  `;
}

function bambooFace(number) {
  if (number === 1) {
    return `
      <path d="M42 98 C28 87 27 70 38 59 C48 48 66 47 76 59 C85 70 79 88 65 97 C58 102 49 102 42 98Z"
        fill="#1d7652" stroke="#124a38" stroke-width="2"/>
      <path d="M45 58 C51 44 63 37 72 32 L66 54Z" fill="#b53b34"/>
      <path d="M71 75 L91 91 L77 91 L64 83Z" fill="#1a6549"/>
      <path d="M40 78 C30 88 30 100 35 111 C42 104 45 96 49 88Z" fill="#b53b34"/>
      <circle cx="61" cy="62" r="3.3" fill="#fff7e8"/>
      <circle cx="61" cy="62" r="1.6" fill="#20251f"/>
      <path d="M42 86 L58 91" stroke="#f6d88a" stroke-width="3" stroke-linecap="round"/>
    `;
  }
  const coordinates = number === 2
    ? [[38, 70], [62, 70]]
    : bambooLayouts[number];
  return coordinates.map(([x, y], index) => {
    const color = index === 1 || index === 4 ? "#b53b34" : "#1b7952";
    return bambooBar(x, y, color, index % 2 ? -4 : 4);
  }).join("");
}

function tileSvg(tile) {
  const number = Number(tile[0]);
  const suit = tile[1];
  let art = "";
  if (suit === "w") {
    art = `
      <text x="50" y="58" text-anchor="middle" font-family="KaiTi, STKaiti, serif"
        font-size="43" font-weight="700" fill="#b1322d">${chineseNumbers[number]}</text>
      <text x="50" y="109" text-anchor="middle" font-family="KaiTi, STKaiti, serif"
        font-size="40" font-weight="700" fill="#173d31">萬</text>
    `;
  } else if (suit === "t") {
    art = bambooFace(number);
  } else {
    art = dotFace(number);
  }
  return `
    <svg class="tile-art-svg" viewBox="0 0 100 140" aria-hidden="true" focusable="false">
      ${art}
    </svg>
  `;
}

function miniTile(tile, className = "") {
  return `
    <span class="mini-tile suit-${tile[1]} ${className}" title="${tileLabel(tile)}" aria-label="${tileLabel(tile)}">
      ${tileSvg(tile)}
    </span>
  `;
}

function concealedHand(count = 13) {
  return Array.from({ length: count }, () => '<i class="tile-back"></i>').join("");
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
    <div class="river river-${position}${dense}">
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
      <div class="seat seat-${position}${player === 0 ? " self" : ""}">
        <span class="seat-avatar">${avatar}</span>
        <span class="seat-copy">
          <b>${label}</b>
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
    <div class="concealed-hand concealed-top" aria-hidden="true">${concealedHand()}</div>
    <div class="concealed-hand concealed-left" aria-hidden="true">${concealedHand()}</div>
    <div class="concealed-hand concealed-right" aria-hidden="true">${concealedHand()}</div>
    ${seats}
    <div class="river-board">
      <div class="table-mark" aria-hidden="true">川<small>血战到底</small></div>
      ${rivers}
    </div>
    <div class="wall-stack" aria-hidden="true">
      <i></i><i></i><i></i><i></i><i></i><i></i>
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
        <span class="tile-face">${tileSvg(tile)}</span>
        ${duplicate}
      </button>
    `;
  }).join("");
  document.querySelectorAll(".mahjong-tile").forEach((button) => {
    button.addEventListener("click", () => selectTile(button));
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

async function start() {
  state.experience = $("experience").value;
  state.startedAt = performance.now();
  const response = await fetch("./tasks.json");
  if (!response.ok) throw new Error("无法加载 tasks.json");
  const payload = await response.json();
  const requestedTaskId = new URLSearchParams(window.location.search).get("task");
  const requestedTask = requestedTaskId
    ? payload.tasks.find((task) => task.id === requestedTaskId)
    : null;
  state.tasks = requestedTask ? [requestedTask] : shuffle(payload.tasks).slice(0, SESSION_SIZE);
  show("quiz");
  renderQuestion();
}

function init() {
  state.collectorId = localStorage.getItem("mahjongCollectorId") || makeId("anon");
  localStorage.setItem("mahjongCollectorId", state.collectorId);
  state.sessionId = makeId("session");
  $("collectorId").textContent = state.collectorId;
  $("consent").addEventListener("change", () => {
    $("start").disabled = !$("consent").checked;
  });
  $("start").addEventListener("click", () => {
    start().catch((error) => alert(error.message));
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
}

init();
