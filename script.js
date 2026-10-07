const tools = {
  formatter: {
    title: "JSON Formatter",
    description: "Beautify pasted JSON and make it easier to read.",
    actions: [
      ["Format", "format"],
      ["Minify", "minify", "secondary"],
      ["Copy", "copy", "secondary"],
      ["Upload", "upload", "secondary"],
      ["Download", "download", "secondary"],
      ["Share", "share", "secondary"],
      ["Clear", "clear", "ghost"],
    ],
  },
  differ: {
    title: "JSON Differ",
    description: "Compare two JSON payloads and list changed paths.",
    actions: [
      ["Compare", "compare"],
      ["Swap", "swap", "secondary"],
      ["Copy Result", "copy", "secondary"],
      ["Share", "share", "secondary"],
      ["Upload Left", "upload-left", "secondary"],
      ["Upload Right", "upload-right", "secondary"],
      ["Clear", "clear", "ghost"],
    ],
  },
  tree: {
    title: "JSON Tree Viewer",
    description: "Turn nested JSON into an expandable tree.",
    actions: [
      ["View Tree", "tree"],
      ["Expand All", "expand", "secondary"],
      ["Collapse All", "collapse", "secondary"],
      ["Upload", "upload", "secondary"],
      ["Copy Tree", "copy", "secondary"],
      ["Share", "share", "secondary"],
      ["Clear", "clear", "ghost"],
    ],
  },
  extract: {
    title: "JSON Extract Keys / Values",
    description: "Extract paths, keys, values, or key-value pairs from JSON.",
    actions: [
      ["Extract", "extract"],
      ["Copy Output", "copy", "secondary"],
      ["Download", "download", "secondary"],
      ["Upload", "upload", "secondary"],
      ["Share", "share", "secondary"],
      ["Clear", "clear", "ghost"],
    ],
  },
  curl: {
    title: "JSON to cURL",
    description: "Generate a cURL request from a JSON body.",
    actions: [
      ["Generate", "curl"],
      ["Copy cURL", "copy", "secondary"],
      ["Download", "download", "secondary"],
      ["Upload JSON", "upload", "secondary"],
      ["Share", "share", "secondary"],
      ["Clear", "clear", "ghost"],
    ],
  },
};

const DEPTH_COLOR_COUNT = 6;
const ARROW_DOWN_SVG = `<svg class="gutter-arrow-svg arrow-down" viewBox="0 0 10 10" width="8" height="8" aria-hidden="true"><polygon points="1.5,3 8.5,3 5,7.5" fill="currentColor"/></svg>`;
const ARROW_UP_SVG = `<svg class="gutter-arrow-svg arrow-up" viewBox="0 0 10 10" width="8" height="8" aria-hidden="true"><polygon points="5,2.5 8.5,7 1.5,7" fill="currentColor"/></svg>`;

function getDepthColor(depth) {
  const index = ((Math.max(1, depth) - 1) % DEPTH_COLOR_COUNT) + 1;
  return `var(--bracket-depth-${index})`;
}

var mirrorContainer = null;

const state = {
  activeTool: "formatter",
  uploadTarget: null,
  diffText: "",
};

const sampleJson = {
  name: "I {💔} JSON",
  purpose: "Make pasted JSON readable",
  features: ["format", "minify", "copy", "upload", "download", "share", "diff", "tree"],
  valid: true,
};

const themeToggle = document.querySelector("#themeToggle");
const themeLabel = document.querySelector("#themeLabel");
const toolCards = document.querySelectorAll(".tool-card");
const panels = document.querySelectorAll(".tool-panel");
const toolTitle = document.querySelector("#toolTitle");
const toolDescription = document.querySelector("#toolDescription");
const toolActions = document.querySelector("#toolActions");
const fileInput = document.querySelector("#fileInput");
const input = document.querySelector("#jsonInput");
const indentSize = document.querySelector("#indentSize");
const statusCard = document.querySelector("#statusCard");
const statusLabel = document.querySelector("#statusLabel");
const statusMessage = document.querySelector("#statusMessage");
const charCount = document.querySelector("#charCount");
const lineCount = document.querySelector("#lineCount");
const byteSize = document.querySelector("#byteSize");
const diffLeft = document.querySelector("#diffLeft");
const diffRight = document.querySelector("#diffRight");
const treeInput = document.querySelector("#treeInput");
const treeOutput = document.querySelector("#treeOutput");
const extractInput = document.querySelector("#extractInput");
const extractMode = document.querySelector("#extractMode");
const extractOutput = document.querySelector("#extractOutput");
const curlInput = document.querySelector("#curlInput");
const curlUrl = document.querySelector("#curlUrl");
const curlMethod = document.querySelector("#curlMethod");
const curlOutput = document.querySelector("#curlOutput");

const sampleText = JSON.stringify(sampleJson);
input.value = sampleText;
diffLeft.value = JSON.stringify({ id: 1, status: "draft", tags: ["json"] }, null, 2);
diffRight.value = JSON.stringify({ id: 1, status: "live", tags: ["json", "tool"] }, null, 2);
treeInput.value = sampleText;
extractInput.value = sampleText;
curlInput.value = sampleText;

