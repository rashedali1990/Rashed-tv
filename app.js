<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>مدير بروفايلات IPTV آمن</title>
    <link rel="stylesheet" href="style.css">
    <!-- تحميل مكتبة Hls.js من CDN لتشغيل M3U8 -->
    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
</head>
<body>
    <div class="container">
        <!-- encabezado -->
        <header class="app-header">
            <h1>📺 مدير بروفايلات IPTV</h1>
            <p class="app-subtitle">إدارة آمنة لقوائم M3U وXtream Codes</p>
        </header>

        <!-- قسم تسجيل الدخول وإدارة البروفايلات -->
        <section class="login-section">
            <h2>إضافة بروفايل جديد</h2>
            <form id="profileForm">
                <div class="form-group">
                    <label for="profileName">اسم البروفايل:</label>
                    <input type="text" id="profileName" placeholder="مثلاً: اشتراكي المنزلي" required>
                </div>

                <!-- تبديل طريقة الاتصال -->
                <div class="method-toggle">
                    <button type="button" id="btnM3u" class="method-btn active" data-method="m3u">رابط M3U مباشر</button>
                    <button type="button" id="btnXtream" class="method-btn" data-method="xtream">خادم Xtream Codes</button>
                </div>

                <!-- قسم M3U (مظهر افتراضي) -->
                <div id="m3uSection" class="input-section active">
                    <div class="form-group">
                        <label for="m3uUrl">رابط M3U:</label>
                        <input type="url" id="m3uUrl" placeholder="例如: http://example.com/playlist.m3u8" required>
                    </div>
                </div>

                <!-- قسم Xtream (مخفي inicialmente) -->
                <div id="xtreamSection" class="input-section">
                    <div class="form-group">
                        <label for="xtreamHost">عنوان الخادم:</label>
                        <input type="url" id="xtreamHost" placeholder="例如: http://panel.example.com:80" required>
                    </div>
                    <div class="form-group">
                        <label for="xtreamUser">اسم المستخدم:</label>
                        <input type="text" id="xtreamUser" placeholder="例如: user123" required>
                    </div>
                    <div class="form-group">
                        <label for="xtreamPass">كلمة المرور:</label>
                        <input type="password" id="xtreamPass" placeholder="••••••••" required>
                    </div>
                </div>

                <button type="submit" class="btn-primary">حفظ وتفعيل البروفايل</button>
            </form>
        </section>

        <!-- قائمة البروفايلات المحفوظة -->
        <section class="profiles-section">
            <h2>البروفايلات المحفوظة</h2>
            <div id="profileList" class="profile-list">
                <!-- سيتم تعبئته بواسطة JavaScript -->
            </div>
        </section>

        <!-- قسم عرض المحتوى -->
        <section class="content-section">
            <div class="tabs">
                <button class="tab active" data-tab="channels">📺 القنوات</button>
                <button class="tab" data-tab="movies">🎬 الأفلام</button>
                <button class="tab" data-tab="series">📚 المسلسلات</button>
            </div>
            
            <div id="contentGrid" class="content-grid">
                <!-- سيتم تعبئته بواسطة JavaScript -->
            </div>
        </section>

        <!-- مشغل الفيديو -->
        <section class="player-section" id="playerContainer" style="display: none;">
            <div class="player-header">
                <span id="currentPlaying">يعرض الآن: </span>
                <button class="btn-close" onclick="closePlayer()">✕ إغلاق المشغل</button>
            </div>
            <video id="videoPlayer" controls autoplay muted playsinline></video>
        </section>
    </div>

    <script src="script.js"></script>
</body>
</html>
