// SidePanel.js

import { meet } from '@googleworkspace/meet-addons/meet.addons';
import { initializeApp } from 'firebase/app';
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider, FacebookAuthProvider, signInWithPopup, onAuthStateChanged } from "firebase/auth";

const CLOUD_PROJECT_NUMBER = '331777483172';
const SERVER_URL = 'https://helloworld-331777483172.us-west1.run.app/processes';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAr5BXnNexqOGuVoXikWZS4hSUKFh8cmDA",
  authDomain: "interview-proctor.firebaseapp.com",
  databaseURL: "https://interview-proctor-default-rtdb.firebaseio.com",
  projectId: "interview-proctor",
  storageBucket: "interview-proctor.firebasestorage.app",
  messagingSenderId: "124879970402",
  appId: "1:124879970402:web:80ce4ae7b862d6be7db13b",
  measurementId: "G-1SCPSVG9F2"
};

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Loaded. Initializing Addon with Role Selection and Timeline.');

  // --- DOM References ---
  const statusElement = document.getElementById('status');
  const errorElement = document.getElementById('error-message');
  const bodyElement = document.body;
  const roleSelectionDiv = document.getElementById('role-selection');
  const hostButton = document.getElementById('host-button');
  // Social login buttons
  const loginSectionDiv = document.getElementById('login-section');
  const loginGoogleButton = document.getElementById('login-google');
  const loginFacebookButton = document.getElementById('login-facebook');
  const loginMicrosoftButton = document.getElementById('login-microsoft');
  const loginErrorMessage = document.getElementById('login-error-message');


  const guestButton = document.getElementById('guest-button');
  // const guestStatusDetail = document.getElementById('guest-status-detail');
  // Guest UI Elements
  const guestConnectionStatusDiv = document.getElementById('guest-connection-status'); // New status div
  const extensionLink = document.getElementById('extension-link'); // Link element
  const daemonLink = document.getElementById('daemon-link'); // Link element
  // Host UI Elements
  const hostGuestName = document.getElementById('host-guest-name');
  const hostOverallStatusIcon = document.getElementById('host-overall-status-icon');
  const hostLastUpdate = document.getElementById('host-last-update');
  const hostProcessesSection = document.getElementById('host-processes-section');
  const hostProcessesStatus = document.getElementById('host-processes-status');
  const hostProcessesList = document.getElementById('host-processes-list');
  const hostTabsSection = document.getElementById('host-tabs-section');
  const hostTabsStatus = document.getElementById('host-tabs-status');
  const hostTabsList = document.getElementById('host-tabs-list');
  const hostScreenshotSection = document.getElementById('host-screenshot-section');
  const hostScreenshotStatus = document.getElementById('host-screenshot-status');
  const hostScreenshotDetails = document.getElementById('host-screenshot-details');
  const hostTimelineSection = document.getElementById('host-timeline-section'); // New Timeline Section
  const hostTimelineList = document.getElementById('host-timeline-list'); // New Timeline List UL

  // --- State Variables (same as before) ---
  let isHost = false;
  let roleSelected = false;
  let session = null;
  let sidePanelClient = null;
  let meetingInfo = null;
  let currentGuestData = null; // Store data for the single guest
  let pollIntervalId = null; // For host polling

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);
  // Initialize Firebase Authentication and get a reference to the service
  const auth = getAuth(app);
  const googleProvider = new GoogleAuthProvider();
  const facebookProvider = new FacebookAuthProvider();
  // TODO: Add MS Provider

  // Create the session and side panel client and hold on them.
  async function setUpAddon() {
    if (session == null) {
      session = await meet.addon.createAddonSession({
        cloudProjectNumber: CLOUD_PROJECT_NUMBER,
      });  
    }
    if (sidePanelClient == null) {
      sidePanelClient = await session.createSidePanelClient();
      meetingInfo = await sidePanelClient.getMeetingInfo();
      console.log("Meeting ID:", meetingInfo.meetingId);
      console.log("Meeting Code:", meetingInfo.meetingCode);
    }
  }

  // --- Helper Functions (updateStatus, displayError, updateHostProcessList - same as before) ---
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

  /** Safely formats list items to prevent HTML injection */
  function createListItem(text) {
    const li = document.createElement('li');
    li.textContent = text; // Use textContent for safety
    return li;
  }

  /** Updates the Host dashboard based on currentGuestData (CandidateInfo format) */
  function updateHostDashboard() {
    if (!isHost || !roleSelected) return;

    // --- Reset UI if no data ---
    if (!currentGuestData) {
      hostGuestName.textContent = 'Guest: ---';
      hostOverallStatusIcon.textContent = '⚪';
      hostOverallStatusIcon.className = 'status-icon unknown';
      hostLastUpdate.textContent = 'Last Update: Waiting for guest...';
      // Reset detail sections
      hostProcessesStatus.textContent = '---'; hostProcessesStatus.className = 'status-text unknown'; hostProcessesList.innerHTML = '';
      hostTabsStatus.textContent = '---'; hostTabsStatus.className = 'status-text unknown'; hostTabsList.innerHTML = '';
      hostScreenshotStatus.textContent = '---'; hostScreenshotStatus.className = 'status-text unknown'; hostScreenshotDetails.textContent = '';
      hostTimelineList.innerHTML = '<li><i>Waiting for guest data...</i></li>';
      // Ensure sections are hidden initially or when data is cleared
      hostProcessesSection.style.display = 'none';
      hostTabsSection.style.display = 'none';
      hostScreenshotSection.style.display = 'none';
      hostTimelineSection.style.display = 'none';
      return;
    }

    // --- Update Header ---
    // Use guestName and collectionTime from CandidateInfo
    hostGuestName.textContent = `Guest: ${currentGuestData.userName || 'Unknown'}`;
    hostLastUpdate.textContent = `Last Update: ${currentGuestData.collectionTime ? new Date(currentGuestData.collectionTime).toLocaleString() : 'N/A'}`; // Use toLocaleString for date+time

    // --- Determine Overall Status ---
    // Start with 'ok', escalate based on findings.
    // Consider the daemon's reported status and error first.
    let overallStatus = 'ok'; // ok, warning, alert
    let overallIcon = '🟢';
    let overallIconClass = 'ok';

    if (currentGuestData.error) {
        overallStatus = 'alert'; // Daemon reported an error
        displayError(`Guest Daemon Error: ${currentGuestData.error}`); // Show daemon error prominently
    } else if (currentGuestData.status && currentGuestData.status !== 'ok' && currentGuestData.status !== 'success') {
        // If daemon status is something other than ok/success, treat as warning (adjust as needed)
        overallStatus = 'warning';
        displayError(null); // Clear previous error if status is just a warning now
    } else {
        displayError(null); // Clear error message if status is ok
    }


    // --- Process Status ---
    const flaggedProcesses = currentGuestData.flaggedProcesses || [];
    hostProcessesList.innerHTML = ''; // Clear previous list
    if (flaggedProcesses.length > 0) {
      hostProcessesStatus.textContent = 'FLAGGED';
      hostProcessesStatus.className = 'status-text warning'; // Treat flagged processes as warning
      flaggedProcesses.forEach(proc => {
          const detail = `${proc.processName} (PID: ${proc.pid || 'N/A'})${proc.title ? ` - ${proc.title}` : ''}`;
          hostProcessesList.appendChild(createListItem(detail));
      });
      hostProcessesSection.style.display = 'block';
      if (overallStatus === 'ok') overallStatus = 'warning'; // Escalate overall status if needed
    } else {
       hostProcessesStatus.textContent = 'OK';
       hostProcessesStatus.className = 'status-text ok';
       hostProcessesList.innerHTML = '<li><i>No flagged processes.</i></li>';
       hostProcessesSection.style.display = 'block'; // Keep section visible even if OK
    }

    // --- Tabs Status ---
    const flaggedTabs = currentGuestData.flaggedTabs || [];
    hostTabsList.innerHTML = ''; // Clear previous list
    if (flaggedTabs.length > 0) {
      hostTabsStatus.textContent = 'FLAGGED';
      hostTabsStatus.className = 'status-text warning'; // Treat flagged tabs as warning
      flaggedTabs.forEach(tab => {
          const detail = `${tab.title || 'Untitled Tab'} - ${tab.url || 'N/A'}`;
          hostTabsList.appendChild(createListItem(detail));
      });
      hostTabsSection.style.display = 'block';
      if (overallStatus === 'ok') overallStatus = 'warning'; // Escalate overall status
    } else {
      hostTabsStatus.textContent = 'OK';
      hostTabsStatus.className = 'status-text ok';
      hostTabsList.innerHTML = '<li><i>No restricted tabs detected.</i></li>';
      hostTabsSection.style.display = 'block'; // Keep section visible even if OK
    }

    // --- Screenshot Status ---
    const screenshots = currentGuestData.screenshot || [];
    hostScreenshotDetails.textContent = ''; // Clear previous details
    if (screenshots.length > 0) {
        hostScreenshotStatus.textContent = 'CAPTURED';
        hostScreenshotStatus.className = 'status-text ok'; // Screenshots themselves aren't necessarily bad
        screenshots.forEach(ss => {
            const detail = `Display ${ss.displayId || 'N/A'}: ${ss.imageSize || ss.originalSize || 'Size unknown'} (${ss.format || 'format unknown'})`;
            // NOTE: Displaying the actual image (ss.imageData) would require creating an <img> tag
            // and setting its src to `data:image/${ss.format};base64,${ss.imageData}`.
            // Be cautious with performance if images are large or frequent.
            // For now, just listing details:
            const p = document.createElement('p');
            p.textContent = detail;
            hostScreenshotDetails.appendChild(p);
        });
        hostScreenshotSection.style.display = 'block';
        // Screenshots don't usually change overall status unless there's a specific rule
    } else {
        hostScreenshotStatus.textContent = 'N/A';
        hostScreenshotStatus.className = 'status-text unknown';
        hostScreenshotDetails.textContent = 'No screenshots received in this update.';
        hostScreenshotSection.style.display = 'block'; // Keep section visible
    }


    // --- Update Timeline (Adapted) ---
    // Use collectionTime and status/error for a simple log entry
    hostTimelineList.innerHTML = ''; // Clear previous timeline (or prepend for history)
    const timestamp = currentGuestData.collectionTime ? new Date(currentGuestData.collectionTime).toLocaleTimeString() : 'No timestamp';
    let logEntry = `Update received. Status: ${currentGuestData.status || 'N/A'}.`;
    if (currentGuestData.error) {
        logEntry += ` Error: ${currentGuestData.error}`;
    } else {
        const issues = [];
        if (flaggedProcesses.length > 0) issues.push(`${flaggedProcesses.length} flagged process(es)`);
        if (flaggedTabs.length > 0) issues.push(`${flaggedTabs.length} flagged tab(s)`);
        if (issues.length > 0) {
            logEntry += ` Issues: ${issues.join(', ')}.`;
        } else {
            logEntry += ` No issues detected.`;
        }
    }

    const li = document.createElement('li');
    const timestampSpan = document.createElement('span');
    const descriptionSpan = document.createElement('span');
    timestampSpan.className = 'timestamp';
    timestampSpan.textContent = `[${timestamp}]`;
    descriptionSpan.className = 'description';
    descriptionSpan.textContent = logEntry; // Use textContent
    li.appendChild(timestampSpan);
    li.appendChild(descriptionSpan);
    hostTimelineList.appendChild(li); // Consider prepending: hostTimelineList.prepend(li);
    hostTimelineSection.style.display = 'block';


    // --- Finalize Overall Status Icon ---
    // Set icon based on the final overallStatus determined above
    if (overallStatus === 'alert') {
        overallIcon = '🔴'; overallIconClass = 'alert';
    } else if (overallStatus === 'warning') {
        overallIcon = '🟡'; overallIconClass = 'warning';
    } else { // ok
        overallIcon = '🟢'; overallIconClass = 'ok';
    }
    hostOverallStatusIcon.textContent = overallIcon;
    hostOverallStatusIcon.className = `status-icon ${overallIconClass}`;
  }

  // --- Function to Fetch the CandidateInfo Data from the candidate side for Host ---
  async function fetchHostData() {
    if (!isHost || !roleSelected || !meetingInfo?.meetingId){
      console.warn("Host fetch skipped: Conditions not met (isHost, roleSelected, meetingId).");
      // Optionally clear the dashboard if conditions aren't met
      // currentGuestData = null;
      // updateHostDashboard();
      return;
    }

    const meetingIdToFetch = meetingInfo.meetingId; // Use the meetingId obtained from the addon session
    console.log(`Host fetching data for meetingId: ${meetingIdToFetch}...`);
    updateStatus('Host mode fetching data...');

    // Construct the URL with the query parameter
    const url = new URL(SERVER_URL);
    url.searchParams.append('meetingId', meetingIdToFetch); // Use 'meetingId' as per backend handler

    try {
        const response = await fetch(url.toString(), {
            method: 'GET',
            mode: 'cors',
            cache: 'no-cache'
        });

        if (!response.ok) {
            // Handle specific errors like 404 (meeting not found) differently?
            // For now, treat all non-ok statuses as errors.
            throw new Error(`HTTP error ${response.status}`);
        }

        const meetingData = await response.json(); // This should be the map { userId: CandidateInfo, ... }
        console.log(`Host received data for meeting ${meetingIdToFetch}:`, meetingData);

        // Check if the response is a valid object
        if (typeof meetingData === 'object' && meetingData !== null) {
          const userIds = Object.keys(meetingData);

          if (userIds.length > 0) {
              // --- Displaying the *first* guest's data ---
              const firstUserId = userIds[0];
              currentGuestData = meetingData[firstUserId]; // Get the CandidateInfo for the first guest
              console.log(`Displaying data for first candidate found: ${firstUserId}`);

              updateHostDashboard(); // Update UI with the first guest's data
              updateStatus(`Host mode listening. Displaying data for ${currentGuestData.userName || firstUserId}. Last fetch: ${new Date().toLocaleTimeString()}`);
          } else {
              // Meeting exists, but no guests have sent data yet
              console.log(`No guest data found for meeting ${meetingIdToFetch} yet.`);
              currentGuestData = null; // Clear previous data if any
              updateHostDashboard(); // Update UI to show "Waiting for guest..." state
              updateStatus(`Host mode listening. Waiting for guest data in meeting ${meetingIdToFetch}...`);
          }
        } else {
          // This case should ideally not happen if the backend sends {} for non-existent meetings
          // or an empty map {} if the meeting exists but has no guests.
          console.error('Received unexpected data format from server:', meetingData);
          throw new Error('Invalid data format received from server');
        }
      } catch (error) {
        console.error(`Error fetching data for meeting ${meetingIdToFetch}:`, error);
        displayError(`Network error fetching data: ${error.message}`);
        updateStatus('Network Error (GET)');
        // Optionally clear the dashboard on error
        // currentGuestData = null;
        // updateHostDashboard();
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
    bodyElement.className = 'role-selected ' + (isHost ? 'host-mode' : 'guest-mode'); // Set body class

    if (meetingInfo) {
      console.log("meetingId: ", meetingInfo.meetingId, " meetingCode: ", meetingInfo.meetingCode);
    } else {
      console.log("meetingInfo is still null");
    }

    updateStatus('Initializing codoing session...');
    try {
      console.log('Make sure the sidePanelClient has initialized...');
      // Use the stored sdkInstance from registerSdk()
      if (!sidePanelClient) {
        console.log("The addon session and side panel has not been initialed. doing now...")
        await setUpAddon();
      }
      console.log('The side panel has started/joined.');
      // updateStatus(isHost ? 'Host mode listening.' : 'Guest mode ready to send.');

      // For role selected.
      // Set visibility of main content.
      bodyElement.classList.add('role-selected'); // Update class to include 'role-selected'

      if (isHost) {
        sidePanelClient.startActivity({
          sidePanelUrl: "https://binp.github.io/addon/src/SidePanel.html"
        });
        // Inside Host logic in startSelectedMode, after setting isHost=true
        // Inside Host logic in startSelectedMode, after setting isHost=true
        updateStatus('Host mode active. Fetching initial data...');
        updateHostDashboard();
        // Start polling
        fetchHostData(); // Fetch immediately
        if (!pollIntervalId) pollIntervalId = setInterval(fetchHostData, 15000); // Fetch every 15 seconds (adjust interval as needed)
      } else {
        // GUEST: Send 'addonOpened' message to the window.top.
         const meetOrigin = 'https://meet.google.com';
         console.log("Guest sending 'addonOpened' message to target:", meetOrigin);
         window.top.postMessage({ type: 'addonOpened' }, meetOrigin);

         // Set initial guest status text.  
         guestConnectionStatusDiv.textContent = 'Status: Waiting for connection from extension...';
         updateStatus('Guest mode active.');

        // Set placeholder links (REPLACE with actual URLs)
        extensionLink.href = 'https://binp.github.io'; // TODO: Replace with Chrome Web Store link
        daemonLink.href = 'https://binp.github.io'; // TODO: Replace with Daemon download link
      }

    } catch (err) {
      console.error('Error starting collaboration:', err);
      displayError(`Collaboration failed: ${err.message || err}`);
      updateStatus('Collaboration Error');
      roleSelected = false;    // Allow re-selection?
      bodyElement.className = ''; // Reset mode classes
    }
  }

  // --- Message Handler (for communication FROM Content Script TO Addon) ---
  function handleMessage(event) {
    const expectedOrigin = 'https://meet.google.com';
    if (event.origin !== expectedOrigin) { return; }

    const message = event.data;
    console.log('Addon received message from parent window:', message);

    // GUESTS process messages from the extension
    if (!isHost && roleSelected && message?.type === 'proctorUpdate') {
      console.log('Guest received process update from extension:', message.payload);
      // Update connection status
      guestConnectionStatusDiv.textContent = `Status: Connected (Last update: ${new Date().toLocaleTimeString()})`;
      updateStatus(`Process info received (${message.payload?.length || 0}). Sending to server...`);

      // TODO(binp): Figure out how to get the user name and user ID.
      // Inside Guest logic, when processes are received from extension
      const candidateInfo = message.payload.candidateInfo
      candidateInfo.userId = 'binp000001';  // No way to get the real user ID.
      candidateInfo.userName = 'Binbin Peng';  // No way to get the user name.
      candidateInfo.meetingId = meetingInfo.meetingId;
      candidateInfo.meetingCode = meetingInfo.meetingCode;

      console.log('Send the payload to the backend server: ', candidateInfo)
      fetch(SERVER_URL, {
        method: 'POST',
        mode: 'cors', // Required for cross-origin requests
        cache: 'no-cache',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(candidateInfo)
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
            console.log('Successfully POSTed data to server:', data);
            updateStatus(`Guest info sent.`);
            guestConnectionStatusDiv.textContent = `Guest info sent. Waiting for next update...`;
        } else {
            console.error('Server returned error:', data.error);
            guestConnectionStatusDiv.textContent = `Status: Error sending data! ${data.error}`;
            updateStatus('Server Error (POST)');
        }
      })
      .catch(error => {
        console.error('Error POSTing data to server:', error);
        // displayError(`Network error sending data: ${error.message}`);
        updateStatus('Network Error (POST)');
        guestConnectionStatusDiv.textContent = 'Error sending process info.';
      });
    } else if (!isHost && roleSelected && (message?.type === 'daemonError' || message?.type === 'daemonDisconnected')) {
       console.warn('Received daemon status from extension:', message.type, message.data);
       // displayError(`Extension reported: ${message.type} ${message.data || ''}`);
       updateStatus('Extension Error');
       guestConnectionStatusDiv.textContent = `Extension reported an error: ${message.type}.`;
    }
  }

  // --- Firebase Auth Listeners ---
  // Listen to the state change in the auth to know if user is signed in or not.
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // User is signed in, see docs for a list of available properties
      // https://firebase.google.com/docs/reference/js/auth.user
      console.log('User is signed in:', user);
      displayLoginError(null);
      bodyElement.classList.add('logged-in'); // Show role selection
      // Proceed to initialize the addon
      await setUpAddon();
      // Show the role-selection
      roleSelectionDiv.style.display = 'block';
      // Set default value of the status
      updateStatus('Please select your role above.');
    } else {
      // User is signed out
      console.log('User is signed out');
      bodyElement.classList.remove('logged-in'); // Hide role selection
      loginSectionDiv.style.display = 'block'; // Make sure login is visible
    }
  });

  // Helper to show/hide login error messages
  function displayLoginError(text) {
    if (text) {
      loginErrorMessage.textContent = text;
      loginErrorMessage.style.display = 'block';
    } else {
      loginErrorMessage.textContent = '';
      loginErrorMessage.style.display = 'none';
    }
  }

  // Handle Google Sign-In
  loginGoogleButton.addEventListener('click', () => {
    signInWithPopup(auth, googleProvider)
      .then((result) => {
        // This gives you a Google Access Token. You can use it to access the Google API.
        // const credential = GoogleAuthProvider.credentialFromResult(result);
        // const token = credential.accessToken;
        const user = result.user;
        console.log('Google sign-in successful:', user);
      }).catch((error) => {
        console.error('Google sign-in error:', error);
        displayLoginError('Google login failed. ' + error.message);
      });
  });

  // Handle Facebook Sign-In
  loginFacebookButton.addEventListener('click', () => {
    signInWithPopup(auth, facebookProvider)
      .then((result) => {
        // const credential = FacebookAuthProvider.credentialFromResult(result);
        // const token = credential.accessToken;
        const user = result.user;
        console.log('Facebook sign-in successful:', user);
      }).catch((error) => {
        console.error('Facebook sign-in error:', error);
        displayLoginError('Facebook login failed. ' + error.message);
      });
  });

  // TODO: Handle Microsoft Sign-In

  // --- Initialization & Event Listeners ---
  hostButton.addEventListener('click', () => startSelectedMode(true));
  guestButton.addEventListener('click', () => startSelectedMode(false));
  window.addEventListener('message', handleMessage);
  setUpAddon(); // Complete the set up of the addon and create session, and sidePanelClient.

  // Remember to clear the interval on unload or if mode changes

  window.addEventListener('unload', () => {
    window.removeEventListener('message', handleMessage);
    if (pollIntervalId) clearInterval(pollIntervalId);   // Clear polling on unload
  });

}); // End DOMContentLoaded listener

