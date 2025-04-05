// SidePanel.js

import {
  meet,
  CoDoingState,
} from '@googleworkspace/meet-addons/meet.addons';

const CLOUD_PROJECT_NUMBER = '331777483172';

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Loaded. Initializing Addon with Role Selection (npm package).');

  // --- DOM References (same as before) ---
  const processListElement = document.getElementById('process-list');
  const statusElement = document.getElementById('status');
  const errorElement = document.getElementById('error-message');
  const bodyElement = document.body;
  const roleSelectionDiv = document.getElementById('role-selection');
  const hostButton = document.getElementById('host-button');
  const guestButton = document.getElementById('guest-button');
  const guestStatusDetail = document.getElementById('guest-status-detail');

  // --- State Variables (same as before) ---
  let isHost = false;
  let roleSelected = false;
  let session = null;
  let sidePanelClient = null;
  let coDoingClient = null;
  const guestProcessData = {};

  // --- Helper Functions (updateStatus, displayError, updateHostProcessList - same as before) ---
  async function setUpAddon() {
    if (session == null) {
      session = await meet.addon.createAddonSession({
        cloudProjectNumber: CLOUD_PROJECT_NUMBER,
      });  
    }
    if (sidePanelClient == null) {
      sidePanelClient = await session.createSidePanelClient();
    }
    if (coDoingClient == null) {
      coDoingClient = await session.createCoDoingClient({
        activityTitle: "Proctor Monitoring",
        onCoDoingStateChanged(coDoingState) {
          guestProcessData = JSON.parse(new TextDecoder().decode(coDoingState.bytes));
          // Update the guestProcessInfo on the sidePanel for host mode only.
          console.log("Recevied the guest process information: ", guestProcessData);
          updateHostProcessList();
        },
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

  /** Updates the list displayed by the host */
  function updateHostProcessList() {
    if (!isHost) {
      console.log("This is in guest mode. Skip to display the process information in the side panel.");
      return; // Only host updates this list
    }

    processListElement.innerHTML = ''; // Clear list
    let count = 0;
    for (const userId in guestProcessData) {
      const data = guestProcessData[userId];
      const li = document.createElement('li');
      // Display name and processes, handle cases where processes might be missing/empty
      const processString = (data.processes && data.processes.length > 0)
                             ? data.processes.join(', ')
                             : '<i>No processes reported</i>';
      li.innerHTML = `<b>${data.name || 'Guest ' + userId.substring(0, 4)}:</b> ${processString}`;
      processListElement.appendChild(li);
      count++;
    }
    if (count === 0) {
      const li = document.createElement('li');
      li.textContent = 'Waiting for guest data...';
      processListElement.appendChild(li);
    }
  }

  // --- Mode Initialization (Called AFTER role selection) ---
  async function startSelectedMode(chosenIsHost) {
    if (roleSelected || !coDoingClient) {
      console.warn("Role already selected or SDK not ready.");
      return;
    }
    roleSelected = true;
    isHost = chosenIsHost;

    console.log(`Role selected: ${isHost ? 'Host' : 'Guest'}`);
    displayError(null);
    bodyElement.classList.add('role-selected');
    bodyElement.classList.add(isHost ? 'host-mode' : 'guest-mode');

    updateStatus('Initializing codoing session...');
    try {
      console.log('Starting/Joining collaboration...');
      // Use the stored sdkInstance from registerSdk()
      if (coDoingClient == null) {
        await setUpAddon();
      }
      console.log('Collaboration started/joined.');
      updateStatus(isHost ? 'Host mode listening.' : 'Guest mode ready to send.');

      if (isHost) {
        // HOST: Listen for broadcasts
        // TODO: please use coDoingClinet API.
        updateHostProcessList(); // Initial render
      } else {
        // GUEST: Send 'addonOpened' message to the window.top.
         const meetOrigin = 'https://meet.google.com';
         console.log("Guest sending 'addonOpened' message to target:", meetOrigin);
         window.top.postMessage({ type: 'addonOpened' }, meetOrigin);
         updateStatus('Guest mode active. Waiting for process info from extension.');
         guestStatusDetail.textContent = 'Waiting for process info from extension...';
      }

    } catch (err) {
      console.error('Error starting collaboration:', err);
      displayError(`Collaboration failed: ${err.message || err}`);
      updateStatus('Collaboration Error');
      roleSelected = false;
      bodyElement.className = ''; // Reset mode classes
    }
  }

  // --- Message Handler (for communication FROM Content Script TO Addon - same logic) ---
  function handleMessage(event) {
    const expectedOrigin = 'https://meet.google.com';
    if (event.origin !== expectedOrigin) { return; }

    const message = event.data;
    console.log('Addon received message from parent window:', message);

    // GUESTS process messages from the extension
    if (!isHost && roleSelected && message?.type === 'processUpdate') {
      console.log('Guest received process update from extension:', message.data);
      guestStatusDetail.textContent = `Sending process info (${message.data?.length || 0})...`;
      displayError(null);

      if (collaboration) {
        // Use cod-doing API instead of collaboration.
        // In the guest mode, this will call coDoingClient.broadcastStateUpdate(bytes).
        const broadcastPayload = { type: 'processUpdate', processes: message.data || [] };
        collaboration.broadcast(broadcastPayload).then(() => {
          console.log('Process info broadcasted successfully.');
          updateStatus(`Process info sent (${broadcastPayload.processes.length}).`);
          guestStatusDetail.textContent = `Process info sent (${broadcastPayload.processes.length}). Waiting for next update...`;
        }).catch(err => {
          console.error('Error broadcasting process info:', err);
          displayError(`Failed to send process info: ${err.message || err}`);
          updateStatus('Broadcast Error');
          guestStatusDetail.textContent = 'Error sending process info.';
        });
      } else {
        console.warn('Cannot broadcast: Collaboration session not ready.');
        displayError('Collaboration session not active. Cannot send data.');
        updateStatus('Collaboration Error');
        guestStatusDetail.textContent = 'Collaboration session not active.';
      }
    } else if (!isHost && roleSelected && (message?.type === 'daemonError' || message?.type === 'daemonDisconnected')) {
       console.warn('Received daemon status from extension:', message.type, message.data);
       displayError(`Extension reported: ${message.type} ${message.data || ''}`);
       updateStatus('Extension Error');
       guestStatusDetail.textContent = `Extension reported an error: ${message.type}.`;
    }
  }

  // --- Initialization & Event Listeners ---
  hostButton.addEventListener('click', () => startSelectedMode(true));
  guestButton.addEventListener('click', () => startSelectedMode(false));
  window.addEventListener('message', handleMessage);
  setUpAddon(); // Complete the set up of the addon and create session, sidePanelClient and coDoingClient.
  window.addEventListener('unload', () => { /* ... cleanup ... */ });

}); // End DOMContentLoaded listener

