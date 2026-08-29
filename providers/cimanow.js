/**
 * Nuvio Provider: CimaNow (with Full Logging & Deep Watch Resolution)
 */

const BASE_URL = "https://cimanow.cc";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_KEY = "4e44d9029b1270a757cddc766a1bcb63";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Referer": BASE_URL
};

// طباعة موحدة للكونسول
function log(step, message, data = "") {
  console.log(`[CimaNow-Debug] [${step}] ${message}`, data ? JSON.stringify(data) : "");
}

// 1. جلب العناوين من TMDB
async function getTmdbDetails(tmdbId, mediaType) {
  try {
    const resAr = await fetch(`${TMDB_API}/${mediaType}/${tmdbId}?api_key=${TMDB_KEY}&language=ar`);
    const dataAr = await resAr.json();

    const resEn = await fetch(`${TMDB_API}/${mediaType}/${tmdbId}?api_key=${TMDB_KEY}&language=en-US`);
    const dataEn = await resEn.json();

    const info = {
      titleAr: dataAr.title || dataAr.name || "",
      titleEn: dataEn.title || dataEn.name || "",
      year: (dataAr.release_date || dataAr.first_air_date || dataEn.release_date || "").split("-")[0]
    };
    log("TMDB", "بيانات العمل المستلمة:", info);
    return info;
  } catch (e) {
    log("TMDB", "فشل جلب بيانات TMDB", e.message);
    return null;
  }
}

// تنظيف الكلمات للبحث
function cleanTitle(str) {
  return str.replace(/[:\-–—_]/g, " ").replace(/\s+/g, " ").trim();
}

// 2. محرك البحث داخل الموقع
async function searchCimaNow(keyword) {
  const query = cleanTitle(keyword);
  const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(query)}`;
  log("Search", `جاري البحث عن: [${query}] الرابط: ${searchUrl}`);

  try {
    const res = await fetch(searchUrl, { headers: HEADERS });
    const html = await res.text();

    const results = [];
    const linkRegex = /<a[^>]+href="(https:\/\/cimanow\.cc\/[^"]+)"[^>]*title="([^"]+)"/gi;
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      const url = match[1];
      const title = match[2];
      if (!url.includes("/category/") && !url.includes("/tag/") && !url.includes("/actors/")) {
        results.push({ url, title });
      }
    }

    log("Search", `عدد النتائج المعثور عليها: ${results.length}`);
    return results;
  } catch (e) {
    log("Search", "خطأ أثناء محاولة البحث", e.message);
    return [];
  }
}

// 3. فحص واستخراج السيرفرات من صفحة المشاهدة
async function extractServers(initialUrl) {
  log("Scraper", `فتح الصفحة الأساسية: ${initialUrl}`);
  const streams = [];

  try {
    const res = await fetch(initialUrl, { headers: HEADERS });
    let html = await res.text();

    // البحث عن رابط صفحة المشاهدة المستقلة إن وجد
    const watchLinkMatch = html.match(/href="([^"]+(?:\/watch\/|\?watch=|\/watching\/)[^"]*)"/i);
    if (watchLinkMatch) {
      let watchUrl = watchLinkMatch[1];
      if (watchUrl.startsWith("//")) watchUrl = "https:" + watchUrl;
      else if (watchUrl.startsWith("/")) watchUrl = BASE_URL + watchUrl;

      log("Scraper", `تم العثور على صفحة مشاهدة فرعية، جاري الانتقال إليها: ${watchUrl}`);
      const watchRes = await fetch(watchUrl, { headers: HEADERS });
      html = await watchRes.text();
    }

    let serverIndex = 1;

    // A. استخراج وسوم iframes
    const iframeRegex = /<iframe[^>]+src="([^"]+)"/gi;
    let ifMatch;
    while ((ifMatch = iframeRegex.exec(html)) !== null) {
      let src = ifMatch[1];
      if (src.startsWith("//")) src = "https:" + src;
      if (!src.includes("facebook") && !src.includes("google") && !src.includes("ads") && !src.includes("histats")) {
        streams.push({
          name: "CimaNow",
          title: `مشغل سيرفر #${serverIndex++}`,
          url: src,
          quality: "1080p",
          headers: { "Referer": initialUrl, "User-Agent": HEADERS["User-Agent"] }
        });
      }
    }

    // B. استخراج السيرفرات من data-url أو data-embed
    const dataRegex = /data-(?:url|embed|src|iframe)="([^"]+)"/gi;
    let dataMatch;
    while ((dataMatch = dataRegex.exec(html)) !== null) {
      let src = dataMatch[1];
      if (src.startsWith("//")) src = "https:" + src;
      if (src.startsWith("http") && !src.includes("google") && !src.includes("ads")) {
        streams.push({
          name: "CimaNow",
          title: `مشغل إضافي #${serverIndex++}`,
          url: src,
          quality: "720p",
          headers: { "Referer": BASE_URL, "User-Agent": HEADERS["User-Agent"] }
        });
      }
    }

    // C. استخراج روابط التشغيل المباشرة (.mp4 أو .m3u8)
    const directRegex = /(https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*)/gi;
    let dirMatch;
    while ((dirMatch = directRegex.exec(html)) !== null) {
      const link = dirMatch[1];
      streams.push({
        name: "CimaNow Direct",
        title: link.includes(".m3u8") ? "HLS Auto Stream" : "Direct MP4 Video",
        url: link,
        quality: "Auto",
        headers: { "Referer": BASE_URL, "User-Agent": HEADERS["User-Agent"] }
      });
    }

    log("Scraper", `إجمالي السيرفرات المستخرجة بنجاح: ${streams.length}`);
  } catch (err) {
    log("Scraper", "خطأ أثناء استخراج السيرفرات", err.message);
  }

  return streams;
}

