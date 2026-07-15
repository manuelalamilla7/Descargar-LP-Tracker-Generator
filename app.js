(function () {
  "use strict";

  var STORAGE_KEY = "lp_tracker_generator_config";
  var form = document.getElementById("builder-form");
  var redirectMode = document.getElementById("redirect-mode");
  var redirectField = document.getElementById("redirect-field");
  var redirectUrl = document.getElementById("redirect-url");
  var emptyState = document.getElementById("empty-state");
  var result = document.getElementById("result");
  var statusBadge = document.getElementById("status-badge");
  var generatedCode = document.getElementById("generated-code");
  var generatedFileNameEl = document.getElementById("generated-file-name");
  var generatedFileSizeEl = document.getElementById("generated-file-size");
  var eventPreview = document.getElementById("event-preview");
  var scriptSnippet = document.getElementById("script-snippet");
  var formSnippet = document.getElementById("form-snippet");
  var copyJsButton = document.getElementById("copy-js-button");
  var downloadButton = document.getElementById("download-button");
  var resetButton = document.getElementById("reset-button");
  var toast = document.getElementById("toast");

  var source = "";
  var fileName = "lp-tracker.js";
  var toastTimer = null;

  redirectMode.addEventListener("change", updateRedirectField);
  form.addEventListener("submit", generate);
  form.addEventListener("input", saveConfig);
  form.addEventListener("change", saveConfig);
  copyJsButton.addEventListener("click", function () {
    copyText(source, "JS copiado");
  });
  downloadButton.addEventListener("click", downloadJs);
  resetButton.addEventListener("click", reset);

  document.querySelectorAll("[data-copy-target]").forEach(function (button) {
    button.addEventListener("click", function () {
      var target = document.getElementById(button.dataset.copyTarget);
      copyText(target ? target.textContent : "", "Código copiado");
    });
  });

  restoreConfig();
  updateRedirectField();

  function updateRedirectField() {
    var enabled = redirectMode.value === "thankyou";
    redirectField.hidden = !enabled;
    redirectUrl.required = enabled;
  }

  function generate(event) {
    event.preventDefault();

    if (!form.reportValidity()) return;

    var data = new FormData(form);
    var config = {
      webhookUrl: String(data.get("webhookUrl") || "").trim(),
      formSelector: String(data.get("formSelector") || "form.lead-form").trim(),
      eventName: normalizeEventName(data.get("eventName")),
      redirectUrl: data.get("redirectMode") === "thankyou"
        ? String(data.get("redirectUrl") || "").trim()
        : "",
      fileName: normalizeFileName(data.get("fileName"))
    };

    if (!isValidUrl(config.webhookUrl)) {
      alert("Ingresa una URL de webhook válida.");
      return;
    }

    try {
      document.querySelector(config.formSelector);
    } catch (_) {
      alert("El selector de formularios no es válido.");
      return;
    }

    source = buildTracker(config);
    fileName = config.fileName;

    generatedCode.textContent = source;
    generatedFileNameEl.textContent = fileName;
    generatedFileSizeEl.textContent = formatBytes(new Blob([source]).size);
    eventPreview.textContent = config.eventName;
    scriptSnippet.textContent = '<script src="./assets/js/' + fileName + '" defer></' + 'script>';
    formSnippet.textContent = buildFormSnippet(config.formSelector);

    emptyState.hidden = true;
    result.hidden = false;
    statusBadge.textContent = "JS generado";
    statusBadge.classList.add("ready");
    saveConfig();
    showToast("Archivo generado correctamente");
  }

  function buildTracker(config) {
    return `/**
 * LP Tracker
 * Captura UTMs, envía formularios a un webhook y publica un evento en dataLayer.
 */
(function (window, document) {
  "use strict";

  var CONFIG = {
    formSelector: ${JSON.stringify(config.formSelector)},
    defaultWebhook: ${JSON.stringify(config.webhookUrl)},
    defaultRedirect: ${JSON.stringify(config.redirectUrl)},
    eventName: ${JSON.stringify(config.eventName)},
    storageKey: "tracking_params",
    redirectDelay: 800
  };

  var TRACKING_PARAMS = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "utm_id",
    "gclid",
    "gbraid",
    "wbraid",
    "fbclid",
    "ad_id",
    "li_fat_id",
    "msclkid",
    "ttclid"
  ];

  function clean(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function safeJson(value, fallback) {
    if (!value) return fallback;
    try {
      return JSON.parse(value);
    } catch (_) {
      return fallback;
    }
  }

  function captureTrackingParams() {
    var stored = {};

    try {
      stored = safeJson(window.localStorage.getItem(CONFIG.storageKey), {});
    } catch (_) {}

    var params = new URLSearchParams(window.location.search);
    var updated = Object.assign({}, stored);
    var hasTracking = false;

    TRACKING_PARAMS.forEach(function (key) {
      var value = clean(params.get(key));
      if (value) {
        updated[key] = value;
        hasTracking = true;
      }
    });

    if (hasTracking) {
      updated.captured_at = new Date().toISOString();
      updated.landing_url = window.location.href;
      updated.referrer = document.referrer || "";

      try {
        window.localStorage.setItem(CONFIG.storageKey, JSON.stringify(updated));
      } catch (_) {}
    }

    return updated;
  }

  function getTrackingParams() {
    try {
      return safeJson(window.localStorage.getItem(CONFIG.storageKey), {});
    } catch (_) {
      return {};
    }
  }

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }

    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  }

  function serializeForm(form) {
    var payload = {};
    var data = new FormData(form);

    data.forEach(function (value, key) {
      if (typeof File !== "undefined" && value instanceof File) return;

      value = clean(value);

      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        payload[key] = Array.isArray(payload[key])
          ? payload[key].concat(value)
          : [payload[key], value];
      } else {
        payload[key] = value;
      }
    });

    Object.keys(payload).forEach(function (key) {
      if (Array.isArray(payload[key])) payload[key] = payload[key].join(", ");
    });

    return payload;
  }

  function buildPayload(form) {
    var payload = serializeForm(form);
    var tracking = getTrackingParams();

    Object.keys(tracking).forEach(function (key) {
      payload[key] = tracking[key];
    });

    payload.lead_id = createId();
    payload.form_id = form.dataset.lpFormId || form.id || "lead-form";
    payload.form_origin = form.dataset.lpFormOrigin || payload.form_id;
    payload.page_url = window.location.href;
    payload.page_path = window.location.pathname;
    payload.page_title = document.title;
    payload.referrer = document.referrer || "";
    payload.submitted_at = new Date().toISOString();

    return payload;
  }

  function toBody(payload) {
    var body = new URLSearchParams();

    Object.keys(payload).forEach(function (key) {
      body.append(key, clean(payload[key]));
    });

    return body;
  }

  function dispatchWebhook(url, payload) {
    var body = toBody(payload);

    if (navigator.sendBeacon) {
      var blob = new Blob([body.toString()], {
        type: "application/x-www-form-urlencoded;charset=UTF-8"
      });

      if (navigator.sendBeacon(url, blob)) {
        return Promise.resolve(true);
      }
    }

    return fetch(url, {
      method: "POST",
      mode: "no-cors",
      keepalive: true,
      body: body
    }).then(function () {
      return true;
    });
  }

  function createGtmEvent(payload) {
    return {
      event: CONFIG.eventName,
      lead_id: payload.lead_id,
      form_id: payload.form_id,
      form_origin: payload.form_origin,
      page_path: payload.page_path,
      utm_source: payload.utm_source || "",
      utm_medium: payload.utm_medium || "",
      utm_campaign: payload.utm_campaign || ""
    };
  }

  function pushGtmEvent(payload) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(createGtmEvent(payload));
  }

  function pushGtmEventAndRedirect(payload, redirectUrl) {
    window.dataLayer = window.dataLayer || [];

    var redirected = false;
    var go = function () {
      if (redirected) return;
      redirected = true;
      window.location.assign(redirectUrl);
    };

    var eventData = createGtmEvent(payload);
    eventData.eventCallback = go;
    eventData.eventTimeout = CONFIG.redirectDelay;

    window.dataLayer.push(eventData);
    window.setTimeout(go, CONFIG.redirectDelay);
  }

  function getRedirect(form) {
    var value = clean(form.dataset.lpRedirect);
    if (value.toLowerCase() === "none") return "";
    return value || CONFIG.defaultRedirect;
  }

  function onSubmit(event) {
    var form = event.target;

    if (!(form instanceof HTMLFormElement)) return;
    if (!form.matches(CONFIG.formSelector)) return;
    if (form.dataset.lpIgnore === "true") return;

    var webhook = clean(form.dataset.lpWebhook) || CONFIG.defaultWebhook;
    if (!webhook) return;

    var redirect = getRedirect(form);
    var payload = buildPayload(form);

    if (redirect) event.preventDefault();

    dispatchWebhook(webhook, payload)
      .then(function () {
        if (redirect) {
          pushGtmEventAndRedirect(payload, redirect);
        } else {
          pushGtmEvent(payload);
        }
      })
      .catch(function (error) {
        console.error("[LP Tracker] No fue posible enviar el formulario:", error);
      });
  }

  captureTrackingParams();
  document.addEventListener("submit", onSubmit, true);
})(window, document);
`;
  }

  function buildFormSnippet(selector) {
    var classMatch = selector.match(/^form\.([a-zA-Z0-9_-]+)$/);
    var className = classMatch ? classMatch[1] : "lead-form";
    return '<form class="' + className + '" data-lp-form-id="hero">';
  }

  function normalizeEventName(value) {
    var result = String(value || "lp_lead_submit")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_.-]/g, "_");
    return result || "lp_lead_submit";
  }

  function normalizeFileName(value) {
    var result = String(value || "lp-tracker.js")
      .trim()
      .replace(/[^a-zA-Z0-9._-]/g, "-");
    return result.toLowerCase().endsWith(".js") ? result : result + ".js";
  }

  function isValidUrl(value) {
    try {
      var url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch (_) {
      return false;
    }
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    return (bytes / 1024).toFixed(1) + " KB";
  }

  function copyText(text, message) {
    if (!text) return;

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () {
        showToast(message);
      }).catch(function () {
        fallbackCopy(text, message);
      });
      return;
    }

    fallbackCopy(text, message);
  }

  function fallbackCopy(text, message) {
    var area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    showToast(message);
  }

  function downloadJs() {
    if (!source) return;

    var blob = new Blob([source], { type: "text/javascript;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Descarga iniciada");
  }

  function saveConfig() {
    var values = Object.fromEntries(new FormData(form).entries());
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    } catch (_) {}
  }

  function restoreConfig() {
    var values = {};
    try {
      values = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch (_) {}

    Object.keys(values).forEach(function (name) {
      var input = form.elements.namedItem(name);
      if (input) input.value = values[name];
    });
  }

  function reset() {
    form.reset();
    redirectMode.value = "none";
    updateRedirectField();
    source = "";
    fileName = "lp-tracker.js";
    generatedCode.textContent = "";
    emptyState.hidden = false;
    result.hidden = true;
    statusBadge.textContent = "Sin generar";
    statusBadge.classList.remove("ready");
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    showToast("Configuración restablecida");
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.classList.remove("show");
    }, 1800);
  }
})();
