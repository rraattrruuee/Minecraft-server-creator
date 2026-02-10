// mcp_sounds.js
// Jouer de petits sons de notification via WebAudio

function playNotificationSound(type = "info") {
  if (!userPreferences?.soundEnabled) return;
  try {
    const audioContext = new (
      globalThis.AudioContext || globalThis.webkitAudioContext
    )();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    const frequencies = { success: 800, error: 300, warning: 500, info: 600 };
    oscillator.frequency.value = frequencies[type] || 600;
    oscillator.type = "sine";
    gainNode.gain.value = 0.1;
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.1);
  } catch (e) {
    console.warn("playSound: audio playback failed", e);
  }
}

function initSounds() {
  globalThis.playNotificationSound = playNotificationSound;
  globalThis._mcp_playNotificationSound = playNotificationSound;
}
