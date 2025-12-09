// ===============================
// Opalstack Pain Vault HUD
// content_script.js
// ===============================

(function () {
  const url = window.location.href;
  const domain = getDomainFromUrl(url);

  // Default campaigns used if user didn't configure any in options
  const DEFAULT_CAMPAIGNS = [
    { id: "vibe_memes", label: "🌈 Vibe Code Memes" },
    { id: "blog_posts", label: "📚 Ghost Blog" },
    { id: "sora_video", label: "🎬 Sora Video" },
    { id: "fb_live", label: "📡 FB Live Topic" }
  ];

  let CAMPAIGNS = []; // will be filled from storage or defaults
  const DAILY_GOAL = 10; // gamified target per campaign/domain

  let hudEnabledForDomain = false;
  let currentCampaign = null;
  let statsForDomain = { total: 0, byCampaign: {} };

  // Load HUD enabled state + campaigns + initial stats
  chrome.storage.sync.get(["hudEnabledDomains", "campaigns"], (data) => {
    const map = data.hudEnabledDomains || {};
    hudEnabledForDomain = !!map[domain];

    const storedCampaigns = Array.isArray(data.campaigns) ? data.campaigns : [];
    CAMPAIGNS =
      storedCampaigns.length > 0 ? storedCampaigns : DEFAULT_CAMPAIGNS.slice();
    if (!currentCampaign && CAMPAIGNS.length > 0) {
      currentCampaign = CAMPAIGNS[0].id;
    }

    createHud();
    requestInitialStats();
  });

  function requestInitialStats() {
    chrome.runtime.sendMessage({ type: "getStats", url }, (res) => {
      if (res && res.ok && res.domain === domain) {
        statsForDomain = res.stats || statsForDomain;
        updateHudStats();
      }
    });
  }

  // Listen for stats updates from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "statsUpdated" && message.domain === domain) {
      statsForDomain = message.stats || statsForDomain;
      updateHudStats();
    }
  });

  // ----- HUD DOM construction -----

  let hudEl, toggleCheckbox, campaignSelect, statsText, goalBarInner, statusText;

  function createHud() {
    hudEl = document.createElement("div");
    hudEl.id = "opal-pain-hud";
    hudEl.style.position = "fixed";
    hudEl.style.bottom = "16px";
    hudEl.style.right = "16px";
    hudEl.style.zIndex = "999999";
    hudEl.style.background = "rgba(15, 23, 42, 0.95)";
    hudEl.style.color = "#e5e7eb";
    hudEl.style.borderRadius = "8px";
    hudEl.style.padding = "8px 10px";
    hudEl.style.fontFamily =
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    hudEl.style.fontSize = "12px";
    hudEl.style.boxShadow = "0 10px 30px rgba(0,0,0,0.5)";
    hudEl.style.minWidth = "220px";
    hudEl.style.cursor = "grab";

    hudEl.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
        <div style="font-weight:600; display:flex; align-items:center; gap:4px;">
          <span>🤖</span>
          <span>n8n Capture</span>
        </div>
        <label style="font-size:11px; display:flex; align-items:center; gap:4px; cursor:pointer;">
          <span>${escapeHtml(domain)}</span>
          <input type="checkbox" id="opal-hud-toggle" />
        </label>
      </div>

      <div id="opal-hud-body" style="display:none; flex-direction:column; gap:6px;">
        <div>
          <label style="font-size:11px; font-weight:600;">
            Campaign
            <span
              title="This label is sent as the 'campaign' field in the JSON payload to your n8n workflow. Configure campaigns in the extension options."
              style="
                display:inline-flex;
                align-items:center;
                justify-content:center;
                width:14px;
                height:14px;
                border-radius:999px;
                background:#1e293b;
                color:#e5e7eb;
                font-size:10px;
                margin-left:4px;
                cursor:default;
              "
            >?</span>
          </label>
          <select id="opal-hud-campaign" style="
              width:100%;
              margin-top:2px;
              padding:2px 4px;
              border-radius:4px;
              border:1px solid #1e293b;
              background:#020617;
              color:#e5e7eb;
              font-size:11px;
          "></select>
          <div style="font-size:10px; color:#9ca3af; margin-top:2px;">
            Example: <code>vibe_memes</code> → meme engine, <code>blog_posts</code> → Ghost drafts, etc.
          </div>
        </div>

        <div style="font-size:11px;" id="opal-hud-stats">
          💾 Captures today: 0 (0 in this campaign)
        </div>

        <div style="width:100%; background:#020617; border-radius:999px; overflow:hidden; height:6px; margin-top:2px;">
          <div id="opal-hud-goal-bar-inner" style="
              height:100%;
              width:0%;
              background:linear-gradient(90deg, #22c55e, #eab308, #f97316, #ef4444);
              transition:width 0.2s ease-out;
          "></div>
        </div>
        <div style="font-size:10px; color:#9ca3af; margin-top:2px;">
          🎯 Goal: ${DAILY_GOAL} captures per campaign per day
        </div>

        <button id="opal-hud-capture" style="
            margin-top:4px;
            width:100%;
            padding:4px 0;
            border-radius:4px;
            border:none;
            background:#22c55e;
            color:#022c22;
            font-weight:600;
            font-size:12px;
            cursor:pointer;
        ">
          ⚡ Capture selection
        </button>

        <div id="opal-hud-status" style="font-size:10px; color:#a5f3fc; margin-top:2px; min-height:1em;"></div>
      </div>
    `;

    document.documentElement.appendChild(hudEl);

    // Hook up references
    toggleCheckbox = hudEl.querySelector("#opal-hud-toggle");
    campaignSelect = hudEl.querySelector("#opal-hud-campaign");
    statsText = hudEl.querySelector("#opal-hud-stats");
    goalBarInner = hudEl.querySelector("#opal-hud-goal-bar-inner");
    statusText = hudEl.querySelector("#opal-hud-status");
    const body = hudEl.querySelector("#opal-hud-body");

    // Populate campaigns from dynamic list
    CAMPAIGNS.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.label || c.id;
      campaignSelect.appendChild(opt);
    });
    if (currentCampaign) {
      campaignSelect.value = currentCampaign;
    }

    // Initial state
    toggleCheckbox.checked = hudEnabledForDomain;
    body.style.display = hudEnabledForDomain ? "flex" : "none";
    hudEl.style.opacity = hudEnabledForDomain ? "1" : "0.5";

    // Toggle HUD on/off for this domain
    toggleCheckbox.addEventListener("change", () => {
      hudEnabledForDomain = toggleCheckbox.checked;
      body.style.display = hudEnabledForDomain ? "flex" : "none";
      hudEl.style.opacity = hudEnabledForDomain ? "1" : "0.5";

      chrome.storage.sync.get(["hudEnabledDomains"], (data) => {
        const map = data.hudEnabledDomains || {};
        if (hudEnabledForDomain) {
          map[domain] = true;
        } else {
          delete map[domain];
        }
        chrome.storage.sync.set({ hudEnabledDomains: map });
      });
    });

    // Campaign change
    campaignSelect.addEventListener("change", () => {
      currentCampaign = campaignSelect.value;
      updateHudStats();
    });

    // Capture button
    const captureBtn = hudEl.querySelector("#opal-hud-capture");
    captureBtn.addEventListener("click", onCaptureClick);

    // Dragging
    initDrag(hudEl);
  }

  function onCaptureClick() {
    if (!hudEnabledForDomain) {
      setStatus("Enable HUD for this site first.", "warn");
      return;
    }

    const selection = window.getSelection().toString();
    if (!selection.trim()) {
      setStatus("No text selected. Highlight something spicy first.", "warn");
      return;
    }

    setStatus("Sending to n8n…", "info");

    chrome.runtime.sendMessage(
      {
        type: "sendSelection",
        selection,
        url,
        title: document.title,
        source: guessSourceFromUrl(url),
        campaign: currentCampaign
      },
      (res) => {
        if (!res || !res.ok) {
          setStatus("Error sending. Check extension options.", "error");
          return;
        }
        setStatus("Captured ✅", "success");
        setTimeout(() => setStatus("", "info"), 1500);
      }
    );
  }

  function updateHudStats() {
    if (!statsText || !goalBarInner) return;
    const total = statsForDomain.total || 0;
    const byCamp = statsForDomain.byCampaign || {};
    const campTotal = byCamp[currentCampaign] || 0;

    statsText.textContent =
      `💾 Captures today: ${total} (${campTotal} in this campaign)`;

    const pct = Math.min(100, Math.round((campTotal / DAILY_GOAL) * 100));
    goalBarInner.style.width = pct + "%";

    if (pct >= 100) {
      statsText.textContent += "  🔥 Goal hit!";
    }
  }

  function setStatus(msg, type) {
    if (!statusText) return;
    statusText.textContent = msg || "";
    if (type === "error") {
      statusText.style.color = "#fca5a5";
    } else if (type === "warn") {
      statusText.style.color = "#fde68a";
    } else {
      statusText.style.color = "#a5f3fc";
    }
  }

  // -------- Dragging logic --------
  function initDrag(el) {
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    el.addEventListener("mousedown", (e) => {
      // Don’t start drag from inside inputs/buttons
      if (
        e.target.tagName === "INPUT" ||
        e.target.tagName === "SELECT" ||
        e.target.tagName === "BUTTON"
      ) {
        return;
      }
      isDragging = true;
      el.style.cursor = "grabbing";
      startX = e.clientX;
      startY = e.clientY;
      const rect = el.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      el.style.left = startLeft + dx + "px";
      el.style.top = startTop + dy + "px";
      el.style.right = "auto";
      el.style.bottom = "auto";
    });

    document.addEventListener("mouseup", () => {
      if (!isDragging) return;
      isDragging = false;
      el.style.cursor = "grab";
    });
  }

  // -------- helpers --------
  function getDomainFromUrl(u) {
    try {
      return new URL(u).hostname;
    } catch {
      return "unknown";
    }
  }

  function guessSourceFromUrl(u) {
    if (!u) return "web";
    const lower = u.toLowerCase();
    if (lower.includes("reddit.com")) return "reddit";
    if (lower.includes("facebook.com")) return "facebook";
    if (lower.includes("mastodon")) return "mastodon";
    if (lower.includes("x.com") || lower.includes("twitter.com")) return "twitter";
    if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "youtube";
    if (lower.includes("linkedin.com")) return "linkedin";
    return "web";
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
})();
