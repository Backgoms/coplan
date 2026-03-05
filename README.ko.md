# coplan

`coplan`은 Claude Code에서 슬래시 커맨드로 "구현 계획(Plan)"을 만들고, Codex 검토(MCP)를 거쳐 더 탄탄한 최종 계획을 반환하는 도구입니다.

## 사용 전 준비

필수:

- Git
- Node.js 20+ (LTS 권장) + npm
- Claude Code + Claude CLI (`claude` 명령이 PATH에 있어야 함)
- Codex CLI (`codex` 명령이 PATH에 있어야 함)
- Codex가 포함된 ChatGPT 플랜(Plus/Pro/Business/Edu/Enterprise). 무료 플랜은 동작 보장으로 보기 어렵습니다.

로컬에 생성되는 파일/폴더:

- `~/.coplan/auth.json` (로컬 인증 메타데이터; 커밋 금지)
- `~/.claude/commands/` (설치된 슬래시 커맨드 템플릿)

## 빠른 시작

클론:

```bash
git clone https://github.com/Backgoms/coplan.git
cd coplan
npm install
```

슬래시 커맨드 설치 + MCP 등록 + 로그인:

```bash
npm run setup
```

Claude Code에서 실행:

```text
/user:coplan <작업>
```

## 작동 구조

`/user:coplan <작업>` 실행 시:

1. Claude가 Draft Plan 생성
2. Claude가 Plan Summary(짧은 요약) 생성
3. MCP 도구 `codex_plan_review`가 Codex에 계획 검토 요청
4. Codex 피드백을 반영해 Final Plan 반환

## 사용 방법 (Claude Code)

- `/user:coplan <작업>`: 계획 생성 + Codex 검토 + 최종 계획
- `/user:coplan-status`: 현재 설정/상태 점검 및 해결 방법 안내
- `/user:coplan-login`: Codex/ChatGPT 로그인 시작(필요시 브라우저 열림)
- `/user:coplan-logout`: Codex 로그아웃 + coplan 로컬 상태 초기화
- `/user:coplan-update`: 이 git 클론을 안전하게 업데이트(`git pull --ff-only`)

## 업데이트

코드 최신화:

```bash
git pull --ff-only
```

슬래시 커맨드 템플릿이 변경/추가되었다면 재설치:

```bash
npm run install:claude
```

참고:

- `/user:coplan-update`는 `coplan update --apply`를 실행하며, 작업트리가 깨끗할 때만 fast-forward 업데이트합니다.
- MCP 서버는 기본적으로 시작 시 안전한 fast-forward 업데이트를 시도합니다. 끄려면 `COPLAN_MCP_AUTO_UPDATE=0`을 설정하세요.

## 문제 해결

- 슬래시 커맨드가 안 보임: `npm run install:claude` 실행 후 Claude Code 재시작
- 로그인창이 안 뜸: 이미 로그인 상태일 수 있음. `/user:coplan-logout` 후 `/user:coplan-login`
- 업데이트가 스킵됨: `git status`로 작업트리 깨끗한지 확인 후 `/user:coplan-update`

## 폴더 구조

- `.claude/commands/`: `~/.claude/commands/`로 복사되는 템플릿
- `packages/coplan-cli/`: setup/login/status 등 실행 CLI
- `packages/coplan-mcp/`: `codex_plan_review` MCP 서버
- `packages/coplan-auth/`: 레거시 로컬 인증 서버(`127.0.0.1:8719`)
