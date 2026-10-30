import { describe, expect, it } from 'vitest';
import { cleanNickname, isFallbackName, nicknameFormatOk } from '../../../src/shared/leaderboard/nickname';

describe('nickname format (client copy of the server rules)', () => {
  it.each(['Kim', 'Kim Lee', '김철수', 'abc123', '홍길동 KR', ''])('%j passes', (name) => {
    expect(nicknameFormatOk(name)).toBe(true);
  });

  it.each(['a', 'abcdefghijklm', 'ㅅㅂ', 'cat😺', 'kim_lee', 'evil.com'])('%j fails', (name) => {
    expect(nicknameFormatOk(name)).toBe(false);
  });

  it('full-width letters and extra spaces are normalized like on the server', () => {
    expect(cleanNickname('  Ｋｉｍ   Lee ')).toBe('Kim Lee');
    expect(nicknameFormatOk('  Ｋｉｍ   Lee ')).toBe(true);
  });

  it('Player#### is recognized as a server fallback name', () => {
    expect(isFallbackName('Player0421')).toBe(true);
    expect(isFallbackName('Player42')).toBe(false);
    expect(isFallbackName('Kim')).toBe(false);
  });
});
