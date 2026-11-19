# Compsing__sense (쎈스 컴포즈 · Sense Compose)

학생들이 직관적으로 작곡할 수 있는 MIDI 편집·재생 웹 앱.

## 목표
- 피아노 롤에서 클릭·드래그로 음표를 입력하고 바로 들어볼 수 있다.
- 표준 MIDI 파일(.mid) 불러오기/내보내기.
- 악보 지식이 없는 학생도 쓸 수 있는 UI (용어를 쉽게, 조작을 단순하게).

## 스택
Vite + React + TypeScript. MIDI 파싱/생성은 `@tonejs/midi`, 사운드폰트 재생은 `spessasynth_lib`
(설치만 해 둠, 실제 사용 전에 API 확인). 악보 표시가 필요하면 alphaTab(`C:\Program Files (x86)\Guitar Pro 5\renewal`에 사용 예가 있음).

## 규칙
- 상용 프로그램 Guitar Pro 5의 실행 파일, DLL, 스킨, RSE 샘플 등 어떤 자산도 이 프로젝트에 복사하거나 사용하지 않는다.
  역공학도 하지 않는다. `docs/analysis.md`는 공개 매뉴얼 기반의 기능 분석일 뿐이다.
- 소스는 `src/`, 설계 메모는 `docs/`.

## 명령어
- `npm run dev` 개발 서버
- `npm run build` 타입 검사 + 빌드
- `npm run lint` oxlint

