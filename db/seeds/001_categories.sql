INSERT INTO categories (slug, name, sort_order, is_all_assortment, seo_title, seo_description)
VALUES
  ('podveska', 'Подвеска', 10, false, 'Подвеска | Автозапчасти на Салтыкова-Щедрина', 'Детали подвески в каталоге магазина автозапчастей в Талдоме.'),
  ('elektrika', 'Электрика', 20, false, 'Электрика | Автозапчасти на Салтыкова-Щедрина', 'Автомобильная электрика и сопутствующие товары в каталоге магазина.'),
  ('filtry-i-masla', 'Фильтры и масла', 30, false, 'Фильтры и масла | Автозапчасти на Салтыкова-Щедрина', 'Масла, фильтры и расходные материалы для обслуживания автомобиля.'),
  ('tormoznaya-sistema', 'Тормозная система', 40, false, 'Тормозная система | Автозапчасти на Салтыкова-Щедрина', 'Товары для тормозной системы в каталоге автозапчастей.'),
  ('kuzov-i-optika', 'Кузов и оптика', 50, false, 'Кузов и оптика | Автозапчасти на Салтыкова-Щедрина', 'Кузовные детали, фары, фонари и элементы оптики.'),
  ('dvigatel-i-transmissiya', 'Двигатель и трансмиссия', 60, false, 'Двигатель и трансмиссия | Автозапчасти на Салтыкова-Щедрина', 'Детали двигателя и трансмиссии в каталоге магазина.'),
  ('aksessuary', 'Аксессуары', 80, false, 'Аксессуары | Автозапчасти на Салтыкова-Щедрина', 'Автомобильные аксессуары и сопутствующие товары.'),
  ('ves-assortiment', 'Весь ассортимент', 90, true, 'Весь ассортимент | Автозапчасти на Салтыкова-Щедрина', 'Полный каталог товаров магазина автозапчастей в Талдоме.')
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  is_all_assortment = EXCLUDED.is_all_assortment,
  seo_title = EXCLUDED.seo_title,
  seo_description = EXCLUDED.seo_description,
  updated_at = now();

INSERT INTO contacts (id, name, phone, email, address, latitude, longitude, yandex_maps_url)
VALUES (
  1,
  'Автозапчасти на Салтыкова-Щедрина',
  '8-496-206-33-04',
  'auto-zapchast.taldom@rambler.ru',
  'Московская область, г. Талдом, ул. Салтыкова-Щедрина, д. 19',
  56.728464,
  37.520348,
  'https://yandex.ru/maps/10757/taldom/?ll=37.520401%2C56.728465&mode=search&sll=37.520348%2C56.728464&text=56.728464%2C37.520348&z=15'
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  phone = EXCLUDED.phone,
  email = EXCLUDED.email,
  address = EXCLUDED.address,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  yandex_maps_url = EXCLUDED.yandex_maps_url,
  updated_at = now();

INSERT INTO business_hours (day_of_week, opens_at, closes_at, is_closed)
VALUES
  (1, '09:00', '18:00', false),
  (2, '09:00', '18:00', false),
  (3, '09:00', '18:00', false),
  (4, '09:00', '18:00', false),
  (5, '09:00', '18:00', false),
  (6, '09:00', '16:00', false),
  (7, '09:00', '16:00', false)
ON CONFLICT (day_of_week) DO UPDATE
SET
  opens_at = EXCLUDED.opens_at,
  closes_at = EXCLUDED.closes_at,
  is_closed = EXCLUDED.is_closed,
  updated_at = now();

INSERT INTO vacancies (title, description, is_published, sort_order)
VALUES (
  'Требуется продавец-консультант',
  'Подробности вакансии можно уточнить по телефону или при личном обращении в магазин.',
  true,
  10
)
ON CONFLICT DO NOTHING;
