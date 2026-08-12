/**
 * MCP Apps HTML resources for the appointment connector.
 * Served via GET /api/1.0/resources/read?uri=ui://…
 */

const APP_BRIDGE_HELPER = `
<script>
(function () {
  var nextId = 1;
  var pending = {};

  function post(msg) {
    window.parent.postMessage(msg, "*");
  }

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.jsonrpc !== "2.0") return;
    if (data.id != null && pending[data.id]) {
      var p = pending[data.id];
      delete pending[data.id];
      if (data.error) p.reject(new Error(data.error.message || "RPC error"));
      else p.resolve(data.result);
      return;
    }
    if (data.method === "ui/notifications/tool-input") {
      window.__onToolInput && window.__onToolInput(data.params || {});
    }
    if (data.method === "ui/notifications/tool-result") {
      window.__onToolResult && window.__onToolResult(data.params || {});
    }
  });

  function request(method, params) {
    var id = nextId++;
    return new Promise(function (resolve, reject) {
      pending[id] = { resolve: resolve, reject: reject };
      post({ jsonrpc: "2.0", id: id, method: method, params: params || {} });
    });
  }

  function reportSize() {
    var wrap = document.querySelector(".wrap");
    var h = wrap ? Math.ceil(wrap.getBoundingClientRect().height) : 0;
    if (h > 0) {
      post({ jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { height: h } });
    }
  }

  function observeSize() {
    reportSize();
    var wrap = document.querySelector(".wrap");
    if (typeof window.ResizeObserver === "function" && wrap) {
      var ro = new ResizeObserver(function () { reportSize(); });
      ro.observe(wrap);
    } else {
      window.addEventListener("resize", reportSize);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", observeSize);
  } else {
    observeSize();
  }

  window.McpAppBridge = {
    callTool: function (name, args) {
      return request("tools/call", { name: name, arguments: args || {} });
    },
    updateModelContext: function (context) {
      return request("ui/update-model-context", context || {});
    },
    notifySize: reportSize,
    ready: function () {
      return request("ui/initialize", {
        protocolVersion: "2026-01-26",
        appCapabilities: { availableDisplayModes: ["inline"] },
        clientInfo: { name: "appointment-mcp-app", version: "1.0.0" },
      }).then(function (result) {
        post({ jsonrpc: "2.0", method: "ui/notifications/initialized" });
        return result;
      });
    }
  };
})();
</script>
`;

