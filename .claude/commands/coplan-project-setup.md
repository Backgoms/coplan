Bootstrap coplan for THIS repository (project-local setup).

Steps:

1. Run shell command: `npm install`
2. Run shell command: `claude mcp add -s project coplan -- node packages/coplan-mcp/index.js`
3. Run shell command: `node packages/coplan-cli/bin/coplan.js login --provider chatgpt`
4. Run shell command: `node packages/coplan-cli/bin/coplan.js doctor`
5. Tell the user they can now run:
   - `/user:coplan <task>`
   - `/user:coplan-status`

Notes:
- This command is intended to be used from the repo root.
- It does not require any API keys.
