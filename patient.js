// MAYIMTECH — patient app (emulates the wristband + patient-facing display)
"use strict";

var PATIENT_ID = "patient_001";
var PATIENT_NAME = "Miriam Cohen";

// ---- thresholds (simple comparison; matches FR-14) ----
var TH = {
  pulseCrit: 100,
  pulseWarn: 92,
  tempCrit: 37.8,
  tempWarn: 37.4,
  moveCrit: 30,
  moveWarn: 40,
};

var db = null;
var channel = null;

var el = {
  conn: document.getElementById("conn"),
  connText: document.getElementById("connText"),
  panel: document.getElementById("statusPanel"),
  icon: document.getElementById("statusIcon"),
  head: document.getElementById("statusHead"),
  sub: document.getElementById("statusSub"),
  pulse: document.getElementById("pulse"),
  temp: document.getElementById("temp"),
  move: document.getElementById("move"),
  rPulse: document.getElementById("rPulse"),
  rTemp: document.getElementById("rTemp"),
  rMove: document.getElementById("rMove"),
  ackBtn: document.getElementById("ackBtn"),
};

function connect() {
  if (isFirebaseConfigured()) {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    el.conn.className = "conn ok";
    el.connText.textContent = "Connected";
  } else {
    channel = new BroadcastChannel("mayimtech");
    el.conn.className = "conn local";
    el.connText.textContent = "Local demo mode";
  }
}

function rInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function rFloat(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 10) / 10;
}

// decide status + human-readable reasons from a reading (threshold comparison)
function classify(reading) {
  var reasons = [];
  var critical = reading.forced;
  var warning = false;

  if (reading.pulse >= TH.pulseCrit) {
    critical = true;
    reasons.push("high pulse");
  } else if (reading.pulse >= TH.pulseWarn) {
    warning = true;
    reasons.push("slightly high pulse");
  }

  if (reading.temperature >= TH.tempCrit) {
    critical = true;
    reasons.push("high temperature");
  } else if (reading.temperature >= TH.tempWarn) {
    warning = true;
    reasons.push("slightly high temperature");
  }

  if (reading.movement <= TH.moveCrit) {
    critical = true;
    reasons.push("very low movement");
  } else if (reading.movement <= TH.moveWarn) {
    warning = true;
    reasons.push("low movement");
  }

  var status = critical ? "Critical" : warning ? "Warning" : "Normal";
  if (reading.forced && reasons.length === 0) reasons.push("manual alert");
  return { status: status, reasons: reasons, alert: status !== "Normal" };
}

function statusClass(status) {
  return status === "Critical"
    ? "is-critical"
    : status === "Warning"
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

// update the big patient-facing display
function render(reading) {
  el.pulse.textContent = reading.pulse;
  el.temp.textContent = reading.temperature.toFixed(1);
  el.move.textContent = reading.movement;

  setLevel(el.rPulse, vitalLevel(reading.pulse >= TH.pulseCrit, reading.pulse >= TH.pulseWarn));
  setLevel(el.rTemp, vitalLevel(reading.temperature >= TH.tempCrit, reading.temperature >= TH.tempWarn));
  setLevel(el.rMove, vitalLevel(reading.movement <= TH.moveCrit, reading.movement <= TH.moveWarn));

  // setting className also clears the "acked" state from a previous reading
  el.panel.className = "status-panel " + statusClass(reading.status);
  el.ackBtn.hidden = true;

  if (reading.status === "Normal") {
    el.icon.style.display = "none";
    el.head.textContent = "You are OK";
    el.sub.style.display = "none";
  } else if (reading.status === "Warning") {
    // softer + smaller: a gentle nudge, not an alarm
    el.icon.style.display = "";
    el.icon.textContent = "⚠️";
    el.head.textContent = "Please drink water and take some rest.";
    el.sub.style.display = "none";
    el.ackBtn.hidden = false; // patient can acknowledge
  } else {
    // Critical: bigger + stricter, no self-dismiss
    el.icon.style.display = "";
    el.icon.textContent = "❗";
    el.head.textContent = "Drink water now.";
    el.sub.textContent = "Your caregiver has been alerted.";
    el.sub.style.display = "";
  }
}

// patient acknowledges a warning: stays amber (not green), icon shrinks + dims,
// pulse stops, and the caregiver is notified.
el.ackBtn.addEventListener("click", function () {
  el.panel.classList.add("acked");
  el.head.textContent = "Noted — keep drinking water and rest.";
  el.ackBtn.hidden = true;
  publishAck();
});

function publishAck() {
  var payload = { acknowledged: true, at: Date.now(), patientName: PATIENT_NAME };
  if (db) {
    db.ref("mayimtech/" + PATIENT_ID + "/ack").set(payload);
  } else if (channel) {
    payload.kind = "ack";
    channel.postMessage(payload);
  }
}

function send(type) {
  var reading;
  if (type === "normal") {
    reading = {
      pulse: rInt(66, 82),
      temperature: rFloat(36.4, 37.0),
      movement: rInt(55, 80),
      forced: false,
    };
  } else if (type === "warning") {
    // values in the WARNING band: above normal but below the critical thresholds
    // (pulse < 100, temp < 37.8, movement > 30) -> classify() returns "Warning"
    reading = {
      pulse: rInt(92, 98),
      temperature: rFloat(37.4, 37.7),
      movement: rInt(33, 39),
      forced: false,
    };
  } else {
    // critical: values that cross the critical thresholds, forced on
    reading = {
      pulse: rInt(108, 124),
      temperature: rFloat(38.2, 39.0),
      movement: rInt(8, 22),
      forced: true,
    };
  }

  var c = classify(reading);
  reading.status = c.status;
  reading.reasons = c.reasons;
  reading.alert = c.alert;
  reading.patientId = PATIENT_ID;
  reading.patientName = PATIENT_NAME;
  reading.timestamp = new Date().toISOString();
  reading.id = reading.timestamp + "-" + Math.random().toString(36).slice(2, 8);

  render(reading);
  publish(reading);
}

function publish(reading) {
  if (db) {
    db.ref("mayimtech/" + PATIENT_ID + "/current").set(reading);
    db.ref("mayimtech/" + PATIENT_ID + "/events").push(reading);
  } else if (channel) {
    localStorage.setItem("mayimtech-current", JSON.stringify(reading));
    var log = JSON.parse(localStorage.getItem("mayimtech-events") || "[]");
    log.push(reading);
    while (log.length > 20) log.shift();
    localStorage.setItem("mayimtech-events", JSON.stringify(log));
    channel.postMessage(reading);
  }
}

// ---- controls ----
document.getElementById("btnNormal").addEventListener("click", function () {
  send("normal");
});
document.getElementById("btnHigh").addEventListener("click", function () {
  send("warning");
});
document.getElementById("btnAlert").addEventListener("click", function () {
  send("critical");
});

var autoTimer = null;
document.getElementById("autoToggle").addEventListener("change", function (e) {
  if (e.target.checked) {
    send("normal");
    autoTimer = setInterval(function () {
      // auto mode sends only normal readings, so the caregiver trend keeps moving
      // without raising an alarm; the alert step in the demo stays deliberate.
      send("normal");
    }, 3000);
  } else if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
  }
});

connect();
send("normal");
