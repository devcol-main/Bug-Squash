// @types/node 없이 테스트에서 파일을 읽기 위한 최소 선언
declare module 'node:fs' {
  export function readFileSync(path: URL | string, encoding: 'utf8'): string;
}
