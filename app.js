let playlistData = { channels: [], movies: [], series: [] };
let currentCategory = 'channels';

async function loadPlaylist() {
    const url = document.getElementById('m3uUrl').value;
    if (!url) return alert('الرجاء إدخال رابط M3U');
    try {
        const response = await fetch(url);
        const text = await response.text();
        parseM3U(text);
    } catch (error) { 
        alert('خطأ في جلب البيانات. تأكد من صحة الرابط وأن السيرفر يعمل.'); 
    }
}

function parseM3U(data) {
    playlistData = { channels: [], movies: [], series: [] };
    // تقسيم النص بناءً على السطور البرمجية مع دعم كل صيغ السطور (\r\n أو \n)
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
            
            // تحسين الفرز الذكي للمحتوى
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

// تعديل الدالة لاستقبال الـ element المـضغوط عليه مباشرة لضمان عملها على الـ APK
function switchTab(cat, element) { 
    currentCategory = cat; 
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    if (element) {
        element.classList.add('active');
    }
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
