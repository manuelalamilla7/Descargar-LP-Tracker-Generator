(function () {
  "use strict";

  var configForm = document.getElementById("auto-config-form");
  var redirectMode = document.getElementById("auto-redirect-mode");
  var redirectField = document.getElementById("auto-redirect-field");
  var redirectUrl = document.getElementById("auto-redirect-url");
  var githubUrl = document.getElementById("github-url");
  var loadGithubButton = document.getElementById("load-github");
  var dropZone = document.getElementById("drop-zone");
  var chooseZipButton = document.getElementById("choose-zip");
  var chooseFolderButton = document.getElementById("choose-folder");
  var zipInput = document.getElementById("zip-input");
  var folderInput = document.getElementById("folder-input");
  var sourceStatus = document.getElementById("source-status");
  var projectSummary = document.getElementById("project-summary");
  var projectNameEl = document.getElementById("project-name");
  var projectFilesEl = document.getElementById("project-files");
  var projectHtmlEl = document.getElementById("project-html");
  var processButton = document.getElementById("process-project");
  var clearButton = document.getElementById("clear-project");
  var processEmpty = document.getElementById("process-empty");
  var processResult = document.getElementById("process-result");
  var processStatus = document.getElementById("process-status");
  var resultHtml = document.getElementById("result-html");
  var resultForms = document.getElementById("result-forms");
  var resultNames = document.getElementById("result-names");
  var resultTracker = document.getElementById("result-tracker");
  var frameworkWarning = document.getElementById("framework-warning");
  var changedCount = document.getElementById("changed-count");
  var changedFiles = document.getElementById("changed-files");
  var downloadButton = document.getElementById("download-project");
  var toast = document.getElementById("auto-toast");

  var currentProject = null;
  var processedBlob = null;
  var processedFileName = "landing-tracked.zip";
  var toastTimer = null;

  redirectMode.addEventListener("change", updateRedirectField);
  chooseZipButton.addEventListener("click", function (event) {
    event.stopPropagation();
    zipInput.click();
  });
  chooseFolderButton.addEventListener("click", function () {
    folderInput.click();
  });
  dropZone.addEventListener("click", function (event) {
    if (event.target === chooseZipButton) return;
    zipInput.click();
  });
  dropZone.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      zipInput.click();
    }
  });
  zipInput.addEventListener("change", function () {
    if (zipInput.files && zipInput.files[0]) loadZipFile(zipInput.files[0]);
  });
  folderInput.addEventListener("change", function () {
    if (folderInput.files && folderInput.files.length) loadFolder(folderInput.files);
  });
  loadGithubButton.addEventListener("click", loadGithubRepository);
  processButton.addEventListener("click", processProject);
  clearButton.addEventListener("click", clearProject);
  downloadButton.addEventListener("click", downloadProcessedProject);

  ["dragenter", "dragover"].forEach(function (name) {
    dropZone.addEventListener(name, function (event) {
      event.preventDefault();
      dropZone.classList.add("is-dragging");
    });
  });

  ["dragleave", "drop"].forEach(function (name) {
    dropZone.addEventListener(name, function (event) {
      event.preventDefault();
      dropZone.classList.remove("is-dragging");
    });
  });

  dropZone.addEventListener("drop", function (event) {
    var files = event.dataTransfer && event.dataTransfer.files;
    if (!files || !files.length) return;

    var zipFile = Array.prototype.find.call(files, function (file) {
      return /\.zip$/i.test(file.name);
    });

    if (!zipFile) {
      alert("Arrastra un archivo .zip. Para una carpeta completa usa el botón ‘Seleccionar carpeta completa’. ");
      return;
    }

    loadZipFile(zipFile);
  });

  updateRedirectField();

  function updateRedirectField() {
    var enabled = redirectMode.value === "thankyou";
    redirectField.hidden = !enabled;
    redirectUrl.required = enabled;
  }

  async function loadZipFile(file) {
    if (!ensureJsZip()) return;
    setSourceLoading("Leyendo ZIP...");

    try {
      var zip = await JSZip.loadAsync(file);
      var project = await projectFromZip(zip, stripZipExtension(file.name));
      setProject(project);
      showToast("ZIP cargado");
    } catch (error) {
      console.error(error);
      setSourceError("No se pudo leer el ZIP");
      alert("No fue posible abrir el archivo ZIP. Verifica que no esté dañado.");
    } finally {
      zipInput.value = "";
    }
  }

  async function loadFolder(fileList) {
    if (!ensureJsZip()) return;
    setSourceLoading("Leyendo carpeta...");

    try {
      var zip = new JSZip();
      var files = Array.prototype.slice.call(fileList);
      var rootName = "landing";

      if (files[0] && files[0].webkitRelativePath) {
        rootName = files[0].webkitRelativePath.split("/")[0] || rootName;
      }

      files.forEach(function (file) {
        var relative = file.webkitRelativePath || file.name;
        var normalized = removeFirstPathSegment(relative, rootName);
        normalized = sanitizePath(normalized || file.name);
        if (!normalized || isJunkPath(normalized)) return;
        zip.file(normalized, file);
      });

      var project = await projectFromZip(zip, rootName, { stripCommonRoot: false });
      setProject(project);
      showToast("Carpeta cargada");
    } catch (error) {
      console.error(error);
      setSourceError("No se pudo leer la carpeta");
      alert("No fue posible leer la carpeta seleccionada.");
    } finally {
      folderInput.value = "";
    }
  }

  async function loadGithubRepository() {
    if (!ensureJsZip()) return;

    var parsed = parseGithubUrl(githubUrl.value);
    if (!parsed) {
      alert("Pega una URL válida, por ejemplo: https://github.com/usuario/repositorio");
      return;
    }

    setSourceLoading("Descargando GitHub...");
    loadGithubButton.disabled = true;

    try {
      var repoResponse = await fetch("https://api.github.com/repos/" + encodeURIComponent(parsed.owner) + "/" + encodeURIComponent(parsed.repo), {
        headers: { "Accept": "application/vnd.github+json" }
      });

      if (!repoResponse.ok) {
        throw new Error("GitHub repo HTTP " + repoResponse.status);
      }

      var repoData = await repoResponse.json();
      var branch = repoData.default_branch || "main";
      var zipResponse = await fetch("https://api.github.com/repos/" + encodeURIComponent(parsed.owner) + "/" + encodeURIComponent(parsed.repo) + "/zipball/" + encodeURIComponent(branch), {
        headers: { "Accept": "application/vnd.github+json" }
      });

      if (!zipResponse.ok) {
        throw new Error("GitHub ZIP HTTP " + zipResponse.status);
      }

      var buffer = await zipResponse.arrayBuffer();
      var zip = await JSZip.loadAsync(buffer);
      var project = await projectFromZip(zip, parsed.repo);
      project.source = "github";
      project.github = parsed.owner + "/" + parsed.repo;
      setProject(project);
      showToast("Repositorio cargado");
    } catch (error) {
      console.error(error);
      setSourceError("GitHub no disponible");
      alert("No pudimos descargar el repositorio desde el navegador. Puedes descargar el ZIP desde GitHub y arrastrarlo aquí; el procesamiento será exactamente el mismo.");
    } finally {
      loadGithubButton.disabled = false;
    }
  }

  async function projectFromZip(zip, suggestedName, options) {
    options = options || {};
    var entries = Object.keys(zip.files).filter(function (path) {
      return !zip.files[path].dir && !isJunkPath(path);
    });

    var commonRoot = options.stripCommonRoot === false ? "" : findCommonRoot(entries);
    var normalizedZip = new JSZip();
    var normalizedPaths = [];

    for (var i = 0; i < entries.length; i += 1) {
      var originalPath = entries[i];
      var normalizedPath = commonRoot ? removeFirstPathSegment(originalPath, commonRoot) : originalPath;
      normalizedPath = sanitizePath(normalizedPath);
      if (!normalizedPath || isJunkPath(normalizedPath)) continue;

      var bytes = await zip.files[originalPath].async("uint8array");
      normalizedZip.file(normalizedPath, bytes);
      normalizedPaths.push(normalizedPath);
    }

    var htmlPaths = normalizedPaths.filter(function (path) {
      return /\.html?$/i.test(path);
    });

    var frameworkFiles = normalizedPaths.filter(function (path) {
      return /\.(jsx|tsx|vue|svelte|astro)$/i.test(path);
    });

    return {
      name: sanitizeDownloadName(suggestedName || commonRoot || "landing"),
      zip: normalizedZip,
      paths: normalizedPaths,
      htmlPaths: htmlPaths,
      frameworkFiles: frameworkFiles,
      source: "local"
    };
  }

  function setProject(project) {
    currentProject = project;
    processedBlob = null;
    processedFileName = "landing-tracked.zip";

    sourceStatus.textContent = "Proyecto listo";
    sourceStatus.classList.add("ready");
    projectSummary.hidden = false;
    projectNameEl.textContent = project.name;
    projectFilesEl.textContent = String(project.paths.length);
    projectHtmlEl.textContent = String(project.htmlPaths.length);
    processButton.disabled = false;
    clearButton.disabled = false;
    resetProcessResult();
  }

  function clearProject() {
    currentProject = null;
    processedBlob = null;
    githubUrl.value = "";
    projectSummary.hidden = true;
    sourceStatus.textContent = "Sin proyecto";
    sourceStatus.classList.remove("ready");
    processButton.disabled = true;
    clearButton.disabled = true;
    resetProcessResult();
    showToast("Proyecto retirado");
  }

  function setSourceLoading(message) {
    sourceStatus.textContent = message;
    sourceStatus.classList.remove("ready");
  }

  function setSourceError(message) {
    sourceStatus.textContent = message;
    sourceStatus.classList.remove("ready");
  }

  async function processProject() {
    if (!currentProject) return;
    if (!configForm.reportValidity()) return;
    if (!ensureJsZip()) return;

    var config = readConfig();
    if (!isValidHttpUrl(config.webhookUrl)) {
      alert("Ingresa una URL de webhook válida.");
      return;
    }

    processButton.disabled = true;
    clearButton.disabled = true;
    processStatus.textContent = "Procesando...";
    processStatus.classList.remove("ready");

    try {
      var outputZip = new JSZip();
      var paths = currentProject.paths.slice();
      var htmlSet = Object.create(null);
      currentProject.htmlPaths.forEach(function (path) { htmlSet[path] = true; });

      var trackerSource = buildTracker(config);
      var trackerPath = "assets/js/" + config.fileName;
      var changed = [];
      var stats = {
        html: 0,
        forms: 0,
        names: 0
      };

      for (var i = 0; i < paths.length; i += 1) {
        var path = paths[i];
        var entry = currentProject.zip.file(path);
        if (!entry) continue;

        if (htmlSet[path]) {
          var originalHtml = await entry.async("string");
          var transformed = transformHtml(originalHtml, path, config);
          outputZip.file(path, transformed.html);
          stats.html += 1;
          stats.forms += transformed.forms;
          stats.names += transformed.names;

          if (transformed.changed) {
            changed.push({
              type: "M",
              path: path,
              detail: transformed.forms + " form" + (transformed.forms === 1 ? "" : "s")
            });
          }
        } else if (path !== trackerPath) {
          var bytes = await entry.async("uint8array");
          outputZip.file(path, bytes);
        }
      }

      outputZip.file(trackerPath, trackerSource);
      changed.push({ type: currentProject.paths.indexOf(trackerPath) === -1 ? "A" : "M", path: trackerPath, detail: "tracker" });

      var blob = await outputZip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
      });

      processedBlob = blob;
      processedFileName = sanitizeDownloadName(currentProject.name) + "-tracked.zip";
      renderResult(stats, changed, config);
      showToast("Proyecto preparado");
    } catch (error) {
      console.error(error);
      processStatus.textContent = "Error";
      alert("Ocurrió un error al procesar el proyecto. Revisa la consola para ver el detalle.");
    } finally {
      processButton.disabled = false;
      clearButton.disabled = false;
    }
  }

  function transformHtml(html, htmlPath, config) {
    var parser = new DOMParser();
    var documentNode = parser.parseFromString(String(html || ""), "text/html");
    var parserError = documentNode.querySelector("parsererror");

    if (parserError) {
      return { html: html, changed: false, forms: 0, names: 0 };
    }

    var forms = Array.prototype.slice.call(documentNode.querySelectorAll("form"));
    var namesAdded = 0;
    var pageBase = slugify(fileStem(htmlPath)) || "pagina";

    forms.forEach(function (targetForm, formIndex) {
      targetForm.classList.add("lead-form");

      if (!clean(targetForm.getAttribute("data-lp-form-id"))) {
        var preferredId = clean(targetForm.id) || pageBase + "-" + (formIndex + 1);
        targetForm.setAttribute("data-lp-form-id", slugify(preferredId) || pageBase + "-" + (formIndex + 1));
      }

      if (!clean(targetForm.getAttribute("data-lp-form-origin"))) {
        targetForm.setAttribute("data-lp-form-origin", targetForm.getAttribute("data-lp-form-id"));
      }

      var usedNames = Object.create(null);
      targetForm.querySelectorAll("[name]").forEach(function (control) {
        var existing = clean(control.getAttribute("name"));
        if (existing) usedNames[existing] = true;
      });

      var controls = Array.prototype.slice.call(targetForm.querySelectorAll("input, select, textarea"));
      controls.forEach(function (control, controlIndex) {
        var type = clean(control.getAttribute("type")).toLowerCase();
        if (["submit", "button", "reset", "image"].indexOf(type) !== -1) return;
        if (clean(control.getAttribute("name"))) return;

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

    var trackerSrc = trackerRelativePath(htmlPath, config.fileName);
    var trackerScript = findTrackerScript(documentNode, config.fileName);

    if (!trackerScript) {
      trackerScript = documentNode.createElement("script");
      trackerScript.defer = true;
      trackerScript.setAttribute("data-lp-tracker", "true");
      trackerScript.setAttribute("src", trackerSrc);
      (documentNode.head || documentNode.body || documentNode.documentElement).appendChild(trackerScript);
    } else {
      trackerScript.setAttribute("src", trackerSrc);
      trackerScript.setAttribute("data-lp-tracker", "true");
      trackerScript.defer = true;
    }

    var doctype = extractDoctype(html);
    var serialized = (doctype ? doctype + "\n" : "<!doctype html>\n") + documentNode.documentElement.outerHTML;

    return {
      html: serialized,
      changed: serialized !== html,
      forms: forms.length,
      names: namesAdded
    };
  }

  function findTrackerScript(documentNode, fileName) {
    var scripts = Array.prototype.slice.call(documentNode.querySelectorAll("script[src]"));
    for (var i = 0; i < scripts.length; i += 1) {
      var src = clean(scripts[i].getAttribute("src"));
      if (scripts[i].hasAttribute("data-lp-tracker")) return scripts[i];
      if (src && src.split("?")[0].split("#")[0].endsWith("/" + fileName)) return scripts[i];
      if (src === fileName || src.endsWith("/lp-tracker.js")) return scripts[i];
    }
    return null;
  }

  function trackerRelativePath(htmlPath, fileName) {
    var normalized = sanitizePath(htmlPath);
    var directory = normalized.indexOf("/") === -1 ? "" : normalized.slice(0, normalized.lastIndexOf("/"));
    var depth = directory ? directory.split("/").filter(Boolean).length : 0;
    var prefix = depth ? new Array(depth + 1).join("../") : "./";
    return prefix + "assets/js/" + fileName;
  }

  function readConfig() {
    var data = new FormData(configForm);
    return {
      webhookUrl: clean(data.get("webhookUrl")),
      eventName: normalizeEventName(data.get("eventName")),
      fileName: normalizeFileName(data.get("fileName")),
      redirectUrl: data.get("redirectMode") === "thankyou" ? clean(data.get("redirectUrl")) : ""
    };
  }

  function buildTracker(config) {
    return `/**
 * LP Tracker
 * Generado automáticamente por LP Tracker Generator.
 * Captura UTMs, envía formularios a un webhook y publica un evento en dataLayer.
 */
(function (window, document) {
  "use strict";

  var CONFIG = {
    formSelector: "form.lead-form",
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
        payload[key] = Array.isArray(payload[key]) ? payload[key].concat(value) : [payload[key], value];
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
      if (navigator.sendBeacon(url, blob)) return Promise.resolve(true);
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
        if (redirect) pushGtmEventAndRedirect(payload, redirect);
        else pushGtmEvent(payload);
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

  function inferFieldName(control, targetForm, index) {
    var sources = [];
    var id = clean(control.id);
    if (id) sources.push(stripCommonPrefix(id));

    var labelText = findLabelText(control, targetForm);
    if (labelText) sources.push(labelText);

    var placeholder = clean(control.getAttribute("placeholder"));
    if (placeholder) sources.push(placeholder);

    var type = clean(control.getAttribute("type"));
    if (type) sources.push(type);

    sources.push(control.tagName.toLowerCase() + "_" + index);

    for (var i = 0; i < sources.length; i += 1) {
      var normalized = normalizeFieldAlias(sources[i]);
      if (normalized) return normalized;
    }

    return "campo_" + index;
  }

  function findLabelText(control, targetForm) {
    var id = clean(control.id);
    if (id) {
      var labels = Array.prototype.slice.call(targetForm.querySelectorAll("label[for]"));
      for (var i = 0; i < labels.length; i += 1) {
        if (labels[i].getAttribute("for") === id) return clean(labels[i].textContent);
      }
    }

    var parentLabel = control.closest ? control.closest("label") : null;
    return parentLabel ? clean(parentLabel.textContent) : "";
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

  function makeUniqueName(base, usedNames) {
    var safeBase = base || "campo";
    var name = safeBase;
    var counter = 2;
    while (usedNames[name]) {
      name = safeBase + "_" + counter;
      counter += 1;
    }
    return name;
  }

  function renderResult(stats, changed, config) {
    processEmpty.hidden = true;
    processResult.hidden = false;
    processStatus.textContent = "Listo para descargar";
    processStatus.classList.add("ready");

    resultHtml.textContent = String(stats.html);
    resultForms.textContent = String(stats.forms);
    resultNames.textContent = String(stats.names);
    resultTracker.textContent = config.fileName;
    changedCount.textContent = changed.length + (changed.length === 1 ? " archivo" : " archivos");
    changedFiles.innerHTML = "";

    changed.forEach(function (item) {
      var li = document.createElement("li");
      var type = document.createElement("span");
      var path = document.createElement("span");
      var detail = document.createElement("span");

      type.className = "change-type";
      type.textContent = item.type;
      path.className = "change-path";
      path.textContent = item.path;
      detail.className = "change-detail";
      detail.textContent = item.detail || "";

      li.appendChild(type);
      li.appendChild(path);
      li.appendChild(detail);
      changedFiles.appendChild(li);
    });

    if (currentProject.frameworkFiles.length) {
      frameworkWarning.hidden = false;
      frameworkWarning.textContent = "Detectamos archivos de framework (JSX/TSX/Vue/Svelte/Astro). Esta V1 solo modifica formularios que existan directamente dentro de archivos .html; el código fuente de componentes no se cambia todavía.";
    } else if (!stats.html) {
      frameworkWarning.hidden = false;
      frameworkWarning.textContent = "No encontramos archivos .html. El tracker sí se agregó al ZIP, pero esta V1 necesita HTML estático para preparar formularios e insertar el script automáticamente.";
    } else {
      frameworkWarning.hidden = true;
      frameworkWarning.textContent = "";
    }
  }

  function resetProcessResult() {
    processedBlob = null;
    processEmpty.hidden = false;
    processResult.hidden = true;
    processStatus.textContent = "Pendiente";
    processStatus.classList.remove("ready");
    changedFiles.innerHTML = "";
    frameworkWarning.hidden = true;
  }

  function downloadProcessedProject() {
    if (!processedBlob) return;
    var url = URL.createObjectURL(processedBlob);
    var link = document.createElement("a");
    link.href = url;
    link.download = processedFileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    showToast("Descarga iniciada");
  }

  function parseGithubUrl(value) {
    var text = clean(value).replace(/\/$/, "");
    var match = text.match(/^https?:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?$/i);
    if (!match) return null;
    return { owner: match[1], repo: match[2] };
  }

  function findCommonRoot(paths) {
    if (!paths.length) return "";
    var firstSegments = paths.map(function (path) {
      return String(path).split("/")[0];
    });
    var first = firstSegments[0];
    var allSame = first && firstSegments.every(function (segment) { return segment === first; });
    var allNested = paths.every(function (path) { return String(path).indexOf("/") !== -1; });
    return allSame && allNested ? first : "";
  }

  function removeFirstPathSegment(path, segment) {
    var text = String(path || "").replace(/^\/+/, "");
    if (!segment) return text;
    if (text === segment) return "";
    if (text.indexOf(segment + "/") === 0) return text.slice(segment.length + 1);
    return text;
  }

  function sanitizePath(path) {
    return String(path || "")
      .replace(/\\/g, "/")
      .split("/")
      .filter(function (part) { return part && part !== "." && part !== ".."; })
      .join("/");
  }

  function isJunkPath(path) {
    var text = String(path || "");
    return /(^|\/)__MACOSX(\/|$)/.test(text) || /(^|\/)\.DS_Store$/.test(text);
  }

  function fileStem(path) {
    var name = String(path || "").split("/").pop() || "pagina";
    return name.replace(/\.[^.]+$/, "");
  }

  function extractDoctype(html) {
    var match = String(html || "").match(/<!doctype[^>]*>/i);
    return match ? match[0] : "";
  }

  function stripZipExtension(name) {
    return String(name || "landing").replace(/\.zip$/i, "");
  }

  function sanitizeDownloadName(value) {
    var result = String(value || "landing")
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return result || "landing";
  }

  function normalizeFileName(value) {
    var result = String(value || "lp-tracker.js")
      .trim()
      .replace(/[^a-zA-Z0-9._-]/g, "-");
    return result.toLowerCase().endsWith(".js") ? result : result + ".js";
  }

  function normalizeEventName(value) {
    var result = String(value || "lp_lead_submit")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_.-]/g, "_");
    return result || "lp_lead_submit";
  }

  function slugify(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function clean(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function isValidHttpUrl(value) {
    try {
      var url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch (_) {
      return false;
    }
  }

  function ensureJsZip() {
    if (typeof window.JSZip !== "function") {
      alert("No se pudo cargar JSZip. Revisa la conexión a Internet y vuelve a abrir esta página.");
      return false;
    }
    return true;
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
