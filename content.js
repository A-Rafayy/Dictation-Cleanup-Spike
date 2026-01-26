window.PICKLE_ENABLED = true;

const COMMANDS = {

    "scratch that": "",
    "delete that": "",
    "new paragraph": "\n\n",
    "new line": "\n"
}

const ACRONYMS = ["mri", "ct", "iv", "pt", "xr"];

// Visual Heartbeat (for testing)

function startCleanupSpike() {
    if (!document.body) {
        window.requestAnimationFrame(startCleanupSpike);
        return;
    }

    const heartbeat = document.createElement('div');
    heartbeat.id = "spike-heartbeat";
    heartbeat.style = "position: fixed; top: 20px; right: 20px; width: 12px; height: 12px; border-radius: 50%; z-index: 999999; transition: transform 0.2s background 0.3s; border: 2px solid white; pointer-events: none;";
    heartbeat.style.display = window.PICKLE_ENABLED ? 'block' : 'none';
    console.log('helloooo');
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
        if (currentText.toLowerCase().trim().endsWith(cmd)) {
            applyFix(element, cmd, replacement, false);
            break;
        }
    }
}
// The Surgery (caret-safe)
function applyFix(el, trigger, replacement, isFullField = false) {

    const isEditable = el.isContentEditable;

    if (!isEditable) {
        const start = el.selectionStart;
        const end = el.selectionEnd;

        let newVal;

        if (isFullField) {
            newVal = replacement;
        } else {
            newVal = el.value.slice(0, start - trigger.length) + replacement + el.value.slice(end);
        }
        el.value = newVal;

        const newPos = isFullField ? start : start - trigger.length + replacement.length;
        el.setSelectionRange(newPos, newPos);

        el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    else {
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        const node = range.endContainer;

        if (isFullField) {
            el.innerText = replacement;
        } else if (node.nodeType === node.TEXT_NODE) {
            const regex = new RegExp(trigger + "\\s*$", "i");
            node.textContent = node.textContent.replace(regex, replacement);
            range.setStart(node, node.textContent.length);
            range.collapse(true);
        }


    }
}
// Conservative Cleanup
function runConservativeCleanup(element) {

    if (!window.PICKLE_ENABLED) return;

    const isEditable = element.isContentEditable;
    let text = isEditable ? element.innerText : element.value;
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