// app.js - النسخة الآمنة مع التشفير الاختياري للبيانات الحساسة
(() => {
    // ===== تهيئة المتغيرات العالمية =====
    let playlistData = { channels: [], movies: [], series: [] };
    let currentCategory = 'channels';
    let currentMethod = 'm3u'; 
    let savedProfiles = [];
    const MASTER_KEY_STORAGE = 'iptv_master_key'; // مفتاح التشفير المشتق (ليس كلمة المرور نفسها!)

    // ===== دوال التشفير الآمن (Web Crypto API) =====
    async function encryptText(text, password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const salt = crypto.getRandomValues(new Uint8Array(16));
        
        const keyMaterial = await crypto.subtle.importKey(
            'raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']
        );
        const key = await crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false, ['encrypt']
        );
        
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            data
        );
        
        return btoa(String.fromCharCode(...new Uint8Array(salt))) + 
               '.' + 
               btoa(String.fromCharCode(...new Uint8Array(iv))) + 
               '.' + 
               btoa(String.fromCharCode(...new Uint8Array(encrypted)));
    }

    async function decryptText(encryptedText, password) {
        try {
            const [saltB64, ivB64, dataB64] = encryptedText.split('.');
            if (!saltB64 || !ivB64 || !dataB64) throw new Error('تنسيق البيانات غير صحيح');
            
            const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
            const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
            const data = Uint8Array.from(atob(dataB64), c => c.charCodeAt(0));
            
            const keyMaterial = await crypto.subtle.importKey(
                'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
            );
            const key = await crypto.subtle.deriveKey(
                { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false, ['decrypt']
            );
            
            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                key,
                data
            );
            return new TextDecoder().decode(decrypted);
        } catch (error) {
            throw new Error('فشل في فك التشفير - تأكد من صحة كلمة المرور الرئيسية');
        }
    }

    // ===== دوال إدارة البروفايلات =====
    function saveProfilesToStorage() {
        localStorage.setItem('iptv_profiles', JSON.stringify(savedProfiles));
    }

    function loadProfilesFromStorage() {
        const data = localStorage.getItem('iptv_profiles');
        if (data) {
            try {
                savedProfiles = JSON.parse(data);
            } catch (e) {
                console.error('خطأ في تحليل بيانات البروفايلات:', e);
                savedProfiles = [];
            }
        }
        renderProfiles();
    }

    async function saveAndLoad() {
        const profileNameInput = document.getElementById('profileName');
        const name = profileNameInput.value.trim();
        if (!name) return alert('الرجاء كتابة اسم للبروفايل أولاً لحفظه.');

        let masterKey = sessionStorage.getItem(MASTER_KEY_STORAGE);
        if (!masterKey) {
            masterKey = prompt('يرجى إدخال كلمة مرور رئيسية لحماية بروفايلاتك (سيتم تذكرها لهذه الجلسة):');
            if (!masterKey) return;
            sessionStorage.setItem(MASTER_KEY_STORAGE, masterKey);
        }

        const newProfile = { 
            id: Date.now(), 
            name: name, 
            type: currentMethod 
        };

        if (currentMethod === 'm3u') {
            const url = document.getElementById('m3uUrl').value.trim();
            if (!url) return alert('الرجاء إدخال رابط M3U');
            newProfile.url = url;
        } else {
            const host = document.getElementById('xtreamHost').value.trim();
            const user = document.getElementById('xtreamUser').value.trim();
            const pass = document.getElementById('xtreamPass').value.trim();
            if (!host || !user || !pass) return alert('الرجاء ملء جميع خانات Xtream');

            try {
                newProfile.host = await encryptText(host, masterKey);
                newProfile.user = await encryptText(user, masterKey);
                newProfile.pass = await encryptText(pass, masterKey);
            } catch (error) {
                alert(`خطأ في التشفير: ${error.message}`);
                return;
            }
        }

        savedProfiles.push(newProfile);
        saveProfilesToStorage();
        renderProfiles();
        activateProfile(newProfile);
        document.getElementById('profileForm').reset();
        profileNameInput.focus();
    }

    function renderProfiles() {
        const list = document.getElementById('profileList');
        list.innerHTML = '';

        if (savedProfiles.length === 0) {
            list.innerHTML = '<p style="color: #94a3b8; font-size: 0.9rem;">لا توجد ملفات محفوظة حالياً.</p>';
            return;
        }

        savedProfiles.forEach(profile => {
            const badge = document.createElement('div');
            badge.className = 'profile-badge';
            badge.id = `prof-${profile.id}`;
            badge.innerHTML = `
                <span onclick="selectProfile(${profile.id})">👤 ${profile.name} (${profile.type.toUpperCase()})</span>
                <span class="delete-profile" onclick="deleteProfile(${profile.id}, event)">&times;</span>
            `;
            list.appendChild(badge);
        });
    }

    function selectProfile(id) {
        const profile = savedProfiles.find(p => p.id === id);
        if (profile) activateProfile(profile);
    }

    function deleteProfile(id, event) {
        event.stopPropagation();
        if (confirm('هل أنت متأكد من رغبتك في حذف هذا البروفايل؟')) {
            savedProfiles = savedProfiles.filter(p => p.id !== id);
            saveProfilesToStorage();
            renderProfiles();
            
            const activeBadge = document.querySelector('.profile-badge.active');
            if (activeBadge && activeBadge.id === `prof-${id}`) {
                document.getElementById('profileName').value = '';
                document.getElementById('m3uUrl').value = '';
                document.getElementById('xtreamHost').value = '';
                document.getElementById('xtreamUser').value = '';
                document.getElementById('xtreamPass').value = '';
            }
        }
    }

    async function activateProfile(profile) {
        document.querySelectorAll('.profile-badge').forEach(b => b.classList.remove('active'));
        const currentBadge = document.getElementById(`prof-${profile.id}`);
        if (currentBadge) currentBadge.classList.add('active');

        document.getElementById('profileName').value = profile.name;
        toggleLoginMethod(profile.type);

        if (profile.type === 'm3u') {
            document.getElementById('m3uUrl').value = profile.url;
            await loadM3uPlaylistFromData(profile.url);
        } else {
            const masterKey = sessionStorage.getItem(MASTER_KEY_STORAGE);
            if (!masterKey) {
                alert('انتهت جلسة الأمان. يرجى إعادة إدخال كلمة المرور الرئيسية.');
                sessionStorage.removeItem(MASTER_KEY_STORAGE);
                return;
            }

            try {
                const host = await decryptText(profile.host, masterKey);
                const user = await decryptText(profile.user, masterKey);
                const pass = await decryptText(profile.pass, masterKey);
                
                document.getElementById('xtreamHost').value = host;
                document.getElementById('xtreamUser').value = user;
                document.getElementById('xtreamPass').value = pass;
                
                await loadXtreamPlaylistFromData(host, user, pass);
            } catch (error) {
                alert(error.message);
                document.getElementById('xtreamHost').value = '';
                document.getElementById('xtreamUser').value = '';
                document.getElementById('xtreamPass').value = '';
            }
        }
    }

    async function loadM3uPlaylistFromData(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`خطأ في التحميل: ${response.status}`);
            const text = await response.text();
            parseM3U(text);
        } catch (error) {
            alert(`خطأ في جلب بيانات الـ M3U: ${error.message}`);
            console.error(error);
        }
    }

    async function loadXtreamPlaylistFromData(host, user, pass) {
        const generatedM3uUrl = `${host}/get.php?username=${user}&password=${pass}&output=ts`;
        try {
            const response = await fetch(generatedM3uUrl);
            if (!response.ok) throw new Error(`خطأ في الاتصال بالسيرفر: ${response.status}`);
            const text = await response.text();
            parseM3U(text);
        } catch (error) {
            alert(`خطأ في الاتصال بسيرفر Xtream: ${error.message}`);
