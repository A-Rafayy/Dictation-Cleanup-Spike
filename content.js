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

document.addEventListener('input', (e) => {
    if (isProcessing) return;
    const target = e.target;
    if (!target.matches('textarea, input, [contenteditable="true"]')) return;

    // 1. COMMANDS (Instant)
    const fullText = target.isContentEditable ? target.innerText : target.value;
    for (const [cmd, rep] of Object.entries(COMMANDS)) {
        if (fullText.toLowerCase().trimEnd().endsWith(cmd)) {
            applyFix(target, cmd, rep);
            return;
        }
    }

    // 2. ACRONYMS (Delayed)
    clearTimeout(globalDebounceTimer);
    globalDebounceTimer = setTimeout(() => {
        applyGlobalAcronymFix(target);
    }, 700); // Slightly faster for better responsiveness
});

function applyGlobalAcronymFix(el) {
    if (isProcessing || !el.isContentEditable) return;
    isProcessing = true;

    const sel = window.getSelection();
    if (!sel.rangeCount) { isProcessing = false; return; }

    // Save Cursor State
    const range = sel.getRangeAt(0);
    const originalOffset = range.startOffset;
    const originalNode = range.startContainer;

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    let node;
    let anyChanges = false;

    while (node = walker.nextNode()) {
        let text = node.textContent;
        let modifiedText = text;

        ACRONYMS.forEach(acr => {
            // Updated Regex: Handles lowercase at start, middle, or end of string
            const regex = new RegExp(`\\b${acr}\\b`, "gi");
            modifiedText = modifiedText.replace(regex, (match) => {
                if (match !== acr.toUpperCase()) {
                    anyChanges = true;
                    return acr.toUpperCase();
                }
                return match;
            });
        });

        if (text !== modifiedText) {
            // We use textContent update here for speed in deep nodes, 
            // then restore the selection at the end.
            node.textContent = modifiedText;
        }
    }

    // Restore Selection if changes were made
    if (anyChanges) {
        try {
            const newRange = document.createRange();
            newRange.setStart(originalNode, originalOffset);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
        } catch (e) {
            // If the node was completely rebuilt by Gmail, stay at the end
        }
    }

    setTimeout(() => { isProcessing = false; }, 50);
}

function applyFix(el, trigger, replacement) {
    isProcessing = true;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) { isProcessing = false; return; }

    const range = sel.getRangeAt(0);
    
    try {
        // 1. Highlight the trigger word ("new line", etc.)
        range.setStart(sel.anchorNode, Math.max(0, sel.anchorOffset - trigger.length));
        sel.removeAllRanges();
        sel.addRange(range);

        // 2. Delete the trigger word
        document.execCommand('delete', false);
        
        // 3. Insert clean breaks based on the command
        if (replacement.includes("<br>")) {
            // "new line" = 1 break, "new paragraph" = 3 breaks
            const count = (replacement.match(/<br>/g) || []).length;
            for (let i = 0; i < count; i++) {
                document.execCommand('insertLineBreak', false);
            }
        } else {
            // For "scratch that", just leave it deleted
            document.execCommand('insertText', false, replacement);
        }
    } catch (err) {
        console.error("Command Error:", err);
    }
    
    setTimeout(() => { isProcessing = false; }, 50);
}