initializeTheme();
initializeEditors();
restoreSharedTool();
updateStats();

toolCards.forEach((card) => {
  card.addEventListener("click", () => setActiveTool(card.dataset.tool));
});

toolActions.addEventListener("click", (event) => {
  const button = event.target.closest("button");

  if (!button) {
    return;
  }

  handleAction(button.dataset.action);
});

input.addEventListener("input", updateStats);
indentSize.addEventListener("change", () => input.value.trim() && formatJson());
extractMode.addEventListener("change", extractJson);
fileInput.addEventListener("change", handleUpload);
themeToggle.addEventListener("click", toggleTheme);

function analyzeCurlyBlocks(text) {
  const lineMap = new Map();
  const stack = [];
  let currentLine = 1;
  let inString = false;
  let isEscaped = false;
  let blockIdCounter = 1;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      } else if (char === "\n") {
        currentLine++;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      isEscaped = false;
      continue;
    }

    if (char === "\n") {
      currentLine++;
      continue;
    }

    if (char === "{") {
      const depth = stack.length + 1;
      const item = {
        id: blockIdCounter++,
        openLine: currentLine,
        depth,
      };
      stack.push(item);

      if (!lineMap.has(currentLine)) {
        lineMap.set(currentLine, { openers: [], closers: [] });
      }
      lineMap.get(currentLine).openers.push(item);
    } else if (char === "}") {
      const depth = stack.length;
      let matchedItem = null;
      if (stack.length > 0) {
        matchedItem = stack.pop();
        matchedItem.closeLine = currentLine;
      }

      if (!lineMap.has(currentLine)) {
        lineMap.set(currentLine, { openers: [], closers: [] });
      }
      lineMap.get(currentLine).closers.push({
        id: matchedItem ? matchedItem.id : 0,
        openLine: matchedItem ? matchedItem.openLine : null,
        closeLine: currentLine,
        depth: matchedItem ? matchedItem.depth : Math.max(1, depth),
        unmatched: !matchedItem,
      });
    }
  }

  const blockMap = new Map();
  for (const [line, data] of lineMap.entries()) {
    const multiOpeners = data.openers.filter(
      (o) => o.closeLine !== o.openLine && (o.closeLine != null || currentLine > o.openLine)
    );
    const multiClosers = data.closers.filter((c) => c.closeLine !== c.openLine);

    if (multiOpeners.length > 0 || multiClosers.length > 0) {
      blockMap.set(line, {
        openers: multiOpeners,
        closers: multiClosers,
      });
    }
  }

  return { blockMap, totalLines: currentLine };
}

function getMirrorContainer() {
  if (!mirrorContainer) {
    mirrorContainer = document.createElement("div");
    mirrorContainer.id = "editorLineMirror";
    mirrorContainer.style.position = "absolute";
    mirrorContainer.style.visibility = "hidden";
    mirrorContainer.style.pointerEvents = "none";
    mirrorContainer.style.left = "-99999px";
    mirrorContainer.style.top = "-99999px";
    mirrorContainer.style.margin = "0";
    mirrorContainer.style.border = "0";
    mirrorContainer.style.zIndex = "-1";
    document.body.appendChild(mirrorContainer);
  }
  return mirrorContainer;
}

function highlightCurlyRange(textarea, startLine, endLine, depth) {
  const wrapper = textarea.closest(".code-editor");
  if (!wrapper) return;
  const highlights = wrapper.querySelector(".line-highlights");
  const gutter = wrapper.querySelector(".line-gutter");
  if (!highlights || !gutter) return;

  highlights.querySelectorAll(".curly-block-highlight").forEach((el) => el.remove());

  const startSpan = gutter.children[startLine - 1];
  const endSpan = gutter.children[endLine - 1];
  if (!startSpan || !endSpan) return;

  const top = startSpan.offsetTop;
  const height = endSpan.offsetTop + endSpan.offsetHeight - top;

  const mark = document.createElement("div");
  mark.className = "curly-block-highlight";
  mark.style.top = `${top}px`;
  mark.style.height = `${height}px`;
  mark.style.borderLeftColor = getDepthColor(depth);
  mark.style.backgroundColor = `color-mix(in srgb, ${getDepthColor(depth)} 12%, transparent)`;
  highlights.appendChild(mark);
}

function clearCurlyRange(textarea) {
  const wrapper = textarea.closest(".code-editor");
  if (!wrapper) return;
  const highlights = wrapper.querySelector(".line-highlights");
  if (!highlights) return;
  highlights.querySelectorAll(".curly-block-highlight").forEach((el) => el.remove());
}

