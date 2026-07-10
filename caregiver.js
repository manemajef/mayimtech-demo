// MAYIMTECH — caregiver dashboard (laptop, projected)
"use strict";

var PATIENT_ID = "patient_001";
// thresholds for per-vital coloring (green / amber / red)
var TH = {
  pulseWarn: 92,
  pulseCrit: 100,
  tempWarn: 37.4,
  tempCrit: 37.8,
  moveWarn: 40,
  moveCrit: 30,
};

var db = null;
var channel = null;
var alertsToday = 0;
var seenAlerts = {}; // dedupe alert count/chime by timestamp
var seenEvents = {}; // dedupe history/trend by timestamp
var trend = []; // recent readings for the chart
var lastAckAt = null; // dedupe patient acknowledgments
var ingestedEvents = []; // stores all unique processed readings and acknowledgments

var el = {
  conn: document.getElementById("conn"),
  connText: document.getElementById("connText"),
  devBar: document.getElementById("devBar"),
  devClear: document.getElementById("devClear"),
  patientCard: document.getElementById("patientCard"),
  statusIcon: document.getElementById("statusIcon"),
  banner: document.getElementById("alertBanner"),
  alertTitle: document.getElementById("alertTitle"),
  alertBody: document.getElementById("alertBody"),
  ackNote: document.getElementById("ackNote"),
  badge: document.getElementById("badge"),
  pulse: document.getElementById("pulse"),
  temp: document.getElementById("temp"),
  move: document.getElementById("move"),
  vPulse: document.getElementById("vPulse"),
  vTemp: document.getElementById("vTemp"),
  vMove: document.getElementById("vMove"),
  lastUpdate: document.getElementById("lastUpdate"),
  alertsCount: document.getElementById("alertsCount"),
  history: document.getElementById("history"),
  historyEmpty: document.getElementById("historyEmpty"),
  historyMore: document.getElementById("historyMore"),
  chart: document.getElementById("chart"),
};

