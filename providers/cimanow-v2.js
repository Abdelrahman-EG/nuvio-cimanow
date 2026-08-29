/**
 * Nuvio Provider: CimaNow V2
 * Native Pure JS - Crash Proof
 */

const BASE_URL = "https://cimanow.cc";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_KEY = "4e44d9029b1270a757cddc766a1bcb63";

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

        if (!query) return [];

        let cleanQuery = query.replace(/[^\w\s\u0600-\u06FF]/gi, " ").trim();
        let searchQuery = cleanQuery.split(" ")[0];

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
        
        // استخراج الروابط المباشرة HLS و MP4
        let mediaRegex = /(https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*)/gi;
        let m;
        while ((m = mediaRegex.exec(postHtml)) !== null) {
            let url = m[1];
            if (!url.includes("google") && !url.includes("facebook")) {
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

        // استخراج السيرفرات الخارجية (Embeds)
        let iframeRegex = /(?:src|data-url|data-embed)="([^"]+)"/gi;
        while ((m = iframeRegex.exec(postHtml)) !== null) {
            let src = m[1];
            if (src.startsWith("//")) src = "https:" + src;
            
            if (src.startsWith("http") && !src.includes("google") && !src.includes("facebook") && !src.includes("cimanow.cc")) {
                let sName = "سيرفر مشاهدة";
                if (src.includes("vidbom") || src.includes("vidshare")) sName = "VidBom";
                else if (src.includes("uqload")) sName = "Uqload";
                else if (src.includes("dood")) sName = "DoodStream";
                else if (src.includes("ok.ru")) sName = "Ok.ru";

                streams.push({
                    server: `${sName} ${count}`,
                    name: sName,
                    title: "سيرفر خارجي",
                    url: src,
                    quality: "1080p",
                    isM3U8: false,
                    type: "embed"
                });
                count++;
            }
        }

        return streams;
    } catch (e) {
        return [];
    }
}

module.exports = { getStreams };
