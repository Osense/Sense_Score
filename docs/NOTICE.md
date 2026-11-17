# 서드파티 자산 고지

## Bravura (악보 기호 도형)
`src/glyphs.ts`의 음자리표, 박자표 숫자, 쉼표, 조표·임시표 도형은 Bravura 글꼴(SMuFL)에서 뽑은 것이다.

- Bravura © Steinberg Media Technologies GmbH
- SIL Open Font License 1.1 — https://openfontlicense.org
- 글꼴 자체를 앱에 넣지 않고, 필요한 기호의 윤곽선(SVG 경로)만 미리 계산해 두었다.
- 다시 만들려면 `@vexflow-fonts/bravura` 글꼴 파일과 `opentype.js`로 각 기호의 경로를 뽑는다. (SMuFL 코드: gClef E050, fClef E062, 타악기 음자리표 E069, 박자 숫자 E080–E089, 쉼표 E4E3–E4E8, 임시표 E260–E262, 오선 한 칸 = 글꼴 크기의 1/4)

## Pretendard (화면 글꼴)
`public/fonts/pretendard/`의 글꼴 파일과 CSS는 Pretendard Variable(필요한 글자 묶음만 받는 dynamic subset)이다.

- Pretendard © 2021 Kil Hyung-jin — https://github.com/orioncactus/pretendard
- SIL Open Font License 1.1 (원문: `public/fonts/pretendard/OFL.txt`)

## JetBrains Mono (숫자·라벨 글꼴)
- © JetBrains — SIL Open Font License 1.1 (원문: `public/fonts/jetbrainsmono-OFL.txt`)

## GeneralUser GS (기본 악기 소리)
`public/soundfonts/GeneralUserGS.sf3`는 S. Christian Collins의 GeneralUser GS 사운드폰트(SpessaSynth 저장소에 들어 있는 SF3 압축판)다.

- 라이선스: GeneralUser GS License v2.0 — 개인·상업 음악 제작에 제한 없이 쓸 수 있고, 소프트웨어 프로젝트에 넣어 쓰는 것도 허용한다 (원문: `public/soundfonts/GeneralUserGS-LICENSE.txt`)
- 원본: https://schristiancollins.com/generaluser.php · https://github.com/mrbumpy409/GeneralUser-GS
- 라이선스 원문에 적힌 대로, 일부 샘플은 출처를 100% 확인할 수 없다고 저자가 밝히고 있다. 유료 판매 제품에 넣기 전에는 다시 검토한다.

Guitar Pro 5의 어떤 자산도 사용하지 않는다 (CLAUDE.md의 규칙).
