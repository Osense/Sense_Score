# 서드파티 자산 고지

## Bravura (악보 기호 도형)
`src/glyphs.ts`의 음자리표, 박자표 숫자, 쉼표, 조표·임시표 도형은 Bravura 글꼴(SMuFL)에서 뽑은 것이다.

- Bravura © Steinberg Media Technologies GmbH
- SIL Open Font License 1.1 — https://openfontlicense.org
- 글꼴 자체를 앱에 넣지 않고, 필요한 기호의 윤곽선(SVG 경로)만 미리 계산해 두었다.
- 다시 만들려면 `@vexflow-fonts/bravura` 글꼴 파일과 `opentype.js`로 각 기호의 경로를 뽑는다. (SMuFL 코드: gClef E050, fClef E062, 타악기 음자리표 E069, 박자 숫자 E080–E089, 쉼표 E4E3–E4E8, 임시표 E260–E262, 오선 한 칸 = 글꼴 크기의 1/4)

Guitar Pro 5의 어떤 자산도 사용하지 않는다 (CLAUDE.md의 규칙).
