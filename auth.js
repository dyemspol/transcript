// ═══════════════════════════════════════════════════
// AUTHENTICATION LOGIC
// ═══════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    const authOverlay = document.getElementById('auth-overlay');
    const authForm = document.getElementById('auth-form');
    const authInput = document.getElementById('auth-password');
    const authError = document.getElementById('auth-error');
    
    // HARDCODED PASSWORD (Simple client-side protection)
    const SECRET_PASSWORD = 'admin'; 

    // Check if already authenticated in this session
    const isAuthenticated = sessionStorage.getItem('scribe_authenticated') === 'true';

    if (isAuthenticated) {
        unlockApp(false); // unlock immediately without animation
    } else {
        document.body.classList.add('locked');
        authInput.focus();
    }

    authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const pwd = authInput.value.trim();

        if (pwd === SECRET_PASSWORD) {
            sessionStorage.setItem('scribe_authenticated', 'true');
            authError.classList.remove('visible');
            unlockApp(true);
        } else {
            authError.textContent = 'Incorrect password. Please try again.';
            authError.classList.add('visible');
            authInput.value = '';
            authInput.focus();
            
            // Add a little shake animation to the card
            const card = document.querySelector('.auth-card');
            card.animate([
                { transform: 'translateX(0)' },
                { transform: 'translateX(-10px)' },
                { transform: 'translateX(10px)' },
                { transform: 'translateX(-10px)' },
                { transform: 'translateX(10px)' },
                { transform: 'translateX(0)' }
            ], { duration: 400, easing: 'ease-in-out' });
        }
    });

    function unlockApp(animate) {
        if (animate) {
            authOverlay.classList.add('unlocked');
            document.body.classList.remove('locked');
            setTimeout(() => {
                authOverlay.style.display = 'none';
            }, 500); // match CSS transition duration
        } else {
            authOverlay.style.display = 'none';
            document.body.classList.remove('locked');
        }
    }
});
