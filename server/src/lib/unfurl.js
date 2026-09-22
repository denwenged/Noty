/**
 * Link unfurling with product awareness.
 *
 * Pulls standard OpenGraph metadata, and — when the page looks like a product
 * listing (Amazon, eBay, most Shopify/WooCommerce shops) — also extracts the
 * product image, current price, list price and discount.
 *
 * Sources tried, in order of reliability:
 *   1. JSON-LD  (schema.org Product / Offer)  — most accurate
 *   2. Microdata / RDFa itemprop attributes
 *   3. OpenGraph product:* + twitter:data meta tags
 *   4. Site-specific DOM fallbacks (Amazon, eBay)
 */

const decodeEntities = (s = '') =>
  s
    .replace(/&(?:amp|#38);/g, '&')
    .replace(/&(?:lt|#60);/g, '<')
    .replace(/&(?:gt|#62);/g, '>')
    .replace(/&(?:quot|#34);/g, '"')
    .replace(/&(?:apos|#39|#x27);/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .trim();

const CURRENCY_SYMBOL = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', INR: '₹', KRW: '₩',
  AUD: 'A$', CAD: 'C$', CHF: 'CHF', SEK: 'kr', NOK: 'kr', DKK: 'kr',
  PLN: 'zł', BRL: 'R$', MXN: 'MX$', RUB: '₽', TRY: '₺', ZAR: 'R',
};

export function formatPrice(amount, currency) {
  if (amount == null || Number.isNaN(amount)) return null;
  const cur = (currency || '').toUpperCase();
  if (cur) {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: cur,
        maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
      }).format(amount);
    } catch {
      /* unknown currency code — fall through */
    }
  }
  const sym = CURRENCY_SYMBOL[cur] || '';
  const n = amount % 1 === 0 ? String(amount) : amount.toFixed(2);
  return sym ? `${sym}${n}` : n;
}

/** Turn "1.299,00", "$1,299.00", "1 299.00 USD" into 1299.00 */
export function parsePrice(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (!s) return null;
  // keep digits and separators only
  s = s.replace(/[^\d.,]/g, '');
  if (!s) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) {
    // whichever comes last is the decimal separator
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma !== -1) {
    const decimals = s.length - lastComma - 1;
    // "1,299" = thousands; "12,99" = decimal
    s = decimals === 3 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else {
    const decimals = lastDot === -1 ? 0 : s.length - lastDot - 1;
    if (decimals === 3 && s.replace(/\./g, '').length > 3) s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** Walk a JSON-LD blob (which may be an array or use @graph) for a Product. */
function findProduct(node, depth = 0) {
  if (!node || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findProduct(n, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof node !== 'object') return null;

  const type = node['@type'];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((t) => typeof t === 'string' && /product|book|vehicle|offer/i.test(t))) {
    if (types.some((t) => /product|book|vehicle/i.test(String(t)))) return node;
  }
  for (const key of ['@graph', 'mainEntity', 'itemListElement', 'hasVariant']) {
    if (node[key]) {
      const hit = findProduct(node[key], depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

function offersOf(product) {
  let o = product?.offers;
  if (!o) return null;
  if (Array.isArray(o)) o = o[0];
  if (o && o['@type'] === 'AggregateOffer') {
    return {
      price: o.lowPrice ?? o.price,
      priceCurrency: o.priceCurrency,
      availability: o.availability,
    };
  }
  return o;
}

export function extractProduct(html, host) {
  const out = {
    price: null,
    priceFormatted: null,
    currency: null,
    listPrice: null,
    listPriceFormatted: null,
    discountPercent: null,
    availability: null,
    image: null,
    title: null,
    isProduct: false,
  };

  // ---------- 1. JSON-LD ----------
  const ldBlocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of ldBlocks) {
    let data;
    try {
      data = JSON.parse(m[1].trim().replace(/^\uFEFF/, ''));
    } catch {
      continue;
    }
    const product = findProduct(data);
    if (!product) continue;
    const offer = offersOf(product);
    const price = parsePrice(offer?.price ?? offer?.lowPrice);
    if (price != null) {
      out.price = price;
      out.currency = offer?.priceCurrency || out.currency;
      out.isProduct = true;
    }
    const img = product.image;
    const imgUrl = Array.isArray(img) ? img[0] : typeof img === 'object' ? img?.url : img;
    if (imgUrl) out.image = String(imgUrl);
    if (product.name) out.title = decodeEntities(String(product.name));
    if (offer?.availability) out.availability = String(offer.availability).split('/').pop();
    // schema sometimes carries the strikethrough price
    const list =
      parsePrice(product.listPrice) ??
      parsePrice(offer?.highPrice) ??
      parsePrice(offer?.priceSpecification?.price);
    if (list && out.price && list > out.price) out.listPrice = list;
    if (out.price != null) break;
  }

  const pick = (re) => {
    const m = html.match(re);
    return m ? decodeEntities(m[1]) : null;
  };

  // ---------- 2. microdata / RDFa ----------
  if (out.price == null) {
    const micro =
      pick(/itemprop=["']price["'][^>]*content=["']([^"']+)/i) ||
      pick(/content=["']([^"']+)["'][^>]*itemprop=["']price["']/i) ||
      // some shops put the price in the element's text instead of an attribute
      pick(/itemprop=["']price["'][^>]*>\s*([^<]{1,40})</i);
    const p = parsePrice(micro);
    if (p != null) {
      out.price = p;
      out.isProduct = true;
      out.currency =
        out.currency ||
        pick(/itemprop=["']priceCurrency["'][^>]*content=["']([^"']+)/i) ||
        pick(/content=["']([^"']+)["'][^>]*itemprop=["']priceCurrency["']/i);
    }
  }

  // ---------- 3. OpenGraph product tags ----------
  if (out.price == null) {
    const og =
      pick(/<meta[^>]+property=["'](?:og:price:amount|product:price:amount)["'][^>]+content=["']([^"']+)/i) ||
      pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["'](?:og:price:amount|product:price:amount)["']/i) ||
      pick(/<meta[^>]+(?:name|property)=["']twitter:data1["'][^>]+content=["']([^"']+)/i);
    const p = parsePrice(og);
    if (p != null) {
      out.price = p;
      out.isProduct = true;
    }
  }
  out.currency =
    out.currency ||
    pick(/<meta[^>]+property=["'](?:og:price:currency|product:price:currency)["'][^>]+content=["']([^"']+)/i) ||
    pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["'](?:og:price:currency|product:price:currency)["']/i);

  // ---------- 4. site-specific fallbacks ----------
  if (out.price == null && /amazon\./i.test(host)) {
    const amazon =
      pick(/class=["'][^"']*a-price-whole[^"']*["'][^>]*>([\d.,]+)/i) ||
      pick(/id=["'](?:priceblock_ourprice|priceblock_dealprice|price_inside_buybox)["'][^>]*>\s*([^<]+)/i) ||
      pick(/"displayPrice"\s*:\s*"([^"]+)"/i) ||
      pick(/class=["'][^"']*a-offscreen[^"']*["'][^>]*>\s*([^<]+)/i);
    const p = parsePrice(amazon);
    if (p != null) {
      out.price = p;
      out.isProduct = true;
      out.currency = out.currency || (/[£]/.test(amazon || '') ? 'GBP' : /€/.test(amazon || '') ? 'EUR' : 'USD');
    }
  }
  if (out.price == null && /ebay\./i.test(host)) {
    const ebay =
      pick(/itemprop=["']price["'][^>]*>\s*([^<]+)/i) ||
      pick(/id=["'](?:prcIsum|mm-saleDscPrc)["'][^>]*>\s*([^<]+)/i) ||
      pick(/"price"\s*:\s*\{\s*"value"\s*:\s*"?([\d.,]+)/i) ||
      pick(/class=["'][^"']*x-price-primary[^"']*["'][^>]*>[\s\S]{0,120}?([$€£]\s?[\d.,]+)/i);
    const p = parsePrice(ebay);
    if (p != null) {
      out.price = p;
      out.isProduct = true;
    }
  }

  // amazon main image fallback
  if (!out.image && /amazon\./i.test(host)) {
    const hiRes =
      pick(/"hiRes"\s*:\s*"([^"]+)"/i) ||
      pick(/"large"\s*:\s*"([^"]+)"/i) ||
      pick(/id=["']landingImage["'][^>]+data-old-hires=["']([^"']+)/i) ||
      pick(/id=["']landingImage["'][^>]+src=["']([^"']+)/i);
    if (hiRes) out.image = hiRes;
  }
  if (!out.image && /ebay\./i.test(host)) {
    const eImg =
      pick(/id=["'](?:icImg|mainImgHldr)["'][^>]+src=["']([^"']+)/i) ||
      pick(/"image"\s*:\s*"(https:\/\/i\.ebayimg[^"]+)"/i);
    if (eImg) out.image = eImg;
  }

  // list / "was" price
  if (out.listPrice == null) {
    const was =
      pick(/<meta[^>]+property=["']product:original_price:amount["'][^>]+content=["']([^"']+)/i) ||
      pick(/class=["'][^"']*(?:a-text-price|basisPrice|was-price|list-price|compare-at|strikethrough|price--original)[^"']*["'][^>]*>[\s\S]{0,160}?([$€£¥]\s?[\d.,]+|[\d.,]+\s*(?:USD|EUR|GBP))/i) ||
      pick(/<(?:del|s)\b[^>]*>[\s\S]{0,80}?([$€£¥]\s?[\d.,]+)/i);
    const p = parsePrice(was);
    if (p != null && out.price != null && p > out.price) out.listPrice = p;
  }

  if (!out.availability) {
    const av = pick(/itemprop=["']availability["'][^>]*(?:content|href)=["']([^"']+)/i);
    if (av) out.availability = av.split('/').pop();
  }

  // ---------- derive formatted values + discount ----------
  if (out.price != null && !out.currency) {
    const symbolSource = html.match(/itemprop=["']price["'][^>]*>\s*([^<]{1,40})</i)?.[1] || '';
    if (/£/.test(symbolSource)) out.currency = 'GBP';
    else if (/€/.test(symbolSource)) out.currency = 'EUR';
    else if (/\$/.test(symbolSource)) out.currency = 'USD';
  }
  if (out.price != null) {
    out.priceFormatted = formatPrice(out.price, out.currency);
    if (out.listPrice && out.listPrice > out.price) {
      out.listPriceFormatted = formatPrice(out.listPrice, out.currency);
      out.discountPercent = Math.round(((out.listPrice - out.price) / out.listPrice) * 100);
      if (out.discountPercent < 1 || out.discountPercent > 99) {
        out.discountPercent = null;
        out.listPrice = null;
        out.listPriceFormatted = null;
      }
    }
  }
  return out;
}

/** Fetch a URL and build a rich preview object. */
export async function unfurl(url) {
  const host = new URL(url).hostname;
  const base = {
    url,
    title: host.replace(/^www\./, ''),
    description: '',
    favicon: `https://icons.duckduckgo.com/ip3/${host}.ico`,
    image: null,
    isProduct: false,
    price: null,
    priceFormatted: null,
    listPriceFormatted: null,
    discountPercent: null,
    currency: null,
    availability: null,
    siteName: null,
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  let html = '';
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        // Retailers serve stripped pages to obvious bots.
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    html = (await resp.text()).slice(0, 700000);
  } catch {
    return base;
  } finally {
    clearTimeout(timer);
  }

  const pick = (re) => {
    const m = html.match(re);
    return m ? decodeEntities(m[1]) : null;
  };

  const ogTitle =
    pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)/i) ||
    pick(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i) ||
    pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const description =
    pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)/i) ||
    pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i) ||
    '';
  let image =
    pick(/<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)/i) ||
    pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i) ||
    pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
    pick(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)/i);
  const siteName = pick(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i);

  const product = extractProduct(html, host);
  if (product.image) image = product.image;

  // resolve protocol-relative / relative image URLs
  if (image) {
    try {
      image = new URL(image, url).href;
    } catch {
      image = null;
    }
  }

  return {
    ...base,
    title: product.title || ogTitle || base.title,
    description,
    image,
    siteName,
    isProduct: product.isProduct,
    price: product.price,
    currency: product.currency,
    priceFormatted: product.priceFormatted,
    listPriceFormatted: product.listPriceFormatted,
    discountPercent: product.discountPercent,
    availability: product.availability,
  };
}
