const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginToggle = document.getElementById('login-toggle');
const registerToggle = document.getElementById('register-toggle');
const errorMessage = document.getElementById('error-message');

loginToggle.addEventListener('click', () => {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    loginToggle.classList.add('active');
    registerToggle.classList.remove('active');
});

registerToggle.addEventListener('click', () => {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
    loginToggle.classList.remove('active');
    registerToggle.classList.add('active');
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
        const { token } = await res.json();
        localStorage.setItem('chat_token', token);
        window.location.href = '/index.html';
    } else {
        const { message } = await res.json();
        errorMessage.textContent = message;
    }
});

registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;
    const res = await fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
        errorMessage.textContent = 'Registration successful! Please log in.';
        loginToggle.click();
    } else {
        const { message } = await res.json();
        errorMessage.textContent = message;
    }
});