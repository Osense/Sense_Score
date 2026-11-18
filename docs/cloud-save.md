# 로그인 · 프로젝트 자동 저장 (준비 상태)

WSNS 계정으로 로그인하면 곡을 계정에 자동 저장하려고 미리 만들어 둔 구조. **서버만 붙이면 켜진다.**
지금은 서버 주소가 없어서 꺼져 있고, 기기 안 자동 저장(localStorage)만 돈다.

## 1. 저장 형식: 표준 MIDI 파일(.mid) 하나

`src/cloud/projectFile.ts`

- 음표 · 템포 · 박자 · 악기(GM 번호) · 드럼 세트 · 트랙 음량(CC7) · 피치 벤드(+RPN 0 벤드 폭)는 보통 MIDI 그대로.
  → GarageBand · MuseScore · Logic 등에서도 그냥 열린다.
- 쎈스 컴포즈만 아는 정보는 첫 트랙의 **텍스트 메타 이벤트 하나**에 넣는다.
  `sense-compose:<버전>:` + JSON을 deflate-raw로 줄이고 base64url로 바꾼 글자.
  - 들어가는 것: 프로젝트 번호(`song.id`), 제목, 마디 수, 파트 구성(sections), 트랙별 id · 이름 · 색 · 역할 · 끄기/혼자 · 음량,
    설정(음계 · 반복 · 칸 등 Settings), 반주 메뉴판 선택(plans), 저장 시각.
  - 다른 프로그램은 이 이벤트를 무시하고, @tonejs/midi로 다시 읽어도 그대로 남는다(빈 트랙도 순서대로 남음, 확인함).
- 다시 열 때(`decodeProject`): 음표는 MIDI 쪽을 믿는다. 트랙 수가 메타 정보와 같을 때만 메타를 덧씌운다.
  다르면(다른 프로그램에서 트랙을 지우거나 더함) 보통 MIDI처럼 불러온다. 더 새 버전이 만든 파일이면 음표만 읽는다.
- 주의: 메타를 넣은 뒤 @tonejs/midi로 **다시 읽어 쓰면 피치 벤드가 사라진다**(14비트 변환 문제) → `exportMidi(song, metaText)`로 한 번에 쓴다.
- 이미 쓰는 곳: 내보내기 → MIDI가 이 형식으로 저장하고, MIDI 열기에서 이 형식이면 파트 · 반주 설정까지 되살린다.

## 2. 보관함

`src/cloud/store.ts` — `ProjectStore { list, load, save, remove }`, 내용은 언제나 .mid 바이트.

- `LocalProjectStore`: 이 기기 IndexedDB(`sense-compose-projects`). 오프라인 · 서버에 못 올린 것을 잠시 보관.
- `RemoteProjectStore(base, token)`: 계정 보관함. 아래 API를 부른다.
- 충돌: 저장할 때 내가 마지막으로 받은 판 번호(rev)를 `If-Match`로 보낸다. 서버 판이 더 새것이면 409 → `ConflictError`.

## 3. 서버 API 약속 (구현할 쪽)

모든 요청: `Authorization: Bearer <WSNS 세션 토큰>`. 사용자 본인 프로젝트만.

| 요청 | 본문 / 헤더 | 응답 |
| --- | --- | --- |
| `GET /projects` | | `200` `[{ id, title, rev, updatedAt, bytes }]` (최근 것 먼저) |
| `GET /projects/:id` | `Accept: audio/midi` | `200` .mid 바이트, 헤더 `ETag: "<rev>"`, `X-Project-Title`(URL 인코딩), `Last-Modified` |
| `PUT /projects/:id` | 본문 .mid, `Content-Type: audio/midi`, `X-Project-Title`, `If-Match: "<rev>"`(처음 저장이면 없음) | `200` `{ id, title, rev, updatedAt, bytes }` · 판이 다르면 `409` + 지금 서버의 `{ id, title, rev, updatedAt }` |
| `DELETE /projects/:id` | | `204` |

- `id`는 앱이 만든다(`song.id`, 곡을 새로 만들거나 남의 곡 · 보통 MIDI를 열면 새 번호, 내 백업 · 내 프로젝트 .mid는 번호 유지).
- 크기: 보통 수~수십 KB. 1MB 제한이면 충분하다.
- CORS: `https://osense.github.io` 허용, 위 헤더(`If-Match`, `X-Project-Title`, `ETag` 노출) 허용.
- 서버 쪽 판 기록(rev별 보관)을 두면 “예전 판으로 되돌리기”를 나중에 붙일 수 있다.

## 4. 로그인 세션

`src/cloud/session.ts`

- WSNS 사이트에서 로그인한 뒤 쎈스 컴포즈로 돌려보낼 때 주소 끝에 `#wsns-token=<토큰>&uid=<사용자>&name=<이름>&exp=<ISO 시각>`을 붙인다.
- 앱이 열리면 `takeSessionFromUrl()`이 받아 `localStorage 'sense-compose:session'`에 두고 주소에서 바로 지운다.
- 로그아웃: `setSession(null)`. 만료 시각이 지나면 세션 없음으로 본다.
- 지금 WSNS 사이트(Osense/WesNS)의 로그인은 브라우저 안 임시 구현(`src/lib/auth/auth-provider.tsx`)이라, 실제 서버 인증을 붙일 때 토큰을 위 방식으로 넘겨 주면 된다.

## 5. 자동 저장

`src/cloud/autosave.ts` + `src/cloud/useCloudAutosave.ts` (App에서 `useCloudAutosave(song, settings, plans)`)

- 켜지는 조건: 빌드할 때 `VITE_CLOUD_API=https://…` + 로그인 세션 있음.
- 곡 · 설정 · 반주 선택이 바뀌면 4초 기다렸다가 .mid로 만들어 올린다. 탭을 닫을 때(pagehide)는 바로.
- 서버에 못 올리면 이 기기 IndexedDB에 먼저 두고 다음 변경 때 다시 올린다. 충돌이면 덮어쓰지 않고 상태 `conflict`.
- 상태 값: `idle · pending · saving · saved · offline · conflict · error` → 머리줄 저장 표시에 붙이면 된다(아직 화면에는 안 씀).

## 남은 일 (서버가 생기면)

1. 서버 API 구현 + `VITE_CLOUD_API` 넣어 배포
2. WSNS 로그인 → 쎈스 컴포즈로 토큰 넘기기, 쎈스 컴포즈 머리줄에 로그인 · 계정 이름 표시
3. “내 프로젝트” 목록 화면(`store.list()` → `load` → `decodeProject`)
4. 충돌 화면: “다른 기기의 판 열기 / 지금 것을 새 프로젝트로 저장”
5. 저장 표시에 계정 저장 상태 붙이기
