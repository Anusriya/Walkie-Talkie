const socket = io();
const roomSelect = document.getElementById('room-select');
const joinButton = document.getElementById('join-button');
const talkButton = document.getElementById('talk-button');
const audioPlayer = document.getElementById('audio-player');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const roomStatus = document.getElementById('room-status');
const visualizerCanvas = document.getElementById('visualizer');
const canvasCtx = visualizerCanvas.getContext('2d');

// Audio visualization variables
let audioContext;
let analyser;
let dataArray;
let animationId;
let isVisualizing = false;

// Set initial canvas size
function setCanvasSize() {
  visualizerCanvas.width = visualizerCanvas.offsetWidth;
  visualizerCanvas.height = visualizerCanvas.offsetHeight;
}
setCanvasSize();

// Initialize audio context and analyzer
function initAudioAnalyser() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    
    // Configure analyzer
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -10;
    
    // Create data array
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    // Connect audio player to analyzer
    const source = audioContext.createMediaElementSource(audioPlayer);
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    
    // Start visualization
    startVisualization();
  }
}

// Start visualization
function startVisualization() {
  if (isVisualizing) return;
  isVisualizing = true;
  drawVisualizer();
}

// Stop visualization
function stopVisualization() {
  isVisualizing = false;
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
  clearCanvas();
}

// Clear canvas
function clearCanvas() {
  canvasCtx.fillStyle = 'rgb(20, 20, 30)';
  canvasCtx.fillRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
}

// Visualization drawing function
function drawVisualizer() {
  if (!isVisualizing || !analyser) return;
  
  animationId = requestAnimationFrame(drawVisualizer);
  
  // Update canvas size if needed
  if (visualizerCanvas.width !== visualizerCanvas.offsetWidth || 
      visualizerCanvas.height !== visualizerCanvas.offsetHeight) {
    setCanvasSize();
  }
  
  // Get frequency data
  analyser.getByteFrequencyData(dataArray);
  
  // Clear canvas
  clearCanvas();
  
  // Draw frequency bars
  const barWidth = (visualizerCanvas.width / analyser.frequencyBinCount) * 2.5;
  let x = 0;
  
  for (let i = 0; i < analyser.frequencyBinCount; i++) {
    // Only draw every 2nd bar for better performance
    if (i % 2 === 0) {
      const barHeight = (dataArray[i] / 255) * visualizerCanvas.height;
      
      // Create gradient for each bar
      const hue = i * 360 / analyser.frequencyBinCount;
      const gradient = canvasCtx.createLinearGradient(0, 0, 0, visualizerCanvas.height);
      gradient.addColorStop(0, `hsla(${hue}, 100%, 50%, 0.8)`);
      gradient.addColorStop(1, `hsla(${hue}, 100%, 20%, 0.6)`);
      
      canvasCtx.fillStyle = gradient;
      canvasCtx.fillRect(
        x,
        visualizerCanvas.height - barHeight,
        barWidth,
        barHeight
      );
    }
    
    x += barWidth + 1;
  }
}

// Room and connection management
let currentRoom = roomSelect.value;
let mediaRecorder;
let audioChunks = [];

function updateStatus(connected) {
  statusIndicator.className = connected ? 'status-indicator connected' : 'status-indicator disconnected';
  statusText.textContent = connected ? 'Connected' : 'Disconnected';
}

function updateRoomStatus(joined) {
  roomStatus.textContent = joined ? `Room: ${currentRoom} FM` : 'Not in a room';
  roomStatus.className = joined ? '' : 'text-muted';
}

// Socket.io events
socket.on('connect', () => updateStatus(true));
socket.on('disconnect', () => updateStatus(false));

// UI Event Listeners
joinButton.addEventListener('click', () => {
  currentRoom = roomSelect.value;
  socket.emit('joinRoom', currentRoom);
  updateRoomStatus(true);
});

// Push-to-Talk functionality
talkButton.addEventListener('mousedown', startRecording);
talkButton.addEventListener('touchstart', (e) => {
  e.preventDefault();
  startRecording();
});
talkButton.addEventListener('mouseup', stopRecording);
talkButton.addEventListener('touchend', (e) => {
  e.preventDefault();
  stopRecording();
});
talkButton.addEventListener('mouseleave', stopRecording);

function startRecording() {
  talkButton.classList.add('recording');
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      mediaRecorder.start();
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunks.push(e.data);
        }
      };
    })
    .catch(err => {
      console.error('Microphone access denied:', err);
      talkButton.classList.remove('recording');
    });
}

function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    talkButton.classList.remove('recording');
    return;
  }
  
  mediaRecorder.stop();
  mediaRecorder.stream.getTracks().forEach(track => track.stop());
  
  mediaRecorder.onstop = () => {
    const audioBlob = new Blob(audioChunks, { type: 'audio/ogg; codecs=opus' });
    const reader = new FileReader();
    reader.onload = () => {
      socket.emit('audio', {
        room: currentRoom,
        audio: reader.result
      });
      audioChunks = [];
    };
    reader.readAsDataURL(audioBlob);
    talkButton.classList.remove('recording');
  };
}

// Handle incoming audio
socket.on('audio', (data) => {
  if (data.room === currentRoom) {
    audioPlayer.src = data.audio;
    
    // Initialize audio context on first playback
    if (!audioContext) {
      initAudioAnalyser();
    } else if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    
    audioPlayer.play().catch(e => console.error('Audio playback failed:', e));
  }
});

// Initialize visualization when page loads
startVisualization();

// Handle window resize
window.addEventListener('resize', setCanvasSize);

// Clean up resources
window.addEventListener('beforeunload', () => {
  stopVisualization();
  if (audioContext) {
    audioContext.close();
  }
});