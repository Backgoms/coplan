const form = document.getElementById("login-form");
const statusNode = document.getElementById("status");
const tokenInput = document.getElementById("access_token");

function setStatus(message, isError = false) {
  statusNode.textContent = message;
  statusNode.className = isError ? "error" : "ok";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const accessToken = tokenInput.value.trim();

  if (!accessToken) {
    setStatus("API key is required.", true);
    return;
  }

  setStatus("Saving...");

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        provider: "openai",
        access_token: accessToken
      })
    });

    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Failed to save key.");
    }

    tokenInput.value = "";
    setStatus(`Saved successfully: ${payload.auth_path}`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
});