// 4. الدالة التنفيذية لتطبيق Nuvio
async function getStreams(tmdbId, mediaType, season, episode) {
  log("Init", `طلب جديد: TMDB ID: ${tmdbId}, Type: ${mediaType}, S: ${season}, E: ${episode}`);
  
  const meta = await getTmdbDetails(tmdbId, mediaType);
  if (!meta) {
    return [{ name: "CimaNow Info", title: "فشل الاتصال بـ TMDB", url: "" }];
  }

  let results = [];

  // البحث بالاسم العربي أولاً
  if (meta.titleAr) {
    results = await searchCimaNow(meta.titleAr);
  }

  // إذا لم نجد نتائج، نجرب بالاسم الإنجليزي
  if (results.length === 0 && meta.titleEn) {
    results = await searchCimaNow(meta.titleEn);
  }

  if (results.length === 0) {
    log("Finish", "لم يتم العثور على أي نتائج في CimaNow");
    return [{
      name: "CimaNow Info",
      title: `لا توجد نتائج لـ: ${meta.titleAr || meta.titleEn}`,
      url: ""
    }];
  }

  let targetUrl = null;

  if (mediaType === "movie") {
    // مطابقة الفيلم بالسنة أو أخذ النتيجة الأكثر ملاءمة
    const match = results.find(r => r.title.includes(meta.year) || r.title.includes(meta.titleAr));
    targetUrl = match ? match.url : results[0].url;
  } else {
    // مطابقة المسلسلات بالموسم والحلقة
    const s = String(season || 1);
    const ep = String(episode || 1);
    const epMatch = results.find(r =>
      (r.title.includes(`الموسم ${s}`) || r.title.includes(`موسم ${s}`)) &&
      (r.title.includes(`الحلقة ${ep}`) || r.title.includes(`حلقة ${ep}`))
    );
    targetUrl = epMatch ? epMatch.url : results[0].url;
  }

  log("Resolver", `تم اختيار الرابط النهائي: ${targetUrl}`);

  const finalStreams = await extractServers(targetUrl);

  if (finalStreams.length === 0) {
    return [{
      name: "CimaNow Info",
      title: `تم فتح الصفحة لكن لم يتم العثور على مشغلات صالحة`,
      url: ""
    }];
  }

  return finalStreams;
}

module.exports = { getStreams };
