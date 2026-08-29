/**
 * Nuvio Provider: CimaNow
 * Features: Search, Post resolution, Episode targeting, Stream extraction.
 */

const BASE_URL = "https://cimanow.cc";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_KEY = "4e44d9029b1270a757cddc766a1bcb63"; // مفتاح TMDB عام مخصص لجلب العناوين

const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
  "Referer": BASE_URL
};

/**
 * جلب بيانات العمل باللغة العربية والإنجليزية من TMDB
 */
async function getTmdbMetadata(tmdbId, mediaType) {
  const url = `${TMDB_API}/${mediaType}/${tmdbId}?api_key=${TMDB_KEY}&language=ar`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("فشل جلب بيانات TMDB");
  const data = await res.json();
  
  return {
    titleAr: data.title || data.name || "",
    titleEn: data.original_title || data.original_name || "",
    year: (data.release_date || data.first_air_date || "").split("-")[0]
  };
}

/**
 * البحث في CimaNow واستخراج رابط المشاهدة المطابق
 */
async function searchCimaNow(query, year, mediaType, season, episode) {
  const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(query)}`;
  const response = await fetch(searchUrl, { headers: DEFAULT_HEADERS });
  if (!response.ok) return null;

  const html = await response.text();

  // استخراج روابط البطاقات من نتائج البحث
  const itemRegex = /<article[^>]*>[\s\S]*?<a\s+href="([^"]+)"[^>]*title="([^"]+)"[\s\S]*?<\/article>/gi;
  let match;
  const results = [];

  while ((match = itemRegex.exec(html)) !== null) {
    results.push({ url: match[1], title: match[2] });
  }

  if (results.length === 0) return null;

  // مطابقة النتيجة بناءً على النوع (فيلم أو مسلسل) ورقم الموسم/الحلقة
  if (mediaType === "movie") {
    const movieMatch = results.find(item => item.title.includes(year) || item.title.includes(query));
    return movieMatch ? movieMatch.url : results[0].url;
  } else {
    // في حالة المسلسلات: البحث عن الموسم والحلقة
    const targetSeason = `الموسم ${season || 1}`;
    const targetEp = `الحلقة ${episode || 1}`;
    const epMatch = results.find(item => item.title.includes(targetSeason) && item.title.includes(targetEp));
    return epMatch ? epMatch.url : results[0].url;
  }
}

/**
 * استخراج سيرفرات المشاهدة وروابط الفيديو المباشرة من صفحة العمل
 */
async function extractStreamsFromPage(pageUrl) {
  const streams = [];
  const response = await fetch(pageUrl, { headers: DEFAULT_HEADERS });
  if (!response.ok) return streams;

  const html = await response.text();

  // 1. استخراج سيرفرات الـ Embed المضمنة داخل iframes أو مشغلات الموقع
  const iframeRegex = /<iframe[^>]+src="([^"]+)"/gi;
  let iframeMatch;
  let serverIndex = 1;

  while ((iframeMatch = iframeRegex.exec(html)) !== null) {
    let embedUrl = iframeMatch[1];
    if (embedUrl.startsWith("//")) embedUrl = "https:" + embedUrl;

    if (!embedUrl.includes("google") && !embedUrl.includes("facebook")) {
      streams.push({
        name: "CimaNow Server",
        title: `سيرفر مشغل #${serverIndex++}`,
        url: embedUrl,
        quality: "1080p",
        headers: {
          "Referer": pageUrl,
          "User-Agent": DEFAULT_HEADERS["User-Agent"]
        }
      });
    }
  }

  // 2. البحث عن روابط مباشرة (.mp4 / .m3u8) مشفرة أو صريحة داخل السكربتات
  const directLinkRegex = /(https?:\/\/[^"'\s]+\.(?:m3u8|mp4)[^"'\s]*)/gi;
  let directMatch;
  while ((directMatch = directLinkRegex.exec(html)) !== null) {
    streams.push({
      name: "CimaNow Direct",
      title: directMatch[1].endsWith(".m3u8") ? "HLS Auto Stream" : "Direct MP4 (HD)",
      url: directMatch[1],
      quality: "Auto",
      headers: {
        "Referer": BASE_URL,
        "User-Agent": DEFAULT_HEADERS["User-Agent"]
      }
    });
  }

  return streams;
}

/**
 * الدالة الرئيسية التي يستدعيها تطبيق Nuvio
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    // 1. جلب بيانات الفيلم/المسلسل من TMDB
    const meta = await getTmdbMetadata(tmdbId, mediaType);
    
    // 2. محاولة البحث بالعنوان العربي أولاً ثم الإنجليزي
    let targetUrl = await searchCimaNow(meta.titleAr, meta.year, mediaType, season, episode);
    if (!targetUrl && meta.titleEn) {
      targetUrl = await searchCimaNow(meta.titleEn, meta.year, mediaType, season, episode);
    }

    if (!targetUrl) return [];

    // 3. استخراج روابط المشاهدة
    return await extractStreamsFromPage(targetUrl);
  } catch (error) {
    console.error("[CimaNow Error]:", error);
    return [];
  }
}

module.exports = { getStreams };