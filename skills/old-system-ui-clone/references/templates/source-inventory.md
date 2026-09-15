# Source Inventory

One row per captured page state. Agent maintains; user does not edit.

| state-id | URL | default screenshot | inventory | summary gate | open-state screenshots | Page Map |
|---|---|---|---|---|---|---|
| buy-list-default | https://.../Buy/List | source/screenshots/buy-list-default.png | probes/buy-list-default.inventory.json | passed | select-pagesize-open | docs/page-maps/buy-list-default.md |

State context:

| state-id | operator task | route / state | viewport / theme | source authority | asset gaps |
|---|---|---|---|---|---|
| buy-list-default | 查询采购单 | `/Buy/List`, default | 1920×1080 / light / logged-in | matched Chrome tab + CDP probe | icon-x pending |

Asset and interaction notes should be kept with the state record or a linked evidence-gap file. Do not copy private source data into a public artifact merely because it was visible during capture.

App-level (once per project):

| Artifact | Path | Status |
|---|---|---|
| source-css-vars | source/probes/source-css-vars.json | done |
| element-token-map | source/probes/element-token-map.json | done |
| shell-tokens | source/probes/shell-tokens.json | done |
| surface-tokens | source/probes/surface-tokens.json | done |