function jumpToPartnerLine(textarea, targetLineNumber, wasOpener) {
  const text = textarea.value;
  const lines = text.split("\n");
  if (targetLineNumber < 1 || targetLineNumber > lines.length) return;

  let charPos = 0;
  for (let i = 0; i < targetLineNumber - 1; i++) {
    charPos += lines[i].length + 1;
  }
  const targetLineText = lines[targetLineNumber - 1] || "";
  const bracketIndex = wasOpener ? targetLineText.lastIndexOf("}") : targetLineText.indexOf("{");
  if (bracketIndex !== -1) {
    charPos += bracketIndex;
  }

  const wrapper = textarea.closest(".code-editor");
  const gutter = wrapper?.querySelector(".line-gutter");
  const targetGutterLine = gutter?.children[targetLineNumber - 1];
  const targetTop = targetGutterLine ? targetGutterLine.offsetTop : 0;
  const targetScrollTop = targetTop - textarea.clientHeight / 2 + (targetGutterLine ? targetGutterLine.offsetHeight / 2 : 0);
  textarea.scrollTo({
    top: Math.max(0, targetScrollTop),
    behavior: "smooth",
  });

  textarea.focus();
  try {
    textarea.setSelectionRange(charPos, charPos + 1);
  } catch (_) {}

  if (targetGutterLine) {
    targetGutterLine.classList.add("gutter-pulse");
    setTimeout(() => targetGutterLine.classList.remove("gutter-pulse"), 900);
  }
}

function initializeEditors() {
  document.querySelectorAll("textarea").forEach((textarea) => {
    const wrapper = document.createElement("div");
    const gutter = document.createElement("div");
    const highlights = document.createElement("div");
    const renderer = document.createElement("div");
    textarea.parentNode.insertBefore(wrapper, textarea);
    wrapper.appendChild(gutter);
    wrapper.appendChild(highlights);
    wrapper.appendChild(renderer);
    wrapper.appendChild(textarea);
    wrapper.className = "code-editor";
    gutter.className = "line-gutter";
    highlights.className = "line-highlights";
    renderer.className = "diff-render";
    textarea.dataset.lineGutter = "true";

    const refresh = () => {
      updateLineNumbers(textarea, gutter);

      if (textarea === diffLeft || textarea === diffRight) {
        clearDiffPane(textarea);
        state.diffText = "";
      }
    };
    textarea.addEventListener("input", refresh);
    textarea.addEventListener("scroll", () => {
      gutter.scrollTop = textarea.scrollTop;
      highlights.style.transform = `translateY(${-textarea.scrollTop}px)`;
      renderer.style.transform = `translateY(${-textarea.scrollTop}px)`;
    });

    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => {
        refresh();
      });
      ro.observe(textarea);
    } else {
      window.addEventListener("resize", refresh);
    }

    // Drag-and-drop file upload support directly onto any editor
    ["dragenter", "dragover"].forEach((evt) => {
      wrapper.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        wrapper.classList.add("editor-drag-over");
      });
    });
    ["dragleave", "drop"].forEach((evt) => {
      wrapper.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        wrapper.classList.remove("editor-drag-over");
      });
    });
    wrapper.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      wrapper.classList.remove("editor-drag-over");
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        await loadFileIntoEditor(file, textarea);
      }
    });

    gutter.addEventListener("click", (event) => {
      const btn = event.target.closest(".gutter-arrow[data-action='jump-curly']");
      if (!btn) return;
      event.stopPropagation();
      const partnerLine = Number(btn.dataset.partner);
      if (!partnerLine) return;
      jumpToPartnerLine(textarea, partnerLine, btn.dataset.type === "open");
    });

    gutter.addEventListener("mouseover", (event) => {
      const btn = event.target.closest(".gutter-arrow");
      if (!btn) return;
      const partnerLine = Number(btn.dataset.partner);
      const fromLine = Number(btn.dataset.line);
      const depth = Number(btn.dataset.depth);
      if (!partnerLine || !fromLine) return;

      highlightCurlyRange(textarea, Math.min(fromLine, partnerLine), Math.max(fromLine, partnerLine), depth);

      const partnerGutterLine = gutter.children[partnerLine - 1];
      if (partnerGutterLine) {
        const partnerBtn = partnerGutterLine.querySelector(`.gutter-arrow[data-partner="${fromLine}"]`);
        if (partnerBtn) {
          partnerBtn.classList.add("active-partner");
        }
      }
    });

    gutter.addEventListener("mouseout", (event) => {
      const btn = event.target.closest(".gutter-arrow");
      if (!btn) return;
      clearCurlyRange(textarea);
      gutter.querySelectorAll(".gutter-arrow.active-partner").forEach((el) => el.classList.remove("active-partner"));
    });

    refresh();
  });
}

