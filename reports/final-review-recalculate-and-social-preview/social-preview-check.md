# Social Preview Check

Expected root metadata:

- canonical: `https://autozapchast-taldom.ru/`
- `og:type`: `website`
- `og:locale`: `ru_RU`
- `og:site_name`: `Автозапчасти на Салтыкова-Щедрина`
- `og:image`: `https://autozapchast-taldom.ru/og-image-v3.png`
- image: PNG, 1200 x 630
- Twitter card: `summary_large_image`

Run locally or against production:

```bash
pnpm social:preview:check
SOCIAL_PREVIEW_BASE_URL=https://autozapchast-taldom.ru pnpm social:preview:check
```

Telegram caches previews. After deploy, an old bare URL may still show the cached card. For verification only, send:

```text
https://autozapchast-taldom.ru/?v=2
```

The canonical must stay `https://autozapchast-taldom.ru/`. The query parameter is only for cache busting, not for permanent links.

Admin routes:

- `/admin/*` returns noindex/nofollow metadata;
- inherited public OG image is cleared;
- admin pages are not added to sitemap.
