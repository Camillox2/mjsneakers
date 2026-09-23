const cache = new Map<string, Promise<string>>();

type Pack = { parts: number; safe: string };

export function packedUrl(publicPath: string) {
  const hit = cache.get(publicPath);
  if (hit) return hit;
  const pending = resolve(publicPath);
  cache.set(publicPath, pending);
  return pending;
}

async function resolve(publicPath: string) {
  try {
    const head = await fetch(publicPath, { method: "HEAD" });
    const type = head.headers.get("content-type") || "";
    if (head.ok && !type.includes("text/html")) return publicPath;
  } catch {
    /* pack below */
  }
  const rel = publicPath.replace(/^\//, "");
  const manifest = (await fetch("/media/manifest.json").then((res) => (res.ok ? res.json() : null))) as
    | Record<string, Pack>
    | null;
  const info = manifest?.[rel];
  if (!info) return publicPath;
  let encoded = "";
  for (let index = 0; index < info.parts; index += 1) {
    const part = await fetch(`/media/${info.safe}.${String(index).padStart(2, "0")}`);
    if (!part.ok) return publicPath;
    encoded += (await part.text()).trim();
  }
  const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  const mime = rel.endsWith(".mp4") ? "video/mp4" : rel.endsWith(".png") ? "image/png" : "image/jpeg";
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}
