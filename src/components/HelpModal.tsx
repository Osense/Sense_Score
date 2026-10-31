import { ICONS } from './Toolbar'
import type { Tool } from '../types'

const TOOLS: { id: Tool; title: string; lines: string[] }[] = [
  {
    id: 'pen',
    title: '연필 — 음표 쓰기',
    lines: ['빈 곳을 누르면 음표가 생겨요.', '누른 채 옆으로 끌면 길이가 정해져요.', '이미 있는 음표를 끌면 길이가 늘었다 줄었다 해요.'],
  },
  {
    id: 'eraser',
    title: '지우개 — 닿는 음표 지우기',
    lines: ['음표를 누르면 지워져요.', '문지르듯 끌면 지나간 음표가 모두 지워져요.', '실수해도 ↶ 되돌리기가 있어요.'],
  },
  {
    id: 'hand',
    title: '손바닥 — 옮기고 늘리고 줄이기',
    lines: ['음표를 끌면 위치와 음 높이가 바뀌어요.', '음표 끝의 손잡이를 끌면 길이가 바뀌어요.', '빈 곳을 끌면 화면이 움직여요.'],
  },
  {
    id: 'select',
    title: '선택 — 여러 개 한꺼번에',
    lines: ['빈 곳에서 끌어 네모로 감싸면 여러 음표가 선택돼요.', '선택한 음표를 끌면 전체가 함께 움직여요. 위아래로 끌면 전조예요!', '아래쪽 전조 버튼으로 반음·옥타브씩 바꿀 수도 있어요.'],
  },
]

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-back" onPointerDown={onClose}>
      <div className="modal" onPointerDown={(e) => e.stopPropagation()} role="dialog" aria-label="사용법">
        <button className="modal-x" onClick={onClose} aria-label="닫기">✕</button>
        <h2>직접 쓰기 모드 사용법 🛠</h2>
        <p className="lead">왼쪽 도구 모음에서 도구를 고르거나, 키보드 숫자 1~4를 눌러요. 마우스 우클릭이나 Shift 없이 손가락·펜으로도 모두 할 수 있어요.</p>
        <div className="help-grid">
          {TOOLS.map((t, i) => (
            <div key={t.id} className="help-card">
              <div className="help-icon">{ICONS[t.id]}</div>
              <h4>
                {t.title} <kbd>{i + 1}</kbd>
              </h4>
              <ul>
                {t.lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <h3>편집 화면</h3>
        <ul className="help-list">
          <li><b>🎹 건반 편집</b> 피아노 건반처럼 세로가 음 높이, 가로가 시간이에요. 드럼은 킥·스네어 같은 파트가 줄로 나와요 (키보드 Q W E R T A S D F로 소리 들어보기).</li>
          <li><b>🎤 멜로디 쓰기(별도 탭)</b> 가로 건반을 연주하면서 ⏺ 녹음을 누르면 연주가 그대로 MIDI 음표로 기록돼요. 컴퓨터 키보드(A S D F…)나 MIDI 키보드도 쓸 수 있어요.</li>
          <li><b>🎼 악보 편집</b> 오선보에 음표를 찍어요. 📜 스크롤 / 📄 페이지 / 🎼 다중 악보로 볼 수 있어요.</li>
          <li><b>편집 메뉴</b> 음표를 <b>우클릭</b>하거나 손가락으로 <b>꾹 누르면</b> 복사·잘라내기·붙여넣기·복제, 길이(2배·반·쪼개기·합치기), 음높이(옥타브·반음·음계에 맞추기), 세기 정리 메뉴가 나와요. 빈 곳에서 열면 그 자리에 붙여넣을 수 있어요. (Ctrl+C / X / V / D)</li>
          <li><b>파트 칩</b> 위쪽 파트 이름을 누르면 그 부분만 반복 재생하며 작곡할 수 있어요.</li>
          <li><b>최소 칸</b> 음표를 놓을 수 있는 가장 작은 칸이에요. 16분음표로 두면 한 박을 4등분해 찍어요.</li>
        </ul>
        <h3>단축키</h3>
        <p className="keys-line">
          <kbd>Space</kbd> 재생/정지 · <kbd>Home</kbd> 처음으로 · <kbd>Ctrl</kbd>+<kbd>Z</kbd> 되돌리기 · <kbd>Ctrl</kbd>+<kbd>Y</kbd> 다시 · <kbd>Delete</kbd> 지우기 · <kbd>Ctrl</kbd>+<kbd>D</kbd> 복제
        </p>
        <button className="primary big-btn" onClick={onClose}>알겠어요, 시작할게요!</button>
      </div>
    </div>
  )
}