const SHARED_STYLES = `
<style>
  :root {
    color-scheme: light dark;
    --bg: #ffffff;
    --fg: #0f172a;
    --muted: #64748b;
    --border: #e2e8f0;
    --primary: #2563eb;
    --primary-fg: #ffffff;
    --card: #f8fafc;
    --danger: #dc2626;
    --ok: #16a34a;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0b1220;
      --fg: #e2e8f0;
      --muted: #94a3b8;
      --border: #1e293b;
      --primary: #3b82f6;
      --primary-fg: #ffffff;
      --card: #111827;
      --danger: #f87171;
      --ok: #4ade80;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    background: var(--bg);
    color: var(--fg);
    font-size: 13px;
    line-height: 1.4;
  }
  .wrap { padding: 14px 16px 16px; }
  .title { font-weight: 650; font-size: 15px; margin: 0; }
  .muted { color: var(--muted); font-size: 12px; }
  .header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }
  .date-tabs {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 8px;
    scrollbar-width: thin;
  }
  .date-tab {
    flex: 0 0 auto;
    background: transparent;
    color: var(--muted);
    border: 1px solid var(--border);
    padding: 7px 10px;
  }
  .date-tab.active {
    color: var(--primary-fg);
    background: var(--primary);
    border-color: var(--primary);
  }
  .time-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
    gap: 7px;
    padding: 4px 0;
  }
  .time-btn {
    background: var(--card);
    color: var(--fg);
    border: 1px solid var(--border);
    padding: 9px 7px;
    font-weight: 550;
  }
  .time-btn:hover { border-color: var(--primary); }
  .time-btn.selected {
    background: color-mix(in srgb, var(--primary) 18%, var(--card));
    border-color: var(--primary);
    color: var(--fg);
  }
  .booking-panel {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }
  .selection {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 9px;
  }
  .selection strong { font-size: 12px; }
  .fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 7px;
  }
  .grid { display: grid; gap: 8px; }
  .slot, .card {
    border: 1px solid var(--border);
    background: var(--card);
    border-radius: 8px;
    padding: 8px 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .slot.selected { outline: 2px solid var(--primary); }
  .card.cancelled {
    opacity: 0.72;
  }
  .card.cancelled .badge {
    border-color: color-mix(in srgb, var(--danger) 40%, var(--border));
    color: var(--danger);
  }
  button {
    border: 0;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
    background: var(--primary);
    color: var(--primary-fg);
  }
  button.secondary {
    background: transparent;
    color: var(--fg);
    border: 1px solid var(--border);
  }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .row { display: flex; gap: 6px; flex-wrap: wrap; }
  input {
    width: 100%;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--fg);
    border-radius: 6px;
    padding: 6px 8px;
    font-size: 12px;
  }
  .form { display: grid; gap: 6px; margin-top: 8px; }
  .status { margin-top: 8px; font-size: 12px; }
  .status.ok { color: var(--ok); }
  .status.err { color: var(--danger); }
  .confirmation {
    display: flex;
    align-items: center;
    gap: 10px;
    border: 1px solid color-mix(in srgb, var(--ok) 35%, var(--border));
    border-radius: 8px;
    background: color-mix(in srgb, var(--ok) 8%, var(--bg));
    padding: 10px 12px;
  }
  .confirmation-mark {
    display: flex;
    width: 24px;
    height: 24px;
    flex: 0 0 24px;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    background: var(--ok);
    color: var(--primary-fg);
    font-weight: 700;
  }
  .confirmation-time { color: var(--fg); font-weight: 600; }
  .badge {
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 999px;
    border: 1px solid var(--border);
    color: var(--muted);
  }
  @media (max-width: 480px) {
    .wrap { padding: 12px; }
    .fields { grid-template-columns: 1fr; }
    .time-grid { grid-template-columns: repeat(3, 1fr); }
  }
</style>
`;

function wrapHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  ${SHARED_STYLES}
  ${APP_BRIDGE_HELPER}
</head>
<body>
  <div class="wrap">
    ${body}
  </div>
