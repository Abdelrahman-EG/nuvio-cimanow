/**
 * Nuvio Provider: CimaNow V2.1
 * Native Pure JS - Strict Video Filter (No JS/Images)
 */

const BASE_URL = "https://cimanow.cc";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_KEY = "4e44d9029b1270a757cddc766a1bcb63";

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        // 1. جلب بيانات TMDB
        let metaUrl = `${TMDB_API}/${mediaType}/${tmdbId}?api_key=${TMDB_KEY}&language=ar`;
        let res = await fetch(metaUrl);
        let data = await res.json();
        
        let query = data.title || data.name || "";
        if (!query) {
            res = await fetch(`${TMDB_API}/${mediaType}/${tmdbId}?api_key=${TMDB_KEY}&language=en-US`);
            data = await res.json();
            query = data.title || data.name || "";
        }

        if (!query) return [];

        let cleanQuery = query.replace(/[^\w\s\u0600-\u06FF]/gi, " ").trim();
        let searchQuery = cleanQuery.split(" ")[0]; // نأخذ أول كلمة لضمان دقة البحث

        // 2. البحث داخل سيما ناو
        let searchRes = await fetch(`${BASE_URL}/?s=${encodeURIComponent(searchQuery)}`);
        let searchHtml = await searchRes.text();

        let postUrl = "";
        let links = searchHtml.match(/href="(https:\/\/cimanow\.cc\/[^"]+)"/g);
        if (links) {
            for (let l of links) {
                let cleanLink = l.replace('href="', '').replace('"', '');
                if (!cleanLink.includes("/category/") && !cleanLink.includes("/tag/") && !cleanLink.includes("wp-content")) {
                    postUrl = cleanLink;
                    break; 
                }
            }
        }

        if (!postUrl) return [];

        // 3. الدخول للمقال وصفحة المشاهدة
        let postRes = await fetch(postUrl);
        let postHtml = await postRes.text();

        let watchMatch = postHtml.match(/href="([^"]+watch[^"]*)"/i);
        if (watchMatch) {
            let watchUrl = watchMatch[1];
            if (!watchUrl.startsWith("http")) watchUrl = BASE_URL + watchUrl;
            let watchRes = await fetch(watchUrl);
            postHtml = await watchRes.text();
        }

        let streams = [];
        let count = 1;
        let seenUrls = new Set(); // مصفوفة لمنع تكرار السيرفرات

        // 4. استخراج الروابط المباشرة (m3u8, mp4)
        let mediaRegex = /(https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*)/gi;
        let m;
        while ((m = mediaRegex.exec(postHtml)) !== null) {
            let url = m[1];
            if (!url.includes("google") && !url.includes("facebook") && !seenUrls.has(url)) {
                seenUrls.add(url);
                streams.push({
                    server: url.includes(".m3u8") ? `CimaNow Auto ${count}` : `CimaNow HD ${count}`,
                    name: "CimaNow Direct",
                    title: url.includes(".m3u8") ? "HLS Stream" : "MP4 Stream",
                    url: url,
                    quality: "Auto",
                    isM3U8: url.includes(".m3u8"),
                    type: url.includes(".m3u8") ? "m3u8" : "mp4"
                });
                count++;
            }
        }

        // دالة مخصصة لفلترة السيرفرات الوهمية (الصور والجافاسكريبت)
        function processServer(src) {
            if (src.startsWith("//")) src = "https:" + src;
            
            // الفلتر القوي: استبعاد أي رابط ليس فيديو
            if (!src.startsWith("http")) return;
            if (src.match(/\.(js|css|webp|gif|jpg|png|svg)$/i)) return; // استبعاد الصور والسكربتات
            if (src.includes("google") || src.includes("facebook") || src.includes("cloudflare") || src.includes("gstatic") || src.includes("ibb.co")) return;
            if (src.includes("cimanow.cc")) return; 

            if (!seenUrls.has(src)) {
                seenUrls.add(src);
                
                let sName = "سيرفر مشاهدة";
                if (src.includes("vidbom") || src.includes("vidshare") || src.includes("vidbm")) sName = "VidBom";
                else if (src.includes("uqload")) sName = "Uqload";
                else if (src.includes("dood")) sName = "DoodStream";
                else if (src.includes("ok.ru")) sName = "Ok.ru";
                else if (src.includes("voe.sx")) sName = "Voe";
                else if (src.includes("mixdrop")) sName = "MixDrop";
                else if (src.includes("streamwish")) sName = "StreamWish";

                streams.push({
                    server: `${sName} ${count++}`,
                    name: sName,
                    title: "سيرفر خارجي",
                    url: src,
                    quality: "1080p",
                    isM3U8: false,
                    type: "embed"
                });
            }
        }

        // 5. استخراج الـ iframes المخصصة للفيديو فقط
        let iframeRegex = /<iframe[^>]+src="([^"]+)"/gi;
        while ((m = iframeRegex.exec(postHtml)) !== null) {
            processServer(m[1]);
        }

        // 6. استخراج السيرفرات من أزرار التشغيل المخفية
        let dataRegex = /data-(?:url|embed)="([^"]+)"/gi;
        while ((m = dataRegex.exec(postHtml)) !== null) {
            processServer(m[1]);
        }

        return streams;
    } catch (e) {
        return [];
    }
}

module.exports = { getStreams };
