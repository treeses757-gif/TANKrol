import { db } from './firebase.js';
import { ref, get, set } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';

export function initAuth(components) {
    const {
        authScreen,
        lobbyScreen,
        loginForm,
        registerForm,
        showLoginBtn,
        showRegisterBtn,
        userNickSpan,
        logoutBtn,
        onLoginSuccess,
        onLogout
    } = components;

    function hashPassword(password) {
        return btoa(password);
    }

    if (showLoginBtn && showRegisterBtn) {
        showLoginBtn.addEventListener('click', () => {
            showLoginBtn.classList.add('active');
            showRegisterBtn.classList.remove('active');
            loginForm.classList.add('active');
            registerForm.classList.remove('active');
        });

        showRegisterBtn.addEventListener('click', () => {
            showRegisterBtn.classList.add('active');
            showLoginBtn.classList.remove('active');
            registerForm.classList.add('active');
            loginForm.classList.remove('active');
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nick = document.getElementById('register-username').value.trim();
            const password = document.getElementById('register-password').value;
            const confirm = document.getElementById('register-confirm').value;
            const errorDiv = document.getElementById('register-error');

            if (!nick) {
                errorDiv.textContent = 'Ник не может быть пустым';
                return;
            }
            if (password !== confirm) {
                errorDiv.textContent = 'Пароли не совпадают';
                return;
            }

            try {
                const userRef = ref(db, `users/${nick}`);
                const snapshot = await get(userRef);
                if (snapshot.exists()) {
                    errorDiv.textContent = 'Ник уже занят';
                    return;
                }
                await set(userRef, { password: hashPassword(password) });
                errorDiv.textContent = 'Регистрация успешна! Теперь войдите.';
                if (showLoginBtn) showLoginBtn.click();
                document.getElementById('register-username').value = '';
                document.getElementById('register-password').value = '';
                document.getElementById('register-confirm').value = '';
            } catch (err) {
                console.error(err);
                errorDiv.textContent = 'Ошибка регистрации';
            }
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nick = document.getElementById('login-username').value.trim();
            const password = document.getElementById('login-password').value;
            const errorDiv = document.getElementById('login-error');

            if (!nick) {
                errorDiv.textContent = 'Введите ник';
                return;
            }

            try {
                const userRef = ref(db, `users/${nick}`);
                const snapshot = await get(userRef);
                if (!snapshot.exists()) {
                    errorDiv.textContent = 'Пользователь не найден';
                    return;
                }
                const userData = snapshot.val();
                if (userData.password !== hashPassword(password)) {
                    errorDiv.textContent = 'Неверный пароль';
                    return;
                }
                localStorage.setItem('playerNick', nick);
                if (userNickSpan) userNickSpan.textContent = nick;
                if (authScreen) authScreen.classList.remove('active');
                if (lobbyScreen) lobbyScreen.classList.add('active');
                if (errorDiv) errorDiv.textContent = '';
                document.getElementById('login-username').value = '';
                document.getElementById('login-password').value = '';

                if (onLoginSuccess) onLoginSuccess(nick);
            } catch (err) {
                console.error(err);
                if (errorDiv) errorDiv.textContent = 'Ошибка входа';
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('playerNick');
            if (authScreen) authScreen.classList.add('active');
            if (lobbyScreen) lobbyScreen.classList.remove('active');
            const gameScreen = document.getElementById('game');
            if (gameScreen) gameScreen.classList.remove('active');
            const roomCodeDisplay = document.getElementById('roomCodeDisplay');
            if (roomCodeDisplay) roomCodeDisplay.textContent = '——';
            const copyBtn = document.getElementById('copyBtn');
            if (copyBtn) copyBtn.style.display = 'none';
            if (onLogout) onLogout();
        });
    }
}