function updateLineNumbers(textarea, gutter) {
  const text = textarea.value;
  const lines = text.split("\n");
  const lineTotal = Math.max(1, lines.length);

  // For massive files (> 4,000 lines), skip heavy character-by-character curly block parsing
  const isHuge = lineTotal > 4000;
  const { blockMap } = isHuge ? { blockMap: new Map() } : analyzeCurlyBlocks(text);

  const style = window.getComputedStyle(textarea);
  const paddingLeft = parseFloat(style.paddingLeft) || 14;
  const paddingRight = parseFloat(style.paddingRight) || 16;
  const contentWidth = Math.max(40, textarea.clientWidth - paddingLeft - paddingRight);
  const lineHeightPx = getEditorLineHeight(textarea) || 23.5;

  // Monospace character width estimate (~8.5px)
  const wrapThresholdChars = Math.floor(contentWidth / 8.5);

  // Only measure lines that could actually exceed the column width
  const linesToMeasure = [];
  for (let i = 0; i < lineTotal; i++) {
    const lineText = lines[i] || "";
    if (lineText.length > wrapThresholdChars) {
      linesToMeasure.push({ lineIndex: i, text: lineText });
    }
  }

  const measuredHeights = new Map();
  if (linesToMeasure.length > 0 && linesToMeasure.length < 1500) {
    const mirror = getMirrorContainer();
    mirror.style.width = `${contentWidth}px`;
    mirror.style.fontFamily = style.fontFamily;
    mirror.style.fontSize = style.fontSize;
    mirror.style.lineHeight = style.lineHeight;
    mirror.style.letterSpacing = style.letterSpacing;
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.wordBreak = "break-all";
    mirror.style.overflowWrap = "anywhere";
    mirror.style.boxSizing = "content-box";
    mirror.style.padding = "0";

    mirror.innerHTML = linesToMeasure
      .map(({ text }) => `<div style="margin:0;padding:0;min-height:${style.lineHeight};">${escapeHtml(text)}</div>`)
      .join("");

    const mirrorChildren = mirror.children;
    linesToMeasure.forEach(({ lineIndex }, idx) => {
      if (mirrorChildren[idx]) {
        measuredHeights.set(lineIndex, mirrorChildren[idx].offsetHeight);
      }
    });
  }

  // Cap DOM spans to 2,500 for massive files to prevent tab freezing
  const maxRenderLines = Math.min(lineTotal, 3000);
  let html = "";
  for (let lineNum = 1; lineNum <= maxRenderLines; lineNum++) {
    const blockData = blockMap.get(lineNum);
    let arrowHtml = "";

    if (blockData) {
      if (blockData.closers.length > 0) {
        const closer = blockData.closers[0];
        const color = getDepthColor(closer.depth);
        if (closer.openLine) {
          arrowHtml += `<button type="button" class="gutter-arrow arrow-close" style="color: ${color};" data-action="jump-curly" data-line="${lineNum}" data-partner="${closer.openLine}" data-depth="${closer.depth}" data-type="close" title="Closure of curly block on line ${closer.openLine} (Depth ${closer.depth}) • Click to jump to start" aria-label="Closure of block on line ${closer.openLine}, jump to line ${closer.openLine}">${ARROW_UP_SVG}</button>`;
        } else {
          arrowHtml += `<span class="gutter-arrow arrow-close unclosed" style="color: ${color};" title="Unmatched closure (Depth ${closer.depth})">${ARROW_UP_SVG}</span>`;
        }
      }

      if (blockData.openers.length > 0) {
        const opener = blockData.openers[0];
        const color = getDepthColor(opener.depth);
        if (opener.closeLine) {
          arrowHtml += `<button type="button" class="gutter-arrow arrow-open" style="color: ${color};" data-action="jump-curly" data-line="${lineNum}" data-partner="${opener.closeLine}" data-depth="${opener.depth}" data-type="open" title="Curly block start (Line ${lineNum} → Line ${opener.closeLine}, Depth ${opener.depth}) • Click to jump to closure" aria-label="Curly block depth ${opener.depth}, jump to line ${opener.closeLine}">${ARROW_DOWN_SVG}</button>`;
        } else {
          arrowHtml += `<span class="gutter-arrow arrow-open unclosed" style="color: ${color};" title="Unclosed curly block (Depth ${opener.depth})">${ARROW_DOWN_SVG}</span>`;
        }
      }
    }

    const lineH = measuredHeights.get(lineNum - 1);
    const heightStyle = lineH && lineH > lineHeightPx ? ` style="height: ${lineH}px; min-height: ${lineH}px;"` : "";

    html += `<span${heightStyle}><span class="gutter-num">${lineNum}</span><span class="gutter-arrow-slot">${arrowHtml}</span></span>`;
  }

  if (lineTotal > maxRenderLines) {
    html += `<span style="padding: 4px; font-size: 0.72rem; color: var(--muted); text-align: center;" title="${lineTotal.toLocaleString()} total lines">+${(lineTotal - maxRenderLines).toLocaleString()}</span>`;
  }

  gutter.innerHTML = html;
}

function refreshEditorNumbers(textarea) {
  const wrapper = textarea.closest(".code-editor");

  if (!wrapper) {
    return;
  }

  updateLineNumbers(textarea, wrapper.querySelector(".line-gutter"));
}

function initializeTheme() {
  const savedTheme = localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(savedTheme || (prefersDark ? "dark" : "light"));
}

