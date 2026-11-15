# Мансарда — 3D-визуализация

React + three.js (@react-three/fiber, @react-three/drei), сборка — Vite.

    npm install
    npm run dev      # локально
    npm run build    # один файл dist/index.html

- `src/params.js` — размеры, площади, проверки
- `src/Room.jsx` — геометрия плоскостей, окно, дверь, свет, размерные линии
- `src/textures.js` — процедурные текстуры (ламинат, краска, вид за окном)
- `src/App.jsx` — сцена, камеры, панель управления
