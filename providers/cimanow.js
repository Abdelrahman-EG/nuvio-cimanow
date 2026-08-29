/**
 * Nuvio Provider: CimaNow (Full Direct Streams Extractor)
 */

const BASE_URL = "https://cimanow.cc";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_KEY = "4e44d9029b1270a757cddc766a1bcb63";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Referer": BASE_URL
};

// 1. جلب العناوين من TMDB
async function getTmdbInfo(tmdbId, mediaType) {
  try {
    const resAr = await fetch(`${TMDB_API}/${mediaType}/${tmdbId}?api_key=${TMDB_KEY}&language=ar`);
    const dataAr = await resAr.json();

    const resEn = await fetch(`${TMDB_API}/${mediaType}/${tmdbId}?api_key=${TMDB_KEY}&language=en-US`);
    const dataEn = await resEn.json();

    return {
      titleAr: (dataAr.title || dataAr.name || "").replace(/[:\-–—_]/g, " ").trim(),
      titleEn: (dataEn.title || dataEn.name || "").replace(/[:\-–—_]/g, " ").trim(),
      year: (dataAr.release_date || dataAr.first_air_date || dataEn.release_date || "").split("-")[0]
    };
  } catch (e) {
    return null;
  }
}

// 2. البحث عن رابط العمل داخل CimaNow
async function searchCimaNow(query) {
  if (!query) return [];
  try {
    const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, { headers: HEADERS });
    const html = await res.text();

    const results = [];
    const itemRegex = /<a[^>]+href="(https:\/\/cimanow\.cc\/[^"]+)"[^>]*title="([^"]+)"/gi;
    let match;

    while ((match = itemRegex.exec(html)) !== null) {
      const url = match[1];
      const title = match[2];
      if (!url.includes("/category/") && !url.includes("/tag/")) {
        results.push({ url, title });
      }
    }
    return results;
  } catch (e) {
    return [];
  }
}

// 3. فك تشفير سيرفرات المشاهدة واستخراج الروابط المباشرة
async function resolveDirectStreams(serverUrl, referer) {
  const streams = [];
  try {
    const res = await fetch(serverUrl, {
      headers: {
        "User-Agent": HEADERS["User-Agent"],
        "Referer": referer || BASE_URL
      }
    });
    const html = await res.text();

    // استخراج روابط HLS المباشرة (.m3u8)
    const m3u8Regex = /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/gi;
    let m3u8Match;
    while ((m3u8Match = m3u8Regex.exec(html)) !== null) {
      streams.push({
        name: "CimaNow HLS",
        title: "جودة تلقائية (Auto HLS)",
        url: m3u8Match[1],
        quality: "Auto",
        type: "m3u8",
        headers: { "Referer": serverUrl, "User-Agent": HEADERS["User-Agent"] }
      });
    }

    // استخراج روابط MP4 المباشرة
    const mp4Regex = /(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/gi;
    let mp4Match;
    while ((mp4Match = mp4Regex.exec(html)) !== null) {
      streams.push({
        name: "CimaNow Direct",
        title: "سيرفر مباشر (MP4 HD)",
        url: mp4Match[1],
        quality: "1080p",
        type: "mp4",
        headers: { "Referer": serverUrl, "User-Agent": HEADERS["User-Agent"] }
      });
    }
  } catch (err) {}
  return streams;
}

// 4. استخراج كافة السيرفرات من صفحة الفيلم/الحلقة
async function extractServers(postUrl) {
  let streams = [];
  try {
    const res = await fetch(postUrl, { headers: HEADERS });
    let html = await res.text();

    // الانتقال لصفحة المشاهدة إن وجدت
    const watchMatch = html.match(/href="([^"]*(?:\/watch\/|\?watch=)[^"]*)"/i);
    let watchUrl = postUrl;
    if (watchMatch) {
      watchUrl = watchMatch[1].startsWith("http") ? watchMatch[1] : BASE_URL + watchMatch[1];
      const watchRes = await fetch(watchUrl, { headers: HEADERS });
      html = await watchRes.text();
    }

    // A. البحث عن روابط مباشرة بداخل الصفحة
    const pageDirect = await resolveDirectStreams(watchUrl, postUrl);
    streams.push(...pageDirect);

    // B. استخراج جميع سيرفرات الـ iframe وسيرفرات data-url
    const serverLinks = [];
    const iframeRegex = /<iframe[^>]+src="([^"]+)"/gi;
    let ifm;
    while ((ifm = iframeRegex.exec(html)) !== null) {
      let src = ifm[1].startsWith("//") ? "https:" + ifm[1] : ifm[1];
      if (!src.includes("google") && !src.includes("facebook") && !src.includes("ads")) {
        serverLinks.push(src);
      }
    }

    const dataRegex = /data-(?:url|embed|src)="([^"]+)"/gi;
    let dtm;
    while ((dtm = dataRegex.exec(html)) !== null) {
      let src = dtm[1].startsWith("//") ? "https:" + dtm[1] : dtm[1];
      if (src.startsWith("http") && !src.includes("google")) {
        serverLinks.push(src);
      }
    }

    // فك تشفير السيرفرات المستخرجة بالتوازي
    for (const sUrl of serverLinks) {
      const resolved = await resolveDirectStreams(sUrl, watchUrl);
      streams.push(...resolved);
    }
  } catch (e) {}

  return streams;
}

// 5. الدالة الأساسية لتطبيق Nuvio
async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const meta = await getTmdbInfo(tmdbId, mediaType);
    if (!meta) return [];

    let results = [];
    if (meta.titleAr) results = await searchCimaNow(meta.titleAr);
    if (results.length === 0 && meta.titleEn) results = await searchCimaNow(meta.titleEn);

    if (results.length === 0) return [];

    let targetUrl = null;
    if (mediaType === "movie") {
      const match = results.find(r => r.title.includes(meta.year) || r.title.includes(meta.titleAr));
      targetUrl = match ? match.url : results[0].url;
    } else {
      const s = String(season || 1);
      const ep = String(episode || 1);
      const epMatch = results.find(r =>
        (r.title.includes(`الموسم ${s}`) || r.title.includes(`موسم ${s}`)) &&
        (r.title.includes(`الحلقة ${ep}`) || r.title.includes(`حلقة ${ep}`))
      );
      targetUrl = epMatch ? epMatch.url : results[0].url;
    }

    if (!targetUrl) return [];

    // إرجاع الروابط المباشرة الصالحة فقط للتشغيل
    return await extractServers(targetUrl);
  } catch (error) {
    return [];
  }
}

module.exports = { getStreams };