function toggleTheme() {
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("theme", theme);
  themeLabel.textContent = theme === "dark" ? "Dark" : "Light";
  themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
  themeToggle.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} theme`);
}

function setActiveTool(tool) {
  state.activeTool = tool;
  const config = tools[tool];
  if (toolTitle) {
    toolTitle.textContent = config.title;
  }
  if (toolDescription) {
    toolDescription.textContent = config.description;
  }
  if (toolActions) {
    toolActions.innerHTML = config.actions
      .map(([label, action, variant = ""]) => {
        const isShare = action === "share";
        const classes = [variant, isShare ? "action-disabled" : ""].filter(Boolean).join(" ");
        const classAttr = classes ? ` class="${classes}"` : "";
        const disabledAttr = isShare ? ` disabled title="Sharing is temporarily disabled" aria-disabled="true"` : "";
        return `<button type="button"${classAttr} data-action="${action}"${disabledAttr}>${label}</button>`;
      })
      .join("");
  }

  toolCards.forEach((card) => card.classList.toggle("active", card.dataset.tool === tool));
  panels.forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === tool));

  const workspace = document.querySelector(".workspace");
  if (workspace) {
    workspace.dataset.activeTool = tool;
  }
}

function handleAction(action) {
  if (action === "share") {
    setStatus("neutral", "Sharing Disabled", "Sharing workspaces is temporarily paused.");
    return;
  }
  const handlers = {
    formatter: {
      format: formatJson,
      minify: minifyJson,
      copy: () => copyText(input.value, "Copied", "The formatter JSON is on your clipboard."),
      upload: () => selectUpload(input),
      download: () => downloadText(input.value, "formatted.json", "application/json"),
      share: shareWorkspace,
      clear: clearFormatter,
    },
    differ: {
      compare: compareJson,
      swap: swapDiff,
      copy: () => copyText(state.diffText, "Copied", "The diff result is on your clipboard."),
      share: shareWorkspace,
      "upload-left": () => selectUpload(diffLeft),
      "upload-right": () => selectUpload(diffRight),
      clear: clearDiff,
    },
    tree: {
      tree: renderTree,
      expand: () => setTreeOpen(true),
      collapse: () => setTreeOpen(false),
      upload: () => selectUpload(treeInput),
      copy: () => copyText(treeOutput.innerText, "Copied", "The tree text is on your clipboard."),
      share: shareWorkspace,
      clear: clearTree,
    },
    extract: {
      extract: extractJson,
      copy: () => copyText(extractOutput.textContent, "Copied", "The extracted output is on your clipboard."),
      download: () => downloadText(extractOutput.textContent, "extracted-json.txt", "text/plain"),
      upload: () => selectUpload(extractInput),
      share: shareWorkspace,
      clear: clearExtract,
    },
    curl: {
      curl: generateCurl,
      copy: () => copyText(curlOutput.textContent, "Copied", "The cURL command is on your clipboard."),
      download: () => downloadText(curlOutput.textContent, "request.sh", "text/plain"),
      upload: () => selectUpload(curlInput),
      share: shareWorkspace,
      clear: clearCurl,
    },
  };

  handlers[state.activeTool][action]();
}

function getIndent() {
  return indentSize.value === "tab" ? "\t" : Number(indentSize.value);
}

function parseFrom(textarea) {
  const raw = textarea.value.trim();

  if (!raw) {
    throw new Error("Paste some JSON first.");
  }

  return JSON.parse(raw);
}

function formatJson() {
  try {
    input.value = JSON.stringify(parseFrom(input), null, getIndent());
    setStatus("valid", "Valid JSON", "Your JSON has been formatted.");
  } catch (error) {
    setStatus("invalid", "Invalid JSON", error.message);
  }

  updateStats();
  refreshEditorNumbers(input);
}

function minifyJson() {
  try {
    input.value = JSON.stringify(parseFrom(input));
    setStatus("valid", "Valid JSON", "Your JSON has been minified.");
  } catch (error) {
    setStatus("invalid", "Invalid JSON", error.message);
  }

  updateStats();
  refreshEditorNumbers(input);
}

function compareJson() {
  try {
    const leftLines = JSON.stringify(parseFrom(diffLeft), null, 2).split("\n");
    const rightLines = JSON.stringify(parseFrom(diffRight), null, 2).split("\n");
    diffLeft.value = leftLines.join("\n");
    diffRight.value = rightLines.join("\n");
    refreshEditorNumbers(diffLeft);
    refreshEditorNumbers(diffRight);
    const diffRows = buildLineDiff(leftLines, rightLines);
    markDiffEditors(diffRows);
    state.diffText = buildDiffText(diffRows);
    setStatus("valid", "Diff ready", "Changes are marked in the original and changed editors.");
  } catch (error) {
    clearDiffMarks();
    state.diffText = "";
    setStatus("invalid", "Invalid JSON", error.message);
  }
}

function buildLineDiff(leftLines, rightLines) {
  // Fast prefix trimming (lines that are identical at start)
  let start = 0;
  while (start < leftLines.length && start < rightLines.length && leftLines[start] === rightLines[start]) {
    start++;
  }

  // Fast suffix trimming (lines that are identical at end)
  let leftEnd = leftLines.length - 1;
  let rightEnd = rightLines.length - 1;
  while (leftEnd >= start && rightEnd >= start && leftLines[leftEnd] === rightLines[rightEnd]) {
    leftEnd--;
    rightEnd--;
  }

  const rows = [];
  // Identical prefix lines
  for (let i = 0; i < start; i++) {
    rows.push({ type: "context", text: leftLines[i], oldNumber: i + 1, newNumber: i + 1 });
  }

  // Middle slice that actually differs
  const subLeft = leftLines.slice(start, leftEnd + 1);
  const subRight = rightLines.slice(start, rightEnd + 1);

  // If sub-slice is <= 1500 lines, compute matrix diff
  if (subLeft.length <= 1500 && subRight.length <= 1500) {
    const matrix = Array.from({ length: subLeft.length + 1 }, () => Array(subRight.length + 1).fill(0));
    for (let i = subLeft.length - 1; i >= 0; i--) {
      for (let j = subRight.length - 1; j >= 0; j--) {
        if (subLeft[i] === subRight[j]) {
          matrix[i][j] = 1 + matrix[i + 1][j + 1];
        } else {
          matrix[i][j] = Math.max(matrix[i + 1][j], matrix[i][j + 1]);
        }
      }
    }

    let i = 0;
    let j = 0;
    let oldNum = start + 1;
    let newNum = start + 1;
    while (i < subLeft.length && j < subRight.length) {
      if (subLeft[i] === subRight[j]) {
        rows.push({ type: "context", text: subLeft[i], oldNumber: oldNum++, newNumber: newNum++ });
        i++;
        j++;
      } else if (matrix[i + 1][j] >= matrix[i][j + 1]) {
        rows.push({ type: "removed", text: subLeft[i], oldNumber: oldNum++, newNumber: "" });
        i++;
      } else {
        rows.push({ type: "added", text: subRight[j], oldNumber: "", newNumber: newNum++ });
        j++;
      }
    }
    while (i < subLeft.length) {
      rows.push({ type: "removed", text: subLeft[i], oldNumber: oldNum++, newNumber: "" });
      i++;
    }
    while (j < subRight.length) {
      rows.push({ type: "added", text: subRight[j], oldNumber: "", newNumber: newNum++ });
      j++;
    }
  } else {
    // Large differing blocks: stream deletions then additions without matrix memory exhaustion
    subLeft.forEach((text, idx) => {
      rows.push({ type: "removed", text, oldNumber: start + idx + 1, newNumber: "" });
    });
    subRight.forEach((text, idx) => {
      rows.push({ type: "added", text, oldNumber: "", newNumber: start + idx + 1 });
    });
  }

  // Identical suffix lines
  let oldSuffixNum = leftEnd + 2;
  let newSuffixNum = rightEnd + 2;
  for (let i = leftEnd + 1; i < leftLines.length; i++) {
    rows.push({ type: "context", text: leftLines[i], oldNumber: oldSuffixNum++, newNumber: newSuffixNum++ });
  }

  return rows;
}

function markDiffEditors(rows) {
  const leftRenderRows = [];
  const rightRenderRows = [];

  rows.forEach((row) => {
    if (row.type === "removed") {
      leftRenderRows.push({ ...row, marker: "-", renderType: "removed" });
      rightRenderRows.push({ text: "", marker: "", renderType: "blank" });
      return;
    }

    if (row.type === "added") {
      leftRenderRows.push({ text: "", marker: "", renderType: "blank" });
      rightRenderRows.push({ ...row, marker: "+", renderType: "added" });
      return;
    }

    leftRenderRows.push({ ...row, marker: " ", renderType: "context" });
    rightRenderRows.push({ ...row, marker: " ", renderType: "context" });
  });

  renderDiffPane(diffLeft, leftRenderRows, "oldNumber");
  renderDiffPane(diffRight, rightRenderRows, "newNumber");
}

function renderDiffPane(textarea, rows, numberKey) {
  const wrapper = textarea.closest(".code-editor");
  const gutter = wrapper.querySelector(".line-gutter");
  const renderer = wrapper.querySelector(".diff-render");
  wrapper.classList.add("diff-mode");
  renderer.innerHTML = rows
    .map((row) => {
      return `<div class="diff-render-row ${row.renderType}"><span class="diff-render-marker">${row.marker}</span><span>${escapeHtml(row.text)}</span></div>`;
    })
    .join("");
  gutter.innerHTML = rows
    .map((row, i) => {
      const markClass = row.renderType === "added" || row.renderType === "removed" ? ` class="${row.renderType}"` : "";
      const rowEl = renderer.children[i];
      const hStyle = rowEl ? ` style="height: ${rowEl.offsetHeight}px; min-height: ${rowEl.offsetHeight}px;"` : "";
      return `<span${markClass}${hStyle}><span class="gutter-num">${row[numberKey] || ""}</span><span class="gutter-arrow-slot"></span></span>`;
    })
    .join("");
}

function applyLineMarks(textarea, lines, type) {
  const wrapper = textarea.closest(".code-editor");
  const gutter = wrapper.querySelector(".line-gutter");
  const highlights = wrapper.querySelector(".line-highlights");
  gutter.querySelectorAll(":scope > span").forEach((line) => {
    line.classList.remove("added", "removed");
  });
  highlights.innerHTML = "";

  lines.forEach((lineNumber) => {
    const line = gutter.children[lineNumber - 1];
    const mark = document.createElement("div");
    mark.className = `line-highlight ${type}`;
    mark.style.top = `${(lineNumber - 1) * getEditorLineHeight(textarea)}px`;

    if (line) {
      line.classList.add(type);
    }

    highlights.appendChild(mark);
  });
}

function clearDiffMarks() {
  [diffLeft, diffRight].forEach((textarea) => clearDiffPane(textarea));
}

function clearDiffPane(textarea) {
  const wrapper = textarea.closest(".code-editor");
  wrapper.classList.remove("diff-mode");
  wrapper.querySelector(".diff-render").innerHTML = "";
  refreshEditorNumbers(textarea);
  applyLineMarks(textarea, [], "added");
}

function getEditorLineHeight(textarea) {
  return Number.parseFloat(getComputedStyle(textarea).lineHeight);
}

function buildDiffText(rows) {
  if (rows.every((row) => row.type === "context")) {
    return "No differences found.";
  }

  return rows
    .map((row) => {
      const marker = row.type === "added" ? "+" : row.type === "removed" ? "-" : " ";
      return `${marker} ${row.text}`;
    })
    .join("\n");
}

function renderTree() {
  try {
    treeOutput.innerHTML = "";
    treeOutput.appendChild(buildTree(parseFrom(treeInput), "$"));
  } catch (error) {
    treeOutput.textContent = `Invalid JSON: ${error.message}`;
  }
}

function buildTree(value, label, depth = 1) {
  if (!isObjectLike(value)) {
    const span = document.createElement("span");
    const valType = typeof value;
    let typeClass = "val-primitive";
    if (valType === "string") typeClass = "val-string";
    else if (valType === "number") typeClass = "val-number";
    else if (valType === "boolean") typeClass = "val-boolean";
    else if (value === null) typeClass = "val-null";

    span.innerHTML = `<span class="json-key">${escapeHtml(label)}</span><span class="json-colon">:</span> <span class="json-value ${typeClass}">${escapeHtml(stringifyValue(value))}</span>`;
    return span;
  }

  const details = document.createElement("details");
  // Default open top 2 levels; defer deeper levels for ultra-fast large file rendering
  details.open = depth <= 2;
  const levelColor = getDepthColor(depth);
  details.style.setProperty("--tree-level-color", levelColor);
  const summary = document.createElement("summary");
  const isArr = Array.isArray(value);
  const count = isArr ? value.length : Object.keys(value).length;
  const bracket = isArr ? `[${count.toLocaleString()}]` : `{${count.toLocaleString()}}`;
  summary.innerHTML = `<span class="tree-key">${escapeHtml(label)}</span> <span class="tree-badge" style="color: ${levelColor};">${bracket}</span>`;
  details.appendChild(summary);

  let populated = false;
  const populateChildren = () => {
    if (populated) return;
    populated = true;
    const list = document.createElement("ul");
    list.style.borderLeftColor = `color-mix(in srgb, ${levelColor} 30%, transparent)`;

    const entries = Object.entries(value);
    const BATCH_SIZE = 120;
    const renderChunk = (startIdx) => {
      const chunk = entries.slice(startIdx, startIdx + BATCH_SIZE);
      chunk.forEach(([key, child]) => {
        const item = document.createElement("li");
        item.appendChild(buildTree(child, key, depth + 1));
        list.appendChild(item);
      });

      if (startIdx + BATCH_SIZE < entries.length) {
        const remaining = entries.length - (startIdx + BATCH_SIZE);
        const moreItem = document.createElement("li");
        moreItem.className = "tree-load-more";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "tree-batch-btn";
        btn.textContent = `+ Show more (${remaining.toLocaleString()} remaining)`;
        btn.onclick = (e) => {
          e.stopPropagation();
          moreItem.remove();
          renderChunk(startIdx + BATCH_SIZE);
        };
        moreItem.appendChild(btn);
        list.appendChild(moreItem);
      }
    };

    renderChunk(0);
    details.appendChild(list);
  };

  details._populate = populateChildren;

  if (depth <= 2) {
    populateChildren();
  } else {
    details.addEventListener(
      "toggle",
      () => {
        if (details.open) {
          populateChildren();
        }
      },
      { once: true }
    );
  }

  return details;
}

function extractJson() {
  try {
    const rows = [];
    walkJson(parseFrom(extractInput), "$", rows);
    const mode = extractMode.value;
    const output = rows.map((row) => {
      if (mode === "keys") return row.key;
      if (mode === "values") return stringifyValue(row.value);
      if (mode === "pairs") return `${row.path}: ${stringifyValue(row.value)}`;
      return row.path;
    });
    extractOutput.textContent = [...new Set(output)].join("\n");
  } catch (error) {
    extractOutput.textContent = `Invalid JSON: ${error.message}`;
  }
}

function walkJson(value, path, rows, depth = 0) {
  if (depth > 120) return; // Prevent call stack overflow on deeply nested JSON
  if (!isObjectLike(value)) {
    rows.push({ path, key: path.split(".").pop(), value });
    return;
  }

  Object.entries(value).forEach(([key, child]) => {
    const nextPath = Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`;
    rows.push({ path: nextPath, key, value: child });
    walkJson(child, nextPath, rows, depth + 1);
  });
}

