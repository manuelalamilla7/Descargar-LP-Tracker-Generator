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

  var helperForm = document.getElementById("form-helper");
  var helperFormId = document.getElementById("helper-form-id");
  var rawFormHtml = document.getElementById("raw-form-html");
  var helperEmpty = document.getElementById("helper-empty");
  var helperOutput = document.getElementById("helper-output");
  var helperStatus = document.getElementById("helper-status");
  var helperSummary = document.getElementById("helper-summary");
  var preparedFormCode = document.getElementById("prepared-form-code");
  var copyPreparedFormButton = document.getElementById("copy-prepared-form");
  var loadFormExampleButton = document.getElementById("load-form-example");
  var clearFormHelperButton = document.getElementById("clear-form-helper");

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
  helperForm.addEventListener("submit", prepareFormHtml);
  copyPreparedFormButton.addEventListener("click", function () {
    copyText(preparedFormCode.textContent, "Formulario copiado");
  });
  loadFormExampleButton.addEventListener("click", loadFormExample);
  clearFormHelperButton.addEventListener("click", clearFormHelper);

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


  function prepareFormHtml(event) {
    event.preventDefault();

    var html = String(rawFormHtml.value || "").trim();
    if (!html) {
      alert("Pega el HTML de al menos un formulario.");
      return;
    }

    var parser = new DOMParser();
    var parsed = parser.parseFromString("<!doctype html><html><body>" + html + "</body></html>", "text/html");
    var forms = Array.prototype.slice.call(parsed.body.querySelectorAll("form"));

    if (!forms.length) {
      alert("No encontramos una etiqueta <form> en el código pegado.");
      return;
    }

    var baseId = slugify(helperFormId.value || "formulario") || "formulario";
    var namesAdded = 0;
    var formsPrepared = 0;

    forms.forEach(function (targetForm, formIndex) {
      formsPrepared += 1;
      targetForm.classList.add("lead-form");

      if (!targetForm.dataset.lpFormId) {
        targetForm.dataset.lpFormId = forms.length === 1
          ? baseId
          : baseId + "-" + (formIndex + 1);
      }

      var usedNames = Object.create(null);
      targetForm.querySelectorAll("[name]").forEach(function (control) {
        var existingName = cleanBuilderValue(control.getAttribute("name"));
        if (existingName) usedNames[existingName] = true;
      });

      var controls = Array.prototype.slice.call(
        targetForm.querySelectorAll("input, select, textarea")
      );

      controls.forEach(function (control, controlIndex) {
        var type = String(control.getAttribute("type") || "").toLowerCase();
        if (type === "submit" || type === "button" || type === "reset" || type === "image") return;
        if (cleanBuilderValue(control.getAttribute("name"))) return;

        var candidate = inferFieldName(control, targetForm, controlIndex + 1);
        var uniqueName = makeUniqueName(candidate, usedNames);
        control.setAttribute("name", uniqueName);
        usedNames[uniqueName] = true;
        namesAdded += 1;

        if ((type === "checkbox" || type === "radio") && !control.hasAttribute("value")) {
          control.setAttribute("value", type === "checkbox" ? "aceptado" : "seleccionado");
        }
      });
    });

    var prepared = formatHtml(parsed.body.innerHTML.trim());
    preparedFormCode.textContent = prepared;
    helperSummary.textContent = formsPrepared + (formsPrepared === 1 ? " formulario preparado · " : " formularios preparados · ") + namesAdded + (namesAdded === 1 ? " name agregado" : " names agregados");
    helperEmpty.hidden = true;
    helperOutput.hidden = false;
    helperStatus.textContent = "Formulario listo";
    helperStatus.classList.add("ready");
    showToast("Formulario preparado");
  }

  function inferFieldName(control, targetForm, index) {
    var sources = [];
    var id = cleanBuilderValue(control.id);

    if (id) {
      sources.push(stripCommonPrefix(id));
    }

    var labelText = findLabelText(control, targetForm);
    if (labelText) sources.push(labelText);

    var placeholder = cleanBuilderValue(control.getAttribute("placeholder"));
    if (placeholder) sources.push(placeholder);

    var type = cleanBuilderValue(control.getAttribute("type"));
    if (type) sources.push(type);

    sources.push(control.tagName.toLowerCase() + "_" + index);

    for (var i = 0; i < sources.length; i += 1) {
      var normalized = normalizeFieldAlias(sources[i]);
      if (normalized) return normalized;
    }

    return "campo_" + index;
  }

  function findLabelText(control, targetForm) {
    var id = cleanBuilderValue(control.id);
    if (id) {
      var labels = Array.prototype.slice.call(targetForm.querySelectorAll("label[for]"));
      for (var i = 0; i < labels.length; i += 1) {
        if (labels[i].getAttribute("for") === id) {
          return cleanBuilderValue(labels[i].textContent);
        }
      }
    }

    var parentLabel = control.closest ? control.closest("label") : null;
    return parentLabel ? cleanBuilderValue(parentLabel.textContent) : "";
  }

  function stripCommonPrefix(value) {
    var parts = String(value).split(/[-_]+/);
    var first = String(parts[0] || "").toLowerCase();
    var prefixes = ["f", "c", "h", "field", "form", "lead", "input"];

    if (parts.length > 1 && (first.length <= 2 || prefixes.indexOf(first) !== -1)) {
      parts.shift();
    }

    return parts.join("_");
  }

  function normalizeFieldAlias(value) {
    var slug = slugify(value);
    if (!slug) return "";

    if (/apellido|last_name|lastname/.test(slug)) return "apellido";
    if (/nombre|full_name|fullname|(^|_)name($|_)/.test(slug)) return "nombre";
    if (/whatsapp|telefono|telephone|phone|(^|_)tel($|_)|(^|_)wa($|_)/.test(slug)) return "whatsapp";
    if (/correo|email|(^|_)mail($|_)/.test(slug)) return "correo";
    if (/interes|interest|que_buscas|buscas|(^|_)int($|_)/.test(slug)) return "interes";
    if (/mensaje|message|comentario|comments|(^|_)msg($|_)/.test(slug)) return "mensaje";
    if (/privacidad|privacy|consentimiento|consent|acepto/.test(slug)) return "aviso_privacidad";

    return slug.slice(0, 64);
  }

  function slugify(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function makeUniqueName(base, usedNames) {
    var name = base || "campo";
    var counter = 2;

    while (usedNames[name]) {
      name = base + "_" + counter;
      counter += 1;
    }

    return name;
  }

  function formatHtml(html) {
    var normalized = String(html || "")
      .replace(/>\s*</g, ">\n<")
      .trim();

    var voidTags = /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i;
    var lines = normalized.split("\n");
    var depth = 0;
    var output = [];

    lines.forEach(function (rawLine) {
      var line = rawLine.trim();
      if (!line) return;

      if (/^<\//.test(line)) depth = Math.max(0, depth - 1);
      output.push(new Array(depth + 1).join("  ") + line);

      var openMatch = line.match(/^<([a-z0-9-]+)(\s|>|\/)/i);
      var closesOnSameLine = /^<([a-z0-9-]+)[^>]*>.*<\/\1>$/i.test(line);
      var selfClosing = /\/\s*>$/.test(line);

      if (openMatch && !voidTags.test(openMatch[1]) && !selfClosing && !closesOnSameLine && !/^<!/.test(line) && !/^<\//.test(line)) {
        depth += 1;
      }
    });

    return output.join("\n");
  }

  function cleanBuilderValue(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function loadFormExample() {
    helperFormId.value = "hero";
    rawFormHtml.value = '<form id="leadForm" novalidate>\n  <label for="f-name">Nombre</label>\n  <input id="f-name" type="text" required>\n\n  <label for="f-wa">WhatsApp</label>\n  <input id="f-wa" type="tel" required>\n\n  <label for="f-mail">Correo</label>\n  <input id="f-mail" type="email">\n\n  <button type="submit">Enviar</button>\n</form>';
    showToast("Ejemplo cargado");
  }

  function clearFormHelper() {
    helperForm.reset();
    helperFormId.value = "hero";
    preparedFormCode.textContent = "";
    helperSummary.textContent = "";
    helperEmpty.hidden = false;
    helperOutput.hidden = true;
    helperStatus.textContent = "Sin preparar";
    helperStatus.classList.remove("ready");
    showToast("Preparador limpio");
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