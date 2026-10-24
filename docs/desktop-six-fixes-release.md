# Подготовка релиза шести исправлений ПК-версии

Дата: 24 октября 2026 года. Релизная ветка: `codex/desktop-six-fixes`.

## А. Готовность

Код подготовлен к публикации. **Деплой не выполнялся и пока не разрешён.**
Перед составлением окончательных команд переключения нужны результаты проверки
сервера ниже. Исторический SHA не доказывает текущую версию работающего сайта.

База исправлений: `8132f34e4b83f30fe1715654528ab06c733d9649`.
В ней уже присутствует исправление подтверждения и повтора сохранения согласия.
После обновления сведений с GitHub установлено:

- `origin/main`: `0afda53c704628505d0965053140c34ecbb39ad0`;
- `origin/codex/privacy-consent-save-diagnostics`: `8132f34e4b83f30fe1715654528ab06c733d9649`;
- `origin/codex/site-release-2026-10-22`: `fef1dbc9255ee8bae339d6d1432e2f0e360af108`.

Удалённый main является предком базы релиза. Merge/rebase не требуется.
SHA итогового коммита и подтверждение push фиксируются в локальном отчёте
`artifacts/desktop-six-fixes/RELEASE.md`; этот документ входит в сам релизный коммит,
поэтому его собственный SHA сюда не подставляется.

## Б. Состав

Восемь файлов приложения:

1. `src/app/globals.css` — фирменные кнопки, Hero, статичные вакансии, галерея.
2. `src/app/page.tsx` — контекст входа в каталог с главной.
3. `src/app/catalog/[categorySlug]/page.tsx` — возврат на `/#catalog`.
4. `src/features/catalog/navigation-context.ts` — разрешённый контекст `home-catalog`.
5. `src/components/home/store-photo-lightbox.tsx` — одно активное фото, ожидание decode.
6. `src/components/purchase-list/purchase-list-page.module.css` — геометрия пустого списка.
7. `src/components/purchase-list/purchase-list-page.tsx` — удалена точка в заголовке.
8. `src/components/purchase-list/purchase-list-product-action.tsx` — класс ПК-кнопки.

Проверки: `scripts/test-catalog-navigation-context.ts` и
`scripts/test-desktop-six-fixes-browser.ts`. Последний сценарий создаёт только
одноразовую локальную тестовую БД; на production его запускать не нужно.
Также в коммит входит эта инструкция. Скриншоты и локальные логи в Git не добавляются.

Схема БД, миграции, каталог/цены, импорт, админка, авторизация, юридические страницы,
API согласий, cookie-баннер, настройки Карт/Метрики, зависимости и конфигурация
PM2/Nginx не изменяются. Наличие нового CSS-класса не меняет действия кнопки товара.

## В. Проверки

Предыдущий отчёт: `artifacts/desktop-six-fixes/REPORT.md`.
Для утверждённого кода уже пройдены typecheck, ESLint, полный `pnpm test`,
`pnpm build` с postbuild standalone, тесты списка и контекста каталога,
16 браузерных сценариев и отдельное сравнение кнопки с отзывами.
Проверены ПК 1920, 1440, 1366, 1340, 1280 и 1024 px, планшет 768 px,
мобильные viewport 390×844 и 375×812.

При подготовке релиза проверяется неизменность защищённых путей относительно базы,
сохраняются контрольные суммы исходников и проверяется регрессия сохранения согласий
на in-memory journal. Точные результаты дополнительных проверок — в `RELEASE.md`.
Тесты с реальной БД, миграции, импорт, SDK Метрики и серверный smoke не запускаются.

## Г. Обнаруженные ограничения

1. Текущие серверные HEAD, рабочее дерево, запущенная сборка, реальные определения
   PM2 и свободное место неизвестны: SSH в этой задаче запрещён.
2. Safari WebDriver недоступен: в Safari выключено «Allow remote automation».
   Настройка не менялась; Safari остаётся обязательной ручной проверкой.
3. Известная схема запускает единственный веб-процесс PM2 в fork-режиме из
   `/var/www/autozap/.next/standalone/server.js`. Сборка в той же `.next` при работающем
   процессе небезопасна; `next build` очищает её, а postbuild обновляет assets.
4. Существующая macOS arm64-сборка — подтверждение локальной проверки, не пакет для Linux.

Периодическая недоступность сайта здесь не диагностируется и не связывается с релизом.

## Д. Первый этап владельца: только проверка сервера

Вставить блок целиком в терминале Timeweb Cloud, в существующей учётной записи
с правом `sudo -iu autozap` (обычно root). Команды не изменяют файлы, Git, процессы,
настройки или БД. Они не выполняют fetch, установку зависимостей, сборку или деплой.
Не включать `set -x`, не выводить `.env`, `pm2 env`, необработанный `pm2 jlist`.

