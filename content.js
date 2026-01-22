window.PICKLE_ENABLED = true;

const COMMANDS = {

    "scratch that": "",
    "delete that": "",
    "new paragraph": "\n\n",
    "new para": "\n\n",
    "new line": "\n"
}

function processText(element) {
    if (!window.PICKLE_ENABLED) return;

    const isEditable = element.isContentEditable;
    const val = isEditable ? element.innerText : element.value;

    for (const [cmd, replacement] of Object.entries(COMMANDS)) {
        if (val.toLowerCase().endsWith(cmd)) {
            applyFix(element, cmd, replacement);
            break;
        }
    }
}

function applyFix(el, trigger, replacement) {

    const isEditable = el.isContentEditable;

    if (!isEditable) {
        const start = el.selectionStart;

        const end = el.selectionEnd;

        const oldVal = el.value;

        const newVal = oldVal.slice(0, start - trigger.length) + replacement + oldVal.slice(end);

        el.value = newVal;

        const newPos = start - trigger.length + replacement.length;

        el.setSelectionRange(newPos, newPos);
    }
    else {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        const node = range.endContainer;

        node.textContent = node.textContent.replace(newRegExp(trigger + "$" + "i"), replacement);

        range.setStart(node, node.textContent.length);
        range.collapse(true);
    }
}

let debounceTimer;

document.addEventListener('input', (e) => {
    const target = e.target;

    if (target.matches('textarea, input, [contenteditable = "true"]')) {
        processText(target);

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            if (window.PICKLE_ENABLED) {
                console.log("idle cleanup: feasibility check passed.");
            }
        }, 800);
    }
});

document.addEventListener('blur', (e) => {
    if (e.target.matches('textarea, input, [contenteditable="true"]')) {
        console.log("Blur cleanup: Ready for pass 2 logic");
    }
}, true);