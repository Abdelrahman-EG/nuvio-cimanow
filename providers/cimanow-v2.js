/**
 * Nuvio Provider: CimaNow V3 (Smart Debugger)
 * Crash Proof & Anti-Infinite Loading
 */

const BASE_URL = "https://cimanow.cc";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_KEY = "4e44d9029b1270a757cddc766a1bcb63";

// دالة الطوارئ: تمنع التطبيق من التحميل اللانهائي وتعرض الخطأ كسيرفر
function debug(msg) {
    return [{
        server: "⚠️ " + msg,
        name: "CimaNow Debug",
        title: "رسالة فحص",
        url: "https://www.w3schools.com/html/mov_bbb.mp4", // فيديو اختباري لإجبار التطبيق على العرض
        quality: "Auto",
        isM3U8: false,
        type: "mp4"
    }];
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        let metaUrl = `${TMDB_API}/${mediaType}/${tmdbId}?api_key=${TMDB_KEY}&language=ar`;
        let res = await fetch(metaUrl);
        let data = await res.json();
        
        let query = data.title || data.name || "";
        if (!query) {
            res = await fetch(`${TMDB_API}/${mediaType}/${tmdbId}?api_key=${TMDB_KEY}&language=en-US`);
            data = await res.json();
            query = data.title || data.name || "";
        }
        if (!query) return debug("فشل جلب اسم الفيلم من TMDB");

        let cleanQuery = query.replace(/[^\w\s\u0600-\u06FF]/gi, " ").trim();
        let searchQuery = cleanQuery.split(" ")[0];

        let searchRes = await fetch(`${BASE_URL}/?s=${encodeURIComponent(searchQuery)}`);
        if (searchRes.status !== 200) return debug(`الموقع حظر التطبيق (كود: ${searchRes.status})`);
        
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

        if (!postUrl) return debug("لم يتم العثور على الفيلم في بحث الموقع");

        let postRes = await fetch(postUrl);
        let postHtml = await postRes.text();

        // محاولة إيجاد صفحة المشاهدة
        let watchMatch = postHtml.match(/href="([^"]+watch[^"]*)"/i);
        if (watchMatch) {
            let watchUrl = watchMatch[1];
            if (!watchUrl.startsWith("http")) watchUrl = BASE_URL + watchUrl;
            let watchRes = await fetch(watchUrl);
            postHtml = await watchRes.text();
        }

        let streams = [];
        let possibleLinks = [];

        // تجميع كل الروابط المحتملة (iframes, data-url, m3u8)
        let dataUrls = postHtml.match(/(?:src|data-url|data-embed|data-link)="([^"]+)"/gi);
        if (dataUrls) {
            for (let d of dataUrls) {
                possibleLinks.push(d.match(/="([^"]+)"/)[1]);
            }
        }
        let directUrls = postHtml.match(/(https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*)/gi);
        if (directUrls) {
            possibleLinks.push(...directUrls);
        }

        // فلترة الروابط
        let count = 1;
        let seenUrls = new Set();
        
        for (let src of possibleLinks) {
            // محاولة فك تشفير Base64 إذا كان الرابط مشفراً (خدعة تستخدمها المواقع)
            if (src.length > 20 && !src.includes("/") && !src.includes(" ")) {
                try { src = atob(src); } catch(e) {}
            }

            if (src.startsWith("//")) src = "https:" + src;
            if (!src.startsWith("http")) continue;
            
            // تجاهل الصور والجافاسكريبت
            if (src.match(/\.(js|css|webp|gif|jpg|png|svg)$/i)) continue;
            if (src.includes("google") || src.includes("facebook") || src.includes("cloudflare") || src.includes("w3.org")) continue;

            if (!seenUrls.has(src)) {
                seenUrls.add(src);
                let sName = src.includes("cimanow") ? "سيرفر خاص" : "سيرفر خارجي";
                
                streams.push({
                    server: `${sName} ${count++}`,
                    name: "CimaNow",
                    url: src,
                    quality: "Auto",
                    isM3U8: src.includes(".m3u8"),
                    type: src.includes(".m3u8") ? "m3u8" : "mp4"
                });
            }
        }

        // إذا بعد كل هذا لم نجد أي رابط صالح:
        if (streams.length === 0) {
            // سنعرض حجم كود الصفحة لنتأكد هل الصفحة فارغة أم الروابط مشفرة بآلية أخرى
            return debug(`تم فتح الصفحة ولكن السيرفرات مشفرة. (حجم الكود: ${postHtml.length} حرف)`);
        }

        return streams;

    } catch (e) {
        return debug(`حدث خطأ برمجي: ${e.message}`);
    }
}

module.exports = { getStreams };