```bash
sudo -iu autozap /bin/bash <<'AUTOZAP_READ_ONLY'
set -eu
cd /var/www/autozap
test "$(id -un)" = autozap
printf '\n--- identity and source ---\n'
id -un
pwd -P
git rev-parse HEAD
git branch --show-current
git status --short
git log -3 --format='%h %s'
if git cat-file -e 8132f34e4b83f30fe1715654528ab06c733d9649^{commit} 2>/dev/null; then
  if git merge-base --is-ancestor 8132f34e4b83f30fe1715654528ab06c733d9649 HEAD; then
    printf 'Historical privacy fix is an ancestor: YES\n'
  else
    printf 'Historical privacy fix is an ancestor: NO — STOP before deployment\n'
  fi
  git diff --name-only 8132f34e4b83f30fe1715654528ab06c733d9649 HEAD
else
  printf 'Historical commit is unavailable locally — server version needs comparison\n'
fi
printf '\n--- runtime and capacity ---\n'
node --version
pnpm --version
df -Pm /var/www/autozap
free -m
for item in . .env .next node_modules; do
  if test -e "$item"; then stat -c '%U %a %n' "$item"; fi
done
readlink -f /var/www/autozap
test ! -e .next || readlink -f .next
test ! -e node_modules || readlink -f node_modules
if test -w /var/www; then printf 'Can create adjacent build directory: YES\n'; else printf 'Can create adjacent build directory: NO\n'; fi
printf '\n--- build IDs ---\n'
for build_id in .next/BUILD_ID .next/standalone/.next/BUILD_ID; do
  if test -r "$build_id"; then printf '%s: ' "$build_id"; head -c 200 "$build_id"; printf '\n'; fi
done
printf '\n--- non-secret source fingerprints ---\n'
sha256sum package.json pnpm-lock.yaml scripts/with-env.sh ecosystem.config.cjs ecosystem.worker.config.cjs \
  src/features/privacy/coordinator.ts src/features/privacy/privacy-provider.tsx
printf '\n--- analytics file gate: boolean only ---\n'
node <<'NODE'
const fs = require('node:fs');
const source = fs.readFileSync('.env', 'utf8');
const disabled = /^\s*(?:export\s+)?YANDEX_METRIKA_CONFIGURATION_VERIFIED\s*=\s*(?:false|"false"|'false')\s*(?:#.*)?$/m.test(source);
console.log(JSON.stringify({ analyticsExplicitlyDisabledInEnvFile: disabled }));
NODE
printf '\n--- existing PM2 daemon: safe selected fields only ---\n'
test -r "$HOME/.pm2/pm2.pid"
kill -0 "$(cat "$HOME/.pm2/pm2.pid")"
pm2 jlist | node -e '
let text=""; process.stdin.on("data", chunk => text += chunk);
process.stdin.on("end", () => {
  try {
    const all = JSON.parse(text), fs = require("node:fs");
    for (const name of ["autozap", "autozap-worker"]) {
      const app = all.find(item => item.name === name);
      if (!app) throw Error("Expected application missing");
      const e = app.pm2_env, args = JSON.stringify(e.args || []);
      const port = String(e.env?.PORT ?? e.PORT ?? "");
      const actualCwd = app.pid > 0 ? fs.readlinkSync(`/proc/${app.pid}/cwd`) : null;
      console.log(JSON.stringify({name, pid:app.pid, status:e.status,
        cwd:e.pm_cwd, actualCwd, entry:e.pm_exec_path, mode:e.exec_mode,
        expectedArgs:name === "autozap" ? args.includes("node") && args.includes(".next/standalone/server.js") : args.includes("scripts/background-worker.ts"),
        portIs3000:port === "3000",
        analyticsExplicitlyDisabled:(e.env?.YANDEX_METRIKA_CONFIGURATION_VERIFIED ?? e.YANDEX_METRIKA_CONFIGURATION_VERIFIED) === "false"
      }));
    }
  } catch { console.error("STOP: PM2 metadata could not be safely verified"); process.exitCode=1; }
});'
printf '\n--- availability baseline; no diagnosis ---\n'
curl --silent --show-error --max-time 15 --output /dev/null --write-out 'local HTTP %{http_code}\n' http://127.0.0.1:3000/
curl --silent --show-error --max-time 15 --output /dev/null --write-out 'public HTTPS %{http_code}\n' https://autozapchast-taldom.ru/
AUTOZAP_READ_ONLY
```

Успех: команда завершилась, оба процесса `online`, пути/entrypoint ожидаемые,
HTTP/HTTPS отвечают 200, флаг Метрики явно выключен. Пустое имя ветки допустимо для
detached HEAD, но сам SHA нужно сопоставить с кандидатом. Если Git показывает изменения,
обнаружена иная версия/конфигурация, флаг не подтверждён или получена ошибка —
**не выполнять публикацию**. Передать полный вывод этого безопасного блока для разбора.
Значение `NO`, `false` или не-200 само по себе ничего не исправлять.

Откат после этого этапа не требуется: работающая версия не меняется.

## План публикации после результатов проверки — ещё не исполняемая инструкция

