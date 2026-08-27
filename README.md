# boolala.boo

Процедурні булалашки з частинок — дивні обличчя, живе волосся, асиметрія.

## Запуск

```bash
npm install
npm run dev
```

Відкрий http://localhost:5173

## Що є

- Детермінована генерація за `seed` (один seed → завжди той самий монстр)
- Metaball field → хмара частинок з нормалями й глибиною
- Багаті обличчя: очі, брови, віки, вії, ніс, вуха, зуби, клики, волосся
- Жива idle-анімація: дихання, погойдування, моргання, хвилі волосся
- Галерея, детальний вигляд, `?seed=` у URL, експорт PNG

## Стек

TypeScript · Vite · PixiJS 8 (`ParticleContainer`)

## Структура

```
src/core/       # генерація (rng, palette, field, particles, face/, monster)
src/core/face/  # очі, брови, віки, вії, ніс, вуха, рот, зуби, волосся, клики
src/render/     # MonsterView — анімована хмара частинок
src/app/        # gallery, detail, ui
```