function generateCurl() {
  try {
    const body = JSON.stringify(parseFrom(curlInput), null, 2);
    const command = [
      `curl -X ${curlMethod.value} "${curlUrl.value || "https://api.example.com/resource"}"`,
      '  -H "Content-Type: application/json"',
      `  -d '${body.replaceAll("'", "'\\''")}'`,
    ].join(" \\\n");
    curlOutput.textContent = command;
  } catch (error) {
    curlOutput.textContent = `Invalid JSON: ${error.message}`;
  }
}

function swapDiff() {
  const nextLeft = diffRight.value;
  diffRight.value = diffLeft.value;
  diffLeft.value = nextLeft;
  refreshEditorNumbers(diffLeft);
  refreshEditorNumbers(diffRight);
  clearDiffMarks();
  compareJson();
}

function setTreeOpen(open) {
  treeOutput.querySelectorAll("details").forEach((details) => {
    if (open && typeof details._populate === "function") {
      details._populate();
    }
    details.open = open;
  });
}

function selectUpload(target) {
  state.uploadTarget = target;
  fileInput.value = "";
  fileInput.click();
}

async function loadFileIntoEditor(file, textarea) {
  if (!file || !textarea) {
    return;
  }

  const fileSizeStr = formatBytes(file.size);
  setStatus("neutral", "Loading File...", `Reading ${file.name} (${fileSizeStr})...`);

  // Yield to UI to show status
  await new Promise((r) => setTimeout(r, 10));

  const t0 = performance.now();
  try {
    // Native modern fast asynchronous stream read in C++ engine
    const content = await file.text();
    const readMs = Math.round(performance.now() - t0);

    textarea.value = content;
    updateStats();

    // Yield before refreshing gutter lines
    await new Promise((r) => setTimeout(r, 0));
    refreshEditorNumbers(textarea);

    setStatus(
      "valid",
      "File Loaded",
      `Imported ${file.name} (${fileSizeStr}) in ${readMs}ms.`
    );
  } catch (err) {
    setStatus("invalid", "Upload Failed", `Could not read file: ${err.message}`);
  }
}

