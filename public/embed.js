/* CaleoCRM — loader de formulários embedáveis.
 * Uso: <script src="https://SEU-APP/embed.js" data-form="FORM_ID" data-mode="inline"></script>
 * Modos: inline (padrão), popup, slide-right, slide-left, top-bar, exit-intent.
 * O iframe aponta para <origin>/embed/?formId=FORM_ID (build separado do widget). */
(function () {
  var bootScript = document.currentScript;
  if (!bootScript) {
    var scripts = document.getElementsByTagName("script");
    for (var i = scripts.length - 1; i >= 0; i--) {
      var candidate = scripts[i];
      if (candidate && /\/embed\.js(?:\?.*)?$/.test(candidate.src || "")) {
        bootScript = candidate;
        break;
      }
    }
  }
  if (!bootScript) return;

  function getBaseUrl(scriptEl) {
    try {
      if (scriptEl && scriptEl.src) {
        return new URL(scriptEl.src, window.location.href).origin;
      }
    } catch (_err) {}
    return window.location.origin;
  }

  var BASE = getBaseUrl(bootScript);
  var formId = bootScript.getAttribute("data-form-id") || bootScript.getAttribute("data-form");
  if (!formId) return;
  var mode = (bootScript.getAttribute("data-mode") || "inline").toLowerCase();
  var triggerLabel = bootScript.getAttribute("data-trigger-label");
  var rawContainerId = bootScript.getAttribute("data-container");
  var containerId =
    rawContainerId && String(rawContainerId).trim()
      ? String(rawContainerId).trim()
      : "wchat-form-" + formId;
  var triggerBottomAttr = Number(bootScript.getAttribute("data-trigger-bottom"));
  var triggerRightAttr = Number(bootScript.getAttribute("data-trigger-right"));

  function buildIframeSrc(targetFormId) {
    var src = BASE + "/embed/?formId=" + encodeURIComponent(targetFormId);
    var parentQuery = window.location.search ? window.location.search.slice(1) : "";
    if (parentQuery) src += "&" + parentQuery;
    return src;
  }

  function createIframe(targetFormId, options) {
    var eager = options && options.eager;
    var iframe = document.createElement("iframe");
    iframe.src = buildIframeSrc(targetFormId);
    iframe.width = "100%";
    iframe.height = "600";
    iframe.style.border = "0";
    iframe.style.borderRadius = "8px";
    iframe.style.background = "transparent";
    iframe.loading = eager ? "eager" : "lazy";
    if (eager && "fetchPriority" in iframe) {
      iframe.fetchPriority = "high";
    }
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    return iframe;
  }

  function injectStyles() {
    if (document.getElementById("wchat-embed-styles")) return;
    var style = document.createElement("style");
    style.id = "wchat-embed-styles";
    style.textContent = [
      ".wcf-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:99998; opacity:0; transition:opacity 0.3s; }",
      ".wcf-overlay.active { opacity:1; }",
      ".wcf-modal { position:fixed; z-index:99999; background:#fff; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25); transition:transform 0.35s ease, opacity 0.35s ease; }",
      ".wcf-modal iframe { border:0; width:100%; height:100%; }",
      ".wcf-close { position:absolute; top:8px; right:12px; width:32px; height:32px; border-radius:50%; border:none; background:#f3f4f6; color:#374151; font-size:18px; cursor:pointer; display:flex; align-items:center; justify-content:center; z-index:10; }",
      ".wcf-close:hover { background:#e5e7eb; }",
      ".wcf-popup { top:50%; left:50%; transform:translate(-50%,-50%) scale(0.95); opacity:0; width:90%; max-width:560px; height:80vh; max-height:700px; border-radius:16px; overflow:hidden; }",
      ".wcf-popup.active { transform:translate(-50%,-50%) scale(1); opacity:1; }",
      ".wcf-slide-right { top:0; right:0; width:420px; max-width:90vw; height:100vh; transform:translateX(100%); opacity:0; border-radius:16px 0 0 16px; overflow:hidden; }",
      ".wcf-slide-right.active { transform:translateX(0); opacity:1; }",
      ".wcf-slide-left { top:0; left:0; width:420px; max-width:90vw; height:100vh; transform:translateX(-100%); opacity:0; border-radius:0 16px 16px 0; overflow:hidden; }",
      ".wcf-slide-left.active { transform:translateX(0); opacity:1; }",
      ".wcf-top-bar { top:0; left:0; right:0; transform:translateY(-100%); opacity:0; height:auto; max-height:60vh; border-radius:0 0 12px 12px; overflow:hidden; }",
      ".wcf-top-bar.active { transform:translateY(0); opacity:1; }",
      ".wcf-top-bar iframe { height:500px; }",
      ".wcf-trigger { position:fixed; bottom:20px; right:20px; z-index:99997; padding:12px 24px; background:#6d28d9; color:#fff; border:none; border-radius:50px; font-size:15px; font-weight:600; cursor:pointer; box-shadow:0 4px 14px rgba(109,40,217,0.4); transition:transform 0.2s; }",
      ".wcf-trigger:hover { transform:scale(1.05); }",
    ].join("\n");
    document.head.appendChild(style);
  }

  function createModal(targetFormId, targetMode) {
    injectStyles();
    var overlay = document.createElement("div");
    overlay.className = "wcf-overlay";
    var modal = document.createElement("div");
    modal.className = "wcf-modal wcf-" + targetMode;
    var closeBtn = document.createElement("button");
    closeBtn.className = "wcf-close";
    closeBtn.innerHTML = "&times;";
    var iframe = createIframe(targetFormId, { eager: false });
    iframe.style.borderRadius = "0";
    iframe.height = "100%";
    modal.appendChild(closeBtn);
    modal.appendChild(iframe);
    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    function open() {
      overlay.classList.add("active");
      modal.classList.add("active");
      document.body.style.overflow = "hidden";
    }
    function close() {
      overlay.classList.remove("active");
      modal.classList.remove("active");
      document.body.style.overflow = "";
    }
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", close);
    return { open: open };
  }

  function initInline(targetFormId, targetContainerId) {
    var container = targetContainerId ? document.getElementById(targetContainerId) : null;
    if (!container) container = document.getElementById("wchat-form-" + targetFormId);
    if (!container) return;
    var iframe = createIframe(targetFormId, { eager: true });
    container.innerHTML = "";
    container.appendChild(iframe);
  }

  function initPopupOrSlide(targetFormId, targetMode, label) {
    var modal = createModal(targetFormId, targetMode);
    var trigger = document.createElement("button");
    trigger.className = "wcf-trigger";
    trigger.textContent = label || "Fale conosco";
    var triggerIndex = document.querySelectorAll(".wcf-trigger").length;
    var bottom = Number.isFinite(triggerBottomAttr) ? triggerBottomAttr : 20 + triggerIndex * 56;
    var right = Number.isFinite(triggerRightAttr) ? triggerRightAttr : 20;
    trigger.style.bottom = bottom + "px";
    trigger.style.right = right + "px";
    trigger.addEventListener("click", modal.open);
    document.body.appendChild(trigger);
  }

  function initExitIntent(targetFormId) {
    var modal = createModal(targetFormId, "popup");
    var triggered = false;
    document.addEventListener("mouseleave", function (e) {
      if (e.clientY <= 0 && !triggered) {
        triggered = true;
        modal.open();
      }
    });
    setTimeout(function () {
      if (!triggered) {
        triggered = true;
        modal.open();
      }
    }, 30000);
  }

  function init() {
    switch (mode) {
      case "popup":
        initPopupOrSlide(formId, "popup", triggerLabel);
        break;
      case "slide-right":
        initPopupOrSlide(formId, "slide-right", triggerLabel);
        break;
      case "slide-left":
        initPopupOrSlide(formId, "slide-left", triggerLabel);
        break;
      case "top-bar":
        initPopupOrSlide(formId, "top-bar", triggerLabel);
        break;
      case "exit-intent":
        initExitIntent(formId);
        break;
      default:
        initInline(formId, containerId);
        break;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
