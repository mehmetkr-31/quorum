# Quorum MCP Server

AI agents (Claude, GPT, etc.) için Quorum DAO'ya erişim sağlayan MCP server.

## Araçlar (Tools)

| Tool | Açıklama |
|------|----------|
| `list_datasets` | Tüm dataset'leri listeler |
| `list_contributions` | Katkıları listeler (status filtresi: pending/approved/rejected) |
| `get_contribution_content` | Shelby'den katkı içeriğini getirir |
| `export_dataset` | Dataset'i JSONL formatında export eder (HuggingFace uyumlu) |
| `get_governance_stats` | DAO istatistiklerini getirir |
| `get_leaderboard` | Üye reputation leaderboard'unu getirir |
| `list_receipts` | Shelby okuma receipt'larını listeler |

## Kurulum

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` dosyasına ekle:

```json
{
  "mcpServers": {
    "quorum": {
      "command": "pnpm",
      "args": ["--filter", "@quorum/mcp", "dev"],
      "cwd": "/path/to/quorum",
      "env": {
        "QUORUM_API_URL": "http://localhost:3001/api/rpc"
      }
    }
  }
}
```

### Geliştirme

```bash
QUORUM_API_URL=http://localhost:3001/api/rpc pnpm --filter @quorum/mcp dev
```
