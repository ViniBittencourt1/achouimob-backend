import axios from "axios";

export async function fetchHTML(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SouzagomesCrawler/1.0)",
        "Accept-Language": "pt-BR,pt;q=0.8"
      },
      timeout: 8000
    });

    return { status: response.status, html: response.data };

  } catch (error) {
    return { status: error?.response?.status || 0, html: null };
  }
}