async function handleUpload() {
  const file = fileInput.files[0];

  if (!file || !state.uploadTarget) {
    return;
  }

  await loadFileIntoEditor(file, state.uploadTarget);
}

async function copyText(text, label, message) {
  if (!text.trim()) {
    setStatus("neutral", "Nothing to copy", "Run the current tool first.");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const fallback = document.createElement("textarea");
    fallback.value = text;
    document.body.appendChild(fallback);
    fallback.select();
    document.execCommand("copy");
    fallback.remove();
  }

  setStatus("valid", label, message);
}

function downloadText(text, filename, type) {
  if (!text.trim()) {
    setStatus("neutral", "Nothing to download", "Run the current tool first.");
    return;
  }

  const blob = new Blob([text], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1500);
  setStatus("valid", "Downloaded", `${filename} has been created.`);
}

async function shareWorkspace() {
  const link = createShareLink();

  try {
    await navigator.clipboard.writeText(link);
    setStatus("valid", "Share link copied", "Open the copied link to load this tool. JSON content is not included.");
  } catch {
    prompt("Copy this shareable workspace link:", link);
    setStatus("valid", "Share link ready", "The link loads this tool without including JSON content.");
  }
}

function createShareLink() {
  const url = new URL(window.location.href);
  url.hash = `tool=${state.activeTool}`;
  return url.toString();
}

