import { ImageResponse } from 'next/og';
import th from '@/messages/th.json';

/**
 * Site-wide Open Graph image (SPEC §5.0).
 *
 * Satori (ImageResponse) has no Thai glyphs by default. At build time we fetch a
 * subset of IBM Plex Sans Thai (TTF, only the glyphs used) from Google Fonts.
 * If that fetch fails (offline CI, network policy), we fall back to an
 * English-only card so the build never breaks. See handoff / DECISIONS.
 */

export const alt = th.meta.ogAlt;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const TITLE_TH = th.landing.heroTitle;
const BRAND_TH = th.marketing.brand;
const SUB_TH = th.marketing.brandTagline;

const TITLE_EN = 'Know your rice field’s water, yield and salinity in advance';
const BRAND_EN = 'BoengNa';
const SUB_EN = 'Free field assessment · Pilot: Maha Sarakham';

async function loadThaiFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@700&text=${encodeURIComponent(text)}`;
    // No browser UA → Google Fonts serves TrueType, which Satori can parse (woff2 is not supported).
    const css = await (await fetch(cssUrl, { signal: AbortSignal.timeout(8000) })).text();
    const match = css.match(/src:\s*url\(([^)]+)\)\s*format\('(?:truetype|opentype)'\)/);
    if (!match?.[1]) return null;
    const res = await fetch(match[1], { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const font = await loadThaiFont(`${TITLE_TH}${BRAND_TH}${SUB_TH}·`);
  const thai = font !== null;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: 'linear-gradient(135deg, #ecfdf3 0%, #fef3c7 60%, #fdba74 100%)',
          color: '#0f2e1c',
          fontFamily: thai ? 'IBM Plex Sans Thai' : 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: '#1f7a45',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ width: 28, height: 28, borderRadius: 14, background: '#facc15' }} />
          </div>
          <div style={{ fontSize: 40, fontWeight: 700, color: '#1f7a45' }}>{thai ? BRAND_TH : BRAND_EN}</div>
        </div>
        <div style={{ display: 'flex', fontSize: thai ? 68 : 64, fontWeight: 700, lineHeight: 1.25, maxWidth: 1000 }}>
          {thai ? TITLE_TH : TITLE_EN}
        </div>
        <div style={{ display: 'flex', fontSize: 32, color: '#365314' }}>{thai ? SUB_TH : SUB_EN}</div>
      </div>
    ),
    {
      ...size,
      fonts: font ? [{ name: 'IBM Plex Sans Thai', data: font, weight: 700, style: 'normal' }] : undefined,
    },
  );
}