function statusClass(s) {
  return s === "Critical"
    ? "is-critical"
    : s === "Warning"
      ? "is-warning"
      : "is-normal";
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

// per-vital color level: green (ok) / amber (warn) / red (crit)
function vitalLevel(isCrit, isWarn) {
  return isCrit ? "crit" : isWarn ? "warn" : "ok";
}
function setLevel(row, lvl) {
  row.classList.remove("ok", "warn", "crit");
  row.classList.add(lvl);
}

function connect() {
  if (isFirebaseConfigured()) {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    el.conn.className = "conn ok";
    el.connText.textContent = "Connected";

    // pre-load the last events so the chart/history are populated on open
    db.ref("mayimtech/" + PATIENT_ID + "/events")
      .limitToLast(10)
      .once("value", function (snap) {
        var data = snap.val();
        if (!data) return;
        Object.keys(data)
          .map(function (k) {
            return data[k];
          })
          .sort(function (a, b) {
            return new Date(a.timestamp) - new Date(b.timestamp);
          })
          .forEach(ingest);
        rebuildUI();
        drawChart();
      });

    db.ref("mayimtech/" + PATIENT_ID + "/current").on("value", function (snap) {
      if (snap.val()) onReading(snap.val());
    });

    // patient acknowledged a warning ("I drank and feel better")
    db.ref("mayimtech/" + PATIENT_ID + "/ack").on("value", function (snap) {
      var a = snap.val();
      if (a && a.at && a.at !== lastAckAt) {
        lastAckAt = a.at;
        showAck(a);
      }
    });
  } else {
    channel = new BroadcastChannel("mayimtech");
    el.conn.className = "conn local";
    el.connText.textContent = "Local demo mode";
    channel.onmessage = function (e) {
      if (e.data && e.data.kind === "ack") showAck(e.data);
      else onReading(e.data);
    };
    // pre-load recent local history so the chart/history are populated on open
    var log = JSON.parse(localStorage.getItem("mayimtech-events") || "[]");
    log.slice(-10).forEach(ingest);
    var stored = localStorage.getItem("mayimtech-current");
    if (stored) onReading(JSON.parse(stored));
    rebuildUI();
  }
  drawChart();
}

// ---- hidden demo rescue controls ----
// Right-click the connection indicator or double-click its dot to toggle.
function toggleDevMode(e) {
  if (e) e.preventDefault();
  el.devBar.hidden = !el.devBar.hidden;
}

el.conn.addEventListener("contextmenu", toggleDevMode);
el.conn.querySelector(".dot").addEventListener("dblclick", toggleDevMode);

document.querySelectorAll("[data-dev-status]").forEach(function (button) {
  button.addEventListener("click", function () {
    devReading(button.getAttribute("data-dev-status"));
  });
});

el.devClear.addEventListener("click", clearDashboardHistory);

function devReading(status) {
  var values =
    status === "critical"
      ? { pulse: 118, temperature: 38.6, movement: 18, forced: true }
      : status === "warning"
        ? { pulse: 95, temperature: 37.6, movement: 36, forced: false }
        : { pulse: 74, temperature: 36.7, movement: 68, forced: false };
  var label =
    status === "critical"
      ? "Critical"
      : status === "warning"
        ? "Warning"
        : "Normal";
  var reasons =
    label === "Critical"
      ? ["high pulse", "high temperature", "very low movement"]
      : label === "Warning"
        ? ["slightly high pulse", "slightly high temperature", "low movement"]
        : [];
  onReading({
    pulse: values.pulse,
    temperature: values.temperature,
    movement: values.movement,
    forced: values.forced,
    status: label,
    reasons: reasons,
    alert: label !== "Normal",
    patientId: PATIENT_ID,
    patientName: "Miriam Cohen",
    timestamp: new Date().toISOString(),
    id: "dev-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
  });
}

function clearDashboardHistory() {
  trend = [];
  ingestedEvents = [];
  seenEvents = {};
  seenAlerts = {};
  alertsToday = 0;
  el.alertsCount.textContent = "0";
  el.history.replaceChildren();
  if (!db) {
    localStorage.removeItem("mayimtech-events");
    localStorage.removeItem("mayimtech-current");
  }
  el.history.classList.remove("is-expanded");
  resetCurrentReading();
  updateHistoryControls();
  drawChart();
}

function resetCurrentReading() {
  el.pulse.textContent = "–";
  el.temp.textContent = "–";
  el.move.textContent = "–";
  [el.vPulse, el.vTemp, el.vMove].forEach(function (vital) {
    vital.classList.remove("ok", "warn", "crit");
  });
  el.badge.textContent = "Waiting";
  el.badge.className = "badge";
  el.lastUpdate.textContent = "—";
  el.statusIcon.textContent = "";
  el.ackNote.hidden = true;
  el.patientCard.className = "card patient-card is-normal";
}

el.historyMore.addEventListener("click", function () {
  var expanded = el.history.classList.toggle("is-expanded");
  el.historyMore.textContent = expanded ? "Show less" : "Show more";
});

function updateHistoryControls() {
  var hasMoreThanSix = el.history.children.length > 6;
  var hasEvents = el.history.children.length > 0;
  el.historyEmpty.hidden = hasEvents;
  el.patientCard.classList.toggle("has-history", hasEvents);
  el.historyMore.hidden = !hasMoreThanSix;
  if (!hasMoreThanSix) {
    el.history.classList.remove("is-expanded");
    el.historyMore.textContent = "Show more";
  }
}

function onReading(r) {
  // current vitals
  el.pulse.textContent = r.pulse;
  el.temp.textContent = Number(r.temperature).toFixed(1);
  el.move.textContent = r.movement;
  setLevel(
    el.vPulse,
    vitalLevel(r.pulse >= TH.pulseCrit, r.pulse >= TH.pulseWarn),
  );
  setLevel(
    el.vTemp,
    vitalLevel(
      Number(r.temperature) >= TH.tempCrit,
      Number(r.temperature) >= TH.tempWarn,
    ),
  );
  setLevel(
    el.vMove,
    vitalLevel(r.movement <= TH.moveCrit, r.movement <= TH.moveWarn),
  );

  el.badge.textContent = r.status;
  el.badge.className = "badge " + statusClass(r.status);
  el.lastUpdate.textContent = formatTime(r.timestamp);
  el.ackNote.hidden = true; // a fresh reading supersedes an earlier acknowledgment

  // The whole patient card reacts to status (border + pulse via CSS)
  // FIX FOR BUG: Do NOT overwrite el.patientCard.className which wipes out has-history!
  // Instead, toggle status classes using classList.
  el.patientCard.classList.remove("is-normal", "is-warning", "is-critical", "is-acknowledged");
  el.patientCard.classList.add(statusClass(r.status));

  if (r.status === "Normal") {
    el.statusIcon.textContent = "";
  } else {
    el.statusIcon.textContent = r.status === "Critical" ? "❗" : "⚠️";
    var affected = [];
    if (r.pulse >= TH.pulseWarn) affected.push("Pulse");
    if (Number(r.temperature) >= TH.tempWarn) affected.push("Temperature");
    if (r.movement <= TH.moveWarn) affected.push("Movement");
    el.alertTitle.textContent =
      r.status === "Critical"
        ? "CRITICAL — dehydration risk"
        : "Warning — check patient";
    el.alertBody.textContent = affected.length
      ? "Outside expected range: " + affected.join(", ") + "."
      : "Manual emergency alert.";
  }

  ingest(r);
  rebuildUI();
  drawChart();

  // sound a chime once per distinct critical reading (ingest handles the count)
  var id = r.id || r.timestamp;
  if (r.status === "Critical" && !seenAlerts[id]) {
    seenAlerts[id] = true;
    chime();
  }
}

// patient tapped "I drank and feel better" on a warning
function showAck(a) {
  var t = formatTime(a.at || Date.now());
  el.ackNote.hidden = false;
  el.ackNote.innerHTML =
    '<span class="ack-title">Acknowledged</span>' +
    '<span class="ack-body">Miriam Cohen saw the warning and drank water · ' + t + '</span>';
  el.patientCard.classList.add("is-acknowledged");
  
  var ackId = "ack-" + (a.at || Date.now());
  if (!seenEvents[ackId]) {
    seenEvents[ackId] = true;
    ingestedEvents.push({
      id: ackId,
      timestamp: new Date(a.at || Date.now()).toISOString(),
      isAck: true
    });
    rebuildUI();
  }
}

// add a reading to the chart + history exactly once (deduped by reading id).
// also counts alerts (so the count is correct even for pre-loaded history).
function ingest(r) {
  var id = r.id || r.timestamp;
  if (seenEvents[id]) return;
  seenEvents[id] = true;
  ingestedEvents.push(r);
  if (r.alert) {
    alertsToday += 1;
    el.alertsCount.textContent = alertsToday;
  }
}

function rebuildUI() {
  // Sort chronologically (oldest first)
  ingestedEvents.sort(function (a, b) {
    return new Date(a.timestamp) - new Date(b.timestamp);
  });

  // Limit local list size to prevent memory bloat
  if (ingestedEvents.length > 50) {
    ingestedEvents = ingestedEvents.slice(-50);
  }

  // Build trend array (only non-acknowledgment readings, last 15 items)
  var readingsOnly = ingestedEvents.filter(function (r) {
    return !r.isAck;
  });
  
  trend = readingsOnly.slice(-15).map(function (r) {
    return {
      pulse: Number(r.pulse),
      temp: Number(r.temperature),
      movement: Number(r.movement),
      time: new Date(r.timestamp),
    };
  });

  // Re-render history list
  el.history.innerHTML = "";
  
  var historyItems = ingestedEvents.slice(-20); // render up to last 20 for expansion
  
  for (var i = historyItems.length - 1; i >= 0; i--) {
    var r = historyItems[i];
    var row = document.createElement("div");
    if (r.isAck) {
      row.className = "event is-normal";
      row.innerHTML =
        "<span><b>Acknowledged</b> · patient drank water</span>" +
        "<span class='e-time'>" +
        formatTime(r.timestamp) +
        "</span>";
    } else {
      row.className = "event " + statusClass(r.status);
      row.innerHTML =
        "<span><b>" +
        r.status +
        "</b> · pulse " +
        r.pulse +
        " · " +
        Number(r.temperature).toFixed(1) +
        "°C · move " +
        r.movement +
        "%</span>" +
        "<span class='e-time'>" +
        formatTime(r.timestamp) +
        "</span>";
    }
    el.history.appendChild(row);
  }
  
  updateHistoryControls();
}

// ---- audible alert (synthesized, no external asset) ----
function chime() {
  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    var ctx = new AC();
    var now = ctx.currentTime;
    [
      [880, 0],
      [660, 0.22],
    ].forEach(function (p) {
      var osc = ctx.createOscillator(),
        g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(p[0], now + p[1]);
      g.gain.setValueAtTime(0.18, now + p[1]);
      g.gain.exponentialRampToValueAtTime(0.001, now + p[1] + 0.35);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now + p[1]);
      osc.stop(now + p[1] + 0.35);
    });
  } catch (e) {
    /* audio not available */
  }
}
// browsers require a user gesture before audio can play
document.body.addEventListener("click", function unlock() {
  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      var c = new AC();
      if (c.state === "suspended") c.resume();
    }
  } catch (e) {}
  document.body.removeEventListener("click", unlock);
});

