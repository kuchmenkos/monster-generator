# Monster Generator

Процедурні монстри з частинок у стилі *Aaahh!!! Real Monsters*.

## Запуск

```bash
npm install
npm run dev
```

Відкрий http://localhost:5173

Голоси (ElevenLabs, лише `npm run dev`): скопіюй `.env.example` → `.env.local`, додай `ELEVENLABS_API_KEY`. У деталі — кнопка **Голос** генерує 3 превʼю.

## Що є в MVP

- Детермінована генерація за `seed` (один seed → завжди той самий монстр)
- 3D-поле metaball'ів → хмара частинок з нормалями й глибиною (без пресетних спрайтів)
- Псевдо-3D: світлотінь по нормалях + паралакс у idle (передні частинки рухаються сильніше)
- Жива idle-анімація: дихання, погойдування, джиґл, моргання, підстрибування
- Галерея з cull'інгом, детальний вигляд, `?seed=` у URL, експорт PNG

## Стек

TypeScript · Vite · PixiJS 8 (`ParticleContainer` для батченого рендеру частинок)

## Структура

```
src/core/     # чиста генерація (rng, palette, field, particles, features, monster)
src/render/   # MonsterView — анімована хмара частинок
src/app/      # gallery, detail, ui, voice
vite-plugins/ # feedback writer + ElevenLabs voice proxy
```
