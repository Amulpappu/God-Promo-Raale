/* Ask Ninja chatbot widget (built by our teammate, integrated into NoteNinja). */

  (function () {
    if (document.getElementById("campus-ai-widget-root")) return;

    const style = document.createElement("style");
    style.innerHTML = `
      #campus-ai-widget-root {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .cai-launcher {
        background: linear-gradient(135deg, #4f46e5, #7c3aed, #ec4899);
        color: white;
        border: none;
        border-radius: 50px;
        padding: 14px 22px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 10px 25px -5px rgba(79, 70, 229, 0.5);
        display: flex;
        align-items: center;
        gap: 10px;
        transition: transform 0.2s, box-shadow 0.2s;
      }
      .cai-launcher:hover {
        transform: translateY(-2px);
        box-shadow: 0 15px 30px -5px rgba(79, 70, 229, 0.7);
      }
      .cai-pulse {
        width: 8px;
        height: 8px;
        background: #10b981;
        border-radius: 50%;
        box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
        animation: cai-pulse-anim 1.5s infinite;
      }
      @keyframes cai-pulse-anim {
        0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
        70% { transform: scale(1); box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
        100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
      }
      .cai-window {
        width: 380px;
        max-width: calc(100vw - 32px);
        height: 540px;
        max-height: calc(100vh - 48px);
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 18px;
        box-shadow: 0 20px 40px rgba(0,0,0,0.6);
        display: none;
        flex-direction: column;
        overflow: hidden;
        color: #f8fafc;
      }
      .cai-header {
        background: linear-gradient(90deg, #1e1b4b, #312e81);
        padding: 14px 18px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid #334155;
      }
      .cai-header-title {
        font-size: 14px;
        font-weight: 700;
        color: #fff;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .cai-close {
        background: none;
        border: none;
        color: #94a3b8;
        font-size: 20px;
        cursor: pointer;
        line-height: 1;
      }
      .cai-close:hover { color: #fff; }
      .cai-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: #020617;
        font-size: 13px;
      }
      .cai-msg {
        max-width: 85%;
        padding: 10px 14px;
        border-radius: 14px;
        line-height: 1.45;
        white-space: pre-line;
        word-break: break-word;
      }
      .cai-msg-bot {
        background: #1e293b;
        color: #e2e8f0;
        border: 1px solid #334155;
        align-self: flex-start;
        border-bottom-left-radius: 2px;
      }
      .cai-msg-user {
        background: #4f46e5;
        color: white;
        align-self: flex-end;
        border-bottom-right-radius: 2px;
      }
      .cai-chips {
        padding: 8px 12px;
        background: #0f172a;
        border-top: 1px solid #1e293b;
        display: flex;
        gap: 6px;
        overflow-x: auto;
      }
      .cai-chip {
        background: #1e293b;
        border: 1px solid #334155;
        color: #94a3b8;
        padding: 4px 10px;
        border-radius: 8px;
        font-size: 11px;
        cursor: pointer;
        white-space: nowrap;
      }
      .cai-chip:hover {
        background: #312e81;
        color: #c7d2fe;
        border-color: #4f46e5;
      }
      .cai-file-preview {
        padding: 6px 12px;
        background: #1e1b4b;
        border-top: 1px solid #4338ca;
        font-size: 11px;
        color: #a5b4fc;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .cai-error {
        padding: 6px 12px;
        background: #450a0a;
        border-top: 1px solid #dc2626;
        font-size: 11px;
        color: #fca5a5;
      }
      .cai-input-bar {
        padding: 10px 12px;
        background: #0f172a;
        border-top: 1px solid #1e293b;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .cai-input {
        flex: 1;
        background: #020617;
        border: 1px solid #334155;
        color: #fff;
        padding: 8px 12px;
        border-radius: 10px;
        font-size: 12px;
        outline: none;
      }
      .cai-input:focus { border-color: #6366f1; }
      .cai-btn-icon {
        background: none;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        font-size: 15px;
        padding: 6px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .cai-btn-icon:hover { background: #1e293b; color: #fff; }
      .cai-btn-icon.active { background: #e11d48; color: #fff; }
      .cai-btn-send {
        background: #4f46e5;
        color: white;
        border: none;
        padding: 8px 12px;
        border-radius: 10px;
        font-weight: 600;
        font-size: 12px;
        cursor: pointer;
      }
      .cai-btn-send:hover { background: #4338ca; }
    `;
    document.head.appendChild(style);

    const container = document.createElement("div");
    container.id = "campus-ai-widget-root";
    container.innerHTML = `
      <button class="cai-launcher" id="caiLauncher">
        <span class="cai-pulse"></span>
        <span>Ask Ninja</span>
      </button>

      <div class="cai-window" id="caiWindow">
        <div class="cai-header">
          <div class="cai-header-title">
            <span>🥷 Ask Ninja · NoteNinja Assistant</span>
          </div>
          <button class="cai-close" id="caiClose">&times;</button>
        </div>

        <div class="cai-messages" id="caiMessages">
          <div class="cai-msg cai-msg-bot">
            👋 Hi! I'm Ask Ninja, your NoteNinja assistant.<br><br>
            • 🎙️ Speak your question<br>
            • 📎 Attach notes/syllabus<br>
            • 📅 Ask for a study schedule<br>
            • 🔍 I scan this page live for you!
          </div>
        </div>

        <div id="caiError" class="cai-error" style="display:none;"></div>
        <div id="caiFilePreview" class="cai-file-preview" style="display:none;">
          <span id="caiFileName"></span>
          <button id="caiRemoveFile" style="background:none;border:none;color:#fff;cursor:pointer;">&times;</button>
        </div>

        <div class="cai-chips">
          <div class="cai-chip" id="chipSchedule">📅 5-Day Study Plan</div>
          <div class="cai-chip" id="chipScan">🔍 Scan This Page</div>
          <div class="cai-chip" id="chipRules">🛡️ Upload Rules</div>
        </div>

        <div class="cai-input-bar">
          <input type="file" id="caiFileInput" style="display:none;" accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg">
          <button class="cai-btn-icon" id="caiFileBtn" title="Attach file">📎</button>
          <button class="cai-btn-icon" id="caiMicBtn" title="Speak">🎙️</button>
          <input type="text" class="cai-input" id="caiInput" placeholder="Ask anything about this page...">
          <button class="cai-btn-send" id="caiSendBtn">Send</button>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    const launcher = document.getElementById("caiLauncher");
    const win = document.getElementById("caiWindow");
    const closeBtn = document.getElementById("caiClose");
    const messagesBox = document.getElementById("caiMessages");
    const input = document.getElementById("caiInput");
    const sendBtn = document.getElementById("caiSendBtn");
    const fileBtn = document.getElementById("caiFileBtn");
    const fileInput = document.getElementById("caiFileInput");
    const micBtn = document.getElementById("caiMicBtn");
    const errorBox = document.getElementById("caiError");
    const previewBox = document.getElementById("caiFilePreview");
    const fileNameSpan = document.getElementById("caiFileName");
    const removeFileBtn = document.getElementById("caiRemoveFile");

    let attachedFile = null;
    let isListening = false;
    let recognition = null;

    launcher.onclick = () => { launcher.style.display = "none"; win.style.display = "flex"; };
    closeBtn.onclick = () => { win.style.display = "none"; launcher.style.display = "flex"; };

    function appendMessage(text, sender) {
      const div = document.createElement("div");
      div.className = "cai-msg " + (sender === "user" ? "cai-msg-user" : "cai-msg-bot");
      div.innerText = text;
      messagesBox.appendChild(div);
      messagesBox.scrollTop = messagesBox.scrollHeight;
    }

    function scanPageForQuery(query) {
      const bodyText = document.body.innerText;
      const lowerQuery = query.toLowerCase();
      if (bodyText.toLowerCase().includes(lowerQuery)) {
        return `✅ Yes! I scanned this webpage and found mentions of "${query}".\nCheck the resources and headings displayed on the page!`;
      }
      return null;
    }

    function botReply(userText, file) {
      const text = userText.toLowerCase();

      if (file) {
        appendMessage(`📄 Received: "${file.name}" (${(file.size/1024).toFixed(1)} KB)\n✅ File validated (under 10 MB, allowed format).\nWould you like me to generate a 5-day study timetable from this syllabus?`, "bot");
        return;
      }

      if (text.includes("scan") || text.includes("page") || text.includes("content")) {
        const pageTitle = document.title || "Campus Platform";
        const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
          .map(h => h.innerText.trim())
          .filter(t => t.length > 0 && t.length < 65)
          .slice(0, 6)
          .join("\n• ");

        appendMessage(`🔍 Live Page Scan Report:\nPage: ${pageTitle}\nResources detected on screen:\n• ${headings || "General Campus Hub"}`, "bot");
        return;
      }

      if (text.includes("schedule") || text.includes("plan") || text.includes("timetable")) {
        appendMessage(`📅 5-Day Smart Study Schedule:\n• Day 1: Core Concepts & Unit 1 Fundamentals (2.5 hrs)\n• Day 2: Unit 2 & 3 Key Algorithms & Flowcharts (3 hrs)\n• Day 3: Problem Solving & Numerical Derivations (3.5 hrs)\n• Day 4: Review Previous 3 Years' Solved Papers (3 hrs)\n• Day 5: Full Mock Revision & Formula Cheat-Sheets (2 hrs)\n💡 Tip: Take a 10-min break every 50 mins!`, "bot");
        return;
      }

      if (text.includes("rule") || text.includes("upload") || text.includes("limit")) {
        appendMessage(`🛡️ Campus Upload Rules:\n1. Formats: PDF, DOCX, PPTX, PNG, JPG (max 10 MB)\n2. Disallowed files (.exe, .zip) are rejected immediately\n3. Unverified uploads show 'Pending review' until a moderator approves them. Only approved resources show the Verified badge.`, "bot");
        return;
      }

      const scanResult = scanPageForQuery(userText);
      if (scanResult) {
        appendMessage(scanResult, "bot");
        return;
      }

      appendMessage(`🤖 I searched the page for "${userText}". You can ask me to prepare a study schedule, scan the page, or test file upload validation!`, "bot");
    }

    function handleSend() {
      const text = input.value.trim();
      if (!text && !attachedFile) return;

      let displayMsg = text;
      if (attachedFile) displayMsg += `\n[Attached: ${attachedFile.name}]`;

      appendMessage(displayMsg, "user");
      const currentFile = attachedFile;

      input.value = "";
      attachedFile = null;
      previewBox.style.display = "none";
      errorBox.style.display = "none";

      setTimeout(() => {
        botReply(text, currentFile);
      }, 350);
    }

    sendBtn.onclick = handleSend;
    input.onkeydown = (e) => { if (e.key === "Enter") handleSend(); };

    fileBtn.onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const ext = file.name.split('.').pop().toLowerCase();
      const allowed = ['pdf', 'docx', 'pptx', 'png', 'jpg', 'jpeg'];

      if (!allowed.includes(ext)) {
        errorBox.innerText = `❌ Error: .${ext} files are rejected! Only PDF, DOCX, PPTX, PNG or JPG allowed.`;
        errorBox.style.display = "block";
        fileInput.value = "";
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        errorBox.innerText = `❌ Error: File size exceeds the 10 MB limit.`;
        errorBox.style.display = "block";
        fileInput.value = "";
        return;
      }

      errorBox.style.display = "none";
      attachedFile = file;
      fileNameSpan.innerText = `📎 ${file.name}`;
      previewBox.style.display = "flex";
    };

    removeFileBtn.onclick = () => {
      attachedFile = null;
      fileInput.value = "";
      previewBox.style.display = "none";
    };

    const Speech = window.isSecureContext && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (Speech) {
      recognition = new Speech();
      recognition.lang = 'en-US';
      recognition.onresult = (e) => {
        input.value = e.results[0][0].transcript;
        micBtn.classList.remove("active");
        isListening = false;
        handleSend();
      };
      recognition.onerror = () => {
        micBtn.classList.remove("active");
        isListening = false;
      };
    }

    micBtn.onclick = () => {
      if (!recognition) {
        appendMessage("🎙️ Voice input works best on Google Chrome or Microsoft Edge.", "bot");
        return;
      }
      if (isListening) {
        recognition.stop();
        micBtn.classList.remove("active");
        isListening = false;
      } else {
        recognition.start();
        micBtn.classList.add("active");
        isListening = true;
      }
    };

    document.getElementById("chipSchedule").onclick = () => {
      input.value = "Create a 5-day study plan";
      handleSend();
    };
    document.getElementById("chipScan").onclick = () => {
      input.value = "Scan this page";
      handleSend();
    };
    document.getElementById("chipRules").onclick = () => {
      input.value = "What are the upload validation rules?";
      handleSend();
    };
  })();
  