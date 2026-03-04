# coplan 사용법

`coplan`은 Claude Code의 `/coplan <작업>` 흐름에서 계획(Plan)을 생성한 뒤, Codex 리뷰를 거쳐 최종 계획을 반환하는 도구입니다.

## 빠른 시작 (GitHub)

필요 조건:

- Node.js 20+ (LTS 권장)
- npm

클론 및 설치:

```bash
git clone https://github.com/Backgoms/coplan.git
cd coplan
npm install
```

Claude Code 연동(슬래시 명령 설치 + MCP 등록):

```bash
npm run setup
```

그 다음 Claude Code에서:

```text
/user:coplan <작업>
/user:coplan-status
```

## 동작 흐름

1. Claude가 초안 계획(Draft Plan) 생성
2. Claude가 요약(Plan Summary) 생성
3. MCP 도구 `codex_plan_review`가 Codex에 검토 요청
4. Codex 피드백을 반영해 최종 계획(Final Plan) 생성

## 사전 준비

1. 의존성 설치

```bash
npm install
```

보안 주의:

- 로컬 인증 상태는 커밋하지 마세요. `~/.coplan/auth.json`는 사용자 홈 디렉터리에 저장되는 로컬 파일입니다.
- 이 저장소는 `.gitignore`로 `.coplan/` (워크스페이스 로컬 상태)도 무시합니다.

2. Claude Code 설치 (슬래시 명령 + MCP 등록)

```bash
npm run install:claude
```

원클릭 설치를 원하면 아래를 사용하세요:

```bash
npm run setup
```

설치 시 자동으로 아래가 적용됩니다.

- `~/.claude/commands/coplan.md` 복사
- `~/.claude/commands/coplan-status.md` 복사
- `coplan` 이름으로 MCP 서버 등록(user scope)

3. 로그인 (기본: ChatGPT 로그인)

```bash
npm run login
```

위 명령은 `coplan login --provider chatgpt`와 동일합니다.


직접 실행:

```bash
node packages/coplan-cli/bin/coplan.js login --provider chatgpt
```

`--allow-plain-key-storage`를 명시한 경우에만 로컬 인증 페이지가 열립니다.

- Windows: `%USERPROFILE%\\.coplan\\auth.json`
- Linux/macOS: `~/.coplan/auth.json`

4. 신규 사용자 원클릭 설정

```bash
npm run setup
```

5. 상태 확인

```bash
npm run status
```

JSON 출력:

```bash
node packages/coplan-cli/bin/coplan.js status --json
```

6. 진단 실행

```bash
npm run doctor
```

7. (선택) MCP 서버 수동 실행

```bash
npm run start:mcp
```

8. (선택) Claude Code에서 제거

```bash
npm run uninstall:claude
```

## Claude Code에서 사용

```text
/user:coplan redis 캐시 레이어 구현
/user:coplan-status
```

출력 섹션:

- Draft Plan
- Plan Summary for Review
- Codex Review
- Final Plan (Codex-reviewed)

## MCP 입력/출력 규격

도구 이름: `codex_plan_review`

입력:

```json
{
  "plan": "string",
  "rubric": "string (optional)"
}
```

출력:

```json
{
  "score": 0,
  "issues": [],
  "missing_steps": [],
  "improvements": [],
  "questions": []
}
```
