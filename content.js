window.PICKLE_ENABLED = true;

let isProcessing = false;
let globalDebounceTimer = null;

const COMMANDS = {
    "scratch that": "",
    "delete that": "",
    "new paragraph": "<br><br><br>",
    "new line": "<br>"
};

const ACRONYMS = ["MRI", "CT", "IV", "PT", "XR"];

const CARET_STABILIZE_MS = 300;
let lastMouseDownAt = 0;
let lastSelectionChangeAt = 0;
let lastKeyCommitAt = 0;

document.addEventListener("mousedown", () => {
    lastMouseDownAt = Date.now();
}, true);

document.addEventListener("selectionchange", () => {
    lastSelectionChangeAt = Date.now();
});

document.addEventListener("keydown", (e) => {
    const commitKeys = [
        "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
        "Backspace", "Delete", "Enter"
    ];

    if (
        commitKeys.includes(e.key) ||
        (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey)
    ) {
        lastKeyCommitAt = Date.now();
    }
}, true);

document.addEventListener("input", (e) => {
    if (!window.PICKLE_ENABLED || isProcessing) return;

    const target = getEditableTarget(e.target);
    if (!target) return;

    if (!isCaretStable()) return;

    const command = getCommandAtCaret(target);

    if (command) {
        applyFix(target, command.cmd, command.replacement);
        return;
    }

    clearTimeout(globalDebounceTimer);
    globalDebounceTimer = setTimeout(() => {
        if (!isProcessing && isCaretStable()) {
            applyLocalAcronymFix(target);
        }
    }, 500);
}, true);

function getEditableTarget(target) {
    if (!target) return null;

    if (target.matches?.("textarea, input")) {
        return target;
    }

    return target.closest?.('[contenteditable="true"]') || null;
}

function isCaretStable() {
    const now = Date.now();

    const recentMouseClick = now - lastMouseDownAt < CARET_STABILIZE_MS;
    const recentSelectionChange = now - lastSelectionChangeAt < CARET_STABILIZE_MS;
    const keyboardCommittedAfterClick = lastKeyCommitAt > lastMouseDownAt;

    if (keyboardCommittedAfterClick) return true;
    if (!recentMouseClick && !recentSelectionChange) return true;

    return false;
}

function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getFreshSelectionInside(el) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;

    const range = sel.getRangeAt(0);

    if (!document.contains(range.startContainer)) return null;
    if (!el.contains(range.startContainer)) return null;

    return { sel, range };
}

function getCommandAtCaret(el) {
    const commandEntries = Object.entries(COMMANDS).sort(
        (a, b) => b[0].length - a[0].length
    );

    if (!el.isContentEditable) {
        const start = el.selectionStart;
        if (typeof start !== "number") return null;

        const textBeforeCaret = el.value.slice(0, start);

        for (const [cmd, replacement] of commandEntries) {
            const regex = new RegExp(`(^|\\s)(${escapeRegex(cmd)})\\s*$`, "i");
            if (regex.test(textBeforeCaret)) {
                return { cmd, replacement };
            }
        }

        return null;
    }

    const fresh = getFreshSelectionInside(el);
    if (!fresh) return null;

    const { range } = fresh;
    const node = range.startContainer;

    if (node.nodeType !== Node.TEXT_NODE) return null;

    const textBeforeCaret = node.textContent.slice(0, range.startOffset);

    for (const [cmd, replacement] of commandEntries) {
        const regex = new RegExp(`(^|\\s)(${escapeRegex(cmd)})\\s*$`, "i");
        if (regex.test(textBeforeCaret)) {
            return { cmd, replacement };
        }
    }

    return null;
}

function applyFix(el, trigger, replacement) {
    if (!window.PICKLE_ENABLED || isProcessing) return;

    isProcessing = true;

    try {
        if (!el.isContentEditable) {
            applyInputFix(el, trigger, replacement);
        } else {
            applyContentEditableFix(el, trigger, replacement);
        }
    } catch (err) {
        console.error("Command Error:", err);
    }

    setTimeout(() => {
        isProcessing = false;
    }, 80);
}

