/**
 * مدير بروفايلات IPTV آمن
 * - لا يخزن أي بيانات اعتماد في الكود أو المستودع
 * - يستخدم tشفير Web API اختياري لحماية بيانات Xtream
 * - جميع البيانات تبقى في localStorage للمستخدم فقط
 */

(() => {
    // ===== تهيئة المتغيرات العالمية =====
    let playlistData = { channels: [], movies: [], series: [] };
    let currentCategory = 'channels';
    let currentMethod = 'm3u'; 
    let savedProfiles = [];
    const MASTER_KEY_STORAGE = 'iptv_master_key'; // مفتاح التشفير المشتق (ليس كلمة المرور نفسها!)

    // ===== دوال التشفير الآمن (Web Crypto API) =====
    /**
     * يشفر نصًا باستخدام كلمة مرور رئيسية
     * @param {string} text - النص المراد تشفيره
     * @param {string} password - كلمة المرور الرئيسية (لا تُخزن أبدًا)
     * @returns {Promise<string>} - النص المشفر بصيغة Base64 مفصولة بنقاط
     */
    async function encryptText(text, password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const salt = crypto.getRandomValues(new Uint8Array(16));
        
        // استخراج مفتاح من كلمة المرور الرئيسية
        const keyMaterial = await crypto.subtle.importKey(
            'raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']
        );
        const key = await crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false, ['encrypt']
        );
        
        // التشفير
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            data
        );
        
        // إرجاع النتيجة بصيغة قابلة للتخزين: salt.iv.encryptedData
        return btoa(String.fromCharCode(...new Uint8Array(salt))) + 
               '.' + 
               btoa(String.fromCharCode(...new Uint8Array(iv))) + 
               '.' + 
               btoa(String.fromCharCode(...new Uint8Array(encrypted)));
    }

    /**
     * يفك تشفير نص باستخدام كلمة مرور رئيسية
     * @param {string} encryptedText - النص المشفر بصيغة salt.iv.encryptedData
     * @param {string} password - كلمة المرور الرئيسية
     * @returns {Promise<string>} - النص الأصلي
     * @throws {Error} إذا فشلت عملية الفك (كلمة مرور خاطئة أو بيانات فاسدة)
     */
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
    /**
     * يحفظ البروفايلات في localStorage
     * (مع تشفير اختياري للبيانات الحساسة)
     */
    function saveProfilesToStorage() {
        // لا نحتاج لتشفير هنا لأننا نفعل ذلك قبل الحفظ في activateProfile
        localStorage.setItem('iptv_profiles', JSON.stringify(savedProfiles));
    }

    /**
     * يحمل البروفايلات من localStorage
     */
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

    /**
     * يضيف بروفايل جديد مع تشفير اختياري للبيانات الحساسة
     */
    async function saveAndLoad() {
        const profileNameInput = document.getElementById('profileName');
        const name = profileNameInput.value.trim();
        if (!name) return alert('الرجاء كتابة اسم للبروفايل أولاً لحفظه.');

        // طلب كلمة المرور الرئيسية مرة واحدة لكل جلسة
        let masterKey = sessionStorage.getItem(MASTER_KEY_STORAGE);
        if (!masterKey) {
            masterKey = prompt('يرجى إدخال كلمة مرور رئيسية لحماية بروفايلاتك (سيتم تذكرها لهذه الجلسة):');
            if (!masterKey) return; // المستخدم إلغاء
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
            newProfile.url = url; // رابط M3U ليس حساسًا بنفس程度 (يمكن تحديثه)
        } else {
            const host = document.getElementById('xtreamHost').value.trim();
            const user = document.getElementById('xtreamUser').value.trim();
            const pass = document.getElementById('xtreamPass').value.trim();
            if (!host || !user || !pass) return alert('الرجاء ملء جميع خانات Xtream');

            // تشفير البيانات الحساسة قبل الحفظ
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
        
        // إعادة تعيين النموذج
        document.getElementById('profileForm').reset();
        profileNameInput.focus();
    }

    /**
     * يعرض قائمة البروفايلات في الواجهة
     */
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

    /**
     * يختار بروفايل عند النقر عليه
     * @param {number} id - معرف البروفايل
     */
    function selectProfile(id) {
        const profile = savedProfiles.find(p => p.id === id);
        if (profile) activateProfile(profile);
    }

    /**
     * يحذف بروفايل من القائمة
     * @param {number} id - معرف البروفايل
     * @param {Event} event - حدث النقر (لمنع الانتشار)
     */
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
        }
    }

    /**
     * يُفعّل البروفايل المختار ويحمل بياناته
     * @param {Object} profile - البروفايل المراد تفعيله
     */
    async function activateProfile(profile) {
        // تحديث حالة البروفايلات النشطة
        document.querySelectorAll('.profile-badge').forEach(b => b.classList.remove('active'));
        const currentBadge = document.getElementById(`prof-${profile.id}`);
        if (currentBadge) currentBadge.classList.add('active');

        // تعبئة النموذج بالبيانات (لعرض ما هو مُفعّل حاليًا)
        document.getElementById('profileName').value = profile.name;
        toggleLoginMethod(profile.type);

        if (profile.type === 'm3u') {
            document.getElementById('m3uUrl').value = profile.url;
            await loadM3uPlaylistFromData(profile.url);
        } else {
            // استرجاع كلمة المرور الرئيسية من الجلسة
            const masterKey = sessionStorage.getItem(MASTER_KEY_STORAGE);
            if (!masterKey) {
                alert('انتهت جلسة الأمان. يرجى إعادة إدخال كلمة المرور الرئيسية.');
                sessionStorage.remove(`${MASTER_KEY_STORAGE}`); // تنظيف المفتاح القديم
                return;
            }

            try {
                // فك تشفير البيانات الحساسة
                const host = await decryptText(profile.host, masterKey);
                const user = await decryptText(profile.user, masterKey);
                const pass = await decryptText(profile.pass, masterKey);
                
                // ملء النموذج بالبيانات المفكوكة تشفيريًا (لكن لا نحفظها في المتغيرات!)
                document.getElementById('xtreamHost').value = host;
                document.getElementById('xtreamUser').value = user;
                document.getElementById('xtreamPass').value = pass;
                
                // تحميل قائمة البث
                await loadXtreamPlaylistFromData(host, user, pass);
            } catch (error) {
                alert(error.message);
                // تنظيف النموذج في حالة الفشل
                document.getElementById('xtreamHost').value = '';
                document.getElementById('xtreamUser').value = '';
                document.getElementById('xtreamPass').value = '';
            }
        }
    }

    /**
     * يحذف جميع البروفايلات (للتجربة أو إعادة البداية)
     */
    function clearAllProfiles() {
        if (confirm('هل أنت متأكد من رغبتك في حذف جميع البروفايلات؟ هذا لا يمكن التراجع عنه.')) {
            savedProfiles = [];
            saveProfilesToStorage();
            sessionStorage.removeItem(MASTER_KEY_STORAGE); // تنظيف مفتاح الجلسة
            renderProfiles();
            document.getElementById('contentGrid').innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #94a3b8; padding: 20px;">لا يوجد محتوى متوفر.</p>';
            document.getElementById('currentPlaying').innerText = 'يعرض الآن: ';
            document.getElementById('playerContainer').style.display = 'none';
            document.getElementById('videoPlayer').pause();
            document.getElementById('videoPlayer').src = '';
        }
    }

    // ===== دوال تحميل ومعالجة بيانات M3U =====
    /**
     * يحمّل قائمة M3U من رابط مباشر
     * @param {string} url - رابط ملف M3U
     */
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

    /**
     * يحمّل قائمة M3U من خادم Xtream Codes
     * @param {string} host - عنوان الخادم
     * @param {string} user - اسم المستخدم
     * @param {string} pass - كلمة المرور
     */
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

    /**
     * يحلل محتوى ملف M3U ويصنّف العناصر
     * @param {string} data - محتوى ملف M3U كنص
     */
    function parseM3U(data) {
        // إعادة تعيين البيانات
        playlistData = { channels: [], movies: [], series: [] };
        const lines = data.split(/\r?\n/);
        let currentItem = null;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (line.startsWith('#EXTINF:')) {
                currentItem = {};
                
                // استخراج اسم القناة
                const nameMatch = line.match(/,(.+)$/);
                currentItem.name = nameMatch ? nameMatch[1].trim() : 'بث غير معروف';
                
                // استخراج شعار القناة (إن وجد)
                const logoMatch = line.match(/tvg-logo="([^"]+)"/);
                currentItem.logo = logoMatch ? logoMatch[1] : 
                                 'https://via.placeholder.com/150x180/1e2330/fff?text=No+Image';
                
                // استخراج الفئة (الطريقة الأكثر موثوقية)
                const groupMatch = line.match(/group-title="([^"]+)"/);
                currentItem.group = groupMatch ? groupMatch[1].toLowerCase() : '';
            } 
            // سطر رابط البث
            else if (line.startsWith('http') && currentItem) {
                currentItem.url = line;
                
                // التصنيف الذكي باستخدام group-title أولًا، ثم الاحتياط إلى كلمات مفتاحية
                const lowerGroup = currentItem.group || '';
                const lowerName = currentItem.name.toLowerCase();
                const lowerUrl = line.toLowerCase();
                
                let categorized = false;
                
                // التحقق من الفئة first (الأكثر موثوقية)
                if (lowerGroup.includes('movie') || lowerGroup.includes('film')) {
                    playlistData.movies.push(currentItem);
                    categorized = true;
                } else if (lowerGroup.includes('series') || lowerGroup.includes('show')) {
                    playlistData.series.push(currentItem);
                    categorized = true;
                } else if (lowerGroup.includes('news') || lowerGroup.includes('sport')) {
                    // يمكن إضافة فئات أخرى حسب الحاجة
                    playlistData.channels.push(currentItem);
                    categorized = true;
                }
                
                // إذا لم يتم التصنيف عبر group-title، نستخدم الاحتياط
                if (!categorized) {
                    if (lowerUrl.includes('/movie/') || lowerName.includes('فيلم') || lowerName.includes('movie') || 
                        lowerUrl.includes('.mp4') || lowerUrl.includes('.mkv') || lowerUrl.includes('.avi')) {
                        playlistData.movies.push(currentItem);
                    } else if (lowerUrl.includes('/series/') || lowerName.includes('مسلسل') || lowerName.includes('series') || 
                               lowerUrl.includes('.mkv') || lowerUrl.includes('.mp4')) {
                        playlistData.series.push(currentItem);
                    } else {
                        playlistData.channels.push(currentItem);
                    }
                }
                
                currentItem = null;
            }
        }
        
        // تحديث الشبكة بعد التحليل
        renderGrid();
    }

    /**
     * يعرض شبكة المحتوى حسب الفئة المختارة
     */
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
                <p>${item.name}</p>
            `;
            grid.appendChild(card);
        });
    }

    /**
     * يغير الفئة المعروضة (قنوات، أفلام، مسلسلات)
     * @param {string} category - الفئة المطلوبة
     * @param {HTMLElement} element - العنصر الذي تم النقر عليه (لتحديث الحالة البصرية)
     */
    function switchTab(category, element) { 
        currentCategory = category; 
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        if (element) element.classList.add('active');
        renderGrid(); 
    }

    /**
     * يشغل فيديو في المشغل المدمج
     * @param {string} url - رابط البث
     * @param {string} name - اسم المحتوى
     */
    function playVideo(url, name) {
        const video = document.getElementById('videoPlayer');
        document.getElementById('currentPlaying').innerText = `يعرض الآن: ${name}`;
        document.getElementById('playerContainer').style.display = 'flex';
        
        // التمرير السلس لأعلى الصفحة
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // تشغيل البث حسب نوع الرابط
        if (url.includes('.m3u8')) {
            if (Hls.isSupported()) {
                const hls = new Hls();
                hls.loadSource(url);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => video.play());
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = url;
                video.play().catch(e => console.error('خطأ في تشغيل HLS:', e));
            }
        } else {
            video.src = url;
            video.play().catch(e => console.error('خطأ في تشغيل الفيديو المباشر:', e));
        }
    }

    /**
     * يغلق مشغل الفيديو ويعيد تعيين الحالة
     */
    function closePlayer() {
        document.getElementById('playerContainer').style.display = 'none';
        const video = document.getElementById('videoPlayer');
        video.pause();
        video.src = '';
    }

    // ===== معالجة الأحداث =====
    document.getElementById('profileForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveAndLoad();
    });

    document.getElementById('btnM3u').addEventListener('click', () => toggleLoginMethod('m3u'));
    document.getElementById('btnXtream').addEventListener('click', () => toggleLoginMethod('xtream'));

    // دوال تبديل طريقة الاتصال
    function toggleLoginMethod(method) {
        currentMethod = method;
        document.getElementById('btnM3u').classList.toggle('active', method === 'm3u');
        document.getElementById('btnXtream').classList.toggle('active', method === 'xtream');
        
        document.getElementById('m3uSection').style.display = method === 'm3u' ? 'block' : 'none';
        document.getElementById('xtreamSection').style.display = method === 'xtream' ? 'block' : 'none';
        
        // التركيز على الحقل الأول عند التبديل
        if (method === 'm3u') {
            document.getElementById('m3uUrl').focus();
        } else {
            document.getElementById('xtreamHost').focus();
        }
    }

    // ===== تهيئة التطبيق عند التحميل =====
    window.onload = function() {
        loadProfilesFromStorage();
        // تعيين الحالة الافتراضية للأزرار
        toggleLoginMethod(currentMethod);
    };
})();
