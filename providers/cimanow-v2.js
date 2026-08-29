/**
 * Nuvio Provider: CimaNow V4 (Token Watch & Strict Media Filter)
 */

const BASE_URL = "https://cimanow.cc";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_KEY = "4e44d9029b1270a757cddc766a1bcb63";

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        // 1. جلب اسم الفيلم من TMDB
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
        let searchQuery = cleanQuery.split(" ")[0];

        // 2. البحث عن رابط الفيلم في الموقع
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

        // 3. الدخول لصفحة الفيلم والبحث عن رابط الـ Token (watching/?token=)
        let postRes = await fetch(postUrl);
        let postHtml = await postRes.text();

        // استخدام النمط الدقيق الذي أعطيتني إياه
        let watchMatch = postHtml.match(/href="([^"]+\/watching\/(?:\?token=[^"]*)?)"/i) || postHtml.match(/href="([^"]+watch[^"]*)"/i);
        let watchUrl = postUrl;

        if (watchMatch) {
            watchUrl = watchMatch[1];
            if (!watchUrl.startsWith("http")) watchUrl = BASE_URL + watchUrl;
        }

        // 4. الدخول لصفحة المشاهدة المحمية
        let watchRes = await fetch(watchUrl);
        let watchHtml = await watchRes.text();

        let streams = [];
        let count = 1;
        let seenUrls = new Set();

        // دالة صارمة جداً لإضافة السيرفرات واستبعاد الصور/السكربتات
        function addServer(src) {
            if (!src) return;
            if (src.startsWith("//")) src = "https:" + src;
            if (!src.startsWith("http")) return;

            // إزالة المتغيرات (مثل ?quality=85) من الرابط قبل فحصه
            let urlWithoutParams = src.split('?')[0].toLowerCase();
            
            // فلتر صارم: لو الرابط ينتهي بصورة أو سكربت يتم تجاهله فوراً
            if (urlWithoutParams.match(/\.(js|css|webp|gif|jpg|jpeg|png|svg|ico|woff)$/)) return;
            
            // استبعاد مسارات الووردبريس (مثل اللي ظهرت في صورتك)
            if (src.includes("wp-content") || src.includes("wp-includes")) return;
            if (src.includes("google") || src.includes("facebook") || src.includes("twitter")) return;

            if (!seenUrls.has(src)) {
                seenUrls.add(src);

                let sName = "سيرفر خارجي";
                if (src.includes("vidbom") || src.includes("vidshare") || src.includes("vidbm")) sName = "VidBom";
                else if (src.includes("uqload")) sName = "Uqload";
                else if (src.includes("dood")) sName = "DoodStream";
                else if (src.includes("ok.ru")) sName = "Ok.ru";
                else if (src.includes("cimanow") && (src.includes(".m3u8") || src.includes(".mp4"))) sName = "CimaNow HD";

                streams.push({
                    server: `${sName} ${count++}`,
                    name: sName,
                    url: src,
                    quality: "Auto",
                    isM3U8: urlWithoutParams.includes(".m3u8"),
                    type: urlWithoutParams.includes(".m3u8") ? "m3u8" : (urlWithoutParams.includes(".mp4") ? "mp4" : "embed")
                });
            }
        }

        // 5. استخراج السيرفرات (iframes و data-url) من صفحة المشاهدة
        let iframeRegex = /<iframe[^>]+src="([^"]+)"/gi;
        let m;
        while ((m = iframeRegex.exec(watchHtml)) !== null) {
            addServer(m[1]);
        }

        let dataRegex = /(?:data-url|data-embed|data-src|data-link)="([^"]+)"/gi;
        while ((m = dataRegex.exec(watchHtml)) !== null) {
            let link = m[1];
            // فك التشفير إذا كان الموقع يستخدم Base64 لإخفاء السيرفرات
            if (link.length > 20 && !link.includes("/") && !link.includes(" ")) {
                try { link = atob(link); } catch(e) {}
            }
            addServer(link);
        }

        let directRegex = /(https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*)/gi;
        while ((m = directRegex.exec(watchHtml)) !== null) {
            addServer(m[1]);
        }

        return streams;

    } catch (e) {
        return [];
    }
}

module.exports = { getStreams };
