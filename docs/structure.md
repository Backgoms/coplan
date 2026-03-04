# 프로젝트 구조

아래는 현재 `coplan` 저장소의 핵심 구조입니다.

```text
coplan/
├─ README.md
├─ README.ko.md
├─ LICENSE
├─ .gitignore
├─ .claude/
│  └─ commands/
│     ├─ coplan.md
│     └─ coplan-status.md
├─ docs/
│  ├─ architecture.md
│  ├─ security.md
│  ├─ diagrams.md
│  └─ structure.md
└─ packages/
   ├─ coplan-mcp/
   │  ├─ package.json
   │  ├─ index.js
   │  └─ src/
   │     ├─ server.js
   │     ├─ codexClient.js
   │     ├─ authStore.js
   │     ├─ schemas.js
   │     └─ logger.js
   ├─ coplan-auth/
   │  ├─ package.json
   │  ├─ server.js
   │  └─ public/
   │     ├─ index.html
   │     ├─ app.js
   │     └─ style.css
   └─ coplan-cli/
      ├─ package.json
      └─ bin/
         └─ coplan.js
```

## 디렉터리별 역할

- `.claude/commands/coplan.md`
  - Claude Code에서 `/coplan` 실행 시 사용할 프롬프트 템플릿

- `.claude/commands/coplan-status.md`
  - Claude Code에서 `/coplan-status` 실행 시 런타임 상태 점검용 프롬프트

- `packages/coplan-mcp`
  - MCP 서버
  - `codex_plan_review` 도구 제공
  - 로컬 인증 토큰을 읽어 Codex API 호출 후 구조화된 JSON 반환

- `packages/coplan-auth`
  - 로컬 웹 인증 서버 (`127.0.0.1:8719`)
  - 사용자 API 키를 `~/.coplan/auth.json`에 저장

- `packages/coplan-cli`
  - `coplan login` CLI 제공
  - 인증 서버 실행 및 브라우저 열기

- `docs`
  - 아키텍처, 보안, 다이어그램 및 구조 문서
