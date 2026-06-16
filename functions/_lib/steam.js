// Server-side Steam import. Runs inside the Worker so members' browsers never
// hit Steam directly. Mirrors the appdetails call already used by
// .github/workflows/update-steam-sales.yml.

export function parseSteamAppId(url) {
  if (!url) return null;
  const m = String(url).match(/store\.steampowered\.com\/app\/(\d+)/);
  return m ? m[1] : null;
}

// Returns a normalized game object, or null if Steam has no data for the id.
// Throws on network / non-OK responses so the caller can report a clean error.
export async function fetchSteamGame(appId) {
  const endpoint = new URL('https://store.steampowered.com/api/appdetails');
  endpoint.searchParams.set('appids', appId);
  endpoint.searchParams.set('cc', 'dk');
  endpoint.searchParams.set('l', 'english');

  const res = await fetch(endpoint, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error('Steam returned ' + res.status);

  const payload = await res.json();
  const entry = payload && payload[appId];
  if (!entry || !entry.success || !entry.data) return null;

  const d = entry.data;
  const genres = (d.genres || []).map((g) => g.description).filter(Boolean);

  const platforms = [];
  if (d.platforms) {
    if (d.platforms.windows) platforms.push('Windows');
    if (d.platforms.mac) platforms.push('macOS');
    if (d.platforms.linux) platforms.push('Linux');
  }

  let price = '';
  if (d.is_free) price = 'Free';
  else if (d.price_overview) price = d.price_overview.final_formatted || '';

  return {
    steamAppId: appId,
    title: d.name || '',
    image: d.header_image || `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`,
    storeUrl: `https://store.steampowered.com/app/${appId}/`,
    genres,
    platforms,
    price,
  };
}
