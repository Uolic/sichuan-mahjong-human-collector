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
};

const $ = (id) => document.getElementById(id);
const suitNames = { w: "万", t: "条", b: "筒" };
const meldNames = { peng: "碰", gang: "杠", chi: "吃" };

function makeId(prefix) {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return prefix + "-" + Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function tileLabel(tile) {
  return `${tile[0]}${suitNames[tile[1]] || tile[1]}`;
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
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderMeta(task) {
  const ting = task.tingTiles && task.tingTiles.length
    ? `可听：${task.tingTiles.map(tileLabel).join("、")}`
    : "尚未听牌";
  $("meta").innerHTML = `
    <span class="chip">定缺：${task.missingSuitName || "未定"}</span>
    <span class="chip">向听：${task.shanten}</span>
    <span class="chip">剩余牌墙：${task.wallRemaining}</span>
    <span class="chip">${ting}</span>
  `;
}

function renderTable(task) {
  $("tableInfo").innerHTML = task.players.map((player) => {
    const melds = player.melds.length
      ? player.melds.map((meld) => `<span class="meld">${meldNames[meld.kind] || meld.kind} ${meld.tiles.map(tileLabel).join(" ")}</span>`).join("")
      : "无副露";
    const discards = player.discards.length
      ? player.discards.map(tileLabel).join(" ")
      : "没有弃牌";
    return `
      <div class="player-row">
        <div class="player-name">${player.player === 0 ? "我" : "P" + player.player}<br><small>${player.score} 分</small></div>
        <div><div>${melds}</div><div>弃牌：${discards}</div></div>
      </div>
    `;
  }).join("");
}

function renderQuestion() {
  const task = state.tasks[state.index];
  state.taskStartedAt = performance.now();
  state.selected = [];
  $("progressTitle").textContent = `第 ${state.index + 1} / ${state.tasks.length} 题`;
  $("progressBar").style.width = `${((state.index + 1) / state.tasks.length) * 100}%`;
  renderMeta(task);
  renderTable(task);
  $("selectedLabel").textContent = "请选择一张";
  $("confirm").disabled = true;
  const counts = {};
  task.hand.forEach((tile) => { counts[tile] = (counts[tile] || 0) + 1; });
  const used = {};
  $("hand").innerHTML = task.hand.map((tile, index) => {
    used[tile] = (used[tile] || 0) + 1;
    const suit = suitNames[tile[1]] || tile[1];
    const duplicate = counts[tile] > 1 ? ` · 第 ${used[tile]} 张` : "";
    const caption = `${suit}${duplicate}`;
    const missing = tile[1] === task.missingSuit ? " missing" : "";
    return `<button class="tile${missing}" data-index="${index}" data-tile="${tile}">${tile[0]}<small>${caption}</small></button>`;
  }).join("");
  document.querySelectorAll(".tile").forEach((button) => {
    button.addEventListener("click", () => selectTile(button));
  });
}

function selectTile(button) {
  document.querySelectorAll(".tile").forEach((node) => node.classList.remove("selected"));
  button.classList.add("selected");
  state.selected = [button.dataset.tile];
  $("selectedLabel").textContent = `已选：${tileLabel(button.dataset.tile)}`;
  $("confirm").disabled = false;
}

function recordAnswer(tile, skipped = false) {
  const task = state.tasks[state.index];
  state.answers.push({
    taskId: task.id,
    chosenTile: skipped ? null : tile,
    skipped,
    responseMs: Math.max(0, Math.round(performance.now() - state.taskStartedAt)),
  });
  state.index += 1;
  if (state.index >= state.tasks.length) finish();
  else renderQuestion();
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
  state.tasks = shuffle(payload.tasks).slice(0, SESSION_SIZE);
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
