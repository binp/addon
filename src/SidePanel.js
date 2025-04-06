// SidePanel.js

import { meet } from '@googleworkspace/meet-addons/meet.addons';

const CLOUD_PROJECT_NUMBER = '331777483172';
// const SERVER_URL = 'https://script.google.com/macros/s/AKfycbywU92GLCsou63SWeD6SO5cMtk9un1JJ5bISqgEhYD4sSRBws3rwNOCNyuEwSi6yX6o/exec';
const SERVER_URL = 'https://script.google.com/macros/s/AKfycbydFolYPigaeJkuK9MwNIjaBqbmw3XLEUBcuY7pQi6Ym-S1wf5soSj1JsOMFJqIs3Qj/exec';

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
      console.log("This is in guest mode. Skip displaying process info in the side panel.");
      return; // Only host updates this list
    }

    processListElement.innerHTML = ''; // Clear list

    // Now guestProcessData is expected to be an array of strings
    if (guestProcessData && guestProcessData.length > 0) {
        guestProcessData.forEach(processString => {
            const li = document.createElement('li');
            li.textContent = processString || '-'; // Display process string or a placeholder
            processListElement.appendChild(li);
        });
        // Update status to show the count
        updateStatus(`Host mode listening. Displaying ${guestProcessData.length} processes.`);
    } else {
        // Display a message if the array is empty or not yet populated
        const li = document.createElement('li');
        li.textContent = 'Waiting for guest process data...';
        processListElement.appendChild(li);
        updateStatus('Host mode listening. Waiting for data...');
    }
  }

  // --- Mode Initialization (Called AFTER role selection) ---
  async function startSelectedMode(chosenIsHost) {
    if (roleSelected) {
      console.warn("Role already selected; no need to run this again.");
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
      console.log('Make sure the sidePanelClient has initialized...');
      // Use the stored sdkInstance from registerSdk()
      if (!sidePanelClient) {
        console.log("The addon session and side panel has not been initialed. doing now...")
        await setUpAddon();
      }
      console.log('The side panel has started/joined.');
      updateStatus(isHost ? 'Host mode listening.' : 'Guest mode ready to send.');

      if (isHost) {
        // HOST: Listen for broadcasts
        // Inside Host logic in startSelectedMode, after setting isHost=true
        let pollIntervalId = null;

        async function fetchGuestData() {
            console.log('Host fetching data...');
            // Default to an empty array, as we now expect an array of processes
            let newProcessList = []; 
            let startingState = null;

            try {
                // Await the promise from getActivityStartingState
                startingState = await sidePanelClient.getActivityStartingState(); 
                console.log('Got the starting state:', startingState);

                // Use optional chaining ?. to safely get additionalData string
                const rawData = startingState?.additionalData;

                if (rawData) {
                  try {
                    // Parse the raw data, expecting it to be the process array
                    const parsedData = JSON.parse(rawData);
                    // Validate that the parsed data is actually an array
                    if (Array.isArray(parsedData)) {
                        guestProcessData = parsedData;
                        console.log('Parsed guest process list:', guestProcessData);
                        updateHostProcessList(); // Update UI
                    } else {
                         console.warn('Parsed additionalData is not an array:', parsedData);
                    }
                  } catch (error) {
                    console.log("We have not got the data yet.")
                  }
                } else {
                    // Handle the case where additionalData string is missing
                    console.warn('startingState.additionalData is null or undefined.');
                }
            } catch (error) {
                // Handle potential errors from await or JSON.parse
                if (error instanceof SyntaxError) {
                    console.error('Failed to parse additionalData JSON:', error, 'Raw data:', startingState?.additionalData);
                } else {
                    console.error('Error fetching or processing starting state:', error);
                }
                // newProcessList remains the default []
            }
        }

        // Start polling
        fetchGuestData(); // Fetch immediately
        pollIntervalId = setInterval(fetchGuestData, 15000); // Fetch every 15 seconds (adjust interval as needed)

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

      // Send the process message to HTTP server.
      // Inside Guest logic, when processes are received from extension
      // const payload = {
      //   userId: ownUserInfo?.userSessionId || 'unknown_guest', // Get actual user ID from SDK
      //   userName: ownUserInfo?.displayName || 'Unknown Guest', // Get actual name from SDK
      //   processes: message.data || [] // Assuming message.data has the process list
      // };
      // I will just send the messaeg.data.
      console.log("Going to startActivity now...");
      sidePanelClient.startActivity({
        additionalData: JSON.stringify(message.data)
      });
      console.log("Done with startActivity now. sent the data: ", message.data);
      console.log("The addon in guest mode post the data to the backend server.");

      // if (collaboration) {
      //   // Use cod-doing API instead of collaboration.
      //   // In the guest mode, this will call coDoingClient.broadcastStateUpdate(bytes).
      //   const broadcastPayload = { type: 'processUpdate', processes: message.data || [] };
      //   collaboration.broadcast(broadcastPayload).then(() => {
      //     console.log('Process info broadcasted successfully.');
      //     updateStatus(`Process info sent (${broadcastPayload.processes.length}).`);
      //     guestStatusDetail.textContent = `Process info sent (${broadcastPayload.processes.length}). Waiting for next update...`;
      //   }).catch(err => {
      //     console.error('Error broadcasting process info:', err);
      //     displayError(`Failed to send process info: ${err.message || err}`);
      //     updateStatus('Broadcast Error');
      //     guestStatusDetail.textContent = 'Error sending process info.';
      //   });
      // } else {
      //   console.warn('Cannot broadcast: Collaboration session not ready.');
      //   displayError('Collaboration session not active. Cannot send data.');
      //   updateStatus('Collaboration Error');
      //   guestStatusDetail.textContent = 'Collaboration session not active.';
      // }
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
  // window.addEventListener('unload', () => { /* ... cleanup ... */ });
  // Remember to clear the interval on unload or if mode changes
  window.addEventListener('unload', () => {
    if (pollIntervalId) clearInterval(pollIntervalId);
  });


}); // End DOMContentLoaded listener