function applyInputFix(el, trigger, replacement) {
    const start = el.selectionStart;
    const end = el.selectionEnd;

    if (typeof start !== "number" || typeof end !== "number") return;

    const textBeforeCaret = el.value.slice(0, start);
    const regex = new RegExp(`(^|\\s)(${escapeRegex(trigger)})\\s*$`, "i");
    const match = textBeforeCaret.match(regex);

    if (!match) return;

    const commandStart = match.index + match[1].length;
    const inputReplacement = replacement.replace(/<br>/g, "\n");

    el.setRangeText(inputReplacement, commandStart, start, "end");
    el.dispatchEvent(new Event("input", { bubbles: true }));
}

function applyContentEditableFix(el, trigger, replacement) {
    const fresh = getFreshSelectionInside(el);
    if (!fresh) return;

    const { sel, range } = fresh;
    const node = range.startContainer;

    if (node.nodeType !== Node.TEXT_NODE) return;

    const offset = range.startOffset;
    const textBeforeCaret = node.textContent.slice(0, offset);

    const regex = new RegExp(`(^|\\s)(${escapeRegex(trigger)})\\s*$`, "i");
    const match = textBeforeCaret.match(regex);

    if (!match) return;

    const commandStart = match.index + match[1].length;

    const deleteRange = document.createRange();
    deleteRange.setStart(node, commandStart);
    deleteRange.setEnd(node, offset);

    sel.removeAllRanges();
    sel.addRange(deleteRange);

    document.execCommand("delete", false);

    if (replacement.includes("<br>")) {
        const count = (replacement.match(/<br>/g) || []).length;

        for (let i = 0; i < count; i++) {
            document.execCommand("insertLineBreak", false);
        }
    } else if (replacement) {
        document.execCommand("insertText", false, replacement);
    }

    const afterSelection = window.getSelection();

    if (afterSelection && afterSelection.rangeCount) {
        const postInsertRange = afterSelection.getRangeAt(0).cloneRange();

        setTimeout(() => {
            if (!document.contains(postInsertRange.startContainer)) return;

            const liveSelection = window.getSelection();
            if (!liveSelection) return;

            liveSelection.removeAllRanges();
            liveSelection.addRange(postInsertRange);
        }, 0);
    }

    el.dispatchEvent(new Event("input", { bubbles: true }));
}

function applyLocalAcronymFix(el) {
    if (!window.PICKLE_ENABLED || isProcessing) return;

    isProcessing = true;

    try {
        if (!el.isContentEditable) {
            fixInputAcronyms(el);
        } else {
            fixContentEditableAcronyms(el);
        }
    } catch (err) {
        console.error("Acronym Fix Error:", err);
    }

    setTimeout(() => {
        isProcessing = false;
    }, 50);
}

function fixInputAcronyms(el) {
    const start = el.selectionStart;
    const end = el.selectionEnd;

    if (typeof start !== "number" || typeof end !== "number") return;

    const windowSize = 250;
    const from = Math.max(0, start - windowSize);
    const before = el.value.slice(0, from);
    let targetText = el.value.slice(from, start);
    const after = el.value.slice(start);

    const original = targetText;

    ACRONYMS.forEach((acr) => {
        const regex = new RegExp(`\\b${acr}\\b`, "gi");
        targetText = targetText.replace(regex, acr);
    });

    if (targetText === original) return;

    el.value = before + targetText + after;

    const offsetDiff = targetText.length - original.length;
    const newPos = start + offsetDiff;

    el.setSelectionRange(newPos, newPos);
    el.dispatchEvent(new Event("input", { bubbles: true }));
}

function fixContentEditableAcronyms(el) {
    const fresh = getFreshSelectionInside(el);
    if (!fresh) return;

    const { sel, range } = fresh;
    const node = range.startContainer;

    if (node.nodeType !== Node.TEXT_NODE) return;

    const originalText = node.textContent;
    let modifiedText = originalText;

    ACRONYMS.forEach((acr) => {
        const regex = new RegExp(`\\b${acr}\\b`, "gi");
        modifiedText = modifiedText.replace(regex, acr);
    });

    if (modifiedText === originalText) return;

    const liveOffset = range.startOffset;

    node.textContent = modifiedText;

    const safeOffset = Math.min(liveOffset, node.textContent.length);

    const newRange = document.createRange();
    newRange.setStart(node, safeOffset);
    newRange.collapse(true);

    sel.removeAllRanges();
    sel.addRange(newRange);

    el.dispatchEvent(new Event("input", { bubbles: true }));
}