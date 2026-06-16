export function addSoundControls() {
    const music = document.getElementById('background-music');
    const toggleMusicBtn = document.getElementById('toggle-music');

    toggleMusicBtn.addEventListener('click', () => {
        if (music.paused) {
            music.play().then(() => {
                toggleMusicBtn.innerHTML = '<i class="fas fa-pause"></i>';
            }).catch(error => {
                console.log('Music playback failed:', error);
            });
        } else {
            music.pause();
            toggleMusicBtn.innerHTML = '<i class="fas fa-play"></i>';
        }
    });
}