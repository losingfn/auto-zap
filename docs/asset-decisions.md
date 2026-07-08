# Решения по ассетам

Все материалы взяты из предоставленного архива и не заменялись альтернативами.

## Логотип

Исходник: `public/assets/source/logo.jpg`.

Созданы:

- `public/assets/brand/logo.webp`
- `public/assets/brand/logo.avif`
- `public/assets/brand/logo-transparent.png`
- `public/assets/brand/logo-mark.png`
- `public/assets/brand/favicon.svg`
- `public/assets/brand/apple-touch-icon.png`
- `public/favicon.ico`

Важно: исходник логотипа в архиве — JPG, а не SVG. Поэтому `favicon.svg` является SVG-оберткой над утвержденным графическим знаком, а не новой векторной отрисовкой.

## Иконки категорий

Исходник: `public/assets/source/category_icons.jpg`.

В архиве иконки предоставлены одним JPG-макетом карточек, не отдельными SVG-файлами. Для финального сайта подготовлены отдельные чистые SVG-иконки в стиле утвержденного макета и логотипа:

- `public/assets/categories/podveska.*`
- `public/assets/categories/elektrika.*`
- `public/assets/categories/filtry-i-masla.*`
- `public/assets/categories/tormoznaya-sistema.*`
- `public/assets/categories/kuzov-i-optika.*`
- `public/assets/categories/dvigatel-i-transmissiya.*`
- `public/assets/categories/aksessuary.*`
- `public/assets/categories/ves-assortiment.*`

Для каждой категории есть чистый SVG. PNG/WebP-кропы из исходного макета оставлены как вспомогательные контрольные материалы.

Иконка `Весь ассортимент` выполнена сеткой каталога, без коробок, складских символов и упаковки.

## Фотографии магазина

Исходники:

- `public/assets/source/facade.jpg`
- `public/assets/source/building.jpg`
- `public/assets/source/entrance.jpg`

Созданы WebP/AVIF и уменьшенные WebP-версии для адаптивной загрузки.

## Изображение продавца-консультанта

Исходник: `public/assets/source/seller_consultant.jpg`.

Созданы:

- `public/assets/vacancy/seller-consultant.webp`
- `public/assets/vacancy/seller-consultant.avif`

## Open Graph

Создано изображение:

- `public/og/store-front.webp`
- `public/og/store-front.jpg`

Основа — реальное фото магазина `facade.jpg`.

## Манифест

Полный список сгенерированных ассетов находится в `public/assets/assets-manifest.json`.
