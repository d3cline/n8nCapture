// ===============================
// n8n Capture Settings
// options.js
// ===============================

const webhookUrlInput = document.getElementById("webhookUrl");
const authTypeSelect = document.getElementById("authType");
const authTokenInput = document.getElementById("authToken");
const customHeaderNameInput = document.getElementById("customHeaderName");
const authTokenHeaderInput = document.getElementById("authTokenHeader");
const statusDiv = document.getElementById("status");
const saveBtn = document.getElementById("saveBtn");
const testBtn = document.getElementById("testBtn");
const campaignRowsContainer = document.getElementById("campaignRows");
const addCampaignBtn = document.getElementById("addCampaignBtn");

const authBearerGroup = document.getElementById("authBearerGroup");
const authHeaderGroup = document.getElementById("authHeaderGroup");

// Default campaigns for initial load / reset
const DEFAULT_CAMPAIGNS = [
  { id: "vibe_memes", label: "🌈 Vibe Code Memes" },
  { id: "blog_posts", label: "📚 Ghost Blog" },
  { id: "sora_video", label: "🎬 Sora Video" },
  { id: "fb_live", label: "📡 FB Live Topic" }
];

// Show/hide auth sections based on type
function updateAuthVisibility() {
  const type = authTypeSelect.value;
  authBearerGroup.style.display = type === "bearer" ? "block" : "none";
  authHeaderGroup.style.display = type === "custom_header" ? "block" : "none";
}

// ---- Campaign editor helpers ----

function renderCampaignRows(campaigns) {
  campaignRowsContainer.innerHTML = "";
  (campaigns || []).forEach((c) => addCampaignRow(c.label, c.id));
  if (!campaigns || campaigns.length === 0) {
    // add defaults on first run
    DEFAULT_CAMPAIGNS.forEach((c) => addCampaignRow(c.label, c.id));
  }
}

function addCampaignRow(label = "", id = "") {
  const row = document.createElement("div");
  row.className = "campaign-row";
  row.innerHTML = `
    <input
      type="text"
      class="campaign-label-input"
      placeholder="🌈 Vibe Code Memes"
      value="${label ? escapeHtml(label) : ""}"
      title="Label shown in the HUD. Emoji welcome."
    />
    <input
      type="text"
      class="campaign-id-input"
      placeholder="vibe_memes"
      value="${id ? escapeHtml(id) : ""}"
      title="ID sent to n8n as the 'campaign' field. No spaces."
    />
    <button type="button" class="campaign-remove-btn" title="Remove campaign">✕</button>
  `;
  const removeBtn = row.querySelector(".campaign-remove-btn");
  removeBtn.addEventListener("click", () => {
    campaignRowsContainer.removeChild(row);
  });
  campaignRowsContainer.appendChild(row);
}

function collectCampaignsFromUI() {
  const rows = campaignRowsContainer.querySelectorAll(".campaign-row");
  const campaigns = [];
  rows.forEach((row) => {
    const labelInput = row.querySelector(".campaign-label-input");
    const idInput = row.querySelector(".campaign-id-input");
    const label = (labelInput.value || "").trim();
    const id = (idInput.value || "").trim();
    if (id) {
      campaigns.push({
        id,
        label: label || id
      });
    }
  });
  return campaigns;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---- Init ----

// Load existing settings + campaigns
chrome.storage.sync.get(
  ["n8nWebhookUrl", "n8nAuthType", "n8nAuthToken", "n8nCustomHeaderName", "campaigns"],
  (config) => {
    if (config.n8nWebhookUrl) {
      webhookUrlInput.value = config.n8nWebhookUrl;
    }
    if (config.n8nAuthType) {
      authTypeSelect.value = config.n8nAuthType;
    }
    if (config.n8nAuthToken) {
      authTokenInput.value = config.n8nAuthToken;
      authTokenHeaderInput.value = config.n8nAuthToken;
    }
    if (config.n8nCustomHeaderName) {
      customHeaderNameInput.value = config.n8nCustomHeaderName;
    }
    updateAuthVisibility();
    renderCampaignRows(config.campaigns || []);
  }
);

// Add campaign row button
addCampaignBtn.addEventListener("click", () => {
  addCampaignRow("", "");
});

// Save settings
saveBtn.addEventListener("click", () => {
  const webhookUrl = webhookUrlInput.value.trim();
  const authType = authTypeSelect.value;

  let token = "";
  if (authType === "bearer") {
    token = authTokenInput.value.trim();
  } else if (authType === "custom_header") {
    token = authTokenHeaderInput.value.trim();
  }

  const customHeaderName = customHeaderNameInput.value.trim();
  const campaigns = collectCampaignsFromUI();

  chrome.storage.sync.set(
    {
      n8nWebhookUrl: webhookUrl,
      n8nAuthType: authType,
      n8nAuthToken: token,
      n8nCustomHeaderName: customHeaderName,
      campaigns
    },
    () => {
      setStatus("Settings saved.", "info");
    }
  );
});

// Test connection to n8n
testBtn.addEventListener("click", () => {
  const webhookUrl = webhookUrlInput.value.trim();
  const authType = authTypeSelect.value;

  if (!webhookUrl) {
    setStatus("Enter a webhook URL first.", "error");
    return;
  }

  let token = "";
  if (authType === "bearer") {
    token = authTokenInput.value.trim();
  } else if (authType === "custom_header") {
    token = authTokenHeaderInput.value.trim();
  }
  const customHeaderName = customHeaderNameInput.value.trim();

  const headers = { "Content-Type": "application/json" };

  if (authType === "bearer" && token) {
    headers["Authorization"] = "Bearer " + token;
  } else if (authType === "custom_header" && customHeaderName && token) {
    headers[customHeaderName] = token;
  }

  const payload = {
    test: true,
    message: "n8n Capture test ping from extension options.",
    created_at: new Date().toISOString()
  };

  setStatus("Testing connection…", "info");

  fetch(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error("HTTP " + res.status + " " + res.statusText + " - " + text);
      }
      setStatus("✅ Test request succeeded. Check your n8n workflow logs.", "success");
    })
    .catch((err) => {
      console.error("n8n test failed:", err);
      setStatus("❌ Test failed. Check URL/auth and n8n logs.", "error");
    });
});

// Update auth visibility when dropdown changes
authTypeSelect.addEventListener("change", updateAuthVisibility);

// Status helper
function setStatus(msg, type) {
  statusDiv.textContent = msg || "";
  if (type === "error") {
    statusDiv.style.color = "#fca5a5";
  } else if (type === "success") {
    statusDiv.style.color = "#bbf7d0";
  } else {
    statusDiv.style.color = "#a5f3fc";
  }
}
