let playlistData = { channels: [], movies: [], series: [] };
let currentCategory = 'channels';
let currentMethod = 'm3u'; // الطريقة الافتراضية

// التبديل بين واجهة M3U و Xtream في التصميم
function toggleLoginMethod(method) {
    currentMethod = method;
    document.getElementById('btnM3u').classList.toggle('active', method === 'm3u');
    document.getElementById('btnXtream').classList.toggle('active', method === 'xtream');
    
    document.getElementById('m3uSection').style.display = method === 'm3u' ? 'block' : 'none';
    document.getElementById('xtreamSection').style.display = method === 'xtream' ? 'block' : 'none';
}

// بدء جلب البيانات بناءً على الطريقة المختارة
function startLoading() {
    if (currentMethod === 'm3u') {
        loadM3uPlaylist();
    } else {
        loadXtreamPlaylist();
    }
}

// 1. جلب وتشغيل عبر رابط M3U مباشر
async function loadM3uPlaylist() {
    const url = document.getElementById('m3uUrl').value;
    if (!url) return alert('الرجاء إدخال رابط M3U');
    try {
        const response = await fetch(url);
        const text = await response.text();
        parseM3U(text);
    } catch (error) { 
        alert('خطأ في جلب البيانات، تأكد من الرابط أو أن السيرفر يدعم الاتصال المباشر.'); 
    }
}

// 2. جلب وتحويل بيانات Xtream إلى رابط M3U خلف الكواليس لتشغيلها
async function loadXtreamPlaylist() {
    const host = document.getElementById('xtreamHost').value.trim();
    const user = document.getElementById('xtreamUser').value.trim();
    const pass = document.getElementById('xtreamPass').value.trim();
    
    if (!host || !user || !pass) {
        return alert('الرجاء ملء جميع خانات Xtream');
    }
    
    // سرفرات Xtream تدعم توليد رابط M3U كامل تلقائياً بهذه الصيغة القياسية:
    const generatedM3uUrl = `${host}/get.php?username=${user}&password=${pass}&output=ts`;
    
    try {
        const response = await fetch(generatedM3uUrl);
        const text = await response.text();
        parseM3U(text);
    } catch (error) {
        alert('تعذر الاتصال بسيرفر Xtream، تأكد من صحة البيانات أو الرابط.');
    }
}

// دالة تحليل وقراءة محتوى الـ M3U المشتركة
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
        grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #888; padding: 20px;">لا يوجد محتوى في هذا القسم حالياً.</p>';
        return;
    }
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card';
        card.onclick = () => playVideo(item.url, item.name);
        card.innerHTML = `
            <img src="${item.logo}" onerror="this.src='https://via.placeholder.com/150x180/1e2330/fff?text=IPTV'">
            <p title="${item.name}">${item.name}</p>
        `;
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
