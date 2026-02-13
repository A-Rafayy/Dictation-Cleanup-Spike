window.PICKLE_ENABLED = true;

const COMMANDS = {

    "scratch that": "",
    "delete that": "",
    "new paragraph": "\n\n",
    "new line": "\n"
}

const ACRONYMS = ["mri", "ct", "iv", "pt", "xr"];

const IS_DOCS = window.location.hostname.includes("docs.google.com");

// Visual Heartbeat (for testing)

function startCleanupSpike() {

    if (IS_DOCS) {
        console.log("Dictation Spike: Standing down on Google Docs for cursor safety.");
        return;
    }

    if (!document.body) {
        window.requestAnimationFrame(startCleanupSpike);
        return;
    }

    const heartbeat = document.createElement('div');
    heartbeat.id = "spike-heartbeat";
    heartbeat.style = "position: fixed; top: 20px; right: 20px; width: 12px; height: 12px; border-radius: 50%; z-index: 999999; transition: transform 0.2s, background 0.3s; border: 2px solid white; pointer-events: none; background: purple";
    heartbeat.style.display = window.PICKLE_ENABLED ? 'block' : 'none';
    document.body.appendChild(heartbeat);

    window.setHeartbeatFlash = () => {
        if (!window.PICKLE_ENABLED) return;
        heartbeat.style.background = "blue";
        setTimeout(() => {
            if (window.PICKLE_ENABLED) heartbeat.style.background = "purple";
        }, 500);
    }



    // The listeners
    let debounceTimer;

    // Toggle Listener (Ctrl+Shift+P)
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toUpperCase() === 'P') {
            window.PICKLE_ENABLED = !window.PICKLE_ENABLED;
            heartbeat.style.display = window.PICKLE_ENABLED ? 'block' : 'none';
            console.log("Pickle mode: ", window.PICKLE_ENABLED ? "Enabled" : "Disabled");
        }
    })

    document.addEventListener('input', (e) => {
        const target = e.target;

        if (target.matches('textarea, input, [contenteditable = "true"]')) {
            processText(target);

            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                runConservativeCleanup(target);
            }, 800);
        }
    });

    document.addEventListener('blur', (e) => {
        if (e.target.matches('textarea, input, [contenteditable="true"]')) {
            runConservativeCleanup(e.target);
        }
    }, true);
}


// The Moniter
function processText(element) {
    if (!window.PICKLE_ENABLED) {
        window.setHeartbeatFlash();
        return;
    }

    const currentText = element.isContentEditable ? element.innerText : element.value

    for (const [cmd, replacement] of Object.entries(COMMANDS)) {
        const commandRegex = new RegExp(`\\b${cmd}\\s*$`, "i");
        if (commandRegex.test(currentText)) {
            applyFix(element, cmd, replacement, false);
            break;
        }
        // if (currentText.toLowerCase().trim().endsWith(cmd)) {
        //     applyFix(element, cmd, replacement, false);
        //     break;
        // }
    }
}
// The Surgery (caret-safe)
function applyFix(el, trigger, replacement, isFullField = false) {

    if (document.activeElement !== el) {
        return;
    }

    const isEditable = el.isContentEditable;

    try {

        if (!isEditable) {
            const start = el.selectionStart;

            if (isFullField) {
                const oldLen = el.value.length;
                el.value = replacement;
                const offSet = replacement.length - oldLen;

                el.setSelectionRange(start + offSet, start + offSet);
            }
            else {
                const textBefore = el.value.slice(0, start);
                const cmdRegex = new RegExp(`\\b${trigger}\\s*$`, "i");
                const match = textBefore.match(cmdRegex);

                if (match) {
                    el.setRangeText(replacement, match.index, start, 'end');
                }
            }
            // el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        else {
            const selection = window.getSelection();

            if (!selection.rangeCount) {
                return;
            }
            const range = selection.getRangeAt(0);
            const node = range.startContainer;

            if (node.nodeType === Node.TEXT_NODE) {
                const currentOffset = range.startOffset;
                if (isFullField) {
                    node.textContent = replacement;
                    range.setStart(node, Math.min(currentOffset, replacement.length));
                    range.collapse(true);
                }
                else {
                    const text = node.textContent.slice(0, currentOffset);
                    const cmdRegex = new RegExp(`${trigger}\\s*$`, "i");
                    const match = text.match(cmdRegex);
                    if (match) {
                        const fixRange = document.createRange();
                        fixRange.setStart(node, match.index);
                        fixRange.setEnd(node, currentOffset);

                        fixRange.deleteContents();
                        const newTextNode = document.createTextNode(replacement);
                        fixRange.insertNode(newTextNode);

                        range.setStartAfter(newTextNode);
                        range.collapse(true);
                    }
                }
                selection.removeAllRanges();
                selection.addRange(range);
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }
    catch (e) {
        console.warn("Safe Edit Triggered: Protection check passed.")
    }
}
// Conservative Cleanup
function runConservativeCleanup(element) {

    if (!window.PICKLE_ENABLED || document.activeElement !== element) return;

    let text = element.isContentEditable ? element.innerText : element.value;
    let originalText = text;

    ACRONYMS.forEach(acr => {
        const regex = new RegExp(`\\b${acr}\\b`, 'gi');
        text = text.replace(regex, acr.toUpperCase());
    });

    text = text.replace(/  +/g, ' ');

    if (text !== originalText) {
        window.setHeartbeatFlash();
        applyFix(element, null, text, true);
    }
}

startCleanupSpike();