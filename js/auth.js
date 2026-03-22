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

    // Переключение между формами
    if (showLoginBtn && showRegisterBtn) {
        showLoginBtn.addEventListener('click', () => {
            showLoginBtn.classList.add('active');
            showRegisterBtn.classList.remove('active');
            if (loginForm) loginForm.classList.add('active');
            if (registerForm) registerForm.classList.remove('active');
        });

        showRegisterBtn.addEventListener('click', () => {
            showRegisterBtn.classList.add('active');
            showLoginBtn.classList.remove('active');
            if (registerForm) registerForm.classList.add('active');
            if (loginForm) loginForm.classList.remove('active');
        });
    }

    // Регистрация
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nick = document.getElementById('register-username').value.trim();
            const password = document.getElementById('register-password').value;
            const confirm = document.getElementById('register-confirm').value;
            const errorDiv = document.getElementById('register-error');

            if (!nick) {
                if (errorDiv) errorDiv.textContent = 'Ник не может быть пустым';
                return;
            }
            if (password !== confirm) {
                if (errorDiv) errorDiv.textContent = 'Пароли не совпадают';
                return;
            }

            try {
                const userRef = ref(db, `users/${nick}`);
                const snapshot = await get(userRef);
                if (snapshot.exists()) {
                    if (errorDiv) errorDiv.textContent = 'Ник уже занят';
                    return;
                }
                await set(userRef, { password: hashPassword(password) });
                if (errorDiv) errorDiv.textContent = 'Регистрация успешна! Теперь войдите.';
                if (showLoginBtn) showLoginBtn.click();
                document.getElementById('register-username').value = '';
                document.getElementById('register-password').value = '';
                document.getElementById('register-confirm').value = '';
            } catch (err) {
                console.error(err);
                if (errorDiv) errorDiv.textContent = 'Ошибка регистрации';
            }
        });
    }

    // Вход
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nick = document.getElementById('login-username').value.trim();
            const password = document.getElementById('login-password').value;
            const errorDiv = document.getElementById('login-error');

            if (!nick) {
                if (errorDiv) errorDiv.textContent = 'Введите ник';
                return;
            }

            try {
                const userRef = ref(db, `users/${nick}`);
                const snapshot = await get(userRef);
                if (!snapshot.exists()) {
                    if (errorDiv) errorDiv.textContent = 'Пользователь не найден';
                    return;
                }
                const userData = snapshot.val();
                if (userData.password !== hashPassword(password)) {
                    if (errorDiv) errorDiv.textContent = 'Неверный пароль';
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

    // Выход из аккаунта
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
