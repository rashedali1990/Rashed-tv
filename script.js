// script.js - المنطق الأمني الأصلي + إضافات بسيطة لواجهة IPTV Smarters
(() => {
    // ===== تهيئة المتغيرات العالمية (نفس المنطق الأمني من قبل) =====
    let playlistData = { channels: [], movies: [], series: [], catchup: [] };
    let currentCategory = 'channels';
    let currentMethod = 'm3u'; 
    let savedProfiles = [];
    const MASTER_KEY_STORAGE = 'iptv_master_key';
    let activeProfileId = null; // لتتبع البروفايل الفعّال

    // ===== دوال التشفير الآمن (بدون تغيير - نفس النسخة الآمنة السابقة) =====
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

    // ===== دوال إدارة البروفايلات (نفس المنطق الأمني من قبل) =====
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
        if (profile) {
            activeProfileId = profile.id;
            activateProfile(profile);
            goBack(); // العودة إلى الشاشة الرئيسية بعد التفعيل
        }
    }

    function deleteProfile(id, event) {
        event.stopPropagation();
        if (confirm('هل أنت متأكد من رغبتك في حذف هذا البروفايل؟')) {
            savedProfiles = savedProfiles.filter(p => p.id !== id);
            saveProfilesToStorage();
            renderProfiles();
            
            // إعادة تعيين النموذج إذا كان البروفايل المحذوف هو الفعّال
            const activeBadge = document.querySelector('.profile-badge.active');
            if (activeBadge && activeBadge.id === `prof-${id}`) {
                document.getElementById('profileName').value = '';
                document.getElementById('m3uUrl').value = '';
                document.getElementById('xtreamHost').value = '';
                document.getElementById('xtreamUser').value = '';
                document.getElementById('xtreamPass').value = '';
            }
            
            // إذا كان البروفايل المحذوف هو الفعّال، نعرض حالة فارغة
            if (activeProfileId === id) {
                activeProfileId = null;
                document.getElementById('contentGrid').innerHTML = '';
                document.getElementById('emptyState').style.display = 'block';
                document.getElementById('currentPlaying').innerText = 'يعرض الآن: ';
                document.getElementById('playerContainer').style.display = 'none';
                document.getElementById('videoPlayer').pause();
                document.getElementById('videoPlayer').src = '';
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

    // ===== دوال تحميل ومعالجة بيانات M3U (نفس المنطق الأمني من قبل) =====
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
            console.error(error);
        }
    }

    function parseM3U(data) {
        // إعادة تعيين البيانات (مع إضافة catch-up)
        playlistData = { channels: [], movies: [], series: [], catchup: [] };
        const lines = data.split(/\r?\n/);
        let currentItem = null;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (line.startsWith('#EXTINF:')) {
                currentItem = {};
                const nameMatch = line.match(/,(.+)$/);
                currentItem.name = nameMatch ? nameMatch[1].trim() : 'بث غير معروف';
                const logoMatch = line.match(/tvg-logo="([^"]+)"/);
                currentItem.logo = logoMatch ? logoMatch[1] : 
                                 'https://via.placeholder.com/150x180/1e2330/fff?text=No+Image';
                const groupMatch = line.match(/group-title="([^"]+)"/);
                currentItem.group = groupMatch ? groupMatch[1].toLowerCase() : '';
            } 
            else if (line.startsWith('http') && currentItem) {
                currentItem.url = line;
                const lowerGroup = currentItem.group || '';
                const lowerName = currentItem.name.toLowerCase();
                const lowerUrl = line.toLowerCase();
                
                let categorized = false;
                
                // التصنيف باستخدام group-title (الأكثر موثوقية)
                if (lowerGroup.includes('movie') || lowerGroup.includes('film')) {
                    playlistData.movies.push(currentItem);
                    categorized = true;
                } else if (lowerGroup.includes('series') || lowerGroup.includes('show')) {
                    playlistData.series.push(currentItem);
                    categorized = true;
                } else if (lowerGroup.includes('news') || lowerGroup.includes('sport')) {
                    playlistData.channels.push(currentItem);
                    categorized = true;
                } else if (lowerGroup.includes('catchup') || lowerGroup.includes('replay')) {
                    playlistData.catchup.push(currentItem);
                    categorized = true;
                }
                
                // الاحتياط باستخدام الكلمات المفتاحية
                if (!categorized) {
                    if (lowerUrl.includes('/movie/') || lowerName.includes('فيلم') || lowerName.includes('movie') || 
                        lowerUrl.includes('.mp4') || lowerUrl.includes('.mkv') || lowerUrl.includes('.avi')) {
                        playlistData.movies.push(currentItem);
                    } else if (lowerUrl.includes('/series/') || lowerName.includes('مسلسل') || lowerName.includes('series') || 
                               lowerUrl.includes('.mkv') || lowerUrl.includes('.mp4')) {
                        playlistData.series.push(currentItem);
                    } else if (lowerUrl.includes('/catchup/') || lowerName.includes('إعادة') || lowerName.includes('replay')) {
                        playlistData.catchup.push(currentItem);
                    } else {
                        playlistData.channels.push(currentItem);
                    }
                }
                
                currentItem = null;
            }
        }
        
        // تحديث الواجهة بعد التحليل
        updateCategories();
        renderGrid();
    }

    // ===== دوال الواجهة الجديدة (مُضافة خصيصًا لواجهة IPTV Smarters) =====
    function updateCategories() {
        const track = document.querySelector('.category-track');
        track.innerHTML = '';
        
        // تعريف الفئات مع أيقوناتها
        const categories = [
            { id: 'channels', name: 'الكل', icon: 'fa-tv', count: playlistData.channels.length },
            { id: 'movies', name: 'أفلام', icon: 'fa-film', count: playlistData.movies.length },
            { id: 'series', name: 'مسلسلات', icon: 'fa-book-open', count: playlistData.series.length },
            { id: 'catchup', name: 'Catch-Up', icon: 'fa-clock-rotate-left', count: playlistData.catchup.length }
        ];
        
        categories.forEach(cat => {
            if (cat.count > 0) { //显示只有有内容的类别
                const item = document.createElement('div');
                item.className = `category-item ${cat.id === currentCategory ? 'active' : ''}`;
                item.dataset.tab = cat.id;
                item.innerHTML = `
                    <i class="fa-solid ${cat.icon}"></i>
                    <span>${cat.name}</span>
                    ${cat.count > 0 ? `<span class="badge">${cat.count}</span>` : ''}
                `;
                item.onclick = () => switchTab(cat.id, item);
                track.appendChild(item);
            }
        });
        
        // إذا لم تكن هناك فئات، نعرض رسالة فارغة
        if (track.children.length === 0) {
            document.getElementById('emptyState').style.display = 'block';
            document.getElementById('contentGrid').innerHTML = '';
        } else {
            document.getElementById('emptyState').style.display = 'none';
        }
    }

    function renderGrid() {
        const grid = document.getElementById('contentGrid');
        grid.innerHTML = '';
        const items = playlistData[currentCategory];
        
        if (items.length === 0) {
            grid.innerHTML = `<p class="empty-state">لا يوجد محتوى متوفر في فئة "${currentCategory}".</p>`;
            return;
        }
        
        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'card';
            card.onclick = () => playVideo(item.url, item.name);
            card.innerHTML = `
                <img src="${item.logo}" onerror="this.src='https://via.placeholder.com/150x180/1e2330/fff?text=IPTV'">
                <div class="overlay">
                    <p>${item.name}</p>
                </div>
            `;
            grid.appendChild(card);
        });
    }

    function switchTab(category, element) { 
        currentCategory = category; 
        document.querySelectorAll('.category-item').forEach(item => item.classList.remove('active'));
        if (element) element.classList.add('active');
        renderGrid(); 
    }

    function playVideo(url, name) {
        const video = document.getElementById('videoPlayer');
        document.getElementById('currentPlaying').innerText = `يعرض الآن: ${name}`;
        document.getElementById('playerContainer').style.display = 'flex';
        
        // إظهار أدوات التحكم بعد ثانيتين (لتحسين تجربة المستخدم)
        setTimeout(() => {
            document.getElementById('playerControls').classList.add('active');
        }, 2000);
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        if (url.includes('.m3u8')) {
            if (Hls.isSupported()) {
                const hls = new Hls();
                hls.loadSource(url);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    video.play();
                    initializePlayerControls(video);
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = url;
                video.play().catch(e => console.error('خطأ في تشغيل HLS:', e));
                initializePlayerControls(video);
            }
        } else {
            video.src = url;
            video.play().catch(e => console.error('خطأ في تشغيل الفيديو المباشر:', e));
            initializePlayerControls(video);
        }
    }

    function initializePlayerControls(video) {
        // زر التشغيل/الإيقاف المؤقت
        const btnPlayPause = document.getElementById('btnPlayPause');
        btnPlayPause.onclick = () => {
            if (video.paused) {
                video.play();
                btnPlayPause.innerHTML = '<i class="fa-solid fa-pause"></i>';
            } else {
                video.pause();
                btnPlayPause.innerHTML = '<i class="fa-solid fa-play"></i>';
            }
        };
        
        // تحديث الوقت
        video.ontimeupdate = () => {
            const currentTime = formatTime(video.currentTime);
            const duration = formatTime(video.duration);
            document.getElementById('currentTime').textContent = currentTime;
            document.getElementById('duration').textContent = duration;
        };
        
        // التحكم في الصوت
        const volumeSlider = document.getElementById('volumeSlider');
        volumeSlider.value = video.volume * 100;
        volumeSlider.oninput = () => {
            video.volume = volumeSlider.value / 100;
            const volIcon = document.getElementById('btnVolume').querySelector('i');
            if (volumeSlider.value == 0) {
                volIcon.className = 'fa-solid fa-volume-mute';
            } else if (volumeSlider.value < 50) {
                volIcon.className = 'fa-solid fa-volume-down';
            } else {
                volIcon.className = 'fa-solid fa-volume-high';
            }
        };
        
        // وضع ملء الشاشة
        const btnFullscreen = document.getElementById('btnFullscreen');
        btnFullscreen.onclick = () => {
            if (!document.fullscreenElement) {
                video.requestFullscreen().catch(err => console.error(`خطأ في وضع ملء الشاشة: ${err}`));
                btnFullscreen.innerHTML = '<i class="fa-solid fa-compress"></i>';
            } else {
                document.exitFullscreen();
                btnFullscreen.innerHTML = '<i class="fa-solid fa-expand"></i>';
            }
        };
        
        // إخفاء أدوات التحكم بعد فترة من عدم النشاط
        let hideTimeout;
        const resetHideTimer = () => {
            clearTimeout(hideTimeout);
            hideTimeout = setTimeout(() => {
                document.getElementById('playerControls').classList.remove('active');
            }, 3000);
        };
        
        document.getElementById('playerContainer').onmousemove = resetHideTimer;
        document.getElementById('playerContainer').ontouchmove = resetHideTimer;
        resetHideTimer();
    }

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    function closePlayer() {
        document.getElementById('playerContainer').style.display = 'none';
        const video = document.getElementById('videoPlayer');
        video.pause();
        video.src = '';
        document.getElementById('playerControls').classList.remove('active');
        document.getElementById('btnPlayPause').innerHTML = '<i class="fa-solid fa-play"></i>';
    }

    function goBack() {
        document.getElementById('settingsScreen').classList.remove('active');
        document.getElementById('contentScreen').classList.add('active');
        document.querySelector('.nav-item[data-tab="channels"]').classList.add('active');
        document.querySelectorAll('.nav-item:not([data-tab="channels"])').forEach(item => item.classList.remove('active'));
    }

    // ===== معالجة الأحداث =====
    document.getElementById('profileForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveAndLoad();
    });

    document.getElementById('btnM3u').addEventListener('click', () => toggleLoginMethod('m3u'));
    document.getElementById('btnXtream').addEventListener('click', () => toggleLoginMethod('xtream'));

    function toggleLoginMethod(method) {
        currentMethod = method;
        document.getElementById('btnM3u').classList.toggle('active', method === 'm3u');
        document.getElementById('btnXtream').classList.toggle('active', method === 'xtream');
        
        document.getElementById('m3uSection').style.display = method === 'm3u' ? 'block' : 'none';
        document.getElementById('xtreamSection').style.display = method === 'xtream' ? 'block' : 'none';
        
        if (method === 'm3u') {
            document.getElementById('m3uUrl').focus();
        } else {
            document.getElementById('xtreamHost').focus();
        }
    }

    // مسح جميع البروفايلات
    document.getElementById('clearAllBtn').addEventListener('click', function() {
        if (confirm('هل أنت متأكد من رغبتك في حذف جميع البروفايلات؟ هذا لا يمكن التراجع عنه.')) {
            savedProfiles = [];
            saveProfilesToStorage();
            sessionStorage.removeItem(MASTER_KEY_STORAGE);
            renderProfiles();
            document.getElementById('contentGrid').innerHTML = '';
            document.getElementById('emptyState').style.display = 'block';
            document.getElementById('currentPlaying').innerText = 'يعرض الآن: ';
            document.getElementById('playerContainer').style.display = 'none';
            document.getElementById('videoPlayer').pause();
            document.getElementById('videoPlayer').src = '';
        }
    });

    // تنقل الشريط السفلي
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const tab = this.dataset.tab;
            
            // تفعيل العنصر المضغوط
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            this.classList.add('active');
            
            // عرض الشاشة المناسبة
            if (tab === 'settings') {
                document.getElementById('settingsScreen').classList.add('active');
                document.getElementById('contentScreen').classList.remove('active');
            } else {
                document.getElementById('contentScreen').classList.add('active');
                document.getElementById('settingsScreen').classList.remove('active');
                currentCategory = tab;
                updateCategories();
                renderGrid();
            }
        });
    });

    // ===== تهيئة التطبيق عند التحميل =====
    window.onload = function() {
        loadProfilesFromStorage();
        toggleLoginMethod(currentMethod);
        
        // إذا كان هناك بروفايل محفوظ، نُفعّله تلقائيًا
        if (savedProfiles.length > 0) {
            const lastProfile = savedProfiles[savedProfiles.length - 1];
            activateProfile(lastProfile);
            goBack(); // الانتقال إلى شاشة المحتوى
        }
    };
})();
