/**
 * Nuvio Provider: CimaNow (Advanced Extractor & Visual Debugger)
 */

const BASE_URL = "https://cimanow.cc";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_KEY = "4e44d9029b1270a757cddc766a1bcb63";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
  "Connection": "keep-alive"
};

// دالة لإنشاء سيرفر "تنبيه" لمعرفة الخطأ داخل التطبيق بدلاً من اختفاء الإضافة
function createErrorStream(message) {
  return [{
    server: `⚠️ CimaNow: ${message}`,
    name: `⚠️ CimaNow: ${message}`,
    title: "رسالة خطأ لتشخيص المشكلة",
    url: "https://www.w3schools.com/html/mov_bbb.mp4", // فيديو اختباري آمن لضمان ظهور السيرفر
    quality: "Unknown",
    isM3U8: false,
    type: "mp4",
    format: "mp4"
  }];
}

// 1. جلب العناوين من TMDB
async function getTmdbInfo(tmdbId, mediaType) {
  try {
    const resAr = await fetch(`${TMDB_API}/${mediaType}/${tmdbId}?api_key=${TMDB_KEY}&language=ar`);
    const dataAr = await resAr.json();

    const resEn = await fetch(`${TMDB_API}/${mediaType}/${tmdbId}?api_key=${TMDB_KEY}&language=en-US`);
    const dataEn = await resEn.json();

    const year = (dataAr.release_date || dataAr.first_air_date || dataEn.release_date || "").split("-")[0];
    
    return {
      titleAr: (dataAr.title || dataAr.name || "").replace(/[:\-–—_]/g, " ").trim(),
      titleEn: (dataEn.title || dataEn.name || "").replace(/[:\-–—_]/g, " ").trim(),
      year: year
    };
  } catch (e) {
    return null;
  }
}

// 2. البحث داخل موقع CimaNow
async function searchCimaNow(query) {
  if (!query) return [];
  try {
    const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, { headers: HEADERS });
    
    // فحص إذا كان الموقع يحظرنا (Cloudflare)
    if (res.status === 403 || res.status === 503) {
      throw new Error("Cloudflare_Block");
    }

    const html = await res.text();
    const results = [];
    
    // استخراج الروابط بمرونة أعلى
    const itemRegex = /href="([^"]+)"/gi;
    let match;
    while ((match = itemRegex.exec(html)) !== null) {
      let url = match[1];
      if (url.includes("cimanow.cc") && !url.includes("/category/") && !url.includes("/tag/") && !url.includes(".jpg") && !url.includes(".png")) {
        // استخراج العنوان من الرابط نفسه (لأن Title قد لا يكون موجوداً)
        let rawTitle = decodeURIComponent(url.split('/').filter(Boolean).pop());
        results.push({ url: url, title: rawTitle });
      }
    }
    
    // إزالة النتائج المكررة
    const uniqueResults = Array.from(new Set(results.map(a => a.url))).map(url => {
      return results.find(a => a.url === url);
    });

    return uniqueResults;
  } catch (e) {
    if (e.message === "Cloudflare_Block") throw e;
    return [];
  }
}

// 3. استخراج السيرفرات وصياغتها لمعايير Nuvio الصارمة
async function extractServers(postUrl) {
  let streams = [];
  try {
    const res = await fetch(postUrl, { headers: HEADERS });
    let html = await res.text();

    // البحث عن روابط المشاهدة المباشرة (mp4 أو m3u8)
    const mediaRegex = /(https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*)/gi;
    let match;
    let serverCount = 1;

    while ((match = mediaRegex.exec(html)) !== null) {
      let mediaUrl = match[1];
      let isHls = mediaUrl.includes(".m3u8");
      
      streams.push({
        server: `CimaNow Direct ${serverCount++}`, // المفتاح الأهم لـ Nuvio
        name: `CimaNow Direct`,
        title: isHls ? "جودة تلقائية (HLS)" : "جودة عالية (MP4)",
        url: mediaUrl,
        link: mediaUrl,
        quality: "Auto",
        isM3U8: isHls, // مفتاح هام جداً
        type: isHls ? "m3u8" : "mp4",
        format: isHls ? "m3u8" : "mp4",
        headers: { "Referer": BASE_URL, "User-Agent": HEADERS["User-Agent"] }
      });
    }

    // استخراج سيرفرات المشاهدة المضمنة (Embeds)
    const iframeRegex = /<iframe[^>]+src="([^"]+)"/gi;
    while ((match = iframeRegex.exec(html)) !== null) {
      let src = match[1].startsWith("//") ? "https:" + match[1] : match[1];
      if (!src.includes("google") && !src.includes("facebook") && !src.includes("ads")) {
        streams.push({
          server: `CimaNow Web Player ${serverCount++}`,
          name: `CimaNow Web Player`,
          title: "مشغل متصفح",
          url: src,
          link: src,
          quality: "1080p",
          isM3U8: false,
          type: "embed",
          format: "embed",
          headers: { "Referer": postUrl }
        });
      }
    }

  } catch (e) {}
  
  return streams;
}

// 4. الدالة الأساسية
async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const meta = await getTmdbInfo(tmdbId, mediaType);
    if (!meta) return createErrorStream("فشل الاتصال بقاعدة بيانات TMDB");

    let results = [];
    
    try {
      // نبحث بالاسم الإنجليزي أولاً لأنه أكثر دقة في روابط سيما ناو
      if (meta.titleEn) results = await searchCimaNow(meta.titleEn);
      
      // إذا فشل، نجرب الاسم العربي
      if (results.length === 0 && meta.titleAr) {
        results = await searchCimaNow(meta.titleAr);
      }
    } catch (err) {
      if (err.message === "Cloudflare_Block") {
        return createErrorStream("الموقع يحظر التطبيق (Cloudflare Block)");
      }
    }

    if (results.length === 0) {
      return createErrorStream(`لم يتم العثور على: ${meta.titleEn || meta.titleAr}`);
    }

    let targetUrl = null;
    
    if (mediaType === "movie") {
      // البحث في الروابط عن السنة
      let match = results.find(r => r.url.includes(meta.year) || r.title.includes(meta.year));
      targetUrl = match ? match.url : results[0].url;
    } else {
      const epStr = String(episode);
      const sStr = String(season);
      let match = results.find(r => r.url.includes(`حلقة-${epStr}`) || r.url.includes(`episode-${epStr}`));
      targetUrl = match ? match.url : results[0].url;
    }

    if (!targetUrl) return createErrorStream("تم العثور على نتائج لكن لم يتطابق الرابط");

    const streams = await extractServers(targetUrl);
    
    if (streams.length === 0) {
      return createErrorStream("تم فتح الصفحة بنجاح، لكن لم يتم العثور على أي فيديو");
    }

    return streams;
  } catch (error) {
    return createErrorStream(`خطأ عام: ${error.message}`);
  }
}

module.exports = { getStreams };
