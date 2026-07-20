import { readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

const userAgents = [
  "TelegramBot (like TwitterBot)",
  "Twitterbot/1.0",
  "facebookexternalhit/1.1",
  "Mozilla/5.0 social-preview-check"
];

const [, , baseUrlArg] = process.argv;
const baseUrl = baseUrlArg || process.env.SOCIAL_PREVIEW_BASE_URL || "";

if (!baseUrl) {
  void runLocalChecks();
} else {
  void runHttpChecks(baseUrl.replace(/\/$/, "")).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

async function runLocalChecks() {
  const pageSource = readFileSync(path.join(process.cwd(), "src/app/page.tsx"), "utf8");
  const adminLayoutSource = readFileSync(path.join(process.cwd(), "src/app/admin/layout.tsx"), "utf8");
  const imagePath = path.join(process.cwd(), "public/og-image-v3.png");
  const image = readFileSync(imagePath);
  const imageStat = await stat(imagePath);

  assert(pageSource.includes('card: "summary_large_image"'), "home twitter card missing");
  assert(pageSource.includes('type: "website"'), "home og type missing");
  assert(pageSource.includes('width: 1200'), "home og image width missing");
  assert(pageSource.includes('height: 630'), "home og image height missing");
  assert(pageSource.includes('type: "image/png"'), "home og image type missing");
  assert(adminLayoutSource.includes("index: false"), "admin noindex missing");
  assert(adminLayoutSource.includes("images: []"), "admin image reset missing");
  assert(image.subarray(0, 8).toString("hex") === "89504e470d0a1a0a", "OG image is not a PNG");
  assert(imageStat.size > 10_000, "OG image file is unexpectedly small");

  console.log(JSON.stringify({ mode: "local", passed: true, imagePath, imageBytes: imageStat.size }, null, 2));
}

async function runHttpChecks(origin: string) {
  const results = [];
  for (const userAgent of userAgents) {
    const home = await fetchHtml(`${origin}/`, userAgent);
    assert(home.status === 200, `home status for ${userAgent}: ${home.status}`);
    assertMeta(home.html, 'property="og:title"', `home og:title for ${userAgent}`);
    assertMeta(home.html, 'property="og:description"', `home og:description for ${userAgent}`);
    const imageUrl = readMetaContent(home.html, 'property="og:image"');
    assert(Boolean(imageUrl), `home og:image for ${userAgent}`);
    assert(/^https:\/\//.test(imageUrl), `home og:image must be absolute HTTPS for ${userAgent}: ${imageUrl}`);
    assertMeta(home.html, 'property="og:url"', `home og:url for ${userAgent}`);
    assertMeta(home.html, 'name="twitter:card" content="summary_large_image"', `home twitter card for ${userAgent}`);
    assertMeta(home.html, 'rel="canonical"', `home canonical for ${userAgent}`);

    const admin = await fetchHtml(`${origin}/admin/review`, userAgent);
    assert(
      /noindex/i.test(admin.html) && /nofollow/i.test(admin.html),
      `admin robots noindex/nofollow for ${userAgent}`
    );
    assert(!/og-image-v3|store-front|facade/.test(admin.html), `admin should not expose public og image for ${userAgent}`);

    results.push({ userAgent, homeStatus: home.status, adminStatus: admin.status, imageUrl });
  }

  const imageUrl = results[0]?.imageUrl;
  assert(imageUrl, "missing image URL");
  const image = await fetch(imageUrl, { headers: { "user-agent": userAgents[0]! }, redirect: "follow" });
  assert(image.status === 200, `image status ${image.status}`);
  assert((image.headers.get("content-type") ?? "").startsWith("image/"), "image content-type must be image/*");

  console.log(JSON.stringify({ mode: "http", passed: true, results, imageStatus: image.status, imageType: image.headers.get("content-type") }, null, 2));
}

async function fetchHtml(url: string, userAgent: string) {
  const response = await fetch(url, {
    headers: { "user-agent": userAgent },
    redirect: "follow"
  });
  return {
    status: response.status,
    html: await response.text()
  };
}

function assertMeta(html: string, marker: string, label: string) {
  assert(html.includes(marker), `${label} missing`);
}

function readMetaContent(html: string, marker: string) {
  const index = html.indexOf(marker);
  if (index < 0) return "";
  const tagStart = html.lastIndexOf("<meta", index);
  const tagEnd = html.indexOf(">", index);
  if (tagStart < 0 || tagEnd < 0) return "";
  const tag = html.slice(tagStart, tagEnd + 1);
  return tag.match(/\bcontent="([^"]+)"/)?.[1] ?? "";
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
