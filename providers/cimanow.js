/**
 * Nuvio Provider: CimaNow
 * Native Architecture - No Web APIs (setTimeout/Promise.race)
 */

const BASE_URL = "https://cimanow.cc";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_KEY = "4e44d9029b1270a757cddc766a1bcb63";

async function getStreams(tmdbId, type, season, episode) {
    try {
        // 1. جلب اسم العمل من TMDB
        let query = "";
        
        if (tmdbId) {
            const tmdbRes = await fetch(`${TMDB_API}/${type}/${tmdbId}?api_key=${TMDB_KEY}&language=ar`);
            const tmdbData = await tmdbRes.json();
            query = tmdbData.title || tmdbData.name || "";
            
            // إذا لم يجد اسماً عربياً، يجلب الإنجليزي
            if (!query) {
                const tmdbEnRes = await fetch(`${TMDB_API}/${type}/${tmdbId}?api_key=${TMDB_KEY}&language=en-US`);
                const tmdbEnData = await tmdbEnRes.json();
                query = tmdbEnData.title || tmdbEnData.name || "";
            }
        }

        // تنظيف الاسم والبحث بأول كلمة لضمان ظهور نتائج في CimaNow
        query = query.replace(/[^\w\s\u0600-\u06FF]/gi, " ").trim();
        const searchQuery = query.split(" ")[0]; 

        if (!searchQuery) return [];

        // 2. البحث في الموقع
        const searchRes = await fetch(`${BASE_URL}/?s=${encodeURIComponent(searchQuery)}`);
        const searchHtml = await searchRes.text();

        // 3. استخراج رابط المقال (الفيلم/المسلسل)
        let postUrl = "";
        const links = searchHtml.match(/href="(https:\/\/cimanow\.cc\/[^"]+)"/g);
        if (links) {
            for (let l of links) {
                let cleanLink = l.replace('href="', '').replace('"', '');
                // استبعاد الروابط غير المتعلقة بالمشاهدة
                if (!cleanLink.includes("/category/") && !cleanLink.includes("/tag/") && !cleanLink.includes("wp-content")) {
                    postUrl = cleanLink;
                    break; 
                }
            }
        }

        if (!postUrl) return [];

        // 4. الدخول لصفحة المقال والبحث عن صفحة المشاهدة
        const postRes = await fetch(postUrl);
        let postHtml = await postRes.text();

        // محاولة العثور على رابط المشاهدة الداخلي (/watch/)
        const watchMatch = postHtml.match(/href="([^"]+watch[^"]*)"/i);
        if (watchMatch) {
            let watchUrl = watchMatch[1];
            if (!watchUrl.startsWith("http")) watchUrl = BASE_URL + watchUrl;
            
            const watchRes = await fetch(watchUrl);
            postHtml = await watchRes.text();
        }

        const streams = [];
        let serverCount = 1;

        // 5. استخراج روابط التشغيل المباشرة (m3u8 و mp4) من سيرفر سيما ناو
        const mediaRegex = /"(https?:\/\/[^"]+\.(?:mp4|m3u8)[^"]*)"/gi;
        let match;
        while ((match = mediaRegex.exec(postHtml)) !== null) {
            let mediaUrl = match[1];
            // استبعاد الروابط الوهمية
            if (!mediaUrl.includes("google") && !mediaUrl.includes("facebook")) {
                streams.push({
                    name: mediaUrl.includes(".m3u8") ? "CimaNow Auto (HLS)" : `CimaNow HD ${serverCount}`,
                    url: mediaUrl,
                    quality: "Auto",
                    format: mediaUrl.includes(".m3u8") ? "m3u8" : "mp4"
                });
                serverCount++;
            }
        }

        // 6. استخراج السيرفرات الخارجية (Vidbom, Uqload, Doodstream)
        // تطبيق Nuvio يمتلك مستخرجات داخلية ستقوم بفك تشفير هذه الروابط تلقائياً
        const iframeRegex = /(?:src|data-url|data-embed)="([^"]+)"/gi;
        while ((match = iframeRegex.exec(postHtml)) !== null) {
            let src = match[1];
            if (src.startsWith("//")) src = "https:" + src;
            
            if (src.startsWith("http") && !src.includes("google") && !src.includes("facebook") && !src.includes("cimanow.cc")) {
                let serverName = "سيرفر خارجي";
                if (src.includes("vidbom") || src.includes("vidshare")) serverName = "VidBom";
                else if (src.includes("uqload")) serverName = "Uqload";
                else if (src.includes("dood")) serverName = "DoodStream";

                streams.push({
                    name: serverName,
                    url: src,
                    quality: "1080p",
                    format: "mp4"
                });
            }
        }

        return streams;
    } catch (e) {
        // في حال حدوث أي خطأ صامت، يرجع مصفوفة فارغة ليتجاوزه التطبيق دون انهيار
        return [];
    }
}

module.exports = { getStreams };
