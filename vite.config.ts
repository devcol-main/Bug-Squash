import { defineConfig } from 'vite';

// 상대 경로(base './')로 빌드해서 어느 하위 경로에 올려도 동작한다.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
  },
});
