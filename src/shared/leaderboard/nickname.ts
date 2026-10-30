// 닉네임 형식 규칙의 클라이언트 사본 (입력 중 즉시 안내용). 판정은 서버(devcol-analytics src/lb/moderation.ts)가 한다.
// 서버 규칙을 바꾸면 여기와 NICKNAME_RULE_TEXT도 맞춘다.

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 12;

/** 게임 화면에 보여주는 규칙 문구 (영어). */
export const NICKNAME_RULE_TEXT = 'Letters, Hangul and numbers only. Offensive names are shown as Player####.';

/** 라틴 문자, 완성형 한글, 숫자. 단어 사이 공백 하나만. */
const NAME_RE = /^[A-Za-z0-9가-힣]+(?: [A-Za-z0-9가-힣]+)*$/;

/** 서버와 같은 정리: NFKC, 연속 공백 하나로, 앞뒤 공백 제거. */
export function cleanNickname(raw: string): string {
  return raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

/** 형식만 본다 (차단어는 서버). 비어 있으면 아직 입력 전이므로 ok로 둔다. */
export function nicknameFormatOk(raw: string): boolean {
  const name = cleanNickname(raw);
  if (name === '') return true;
  const len = Array.from(name).length;
  return len >= NICKNAME_MIN && len <= NICKNAME_MAX && NAME_RE.test(name);
}

/** 서버가 형식/차단어/AI 검사에서 바꾼 공개 이름인지 (Player####). */
export function isFallbackName(name: string): boolean {
  return /^Player\d{4}$/.test(name);
}