// ---- minimal line chart (pulse + temperature + movement) ----
function drawChart() {
  var c = el.chart,
    ctx = c.getContext("2d");
  var rect = c.getBoundingClientRect();
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var w = Math.max(280, Math.round(rect.width));
  var h = Math.max(180, Math.round(rect.height));
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  var pad = 22;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(22, 32, 43, 0.08)";
  ctx.lineWidth = 1;
  for (var i = 0; i <= 4; i++) {
    var y = pad + ((h - pad * 2) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(w - pad, y);
    ctx.stroke();
  }
  if (trend.length < 2) {
    ctx.fillStyle = "#5a6672";
    ctx.font = "14px sans-serif";
    ctx.fillText("Waiting for patient readings…", pad + 6, h / 2);
    return;
  }
  line(
    ctx,
    trend.map(function (v) {
      return v.pulse;
    }),
    55,
    130,
    "#b3161c",
    w,
    h,
    pad,
  );
  line(
    ctx,
    trend.map(function (v) {
      return v.temp;
    }),
    36,
    39.5,
    "#1a56c4",
    w,
    h,
    pad,
  );
  line(
    ctx,
    trend.map(function (v) {
      return v.movement;
    }),
    0,
    100,
    "#6f42c1",
    w,
    h,
    pad,
  );
  legend(ctx);
}

if (window.ResizeObserver) {
  var chartObserver = new ResizeObserver(function () {
    drawChart();
  });
  chartObserver.observe(el.chart);
} else {
  window.addEventListener("resize", drawChart);
}

function line(ctx, vals, min, max, color, w, h, pad) {
  var step = (w - pad * 2) / (vals.length - 1);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  
  // Draw line
  ctx.beginPath();
  vals.forEach(function (v, i) {
    var x = pad + i * step;
    var y = h - pad - ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * (h - pad * 2);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
}

function legend(ctx) {
  var items = [
    ["Pulse", "#b3161c"],
    ["Temperature", "#1a56c4"],
    ["Movement", "#6f42c1"],
  ];
  ctx.font = "12px sans-serif";
  items.forEach(function (it, i) {
    var x = 26 + i * 112;
    ctx.fillStyle = it[1];
    ctx.fillRect(x, 6, 10, 10);
    ctx.fillStyle = "#5a6672";
    ctx.fillText(it[0], x + 15, 15);
  });
}

connect();