## 현재 상태
`docs/analysis.md`의 "먼저 만들 것" 1~5번 구현 완료(빌드 통과, 브라우저 실사용 검증은 아직).
- `src/engine/audio.ts` 내장 WebAudio 신스 + 사운드폰트(spessasynth) 전환, `player.ts` 룩어헤드 스케줄러(반복·카운트인·메트로놈·스피드 트레이너)
- 믹스 탭(`MixPage`): 트랙마다 가로 한 줄(`.mix-row`: 이름·악기 | 가로 음량 막대 | 끄기·혼자·지우기), 넓은 화면은 2열, 폰(≤640)은 두 줄(위 이름·악기·버튼, 아래 음량). 폰 재생 줄은 시계를 숨기고 ‘몇 마디 몇 박’만(`.time-clock`)
- `src/components/` 피아노 롤, 트랙 믹서, 음계/코드 도우미, 연습 패널. `midi.ts` 입출력, `storage.ts` 자동 저장, `history.ts` Undo/Redo
- 편집 모드 2개: 건반(`PianoRoll`, 드럼 트랙이면 드럼 파트 레인 + 키보드 Q W E R T A S D F 연계) / 악보(`StaffEditor`, 대보표·타악 오선). 드럼 파트 정의는 `music.ts`의 `DRUM_PARTS`
- 도구 모음(`Toolbar`, 단축키 1~4): 연필(쓰기·끌어서 길이)/지우개(문질러 지우기)/손바닥(이동·끝 손잡이로 길이·빈 곳 끌면 화면 이동)/선택(네모 선택). 우클릭·Shift 없이 터치로 모든 편집 가능
- 악보 편집(`StaffEditor`): 줄(시스템)×트랙(블록) 배치. 보기 = 스크롤/페이지, 다중 악보(전 트랙), 조표(`keyOf`, 설정의 음계와 연동)·박자표·템포 표시. 페이지 보기는 A4 비율, 한 줄 기본 4마디(촘촘하면 2마디, 직접 2/4/8), 마디 수는 항상 짝수, 페이지 상단에 악보명
- 용어: 건반/악보에 직접 찍는 화면 = **직접 쓰기 모드**(탭 id `compose`). 프로그램은 항상 시작(`Interview`)에서 출발한다.
- 작업 흐름 탭(아래, `WorkspaceTabs`): 시작(`Interview`) → 구성(`ArrangePage`, 자세히 고치기용) → 멜로디 → 직접 쓰기(기존 편집기 + 파트 칩) → 믹스(`MixPage`) → 완성(`DeliverPage`: 듣기·평가·공유)
- 시작 인터뷰(`components/Interview.tsx`): 어린 학생 기준, 한 화면에 한 질문. 4마당 = ①곡 준비(이름→분위기(음계, 으뜸음 고르기 상시 표시·'자주 써요' 표시)→넘어갈 때 'E minor 스케일' 설명 팝업→빠르기(숫자 막대 상시 표시)→박자→악기) ②곡의 모양(틀 고르기→순서 확인: 화살표·±4마디·빼기·＋팝업으로 파트 더하기(다음에 보통 오는 파트·보통 길이 추천), 끌기 없음, 마지막 파트까지 지울 수 있음, '빈 곳에서 내 마음대로'는 파트 0개로 시작) ③반주 만들기: 곡 앞 파트부터 차례로 파트 종류마다 [파트 소개(PART_GUIDE)+화음 진행 3개 추천+'화음 없이'] → 화음 박자(화성 리듬, 화음 칸 그림) → 화음 리듬꼴 → 드럼 → 베이스. 같은 종류(벌스 2…)는 재사용. 리듬꼴·드럼·베이스 카드는 음악 용어가 제목, 아이 말은 부제, 한 마디 리듬 그림(`PatternView`, 들려줄 때 재생선이 지나감), '직접 정하기'는 `PatternEditor`(PatternView.tsx): 칸 크기 8분/16분/셋잇단(PartPlan.grid = 한 박의 칸 수 2/4/3), 빈 칸을 누르고 끌면 길게(화음·베이스, 겹치는 음은 잘림·베이스는 근음/5도/옥타브 중 한 줄만), 막대를 끌면 길이 변경, 그냥 누르면 지움, 드럼은 문질러 여러 칸 치기(심벌·열린 햇·하이햇·스네어·탐·킥). 저장은 tick 단위 PartPlan.compPat/drumPat/bassPat({t,d}), 옛 customComp/customDrum/customBass(8분 칸 번호)는 `compPatOf`/`drumPatOf`/`bassPatOf`로 읽음. 생성은 `patInSeg`(화음이 바뀌는 자리에서 이어지던 음은 새 화음으로 다시 침), 스타일 id 'custom'. 학생이 확인한 파트는 PartPlan.picked, 나머지는 `autoPlans`가 앞에서부터 다시 추천 → 마지막에 모든 파트 요약·듣기 ④멜로디(건반 녹음/직접 쓰기로 보내기). 카드를 누르면 바로 소리(새 소리 전에 `hush()`로 이전 소리를 끊음). '알아두면 좋아요'는 늘 펼쳐 둠. 진행 상태(`ivStep` 등)는 App에 있어 탭을 오가도 이어진다
- 화음 추천(`rankProgressions`): 앞 파트에서 자연스럽게 이어지기 + 대비(같은 진행 −46, 같은 고리를 회전만 한 진행(C G Am F↔F C G Am) −34, 같은 첫 화음 −24, 앞 파트 마지막 화음과 같은 화음으로 시작 −24, 다른 첫 화음 +16, 벌스에 없던 화음 +8~16, 진행 안의 Ⅴ→Ⅰ 도착 +8, 단조 후렴은 밝은 Ⅲ·Ⅵ +10, 후렴에 긴장형(build)·재즈 진행 감점) + 도약(앞 파트가 딸림화음으로 끝나면 코러스 Ⅰ +20·Ⅳ +12) + 역할(벌스·A는 으뜸화음 시작·코러스 앞이면 딸림화음으로 끝 +14, 연결 파트는 딸림화음으로 끝, 아웃트로는 으뜸으로 끝). 마지막 화음은 화음 속도까지 반영. 턴어라운드(`turnaroundOf`): 벌스·A·프리코러스가 코러스·B 바로 앞에서 딸림화음이 아니면 마지막 마디 뒤 반을 Ⅴ(단조 Ⅶ)로 바꿔 생성. 코러스·B는 화음 맨 아래 음을 옥타브 위에 겹쳐 넓게. 진행 목록에 royal·soar(Ⅳ–Ⅴ–Ⅰ–ⅵ)·climb·m-pop·m-major·m-v. 아웃트로 기본 화음 속도는 보통(4마디에 4화음, 으뜸으로 끝남)
- 곡 모델: 파트 0개(빈 곡)도 허용 — 음표가 없으면 sections=[]·bars=8, 음표를 쓰면 '자유' 파트로 묶음(`normalizeSong`). 기본 길이: 벌스·코러스·A·B·브릿지 8마디, 인트로·프리코러스·간주·아웃트로 4마디(`TYPICAL_BARS`)
- 소리: 기본 악기 소리는 GeneralUser GS 사운드폰트(`public/soundfonts/GeneralUserGS.sf3`, 약 8MB, 앱을 열면 받아 두었다가 소리 엔진이 생기면 적용, 서비스 워커는 따로 된 보관함 'sensescore-soundfonts'에 보관). '간단한 소리로'를 고르면 `localStorage 'sense-score:sound'='builtin'`. 정지(`allOff`)는 채널 노드까지 새로 만들어서 끝 시각이 예약된 긴 음도 즉시 끊는다. 소리 크기(`audio.ts`): 사운드폰트 출력은 원래 아주 작아서(-30 LUFS) `SF_GAIN` 5(+14dB), 내장 신스 `BUILTIN_GAIN` 1.25, 전체 `MASTER_GAIN` 0.8 → 기본 곡이 재생·소리 파일 모두 약 -16 LUFS. 재생은 출력 앞 DynamicsCompressor 리미터(threshold -3·ratio 20) + 크롬 자동 보정 되돌림 0.82, 소리 파일은 `exportWorker.ts`의 lookahead 리미터(-1 dBFS, 1.5ms·release 80ms, 피크만 누름). 측정은 OfflineAudioContext/내보내기 WAV에서 BS.1770 K-가중 LUFS로
- 멜로디 녹음 화면: 위쪽 한 줄(녹음·반주 듣기·트랙·예비박(기본 켜짐, 녹음에서만 쓰고 끝나면 원래 설정으로)·설정 팝업(메트로놈·덮어쓰기·MIDI·도움·연주 보정)) + 곡 위치 줄(`SongStrip`: 파트 블록·재생선, 끌거나 눌러서 이동, 파트를 누르면 그 파트 반복) + 큰 카운트다운(`Cue`: 예비박 동안 '첫 파트는 …', 다음 파트 한 마디 전 '다음 파트는 …입니다! 준비하세요' + 남은 박). 건반 위 키보드 글자는 늘 크게 표시. 믹스 탭에도 `SongStrip`
- 드럼 녹음(트랙 선택에서 드럼): 위에서 내려오는 레인(`DrumKit.tsx`의 `DrumRoll`, 드럼 게임처럼 크래시·하이햇·스네어·킥·하이탐·미드탐·플로어탐·라이드) + 드럼 세트 그림(`DrumKitView`, 눌러서 치기). 키: 왼손 F 스네어·R 크래시, 오른손 J 하이햇(K 열림)·O 라이드, G·H 탐, L 플로어 탐, 스페이스(또는 B) 킥. 직접 쓰기 화면의 드럼 키(`DRUM_PARTS.key`)도 같은 자리(킥은 B). 드럼 녹음은 음 높이·길이 보정 없이 타이밍만 맞춘다(`CorrectEnv.drum`)
- 평가: `evaluate.ts`(완성도·음계·리듬·멜로디 모양·음역·반복/변화·마무리·악기 구성, 항목마다 배움 한 줄+팁). 공유: `share.ts`(곡을 deflate+base64url로 링크 `#s=`에 담음), 소리 파일은 `engine/export.ts`의 `exportAudio`로 재생 없이 바로 MP3/WAV 생성(내장 소리=OfflineAudioContext를 약 1초마다 suspend하며 음표를 넣음, suspend 미지원이면 2초 구간 렌더 후 합산 / 사운드폰트=`exportWorker.ts`에서 spessasynth_core로 직접 렌더, MP3는 wasm-media-encoders 192kbps, 모두 워커에서 변환). 3분 곡 기준 2코어 헤드리스 Chrome에서 WAV 약 4초, MP3 약 7초. 내장 신스의 노드는 소리가 끝나면 `onended`로 연결을 끊는다(안 끊으면 긴 곡일수록 느려짐), .mid 저장
- 곡 모델: `Song.sections`(파트, 마디 수 합 = `song.bars`). 파트 연산은 `sections.ts`의 `applySections(plan)` 하나로 처리(음표가 파트와 함께 이동). 항상 `normalizeSong`으로 정합 유지
- 선택 도구: 선택된 음표를 끌면 전체 이동(세로=전조), 상태줄 전조 버튼(반음/8도, 선택 없으면 트랙 전체)
- 로직 스모크 테스트: `npx tsx <스크립트>`로 `sections.ts`/`template.ts`/`music.ts` 검증 가능(브라우저 UI는 미검증)
- 악기는 `instruments.ts`의 80종(GeneralUser GS의 GM 음색 중 골라 11묶음 `INSTRUMENT_GROUPS`: 건반·종·말렛·오르간·리드·기타·베이스·현악기·목소리·금관·목관·신스·세계 악기, 음역 포함, 고르기 목록은 optgroup). 드럼 트랙은 `DRUM_KITS`(스탠다드·룸·파워·일렉트로닉·808/909·댄스·재즈·브러시·오케스트라, Track.program = 세트 번호, 사운드폰트에서만 소리가 다름, MIDI 불러오기도 세트 번호 유지). 내장 신스는 GM 계열 범위로 소리를 고른다. 악기·세트를 바꾸면 음역 가운데 음/킥·스네어로 미리 들려줌. 음역 제한은 없앴다: 어떤 악기든 피아노 88건반(`EDIT_RANGE` 21~108, `rangeOf`)에 쓸 수 있고, 실제 악기 음역(`soundRangeOf`)은 ‘어울리는 음역’ 안내·자동 반주 배치·미리 듣기 높이·멜로디 건반 처음 위치에만 쓴다. 악기·드럼 세트 고르기는 드롭다운 대신 팝업(`InstrumentPicker.tsx`의 `ProgramSelect`/`DrumKitSelect`): 왼쪽 묶음(설명 `GROUP_INFO`: 어떻게 소리 내는지·어디에 어울리는지) + 악기 카드(느낌 `FEEL`·설명·어울리는 음역), 카드를 누르면 바로 바뀌고 소리, ‘다 골랐어요’로 닫음, 폰은 아래에서 올라오는 시트
- 악보 표기: `notation.ts`가 음표를 정식 음표값으로 쪼개 붙임줄로 잇고 빈 곳을 쉼표로 채운다(마디 가운데·박 경계 규칙, 드럼은 다음 소리까지). 음자리표·박자표·조표·쉼표는 `glyphs.ts`(Bravura 도형, 고지는 docs/NOTICE.md)로 SMuFL 기준점에 맞춰 그림
- 구성 탭(인터뷰 뒤에 자세히 고칠 때): 곡의 틀 갤러리(AB/ABA/AABA/기성곡/풀 세션) + 파트 블록을 끌어서 순서 변경(`useReorder`, 위쪽 가로 블록·아래 목록 모두) + 파트 직접 붙이기 → "뼈대를 세울까요?" → 메뉴판(`ScaffoldMenu`): 파트별로 화음 진행(앞 파트 마지막 화음 기반 추천, `suggestNext`)·화음 속도·7화음 / 반주 리듬 / 드럼(기본8·4비트·포온더플로어·16비트·싱코페이션·하프타임·셔플·폴카·필인·크래시) / 베이스(킥에 맞춘 루트·경과음·워킹·핑거링·옥타브) 선택. 생성은 `scaffold.ts`의 `generate()`(멜로디는 만들지 않음, Track.role로 코드/베이스/드럼 트랙을 찾고 없으면 만듦)
- 음표 우클릭·길게 누르기 메뉴(`ContextMenu`, `useLongPress`): 복사·잘라내기·붙여넣기(`editActions.ts` 클립보드)·복제·길이/음높이/세기 정리·선택 도우미, 단축키 Ctrl+C/X/V/D. 건반·악보 편집 모두 지원
- 규칙: 모든 파트는 4마디 단위(`sections.ts`의 `ceil4`/`stepBars`, 틀 템플릿·±버튼·곡 끝 자동 확장·MIDI 불러오기 모두). 같은 종류 파트(코러스 2·3…)는 메뉴판 설정이 자동 연동(`PartPlan.linked`). 화음 추천은 `rankProgressions`(앞 파트와의 연결·다음 파트로의 해결·딸림화음 종지·이웃과의 대비), 곡 앞에서부터 차례로 결정(`autoPlans`). 메뉴판 선택은 `Player.playTemp`로 임시 곡을 바로 들려줌. 내장 베이스는 중음 강조(하이패스+피킹 EQ)·음량 크게, 베이스 트랙 기본 음량 1
- 멜로디 쓰기 탭(구성과 직접 쓰기 사이, 탭 id `melody`): 가로 건반(`HKeyboard`, 화면 폭에 맞춰 건반 수 조정·악기 음역만 활성·음계 안만 잠금·옥타브 이동, 컴퓨터 키보드 A S D F…/W E T Y…·Z X, Web MIDI 키보드) + 떨어지는 음표 화면(`LiveRoll`, 건반과 같은 x 배치) + ⏺ 녹음. `recorder.ts`의 `Recorder`가 재생 위치(tick, 출력 지연 보정) 기준으로 note on/off를 기록, 끝나면 박자 맞추기(`quantizeNotes`) 후 한 번의 되돌리기 단위로 트랙에 추가. 파트 칩으로 구간 반복 녹음, 덮어쓰기·먼저 세기·메트로놈 옵션
- 연주 보정(`correct.ts`): 지연 보정(ms)→스친 음 지우기→음계 안으로→타이밍 칸 맞추기(강도)→길이 맞추기→겹친 같은 음 정리→세기 고르게. 프리셋(원본/살짝/깔끔하게 추천/완벽 정렬), 녹음 후에도 설정을 바꾸면 방금 녹음에 즉시 재적용(원본 `lastTake.raw` 보관). 연주 중 보조: 🧲 음계로 보정(가까운 음계 음으로 소리·기록)/🔒 음계 안만. 건반 색: 으뜸음 노랑·추천 음계 파랑·음계 밖 회색·지금 반주 화음의 음 초록 테두리(`HKeyboard`, `LiveRoll` 열 색도 동일)
- 디자인: WSNS(WesNS 사이트, GitHub Osense/WesNS) 컨셉 — `index.css` 토큰(밝은 바탕 기본 + `html[data-theme=dark]` 어두운 모드, 바이올렛→시안 브랜드 그라데이션 `--brand-grad`, 그 위 글자는 `--on-brand`, 둥근 카드 12~18px·부드러운 그림자, Pretendard(`public/fonts/pretendard` 필요한 글자 묶음만 받는 CSS, index.html에서 링크) + JetBrains Mono 숫자 라벨, 모두 OFL). 테마는 머리줄 '어둡게/밝게' 버튼, `localStorage 'sense-score:theme'`, 없으면 기기 설정(깜빡임 막으려고 index.html에서 먼저 정함). 한글 라벨에는 고정폭 글꼴을 쓰지 않는다. 이모지 대신 `components/Icon.tsx`의 선 아이콘. `App.css` 아래쪽 'WSNS 디자인'·'WSNS 마감' 블록이 위쪽 규칙을 덮어씀. 태블릿(`pointer: coarse` + 너비 700 이상)은 누르는 곳 44px 이상, 1180 이하 가로에서는 재생 줄 한 줄·트랙 칸 300px. 가로 스크롤 금지: 머리줄·재생 줄은 줄바꿈, 단계 탭은 6칸 그리드(세로=아래, 폰 가로=`(orientation: landscape) and (max-height: 560px)`에서 왼쪽 세로 막대). 머리줄 왼쪽은 WSNS 로고(쎈스 디렉터와 같은 방식: `public/brand/wsns-mark.svg` 2×2 마크 + '쎈스 컴포즈' + 'WSNS studio [웨스엔에스 스튜디오]' 발음, 누르면 WSNS 홈페이지 새 탭). 머리줄 오른쪽 `ExportMenu`(MP3/WAV/MIDI/링크)는 모든 화면에서 보임. 직접 쓰기의 칸·확대·따라가기·±4마디·건반 표시는 편집기 안 `.view-bar`
- MIDI 불러오기(`midi.ts`): 곡/트랙 이름은 바이트로 다시 읽어 UTF-8 → CP949(EUC-KR) → Shift-JIS → windows-1252 순으로 해석(`decodeMidiText`), 저장은 UTF-8. 포맷 0은 @tonejs/midi가 채널·악기별로 트랙을 나눔(곡 이름이 첫 트랙 이름에 붙으면 악기 이름 사용). 드럼 = 10번 채널 또는 뱅크 MSB 127(XG)/120(GM2). 서스테인(CC64)은 음 길이로 반영, 첫 CC7은 트랙 음량, 16트랙 초과 시 같은 악기끼리 합침. 템포는 첫 템포만
- 피치 벤드: `Track.bends`(tick, -1~1) + `bendRange`(RPN 0, 기본 2). 내장 신스는 채널별 ConstantSource를 오실레이터 detune에 연결, 사운드폰트는 pitchWheel. `applySections`가 파트와 함께 옮김. MIDI 저장 시 @tonejs/midi가 14비트 변환을 안 해서 직접 ×8192
- 로그인 자동 저장 준비(`src/cloud/`, 설계 `docs/cloud-save.md`): 프로젝트 = 표준 .mid + 텍스트 메타 이벤트 하나(`sense-compose:1:` + deflate·base64url JSON: 파트·트랙 색/역할·설정·plans·song.id). `encodeProject`/`decodeProject`, 보관함 `LocalProjectStore`(IndexedDB)·`RemoteProjectStore`(REST, If-Match 판 번호·409 충돌), 세션 `#wsns-token=`, `useCloudAutosave`(VITE_CLOUD_API + 로그인일 때만, 지금은 꺼짐). 내보내기 MIDI·MIDI 열기는 이미 이 형식(다시 열면 파트·반주 설정 복원). `Song.id`는 `withId`로 붙임(새 곡·남의 곡·보통 MIDI는 새 번호). 시연 소리(음계 등)는 사운드폰트가 예약된 음을 못 지워서 `engine.later` 타이머로 한 음씩 보내고 `allOff`에서 취소
- 언어(한국어·영어, `src/i18n/`): 화면 문구는 소스에 한국어 원문 그대로 `L("한국어", ...값)`(자리 표시 {0} {1}), 영어는 `src/i18n/en.ts`의 사전(키 = 한국어 원문). 처음 열면 기기 언어(navigator.languages[0])가 ko면 한국어, 아니면 영어, 머리줄 `.lang-switch`(한국어/English, 폰은 KO/EN)로 바꾸면 `localStorage 'sense-score:lang'` 저장 + 곡 저장 후 새로고침(언어는 페이지를 열 때 정해져서 모듈 맨 위 상수 목록도 그 언어로 만들어짐 → `isEn`, `lang`). 한국어 문구를 고치거나 새로 쓰면 en.ts에도 같은 키로 영어를 넣고 `node scripts/i18n-check.mjs`로 빠진 키 확인(개발 모드에서는 window.__i18nMissing). 어순이 다른 조각 문장은 같은 한국어 조각이 두 뜻일 때 키 끝에 \u200b를 붙여 따로 번역(예: "는\u200b"). 한국어 문자열로 로직을 비교하지 말 것(번역되면 깨짐)
- 남은 것: 사운드폰트 영구 저장(IndexedDB), 터치 편집 검증, 악보 빔(연결 보)·셋잇단음표 표기