function restoreSharedTool() {
  const hash = window.location.hash.slice(1);

  if (!hash.startsWith("tool=")) {
    setActiveTool("formatter");
    return;
  }

  const tool = decodeURIComponent(hash.replace("tool=", ""));
  setActiveTool(tool in tools ? tool : "formatter");
  setStatus("valid", "Tool loaded", "This shared link does not include JSON content.");
}

function clearFormatter() {
  input.value = "";
  setStatus("neutral", "Ready", "Paste JSON and press Format.");
  updateStats();
  refreshEditorNumbers(input);
}

function clearDiff() {
  diffLeft.value = "";
  diffRight.value = "";
  state.diffText = "";
  refreshEditorNumbers(diffLeft);
  refreshEditorNumbers(diffRight);
  clearDiffMarks();
}

function clearTree() {
  treeInput.value = "";
  treeOutput.textContent = "";
  refreshEditorNumbers(treeInput);
}

function clearExtract() {
  extractInput.value = "";
  extractOutput.textContent = "";
  refreshEditorNumbers(extractInput);
}

function clearCurl() {
  curlInput.value = "";
  curlOutput.textContent = "";
  refreshEditorNumbers(curlInput);
}

function setStatus(type, label, message) {
  statusCard.className = `status-card ${type}`;
  statusLabel.textContent = label;
  statusMessage.textContent = message;
}

function countLines(text) {
  if (!text) return 1;
  let count = 1;
  let pos = -1;
  while ((pos = text.indexOf("\n", pos + 1)) !== -1) {
    count++;
  }
  return count;
}

function updateStats() {
  const text = input.value;
  charCount.textContent = text.length.toLocaleString();
  lineCount.textContent = countLines(text).toLocaleString();
  if (text.length > 2000000) {
    byteSize.textContent = formatBytes(text.length);
  } else {
    byteSize.textContent = formatBytes(new Blob([text]).size);
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let size = bytes / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

function isObjectLike(value) {
  return value !== null && typeof value === "object";
}

function stringifyValue(value) {
  return typeof value === "string" ? `"${value}"` : JSON.stringify(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("`", "&#96;");
}
