export const siteConfig = {
  name: "Автозапчасти Талдом на Салтыкова-Щедрина",
  shortName: "Автозапчасти",
  url: process.env.APP_URL?.replace(/\/$/, "") || "https://autozapchast-taldom.ru",
  phone: "8-496-206-33-04",
  email: "auto-zapchast.taldom@rambler.ru",
  address: {
    region: "Московская область",
    city: "г. Талдом",
    street: "ул. Салтыкова-Щедрина, д. 19",
    full: "Московская область, г. Талдом, ул. Салтыкова-Щедрина, д. 19",
    latitude: 56.728464,
    longitude: 37.520348
  },
  yandexMapsUrl:
    "https://yandex.ru/maps/10757/taldom/?ll=37.520401%2C56.728465&mode=search&sll=37.520348%2C56.728464&text=56.728464%2C37.520348&z=15",
  workingHours: [
    {
      label: "Понедельник–Пятница",
      opensAt: "09:00",
      closesAt: "18:00"
    },
    {
      label: "Суббота–Воскресенье",
      opensAt: "09:00",
      closesAt: "16:00"
    }
  ]
} as const;
