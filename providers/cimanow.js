/**
 * Nuvio Provider: CimaNow 
 * Version: Ultimate Debugger with Timeout Racing
 */

const BASE_URL = "https://cimanow.cc";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_KEY = "4e44d9029b1270a757cddc766a1bcb63";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ar,en-US;q=0.9,en;q=0.8"
};

// دالة أمان: طلب الشبكة مع حد أقصى للوقت (5 ثوانٍ للطلب الواحد)
function fetchWithTimeout(url, options, timeoutMs = 5000) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeoutMs))
  ]);
}

// دالة لإنشاء سيرفر يعرض رسالة الخطأ بشكل مرئي بدلاً من التحميل اللانهائي
function createErrorStream(message) {
  return [{
    server: message,
    name: "CimaNow Error",
    title: "اضغط هنا لرؤية الخطأ",
    url: "https://www.w3schools.com/html/mov_bbb.mp4",
    link: "https://www.w3schools.com/html/mov_bbb.mp4",
    quality: "Unknown",
    isM3U8: false,
    type: "mp4"
  }];
}

// المنطق الأساسي للبحث والجلب
async function executeScraping(tmdbId, mediaType) {
  try {
    // 1. جلب الاسم
    const tmdbRes = await fetchWithTimeout(`${TMDB_API}/${mediaType}/${tmdbId}?api_key=${TMDB_KEY}&language=en-US`, {}, 4000);
    const tmdbData = await tmdbRes.json();
    const title = tmdbData.title || tmdbData.name;

    if (!title) return createErrorStream("⚠️ فشل جلب اسم الفيلم من TMDB");

    // 2. البحث في الموقع
    const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(title.split(' ')[0])}`;
    const searchRes = await fetchWithTimeout(searchUrl, { headers: HEADERS }, 6000);
    
    if (searchRes.status !== 200) {
      return createErrorStream(`⚠️ حظر من سيرفر سيما ناو (كود: ${searchRes.status})`);
    }

    const html = await searchRes.text();

    // 3. استخراج الروابط السريعة (لإثبات الاتصال)
    const streams = [];
    const mp4Regex = /(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/gi;
    let match;
    let count = 1;

    while ((match = mp4Regex.exec(html)) !== null) {
      streams.push({
        server: `CimaNow Direct ${count++}`,
        name: "CimaNow MP4",
        title: "جودة مباشرة",
        url: match[1],
        link: match[1],
        quality: "Auto",
        isM3U8: false,
        type: "mp4"
      });
    }

    if (streams.length > 0) return streams;

    return createErrorStream(`⚠️ تم الاتصال بالموقع بنجاح، لكن لم يعثر على روابط للفيلم: ${title}`);

  } catch (error) {
    if (error.message === "Timeout") {
      return createErrorStream("⚠️ اتصال معلق: الموقع لا يرد على التطبيق (Cloudflare Timeout)");
    }
    return createErrorStream(`⚠️ خطأ برمجي: ${error.message}`);
  }
}

// الدالة الرئيسية (مغلفة بمؤقت زمني شامل 8 ثوانٍ لمنع التطبيق من التحميل اللانهائي)
async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    return await Promise.race([
      executeScraping(tmdbId, mediaType),
      new Promise(resolve => setTimeout(() => resolve(createErrorStream("⚠️ التطبيق استغرق وقتاً طويلاً وتم إيقافه إجبارياً")), 8000))
    ]);
  } catch (err) {
    return createErrorStream("⚠️ انهيار في محرك التطبيق");
  }
}

module.exports = { getStreams };
