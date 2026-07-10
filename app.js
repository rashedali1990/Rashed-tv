let playlistData = { channels: [], movies: [], series: [] };
let currentCategory = 'channels';
let currentMethod = 'm3u'; 
let savedProfiles = [];

// عند تشغيل التطبيق، نقوم بتحميل البروفايلات المحفوظة سابقاً من ذاكرة الهاتف
window.onload = function() {
    loadProfilesFromStorage();
};

function toggleLoginMethod(method) {
    currentMethod = method;
    document.getElementById('btnM3u').classList.toggle('active', method === 'm3u');
    document.getElementById('btnXtream').classList.toggle('active', method === 'xtream');
    
    document.getElementById('m3uSection').style.display = method === 'm3u' ? 'block' : 'none';
    document.getElementById('xtreamSection').style.display = method === 'xtream' ? 'block' : 'none';
}

// دالة الحفظ والتشغيل
function saveAndLoad() {
    const name = document.getElementById('profileName').value.trim();
    if (!name) return alert('الرجاء كتابة اسم للبروفايل أولاً لحفظه.');

    let newProfile = { id: Date.now(), name: name, type: currentMethod };

    if (currentMethod === 'm3u') {
        const url = document.getElementById('m3uUrl').value.trim();
        if (!url) return alert('الرجاء إدخال رابط M3U');
        newProfile.url = url;
    } else {
        const host = document.getElementById('xtreamHost').value.trim();
        const user = document.getElementById('xtreamUser').value.trim();
        const pass = document.getElementById('xtreamPass').value.trim();
        if (!host || !user || !pass) return alert('الرجاء ملء جميع خانات Xtream');
        newProfile.host = host;
        newProfile.user = user;
        newProfile.pass = pass;
    }

    // إضافة البروفايل الجديد وحفظه في الذاكرة
    savedProfiles.push(newProfile);
    localStorage.setItem('iptv_profiles', JSON.stringify(savedProfiles));
    
    renderProfiles();
    activateProfile(newProfile);
}

// عرض البروفايلات في الشريط العلوي
function renderProfiles() {
    const list = document.getElementById('profileList');
    list.innerHTML = '';

    if (savedProfiles.length === 0) {
        list.innerHTML = '<p style="color: #666; font-size: 14px;">لا توجد ملفات محفوظة حالياً.</p>';
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

// اختيار بروفايل عند الضغط عليه
function selectProfile(id) {
    const profile = savedProfiles.find(p => p.id === id);
    if (profile) activateProfile(profile);
}

// تفعيل وتشغيل بيانات البروفايل المختار
async function activateProfile(profile) {
    document.querySelectorAll('.profile-badge').forEach(b => b.classList.remove('active'));
    const currentBadge = document.getElementById(`prof-${profile.id}`);
    if (currentBadge) currentBadge.classList.add('active');

    // تعبئة الفورم بالبيانات تلقائياً ليرى المستخدم السيرفر المفتوح
    document.getElementById('profileName').value = profile.name;
    toggleLoginMethod(profile.type);

    if (profile.type === 'm3u') {
        document.getElementById('m3uUrl').value = profile.url;
        await loadM3uPlaylistFromData(profile.url);
    } else {
        document.getElementById('xtreamHost').value = profile.host;
        document.getElementById('xtreamUser').value = profile.user;
        document.getElementById('xtreamPass').value = profile.pass;
        await loadXtreamPlaylistFromData(profile.host, profile.user, profile.pass);
    }
}

// حذف بروفايل من الذاكرة
function deleteProfile(id, event) {
    event.stopPropagation(); // منع تفعيل البروفايل عند الضغط على علامة الحذف
    if (confirm('هل أنت متأكد من رغبتك في حذف هذا البروفايل؟')) {
        savedProfiles = savedProfiles.filter(p => p.id !== id);
        localStorage.setItem('iptv_profiles', JSON.stringify(savedProfiles));
        renderProfiles();
        // تفريغ المدخلات بعد الحذف
        document.getElementById('profileName').value = '';
        document.getElementById('m3uUrl').value = '';
        document.getElementById('xtreamHost').value = '';
        document.getElementById('xtreamUser').value = '';
        document.getElementById('xtreamPass').value = '';
    }
}

function loadProfilesFromStorage() {
    const data = localStorage.getItem('iptv_profiles');
    if (data) {
        savedProfiles = JSON.parse(data);
        renderProfiles();
    }
}

// دوال جلب البيانات المستقلة للبروفايلات
async function loadM3uPlaylistFromData(url) {
    try {
        const response = await fetch(url);
        const text = await response.text();
        parseM3U(text);
    } catch (error) { alert('خطأ في جلب بيانات الـ M3U لهذا البروفايل.'); }
}

async function loadXtreamPlaylistFromData(host, user, pass) {
    const generatedM3uUrl = `${host}/get.php?username=${user}&password=${pass}&output=ts`;
    try {
        const response = await fetch(generatedM3uUrl);
        const text = await response.text();
        parseM3U(text);
    } catch (error) { alert('خطأ في الاتصال بسيرفر Xtream لهذا البروفايل.'); }
}

// دالة معالجة الـ M3U الشهيرة كما هي
function parseM3U(data) {
    playlistData = { channels: [], movies: [], series: [] };
    const lines = data.split(/\r?\n/);
    let currentItem = null;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (line.startsWith('#EXTINF:')) {
            currentItem = {};
            const nameMatch = line.match(/,(.+)$/);
            currentItem.name = nameMatch ? nameMatch[1].trim() : 'بث غير معروف';
            const logoMatch = line.match(/tvg-logo="([^"]+)"/);
            currentItem.logo = logoMatch ? logoMatch[1] : 'https://via.placeholder.com/150x180/1e2330/fff?text=No+Image';
        } else if (line.startsWith('http') && currentItem) {
            currentItem.url = line;
            const lowerLine = line.toLowerCase();
            const lowerName = currentItem.name.toLowerCase();
            
            if (lowerLine.includes('/movie/') || lowerName.includes('فيلم') || lowerName.includes('movie') || lowerLine.includes('.mp4') || lowerLine.includes('.mkv')) {
                playlistData.movies.push(currentItem);
            } else if (lowerLine.includes('/series/') || lowerName.includes('مسلسل') || lowerName.includes('series')) {
                playlistData.series.push(currentItem);
            } else {
                playlistData.channels.push(currentItem);
            }
            currentItem = null;
        }
    }
    renderGrid();
}

function renderGrid() {
    const grid = document.getElementById('contentGrid');
    grid.innerHTML = '';
    const items = playlistData[currentCategory];
    if (items.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #888; padding: 20px;">لا يوجد محتوى متوفر.</p>';
        return;
    }
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card';
        card.onclick = () => playVideo(item.url, item.name);
        card.innerHTML = `<img src="${item.logo}" onerror="this.src='https://via.placeholder.com/150x180/1e2330/fff?text=IPTV'"><p>${item.name}</p>`;
        grid.appendChild(card);
    });
}

function switchTab(cat, element) { 
    currentCategory = cat; 
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    if (element) element.classList.add('active');
    renderGrid(); 
}

function playVideo(url, name) {
    const video = document.getElementById('videoPlayer');
    document.getElementById('currentPlaying').innerText = 'يعرض الآن: ' + name;
    document.getElementById('playerContainer').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    if (url.includes('.m3u8')) {
        if (Hls.isSupported()) {
            const hls = new Hls();
            hls.loadSource(url);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, function() { video.play(); });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url;
            video.play();
        }
    } else {
        video.src = url;
        video.play();
    }
}
