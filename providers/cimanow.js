/**
 * Nuvio Provider: CimaNow
 * Content Language: Arabic (ar)
 */

const BASE_URL = "https://cimanow.cc";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_KEY = "4e44d9029b1270a757cddc766a1bcb63";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
  "Referer": BASE_URL
};

async function getMetadata(tmdbId, mediaType) {
  try {
    const res = await fetch(`${TMDB_API}/${mediaType}/${tmdbId}?api_key=${TMDB_KEY}&language=ar`);
    const data = await res.json();
    return {
      titleAr: data.title || data.name || "",
      titleEn: data.original_title || data.original_name || "",
      year: (data.release_date || data.first_air_date || "").split("-")[0]
    };
  } catch {
    return null;
  }
}

async function searchAndGetPost(title, year, mediaType, season, episode) {
  try {
    const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(title)}`;
    const res = await fetch(searchUrl, { headers: HEADERS });
    const html = await res.text();

    const postRegex = /<article[^>]*>[\s\S]*?<a\s+href="([^"]+)"[^>]*title="([^"]+)"[\s\S]*?<\/article>/gi;
    let match;
    const posts = [];

    while ((match = postRegex.exec(html)) !== null) {
      posts.push({ url: match[1], title: match[2] });
    }

    if (posts.length === 0) return null;

    if (mediaType === "movie") {
      const matchMovie = posts.find(p => p.title.includes(year) || p.title.includes(title));
      return matchMovie ? matchMovie.url : posts[0].url;
    } else {
      const sNum = String(season || 1);
      const epNum = String(episode || 1);
      const matchEp = posts.find(p => 
        (p.title.includes(`الموسم ${sNum}`) || p.title.includes(`موسم ${sNum}`)) &&
        (p.title.includes(`الحلقة ${epNum}`) || p.title.includes(`حلقة ${epNum}`))
      );
      return matchEp ? matchEp.url : posts[0].url;
    }
  } catch {
    return null;
  }
}

async function extractStreams(url) {
  const streams = [];
  try {
    const res = await fetch(url, { headers: HEADERS });
    const html = await res.text();

    // 1. استخراج الـ iFrames
    const iframeRegex = /<iframe[^>]+src="([^"]+)"/gi;
    let ifMatch;
    let idx = 1;
    while ((ifMatch = iframeRegex.exec(html)) !== null) {
      let src = ifMatch[1];
      if (src.startsWith("//")) src = "https:" + src;
      if (!src.includes("google") && !src.includes("facebook") && !src.includes("ads")) {
        streams.push({
          server: `CimaNow Server ${idx++}`,
          url: src,
          quality: "HD",
          type: "embed",
          headers: {
            "Referer": url,
            "User-Agent": HEADERS["User-Agent"]
          }
        });
      }
    }

    // 2. استخراج روابط التشغيل المباشرة (.mp4 و .m3u8)
    const directRegex = /(https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*)/gi;
    let dirMatch;
    while ((dirMatch = directRegex.exec(html)) !== null) {
      const link = dirMatch[1];
      streams.push({
        server: link.includes(".m3u8") ? "HLS Auto Stream" : "Direct MP4",
        url: link,
        quality: "Auto",
        type: link.includes(".m3u8") ? "hls" : "mp4",
        headers: {
          "Referer": BASE_URL,
          "User-Agent": HEADERS["User-Agent"]
        }
      });
    }
  } catch (e) {
    console.error(e);
  }
  return streams;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  const meta = await getMetadata(tmdbId, mediaType);
  if (!meta) return [];

  let postUrl = await searchAndGetPost(meta.titleAr, meta.year, mediaType, season, episode);
  if (!postUrl && meta.titleEn) {
    postUrl = await searchAndGetPost(meta.titleEn, meta.year, mediaType, season, episode);
  }

  if (!postUrl) return [];
  return await extractStreams(postUrl);
}

module.exports = { getStreams };