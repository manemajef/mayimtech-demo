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

var el = {
  conn: document.getElementById("conn"),
  connText: document.getElementById("connText"),
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
  chart: document.getElementById("chart"),
};

function statusClass(s) {
  return s === "Critical"
    ? "is-critical"
    : s === "Warning"
      ? "is-warning"
      : "is-normal";
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
  }
  drawChart();
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
  el.lastUpdate.textContent = new Date(r.timestamp).toLocaleTimeString();
  el.ackNote.hidden = true; // a fresh reading supersedes an earlier acknowledgment

  // the whole patient card reacts to status (border + pulse via CSS)
  el.patientCard.className = "card patient-card " + statusClass(r.status);
  if (r.status === "Normal") {
    el.statusIcon.textContent = "";
  } else {
    el.statusIcon.textContent = r.status === "Critical" ? "❗" : "⚠️";
    var reasons =
      r.reasons && r.reasons.length
        ? r.reasons.join(", ")
        : "abnormal readings";
    el.alertTitle.textContent =
      r.status === "Critical"
        ? "CRITICAL — dehydration risk"
        : "Warning — check patient";
    el.alertBody.textContent = reasons;
  }

  ingest(r);
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
  var t = new Date(a.at || Date.now()).toLocaleTimeString();
  el.ackNote.hidden = false;
  el.ackNote.textContent =
    "✓ Miriam Cohen saw the warning and drank water · " + t;
  var row = document.createElement("div");
  row.className = "event is-normal";
  row.innerHTML =
    "<span><b>Acknowledged</b> · patient drank water</span>" +
    "<span class='e-time'>" +
    t +
    "</span>";
  el.history.insertBefore(row, el.history.firstChild);
  while (el.history.children.length > 10)
    el.history.removeChild(el.history.lastChild);
}

// add a reading to the chart + history exactly once (deduped by reading id).
// also counts alerts (so the count is correct even for pre-loaded history).
function ingest(r) {
  var id = r.id || r.timestamp;
  if (seenEvents[id]) return;
  seenEvents[id] = true;
  pushTrend(r);
  addEvent(r);
  if (r.alert) {
    alertsToday += 1;
    el.alertsCount.textContent = alertsToday;
  }
}

function pushTrend(r) {
  trend.push({
    pulse: Number(r.pulse),
    temp: Number(r.temperature),
    time: new Date(r.timestamp),
  });
  while (trend.length > 15) trend.shift();
}

function addEvent(r) {
  var row = document.createElement("div");
  row.className = "event " + statusClass(r.status);
  var t = new Date(r.timestamp).toLocaleTimeString();
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
    t +
    "</span>";
  el.history.insertBefore(row, el.history.firstChild);
  while (el.history.children.length > 10)
    el.history.removeChild(el.history.lastChild);
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

// ---- minimal line chart (pulse + temperature) ----
function drawChart() {
  var c = el.chart,
    ctx = c.getContext("2d");
  var w = c.width,
    h = c.height,
    pad = 22;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "#e2e7ec";
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
  legend(ctx);
}

function line(ctx, vals, min, max, color, w, h, pad) {
  var step = (w - pad * 2) / (vals.length - 1);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  vals.forEach(function (v, i) {
    var x = pad + i * step;
    var y =
      h -
      pad -
      ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * (h - pad * 2);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
}

function legend(ctx) {
  var items = [
    ["Pulse", "#b3161c"],
    ["Temp", "#1a56c4"],
  ];
  ctx.font = "12px sans-serif";
  items.forEach(function (it, i) {
    var x = 26 + i * 74;
    ctx.fillStyle = it[1];
    ctx.fillRect(x, 6, 10, 10);
    ctx.fillStyle = "#16202b";
    ctx.fillText(it[0], x + 15, 15);
  });
}

connect();
