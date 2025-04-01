console.log("Addon Script: Running."); // Log for debugging

const statusDiv = document.getElementById('status');
const stringListUl = document.getElementById('string-list');

// 1. Send a message indicating the add-on script is ready
// This message will be picked up by the content script injected into this same iframe.
statusDiv.textContent = 'Sending ready message...';
try {
    // Using '*' for targetOrigin is generally acceptable when messaging within the same frame context,
    // but be mindful if your iframe source changes unexpectedly.
    window.postMessage({ type: "addon_script_ready", message: "Add-on UI is ready!" }, "*");
    console.log("Addon Script: Sent 'addon_script_ready' message.");
    statusDiv.textContent = 'Ready message sent. Waiting for list...';
} catch (error) {
    console.error("Addon Script: Error sending postMessage:", error);
    statusDiv.textContent = 'Error sending ready message.';
}


// 4. Listen for messages coming *from* the content script (forwarded from the background script)
window.addEventListener("message", (event) => {
    // Basic security check: ensure the message isn't from itself or an unexpected source
    // In this simple intra-iframe case, checking the type might suffice,
    // but checking event.source could be added for robustness if needed.
    // For communication *between* different frames, checking event.origin is critical.
    if (event.source !== window) {
       // console.log("Addon Script: Ignoring message from different source:", event.source);
       // return; // Commented out for simplicity in this example, but consider if needed.
    }

    if (event.data && event.data.type === "list_from_extension") {
        console.log("Addon Script: Received list from extension:", event.data.payload);
        statusDiv.textContent = 'Received list from extension:';

        const strings = event.data.payload;

        // Clear previous list items
        stringListUl.innerHTML = '';

        // Display the new list
        if (Array.isArray(strings) && strings.length > 0) {
            strings.forEach(str => {
                const li = document.createElement('li');
                li.textContent = str;
                stringListUl.appendChild(li);
            });
        } else {
            const li = document.createElement('li');
            li.textContent = '(Received empty list or invalid data)';
            stringListUl.appendChild(li);
        }
    } else {
        // Optional: Log messages not matching the expected type
        // console.log("Addon Script: Received other message type:", event.data?.type);
    }
});

console.log("Addon Script: Event listener added.");