Окончательные команды будут привязаны к проверенным серверному SHA, путям и кандидату.
Сейчас запускать старую инструкцию `docs/site-release-2026-10-24.md` нельзя: её база
и процедура остановки/сборки относятся к предыдущему релизу.

| Этап | Действие | Успех / остановка | Возврат к старой версии |
|---|---|---|---|
| 1 | Проверить текущую публичную и локальную доступность, HEAD и отсутствие неперенесённых серверных правок. | Если версия сервера не входит в кандидата либо есть правки — остановиться и сравнить. | Ничего не изменено. |
| 2 | Получить конкретный релизный коммит и собрать Linux-версию в отдельном каталоге со своими зависимостями, не трогая рабочую `.next`. | Установка по frozen lockfile, build и postbuild успешны, места/памяти достаточно. Иначе остановиться. | Старое приложение продолжает обслуживать сайт. |
| 3 | Проверить standalone entrypoint, совпадение BUILD_ID, public/static и обязательные маршруты. | Все файлы полны; флаг Метрики не включён. Не использовать macOS `.next`. | Кандидат не подключён к трафику. |
| 4 | До переключения сохранить точные старые исходники/сборку, SHA и контроль состояния без вывода секретов. | Точка восстановления читаема и позволяет вернуть именно прежнюю сборку. | Пока не меняется работающий экземпляр. |
| 5 | Коротко остановить только веб-процесс, переключить полную подготовленную сборку и согласованные исходники, запустить прежним standalone entrypoint. | Не делать build в окне недоступности. Не менять Nginx/PM2-конфиги. Worker не трогать, если сравнение подтвердит неизменность его кода и зависимостей. | При ошибке вернуть старые исходники и полную старую сборку, затем прежний веб-процесс. |
| 6 | Проверить локальную и публичную доступность, актуальные CSS/JS и чек-лист ниже. | Не подтверждать релиз при ошибках. Не менять Метрику, БД или импорт для исправления UI-релиза. | Перейти к файловому откату без восстановления БД. |

Это использует существующие PM2/Nginx и не требует новой инфраструктуры. Конкретный
каталог кандидата, способ его проверки и переключения нельзя выбирать без сведений
о серверных правах, диске и фактической раскладке. Если отдельная сборка невозможна
из-за ресурсов, согласовать короткое плановое окно; не начинать длительную остановку
и не запускать сборку поверх обслуживаемой `.next`.

## Е. Откат

На нынешнем этапе возвращать нечего: сервер не менялся. Для будущей публикации
точка восстановления должна содержать **старую готовую Linux-сборку**, прежние
исходники и SHA. Тогда откат не требует новой сборки или изменения истории Git.

При неуспешном запуске/проверках: остановить веб-процесс, убрать неудачную сборку
из рабочего пути, вернуть полную старую сборку и старые исходники, запустить прежний
entrypoint и проверить локальный/публичный HTTP и privacy. Нельзя накладывать две
`.next` друг на друга, удалять пользовательские файлы или восстанавливать БД,
`.env`, импортные файлы и каталог. Реальные пути сохранённой версии и команды будут
указаны после read-only проверки, а не заменены вымышленными значениями.

## Проверки после публикации

1. Главная доступна локально и по HTTPS; CSS/JS загружаются.
2. Каталог отображается; категории и подкатегории открываются.
3. «Назад» проходит товар → подкатегория → категория → каталог на главной;
   при входе с `/catalog` возвращает туда. Проверить reload и browser Back.
4. Товар добавляется в список; пустой список и состояние «В списке» корректны.
5. Кнопка товара имеет фирменный градиент; hover и клавиатурный focus работают.
6. Hero: четыре преимущества, ровные отступы, разделители не касаются иконок.
7. Вакансии: медленная/быстрая прокрутка в обе стороны без прыжков; hover телефона.
8. Галерея: все фото, вперёд/назад, быстро, разные пропорции, Escape, повторное открытие.
9. В отдельном браузерном профиле cookie-баннер показывает понятное подтверждение
   после сохранения отказа; после reload настройки сохраняются. Не давать согласие
   на Метрику ради проверки. Проверка сохранения создаёт штатное событие согласия —
   её проводить только в отдельно разрешённой фазе публикации.
10. Метрика остаётся выключенной: нет загрузки `mc.yandex.ru/metrika/tag.js` и запросов
    счётчика. `YANDEX_METRIKA_CONFIGURATION_VERIFIED` остаётся `false`.
11. Админка открывается, вход работает; не запускать импорт, публикацию и действия записи.
12. Мобильные 390×844 и 375×812 не получили новых ошибок.

**Обязательно вручную в Safari на macOS:** пункты 3–8, повторные входы в вакансии,
быстрое перелистывание галереи и отказ в cookie-баннере с reload. Проверить также
обычное открытие сайта до/после публикации; при недоступности зафиксировать результат
для существующего обращения Timeweb, не начинать отдельную диагностику в этом релизе.

## Ж. Следующее действие

Выполнить только read-only блок из раздела Д в терминале Timeweb Cloud и передать вывод.
До его разбора публикацию и команды переключения не выполнять.