</body>
</html>`;
}

export const CHECK_SLOTS_HTML = wrapHtml(
  "Available times",
  `
  <div class="header">
    <div>
      <p class="title" id="entity-title">Available times</p>
      <p class="muted" id="entity-subtitle" style="margin:2px 0 0"></p>
    </div>
    <span class="muted" id="subtitle">Loading…</span>
  </div>
  <div class="date-tabs" id="date-tabs"></div>
  <div class="time-grid" id="slots"></div>
  <div class="booking-panel" id="book-form" style="display:none">
    <div class="selection">
      <strong id="selection-label"></strong>
      <button id="clear-btn" class="secondary" type="button">Change</button>
    </div>
    <div class="fields">
      <input id="name" autocomplete="name" placeholder="Your name" />
      <input id="email" type="email" autocomplete="email" placeholder="Your email" />
    </div>
    <button id="book-btn" type="button" style="width:100%;margin-top:8px">Confirm booking</button>
  </div>
  <div class="status" id="status"></div>
  <script>
    var state = {
      slots: [],
      selected: null,
      activeDate: "",
      args: {},
      timezone: "",
      entityId: "",
      entityName: "",
      booked: false
    };

    function escapeHtml(value) {
      return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }

    function parseResult(params) {
      var structured = params.structuredContent;
      if (
        structured &&
        typeof structured === "object" &&
        !Array.isArray(structured) &&
        (structured.slots || structured.appointments || structured.ok === true)
      ) {
        return structured;
      }
      var content = params.content;
      if (Array.isArray(content)) {
        for (var i = 0; i < content.length; i++) {
          if (content[i] && content[i].type === "text" && content[i].text) {
            try { return JSON.parse(content[i].text); } catch (e) {}
          }
        }
      }
      if (structured && Array.isArray(structured.content)) {
        for (var j = 0; j < structured.content.length; j++) {
          var block = structured.content[j];
          if (block && block.type === "text" && block.text) {
            try { return JSON.parse(block.text); } catch (e) {}
          }
        }
      }
      return params;
    }

    function dateKey(slot) {
      return String(slot.start_local || slot.start || "").slice(0, 10);
    }

    function timeLabel(value) {
      var text = String(value || "");
      var match = text.match(/(?:T|\\s)(\\d{2}:\\d{2})/);
      return match ? match[1] : text;
    }

    function formatDate(value) {
      try {
        return new Intl.DateTimeFormat(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric"
        }).format(new Date(value + "T00:00:00"));
      } catch (e) {
        return value;
      }
    }

    function showConfirmation(slot, name) {
      document.getElementById("date-tabs").style.display = "none";
      document.getElementById("slots").style.display = "none";
      document.getElementById("book-form").style.display = "none";
      var entityLabel = state.entityName || "provider";
      document.getElementById("entity-title").textContent = "Appointment confirmed";
      document.getElementById("entity-subtitle").textContent = entityLabel;
      document.getElementById("subtitle").textContent = "Booked";
      var when = formatDate(dateKey(slot)) + " at " +
        timeLabel(slot.start_local || slot.start);
      var status = document.getElementById("status");
      status.className = "status ok";
      status.innerHTML =
        '<div class="confirmation">' +
        '<span class="confirmation-mark" aria-hidden="true">✓</span>' +
        "<div>" +
        '<div class="confirmation-time">Appointment with ' +
        escapeHtml(entityLabel) + " booked for " + escapeHtml(when) + ".</div>" +
        '<div class="muted">Confirmed for ' + escapeHtml(name) + "</div>" +
        "</div>" +
        "</div>";
      requestAnimationFrame(function () {
        window.McpAppBridge.notifySize && window.McpAppBridge.notifySize();
      });
    }

    function updateEntityHeader() {
      var title = document.getElementById("entity-title");
      var sub = document.getElementById("entity-subtitle");
      if (state.entityName) {
        title.textContent = state.entityName;
        sub.textContent = state.slots.length ? "Choose a time" : "";
      } else {
        title.textContent = "Available times";
        sub.textContent = "";
      }
    }

    function hidePickerUi() {
      var wrap = document.querySelector(".wrap");
      if (wrap) {
        wrap.style.display = "none";
        wrap.innerHTML = "";
      }
      requestAnimationFrame(function () {
        window.McpAppBridge.notifySize && window.McpAppBridge.notifySize();
        // Host may collapse/dismiss the card when height is 0.
        window.parent.postMessage({
          jsonrpc: "2.0",
          method: "ui/notifications/size-changed",
          params: { height: 0 }
        }, "*");
      });
    }

    function render() {
      if (state.booked) return;
      var root = document.getElementById("slots");
      var tabs = document.getElementById("date-tabs");
      var form = document.getElementById("book-form");
      var subtitle = document.getElementById("subtitle");
      root.innerHTML = "";
      tabs.innerHTML = "";
      updateEntityHeader();
      if (!state.slots.length) {
        // No slots to pick — don't leave a useless "Choose a time" card open.
        hidePickerUi();
        var emptyEntity = state.entityName || "this provider";
        window.McpAppBridge.updateModelContext({
          content: [{
            type: "text",
            text: "No available appointment times for " + emptyEntity +
              " in the requested date range."
          }],
          structuredContent: {
            uiComplete: true,
            action: "no_slots_available",
            entity_id: state.entityId || state.args.entity_id || null,
            entity_name: state.entityName || null,
            slots: []
          }
        }).catch(function () {});
        return;
      }

      subtitle.textContent = state.slots.length + " available";
      var dates = [];
      state.slots.forEach(function (slot) {
        var key = dateKey(slot);
        if (key && dates.indexOf(key) === -1) dates.push(key);
      });
      if (!state.activeDate || dates.indexOf(state.activeDate) === -1) {
        state.activeDate = dates[0] || "";
      }

      dates.forEach(function (date) {
        var tab = document.createElement("button");
        tab.type = "button";
        tab.className = "date-tab" + (date === state.activeDate ? " active" : "");
        tab.textContent = formatDate(date);
        tab.onclick = function () {
          state.activeDate = date;
          state.selected = null;
          render();
        };
        tabs.appendChild(tab);
      });

      state.slots.forEach(function (slot, idx) {
        if (dateKey(slot) !== state.activeDate) return;
        var button = document.createElement("button");
        button.type = "button";
        button.className = "time-btn" + (state.selected === idx ? " selected" : "");
        button.textContent = timeLabel(slot.start_local || slot.start);
        button.onclick = function () {
          state.selected = idx;
          render();
        };
        root.appendChild(button);
      });

      if (state.selected == null) {
        form.style.display = "none";
      } else {
        var selected = state.slots[state.selected];
        form.style.display = "block";
        document.getElementById("selection-label").textContent =
          formatDate(dateKey(selected)) + " at " +
          timeLabel(selected.start_local || selected.start);
      }
    }

    document.getElementById("clear-btn").onclick = function () {
      state.selected = null;
      document.getElementById("status").textContent = "";
      render();
    };

    document.getElementById("book-btn").onclick = function () {
      var status = document.getElementById("status");
      status.className = "status";
      status.textContent = "";
      if (state.selected == null) {
        status.className = "status err";
        status.textContent = "Select a slot first.";
        return;
      }
      var slot = state.slots[state.selected];
      var name = document.getElementById("name").value.trim();
      var email = document.getElementById("email").value.trim();
      if (!name || !email) {
        status.className = "status err";
        status.textContent = "Name and email are required.";
        return;
      }
      var btn = document.getElementById("book-btn");
      btn.disabled = true;
      status.textContent = "Booking…";
      window.McpAppBridge.callTool("book_appointment", {
        entity_id: state.entityId || state.args.entity_id,
        slot_start: slot.start,
        slot_end: slot.end,
        name: name,
        email: email,
        timezone: state.timezone || state.args.timezone
      }).then(function (result) {
        var booking = parseResult(result || {});
        if (booking.entity_name) state.entityName = booking.entity_name;
        var entityLabel = state.entityName || "provider";
        var when = formatDate(dateKey(slot)) + " at " +
          timeLabel(slot.start_local || slot.start);
        var summary =
          "Appointment with " + entityLabel + " booked for " + when + ".";
        state.booked = true;
        showConfirmation(slot, name);
        return window.McpAppBridge.updateModelContext({
          content: [{ type: "text", text: summary }],
          structuredContent: {
            uiComplete: true,
            action: "appointment_booked",
            appointment_id: booking.appointment_id || booking.id,
            entity_id: state.entityId || state.args.entity_id,
            entity_name: entityLabel,
            slot_start: slot.start,
            slot_end: slot.end,
            timezone: state.timezone || state.args.timezone,
            name: name,
            email: email,
            meeting_mode: booking.meeting_mode || null,
            meeting_url: booking.meeting_url || null,
            location_address: booking.location_address || null,
            location_maps_url: booking.location_maps_url || null
          }
        }).catch(function () {
          // Booking already succeeded; context synchronization is best-effort.
        });
      }).catch(function (err) {
        status.className = "status err";
        status.textContent = err.message || "Booking failed";
        btn.disabled = false;
      });
    };

    window.__onToolInput = function (params) {
      state.args = params.arguments || params || {};
      state.timezone = state.args.timezone || "";
    };

    window.__onToolResult = function (params) {
      var data = parseResult(params);
      var slots = data.slots || [];
      state.slots = Array.isArray(slots) ? slots : [];
      state.entityId = data.entity_id || state.args.entity_id;
      state.entityName = data.entity_name || state.entityName || "";
      state.timezone = data.user_timezone || state.args.timezone || state.timezone;
      render();
    };

    window.McpAppBridge.ready().catch(function (err) {
      document.getElementById("status").className = "status err";
      document.getElementById("status").textContent = err.message || "Failed to initialize";
    });
  </script>
  `,
);

export const APPOINTMENTS_HTML = wrapHtml(
  "Your appointments",
  `
  <p class="title">Your appointments</p>
  <p class="muted" id="subtitle">Loading…</p>
  <div class="grid" id="list"></div>
  <div class="status" id="status"></div>
  <script>
    var state = { appointments: [], args: {} };

    function parseResult(params) {
      var structured = params.structuredContent;
      if (
        structured &&
        typeof structured === "object" &&
        !Array.isArray(structured) &&
        (structured.slots || structured.appointments || structured.ok === true)
      ) {
        return structured;
      }
      var content = params.content;
      if (Array.isArray(content)) {
        for (var i = 0; i < content.length; i++) {
          if (content[i] && content[i].type === "text" && content[i].text) {
            try { return JSON.parse(content[i].text); } catch (e) {}
          }
        }
      }
      if (structured && Array.isArray(structured.content)) {
        for (var j = 0; j < structured.content.length; j++) {
          var block = structured.content[j];
          if (block && block.type === "text" && block.text) {
            try { return JSON.parse(block.text); } catch (e) {}
          }
        }
      }
      return params;
    }

    function setStatus(msg, ok) {
      var el = document.getElementById("status");
      el.className = "status " + (ok ? "ok" : "err");
      el.textContent = msg || "";
    }

    function render() {
      var root = document.getElementById("list");
      var subtitle = document.getElementById("subtitle");
      root.innerHTML = "";
      if (!state.appointments.length) {
        subtitle.textContent = "No appointments found.";
        window.McpAppBridge.notifySize && window.McpAppBridge.notifySize();
        return;
      }
      var activeCount = 0;
      state.appointments.forEach(function (appt) {
        if (String(appt.status || "confirmed").toLowerCase() !== "cancelled") {
          activeCount += 1;
        }
      });
      subtitle.textContent =
        activeCount + " upcoming · " + state.appointments.length + " total";
      state.appointments.forEach(function (appt) {
        var el = document.createElement("div");
        var status = String(appt.status || "confirmed").toLowerCase();
        var cancelled = status === "cancelled";
        el.className = "card" + (cancelled ? " cancelled" : "");
        var when = appt.start_local || appt.start_time || "";
        el.innerHTML =
          "<div><div><strong>" + (appt.entity_name || "Appointment") + "</strong> " +
          "<span class=\\"badge\\">" + status + "</span></div>" +
          "<div class=\\"muted\\">" + when + "</div></div>" +
          "<div class=\\"row\\"></div>";
        var actions = el.querySelector(".row");
        if (!cancelled) {
          var cancelBtn = document.createElement("button");
          cancelBtn.type = "button";
          cancelBtn.className = "secondary";
          cancelBtn.textContent = "Cancel";
          cancelBtn.onclick = function () {
            cancelBtn.disabled = true;
            window.McpAppBridge.callTool("cancel_appointment", {
              appointment_id: appt.appointment_id,
              timezone: state.args.timezone
            }).then(function () {
              appt.status = "cancelled";
              setStatus("Cancelled.", true);
              render();
              var whenLabel = appt.start_local || appt.start_time || "";
              return window.McpAppBridge.updateModelContext({
                content: [{
                  type: "text",
                  text: "Cancelled appointment with " +
                    (appt.entity_name || "provider") +
                    (whenLabel ? " at " + whenLabel : "") + "."
                }],
                structuredContent: {
                  action: "appointment_cancelled",
                  appointment_id: appt.appointment_id,
                  status: "cancelled",
                  toolResult: { appointments: state.appointments }
                }
              }).catch(function () {
                // Cancel already succeeded; persistence is best-effort.
              });
            }).catch(function (err) {
              setStatus(err.message || "Cancel failed", false);
              cancelBtn.disabled = false;
            });
          };
          actions.appendChild(cancelBtn);
        }
        root.appendChild(el);
      });
      window.McpAppBridge.notifySize && window.McpAppBridge.notifySize();
    }

    window.__onToolInput = function (params) {
      state.args = params.arguments || params || {};
    };

    window.__onToolResult = function (params) {
      var data = parseResult(params);
      var list = data.appointments || [];
      state.appointments = Array.isArray(list) ? list : [];
      render();
    };

    window.McpAppBridge.ready().catch(function (err) {
      setStatus(err.message || "Failed to initialize", false);
    });
  </script>
  `,
);
