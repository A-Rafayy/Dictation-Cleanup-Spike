window.PICKLE_ENABLED = true;

const DEBUG_MODE = true;

/* -----------------------------
   DEBUG LOGGER
----------------------------- */

function logDebug(label, data = {}) {
    if (!DEBUG_MODE) return;

    const sel = window.getSelection();
    let caretInfo = null;

    if (sel && sel.rangeCount) {
        const r = sel.getRangeAt(0);
        caretInfo = {
            node: r.startContainer?.nodeName,
            offset: r.startOffset
        };
    }

    console.log(`🧠 ${label}`, {
        time: new Date().toISOString(),
        caret: caretInfo,
        ...data
    });
}

/* -----------------------------
   STATE
----------------------------- */

let isProcessing = false;
let globalDebounceTimer = null;

const COMMANDS = {
    "scratch that": "",
    "delete that": "",
    "new paragraph": "<br><br><br>",
    "new line": "<br>"
};

const ACRONYMS = ["MRI", "CT", "IV", "PT", "XR"];

const CARET_STABILIZE_MS = 400;

let lastMouseDownAt = 0;
let lastSelectionChangeAt = 0;
let lastKeyCommitAt = 0;

/* -----------------------------
   CARET TRACKING
----------------------------- */

document.addEventListener("mousedown", () => {
    lastMouseDownAt = Date.now();
    logDebug("Mouse Down");
}, true);

document.addEventListener("selectionchange", () => {
    lastSelectionChangeAt = Date.now();
    logDebug("Selection Changed");
});

document.addEventListener("keydown", (e) => {
    if (
        e.key.length === 1 ||
        ["Enter", "Backspace", "Delete"].includes(e.key)
    ) {
        lastKeyCommitAt = Date.now();
        logDebug("Keyboard Commit", { key: e.key });
    }
}, true);

/* -----------------------------
   INPUT HANDLER
----------------------------- */

document.addEventListener("input", (e) => {
    logDebug("Input Event", { target: e.target?.tagName });

    if (!window.PICKLE_ENABLED || isProcessing) return;

    const target = getEditableTarget(e.target);
    if (!target) return;

    if (!isCaretStable()) {
        logDebug("Caret NOT Stable → Skip");
        return;
    }

    const command = getCommandAtCaret(target);

    if (command) {
        logDebug("Command Detected", { command: command.cmd });
        applyCommand(target, command.cmd, command.replacement);
        return;
    }

    clearTimeout(globalDebounceTimer);

    globalDebounceTimer = setTimeout(() => {
        if (!isProcessing && isCaretStable()) {
            logDebug("Acronym Fix Triggered");
            applySafeAcronymFix(target);
        }
    }, 600);

}, true);

/* -----------------------------
   HELPERS
----------------------------- */

function getEditableTarget(target) {
    if (!target) return null;

    if (target.matches?.("textarea, input")) return target;

    return target.closest?.('[contenteditable="true"]') || null;
}

function isCaretStable() {
    const now = Date.now();

    const recentMouse = now - lastMouseDownAt < CARET_STABILIZE_MS;
    const recentSelection = now - lastSelectionChangeAt < CARET_STABILIZE_MS;
    const keyboardCommitted = lastKeyCommitAt > lastMouseDownAt;

    if (keyboardCommitted) return true;
    if (!recentMouse && !recentSelection) return true;

    return false;
}

function getFreshSelectionInside(el) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;

    const range = sel.getRangeAt(0);

    if (!document.contains(range.startContainer)) return null;
    if (!el.contains(range.startContainer)) return null;

    return { sel, range };
}

/* -----------------------------
   COMMAND DETECTION
----------------------------- */

function getCommandAtCaret(el) {
    const entries = Object.entries(COMMANDS);

    if (!el.isContentEditable) {
        const start = el.selectionStart;
        if (start == null) return null;

        const text = el.value.slice(0, start);

        for (const [cmd, rep] of entries) {
            if (text.toLowerCase().endsWith(cmd)) {
                return { cmd, replacement: rep };
            }
        }
        return null;
    }

    const fresh = getFreshSelectionInside(el);
    if (!fresh) return null;

    const { range } = fresh;
    const node = range.startContainer;

    if (node.nodeType !== Node.TEXT_NODE) return null;

    const text = node.textContent.slice(0, range.startOffset);

    for (const [cmd, rep] of entries) {
        if (text.toLowerCase().endsWith(cmd)) {
            return { cmd, replacement: rep };
        }
    }

    return null;
}

/* -----------------------------
   COMMAND EXECUTION
----------------------------- */

function applyCommand(el, trigger, replacement) {
    logDebug("Applying Command", { trigger });

    isProcessing = true;

    try {
        if (!el.isContentEditable) {
            applyInputCommand(el, trigger, replacement);
        } else {
            applyContentEditableCommand(el, trigger, replacement);
        }
    } catch (e) {
        console.error(e);
    }

    setTimeout(() => {
        isProcessing = false;
    }, 80);
}

function applyContentEditableCommand(el, trigger, replacement) {
    const fresh = getFreshSelectionInside(el);
    if (!fresh) return;

    const { sel, range } = fresh;
    const node = range.startContainer;

    if (node.nodeType !== Node.TEXT_NODE) return;

    const offset = range.startOffset;
    const text = node.textContent;

    if (!text.toLowerCase().endsWith(trigger)) return;

    const start = offset - trigger.length;

    const deleteRange = document.createRange();
    deleteRange.setStart(node, start);
    deleteRange.setEnd(node, offset);

    sel.removeAllRanges();
    sel.addRange(deleteRange);

    document.execCommand("delete");

    if (replacement.includes("<br>")) {
        const count = (replacement.match(/<br>/g) || []).length;

        for (let i = 0; i < count; i++) {
            document.execCommand("insertLineBreak");
        }
    }

    logDebug("Command Inserted");
}

function applyInputCommand(el, trigger, replacement) {
    const start = el.selectionStart;
    if (start == null) return;

    const text = el.value.slice(0, start);

    if (!text.toLowerCase().endsWith(trigger)) return;

    const pos = start - trigger.length;

    el.setRangeText(replacement.replace(/<br>/g, "\n"), pos, start, "end");
}

/* -----------------------------
   SAFE ACRONYM FIX
----------------------------- */

function applySafeAcronymFix(el) {
    const fresh = getFreshSelectionInside(el);
    if (!fresh) return;

    const { range } = fresh;
    const node = range.startContainer;

    if (node.nodeType !== Node.TEXT_NODE) return;

    const text = node.textContent;
    let modified = text;

    ACRONYMS.forEach(acr => {
        const regex = new RegExp(`\\b${acr}\\b`, "gi");
        modified = modified.replace(regex, acr);
    });

    if (modified === text) return;

    // 🔒 ONLY modify if cursor is at end (safe zone)
    if (range.startOffset !== text.length) {
        logDebug("Acronym Fix Skipped (Not at End)");
        return;
    }

    node.textContent = modified;

    logDebug("Acronym Applied");
}

/* -----------------------------
   CARET JUMP DETECTION
----------------------------- */

let lastCaretSnapshot = null;

function detectCaretJump() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    const r = sel.getRangeAt(0);

    const current = {
        node: r.startContainer,
        offset: r.startOffset
    };

    if (
        lastCaretSnapshot &&
        current.node !== lastCaretSnapshot.node
    ) {
        logDebug("⚠️ CARET JUMP DETECTED", {
            from: lastCaretSnapshot,
            to: current
        });
    }

    lastCaretSnapshot = current;
}

setInterval(detectCaretJump, 300);