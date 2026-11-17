# Compsing__sense

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
- `src/components/` 피아노 롤, 트랙 믹서, 음계/코드 도우미, 연습 패널. `midi.ts` 입출력, `storage.ts` 자동 저장, `history.ts` Undo/Redo
- 편집 모드 2개: 건반(`PianoRoll`, 드럼 트랙이면 드럼 파트 레인 + 키보드 Q W E R T A S D F 연계) / 악보(`StaffEditor`, 대보표·타악 오선). 드럼 파트 정의는 `music.ts`의 `DRUM_PARTS`
- 도구 모음(`Toolbar`, 단축키 1~4): 연필(쓰기·끌어서 길이)/지우개(문질러 지우기)/손바닥(이동·끝 손잡이로 길이·빈 곳 끌면 화면 이동)/선택(네모 선택). 우클릭·Shift 없이 터치로 모든 편집 가능
- 악보 편집(`StaffEditor`): 줄(시스템)×트랙(블록) 배치. 보기 = 스크롤/페이지, 다중 악보(전 트랙), 조표(`keyOf`, 설정의 음계와 연동)·박자표·템포 표시. 페이지 보기는 A4 비율, 한 줄 기본 4마디(촘촘하면 2마디, 직접 2/4/8), 마디 수는 항상 짝수, 페이지 상단에 악보명
- 용어: 건반/악보에 직접 찍는 화면 = **직접 쓰기 모드**(탭 id `compose`). 프로그램은 항상 시작(`Interview`)에서 출발한다.
- 작업 흐름 탭(아래, `WorkspaceTabs`): 시작(`Interview`) → 구성(`ArrangePage`, 자세히 고치기용) → 멜로디 → 직접 쓰기(기존 편집기 + 파트 칩) → 믹스(`MixPage`) → 완성(`DeliverPage`: 듣기·평가·공유)
- 시작 인터뷰(`components/Interview.tsx`): 어린 학생 기준, 한 화면에 한 질문. 4마당 = ①곡 준비(이름→분위기(음계, 으뜸음 고르기 상시 표시·'자주 써요' 표시)→넘어갈 때 'E minor 스케일' 설명 팝업→빠르기(숫자 막대 상시 표시)→박자→악기) ②곡의 모양(틀 고르기→순서 확인: 화살표·±4마디·빼기·＋팝업으로 파트 더하기(다음에 보통 오는 파트·보통 길이 추천), 끌기 없음, 마지막 파트까지 지울 수 있음, '빈 곳에서 내 마음대로'는 파트 0개로 시작) ③반주 만들기: 곡 앞 파트부터 차례로 파트 종류마다 [파트 소개(PART_GUIDE)+화음 진행 3개 추천+'화음 없이'] → 화음 박자(화성 리듬, 화음 칸 그림) → 화음 리듬꼴 → 드럼 → 베이스. 같은 종류(벌스 2…)는 재사용. 리듬꼴·드럼·베이스 카드는 음악 용어가 제목, 아이 말은 부제, 한 마디 리듬 그림(`PatternView`, 들려줄 때 재생선이 지나감), '직접 정하기'는 8분음표 칸 입력(`StepGrid` → PartPlan.customComp/customDrum/customBass, 스타일 id 'custom'). 학생이 확인한 파트는 PartPlan.picked, 나머지는 `autoPlans`가 앞에서부터 다시 추천 → 마지막에 모든 파트 요약·듣기 ④멜로디(건반 녹음/직접 쓰기로 보내기). 카드를 누르면 바로 소리(새 소리 전에 `hush()`로 이전 소리를 끊음). '알아두면 좋아요'는 늘 펼쳐 둠. 진행 상태(`ivStep` 등)는 App에 있어 탭을 오가도 이어진다
- 화음 추천(`rankProgressions`): 앞 파트에서 자연스럽게 이어지기 + 대비(코러스·B는 앞의 벌스·A와 같은 진행 −46, 같은 첫 화음 −24, 다른 첫 화음 +16, 단조 후렴은 밝은 Ⅲ·Ⅵ로 열기 +10) + 역할(벌스·A는 으뜸화음 시작, 연결 파트는 딸림화음으로 끝, 아웃트로는 으뜸으로 끝). 진행 목록에 royal(Ⅳ–Ⅴ–ⅲ–ⅵ)·climb·m-pop(Ⅵ–Ⅲ–Ⅶ–ⅰ)·m-major·m-v 추가
- 곡 모델: 파트 0개(빈 곡)도 허용 — 음표가 없으면 sections=[]·bars=8, 음표를 쓰면 '자유' 파트로 묶음(`normalizeSong`). 기본 길이: 벌스·코러스·A·B·브릿지 8마디, 인트로·프리코러스·간주·아웃트로 4마디(`TYPICAL_BARS`)
- 소리: 기본 악기 소리는 GeneralUser GS 사운드폰트(`public/soundfonts/GeneralUserGS.sf3`, 약 8MB, 앱을 열면 받아 두었다가 소리 엔진이 생기면 적용, 서비스 워커는 따로 된 보관함 'sensescore-soundfonts'에 보관). '간단한 소리로'를 고르면 `localStorage 'sense-score:sound'='builtin'`. 정지(`allOff`)는 채널 노드까지 새로 만들어서 끝 시각이 예약된 긴 음도 즉시 끊는다
- 멜로디 녹음 화면: 위쪽 한 줄(녹음·반주 듣기·트랙·예비박(기본 켜짐, 녹음에서만 쓰고 끝나면 원래 설정으로)·설정 팝업(메트로놈·덮어쓰기·MIDI·도움·연주 보정)) + 곡 위치 줄(`SongStrip`: 파트 블록·재생선, 끌거나 눌러서 이동, 파트를 누르면 그 파트 반복) + 큰 카운트다운(`Cue`: 예비박 동안 '첫 파트는 …', 다음 파트 한 마디 전 '다음 파트는 …입니다! 준비하세요' + 남은 박). 건반 위 키보드 글자는 늘 크게 표시. 믹스 탭에도 `SongStrip`
- 드럼 녹음(트랙 선택에서 드럼): 위에서 내려오는 레인(`DrumKit.tsx`의 `DrumRoll`, 드럼 게임처럼 크래시·하이햇·스네어·킥·하이탐·미드탐·플로어탐·라이드) + 드럼 세트 그림(`DrumKitView`, 눌러서 치기). 키: 왼손 F 스네어·R 크래시, 오른손 J 하이햇(K 열림)·O 라이드, G·H 탐, L 플로어 탐, 스페이스(또는 B) 킥. 직접 쓰기 화면의 드럼 키(`DRUM_PARTS.key`)도 같은 자리(킥은 B). 드럼 녹음은 음 높이·길이 보정 없이 타이밍만 맞춘다(`CorrectEnv.drum`)
- 평가: `evaluate.ts`(완성도·음계·리듬·멜로디 모양·음역·반복/변화·마무리·악기 구성, 항목마다 배움 한 줄+팁). 공유: `share.ts`(곡을 deflate+base64url로 링크 `#s=`에 담음), 소리 파일은 `engine/export.ts`의 `exportAudio`로 재생 없이 바로 MP3/WAV 생성(내장 소리=OfflineAudioContext를 약 1초마다 suspend하며 음표를 넣음, suspend 미지원이면 2초 구간 렌더 후 합산 / 사운드폰트=`exportWorker.ts`에서 spessasynth_core로 직접 렌더, MP3는 wasm-media-encoders 192kbps, 모두 워커에서 변환). 3분 곡 기준 2코어 헤드리스 Chrome에서 WAV 약 4초, MP3 약 7초. 내장 신스의 노드는 소리가 끝나면 `onended`로 연결을 끊는다(안 끊으면 긴 곡일수록 느려짐), .mid 저장
- 곡 모델: `Song.sections`(파트, 마디 수 합 = `song.bars`). 파트 연산은 `sections.ts`의 `applySections(plan)` 하나로 처리(음표가 파트와 함께 이동). 항상 `normalizeSong`으로 정합 유지
- 선택 도구: 선택된 음표를 끌면 전체 이동(세로=전조), 상태줄 전조 버튼(반음/8도, 선택 없으면 트랙 전체)
- 로직 스모크 테스트: `npx tsx <스크립트>`로 `sections.ts`/`template.ts`/`music.ts` 검증 가능(브라우저 UI는 미검증)
- 악기는 `instruments.ts`의 10종만(음역 포함). 고른 악기의 음역만 건반으로 보여 주고(밖은 흐림·입력 불가), 악보 편집도 같은 음역으로 제한. 악기를 바꾸면 음역 밖 음표는 옥타브 이동
- 악보 표기: `notation.ts`가 음표를 정식 음표값으로 쪼개 붙임줄로 잇고 빈 곳을 쉼표로 채운다(마디 가운데·박 경계 규칙, 드럼은 다음 소리까지). 음자리표·박자표·조표·쉼표는 `glyphs.ts`(Bravura 도형, 고지는 docs/NOTICE.md)로 SMuFL 기준점에 맞춰 그림
- 구성 탭(인터뷰 뒤에 자세히 고칠 때): 곡의 틀 갤러리(AB/ABA/AABA/기성곡/풀 세션) + 파트 블록을 끌어서 순서 변경(`useReorder`, 위쪽 가로 블록·아래 목록 모두) + 파트 직접 붙이기 → "뼈대를 세울까요?" → 메뉴판(`ScaffoldMenu`): 파트별로 화음 진행(앞 파트 마지막 화음 기반 추천, `suggestNext`)·화음 속도·7화음 / 반주 리듬 / 드럼(기본8·4비트·포온더플로어·16비트·싱코페이션·하프타임·셔플·폴카·필인·크래시) / 베이스(킥에 맞춘 루트·경과음·워킹·핑거링·옥타브) 선택. 생성은 `scaffold.ts`의 `generate()`(멜로디는 만들지 않음, Track.role로 코드/베이스/드럼 트랙을 찾고 없으면 만듦)
- 음표 우클릭·길게 누르기 메뉴(`ContextMenu`, `useLongPress`): 복사·잘라내기·붙여넣기(`editActions.ts` 클립보드)·복제·길이/음높이/세기 정리·선택 도우미, 단축키 Ctrl+C/X/V/D. 건반·악보 편집 모두 지원
- 규칙: 모든 파트는 4마디 단위(`sections.ts`의 `ceil4`/`stepBars`, 틀 템플릿·±버튼·곡 끝 자동 확장·MIDI 불러오기 모두). 같은 종류 파트(코러스 2·3…)는 메뉴판 설정이 자동 연동(`PartPlan.linked`). 화음 추천은 `rankProgressions`(앞 파트와의 연결·다음 파트로의 해결·딸림화음 종지·이웃과의 대비), 곡 앞에서부터 차례로 결정(`autoPlans`). 메뉴판 선택은 `Player.playTemp`로 임시 곡을 바로 들려줌. 내장 베이스는 중음 강조(하이패스+피킹 EQ)·음량 크게, 베이스 트랙 기본 음량 1
- 멜로디 쓰기 탭(구성과 직접 쓰기 사이, 탭 id `melody`): 가로 건반(`HKeyboard`, 화면 폭에 맞춰 건반 수 조정·악기 음역만 활성·음계 안만 잠금·옥타브 이동, 컴퓨터 키보드 A S D F…/W E T Y…·Z X, Web MIDI 키보드) + 떨어지는 음표 화면(`LiveRoll`, 건반과 같은 x 배치) + ⏺ 녹음. `recorder.ts`의 `Recorder`가 재생 위치(tick, 출력 지연 보정) 기준으로 note on/off를 기록, 끝나면 박자 맞추기(`quantizeNotes`) 후 한 번의 되돌리기 단위로 트랙에 추가. 파트 칩으로 구간 반복 녹음, 덮어쓰기·먼저 세기·메트로놈 옵션
- 연주 보정(`correct.ts`): 지연 보정(ms)→스친 음 지우기→음계 안으로→타이밍 칸 맞추기(강도)→길이 맞추기→겹친 같은 음 정리→세기 고르게. 프리셋(원본/살짝/깔끔하게 추천/완벽 정렬), 녹음 후에도 설정을 바꾸면 방금 녹음에 즉시 재적용(원본 `lastTake.raw` 보관). 연주 중 보조: 🧲 음계로 보정(가까운 음계 음으로 소리·기록)/🔒 음계 안만. 건반 색: 으뜸음 노랑·추천 음계 파랑·음계 밖 회색·지금 반주 화음의 음 초록 테두리(`HKeyboard`, `LiveRoll` 열 색도 동일)
- 디자인: WSNS(WesNS 사이트, GitHub Osense/WesNS) 컨셉 — `index.css` 토큰(밝은 바탕 기본 + `html[data-theme=dark]` 어두운 모드, 바이올렛→시안 브랜드 그라데이션 `--brand-grad`, 그 위 글자는 `--on-brand`, 둥근 카드 12~18px·부드러운 그림자, Pretendard(`public/fonts/pretendard` 필요한 글자 묶음만 받는 CSS, index.html에서 링크) + JetBrains Mono 숫자 라벨, 모두 OFL). 테마는 머리줄 '어둡게/밝게' 버튼, `localStorage 'sense-score:theme'`, 없으면 기기 설정(깜빡임 막으려고 index.html에서 먼저 정함). 한글 라벨에는 고정폭 글꼴을 쓰지 않는다. 이모지 대신 `components/Icon.tsx`의 선 아이콘. `App.css` 아래쪽 'WSNS 디자인'·'WSNS 마감' 블록이 위쪽 규칙을 덮어씀. 태블릿(`pointer: coarse` + 너비 700 이상)은 누르는 곳 44px 이상, 1180 이하 가로에서는 재생 줄 한 줄·트랙 칸 300px. 가로 스크롤 금지: 머리줄·재생 줄은 줄바꿈, 단계 탭은 6칸 그리드(세로=아래, 폰 가로=`(orientation: landscape) and (max-height: 560px)`에서 왼쪽 세로 막대). 머리줄 왼쪽은 WSNS 로고(쎈스 디렉터와 같은 방식: `public/brand/wsns-mark.svg` 2×2 마크 + '쎈스 스코어' + 'WSNS studio [웨스엔에스 스튜디오]' 발음, 누르면 WSNS 홈페이지 새 탭). 머리줄 오른쪽 `ExportMenu`(MP3/WAV/MIDI/링크)는 모든 화면에서 보임. 직접 쓰기의 칸·확대·따라가기·±4마디·건반 표시는 편집기 안 `.view-bar`
- MIDI 불러오기(`midi.ts`): 곡/트랙 이름은 바이트로 다시 읽어 UTF-8 → CP949(EUC-KR) → Shift-JIS → windows-1252 순으로 해석(`decodeMidiText`), 저장은 UTF-8. 포맷 0은 @tonejs/midi가 채널·악기별로 트랙을 나눔(곡 이름이 첫 트랙 이름에 붙으면 악기 이름 사용). 드럼 = 10번 채널 또는 뱅크 MSB 127(XG)/120(GM2). 서스테인(CC64)은 음 길이로 반영, 첫 CC7은 트랙 음량, 16트랙 초과 시 같은 악기끼리 합침. 템포는 첫 템포만
- 피치 벤드: `Track.bends`(tick, -1~1) + `bendRange`(RPN 0, 기본 2). 내장 신스는 채널별 ConstantSource를 오실레이터 detune에 연결, 사운드폰트는 pitchWheel. `applySections`가 파트와 함께 옮김. MIDI 저장 시 @tonejs/midi가 14비트 변환을 안 해서 직접 ×8192
- 남은 것: 사운드폰트 영구 저장(IndexedDB), 터치 편집 검증, 악보 빔(연결 보)·셋잇단음표 표기
