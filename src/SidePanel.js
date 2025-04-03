// SidePanel.js

// Wait for the DOM to be fully loaded before running script
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Loaded. Initializing Addon (Externally Hosted).');
  
    // Get references to DOM elements
    const processListElement = document.getElementById('process-list');
    const statusElement = document.getElementById('status');
    const errorElement = document.getElementById('error-message');
  
    // --- Helper Functions (same as before) ---
  
    function updateProcessList(processes) {
      processListElement.innerHTML = '';
      if (!processes || processes.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No matching processes found.';
        processListElement.appendChild(li);
      } else {
        processes.forEach(procName => {
          const li = document.createElement('li');
          li.textContent = procName;
          processListElement.appendChild(li);
        });
      }
    }
  
    function updateStatus(text) {
      statusElement.textContent = `Status: ${text}`;
    }
  
    function displayError(text) {
      if (text) {
        errorElement.textContent = text;
        errorElement.style.display = 'block';
      } else {
        errorElement.textContent = '';
        errorElement.style.display = 'none';
      }
    }
  
    // --- Meet Add-on SDK Initialization ---
    // if (window.MeetAddon) {
    if (window.meet.addon.MeetAddon) {
      try {
        const sdk = window.meet.addon.MeetAddon.register();
        console.log('Meet Add-on SDK Registered successfully.');
  
        sdk.onLoad(payload => {
          console.log('Addon loaded callback. Payload:', payload);
          // Send the 'addonOpened' message to the parent (content script)
          // The target origin MUST be the Meet window origin
          const meetOrigin = 'https://meet.google.com';
          console.log("Addon sending 'addonOpened' message to target:", meetOrigin);
          try {
              window.parent.postMessage({ type: 'addonOpened' }, meetOrigin);
              updateStatus('Connecting to extension...');
          } catch (e) {
              console.error("Error sending addonOpened message:", e);
              displayError("Failed to communicate with Meet page.");
              updateStatus("Initialization Error");
          }
        });
  
        // Add other SDK event listeners if needed
        // sdk.onMeetingInfoChanged(...)
  
      } catch (error) {
          console.error('Error registering Meet Add-on SDK:', error);
          displayError('Failed to initialize Meet Add-on SDK.');
          updateStatus('SDK Error');
          // Fallback attempt to notify opener even if SDK init fails
          try {
              const meetOrigin = 'https://meet.google.com';
              console.warn("SDK failed, trying to send 'addonOpened' anyway to:", meetOrigin);
              window.parent.postMessage({ type: 'addonOpened' }, meetOrigin);
              updateStatus('Connecting to extension (SDK failed)...');
          } catch (e) {
               console.error("Error sending addonOpened message after SDK failure:", e);
          }
      }
    } else {
        console.error('Meet Add-on SDK not found!');
        displayError('Meet Add-on SDK script failed to load.');
        updateStatus('SDK Load Error');
         // Fallback attempt to notify opener even if SDK script missing
         try {
              const meetOrigin = 'https://meet.google.com';
              console.warn("SDK missing, trying to send 'addonOpened' anyway to:", meetOrigin);
              window.parent.postMessage({ type: 'addonOpened' }, meetOrigin);
              updateStatus('Connecting to extension (SDK missing)...');
         } catch (e) {
              console.error("Error sending addonOpened message with SDK missing:", e);
         }
    }
  
  
    // --- postMessage Communication Logic ---
  
    function handleMessage(event) {
      // SECURITY CHECK: ALWAYS verify the origin of the sender
      const expectedOrigin = 'https://meet.google.com';
      if (event.origin !== expectedOrigin) {
          console.warn(`Ignoring message from unexpected origin: ${event.origin}. Expected '${expectedOrigin}'`);
          return; // Stop processing if origin doesn't match
      }
  
      console.log('Addon received message:', event.data, 'from origin:', event.origin);
      const message = event.data;
  
      displayError(null); // Clear previous error
  
      switch (message?.type) {
        case 'processUpdate':
          updateProcessList(message.data || []);
          updateStatus(`Monitoring active. Last update: ${new Date().toLocaleTimeString()}`);
          break;
        case 'daemonError':
          displayError(`Daemon Error: ${message.data}`);
          updateStatus('An error occurred.');
          updateProcessList([]);
          break;
        case 'daemonDisconnected':
          displayError(null);
          updateStatus('Daemon disconnected. Monitoring stopped.');
          updateProcessList([]);
          break;
        default:
          console.log('Addon received unknown message type:', message);
          break;
      }
    }
  
    // Add the event listener for messages from the parent window (Meet)
    window.addEventListener('message', handleMessage);
    console.log('Message listener added for parent communication.');
  
    // Cleanup listener on unload
    window.addEventListener('unload', () => {
       console.log('Addon unloading. Removing message listener.');
       window.removeEventListener('message', handleMessage);
    });
  
  }); // End DOMContentLoaded listener
