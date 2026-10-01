# portfolio

Design portfolio: Etsy, Amazon A+, Photoshop Scripts, ComfyUI.

Website: **https://cv-designer.me/**.

English is the default at [the portfolio](https://cv-designer.me/).
[Ukrainian](https://cv-designer.me/uk/) and
[Russian](https://cv-designer.me/ru/) are available through
the EN / UK / RU switch. Project and filter context is retained.

The legacy project URL redirects to the custom domain. The additional
`snowganter.github.io` entry point is maintained separately in
[SnowGanter/SnowGanter.github.io](https://github.com/SnowGanter/SnowGanter.github.io).

`docs/` contains the verified static release. The **Publish portfolio** GitHub
Actions workflow deploys this folder to GitHub Pages after release updates to
`main`. Keep Pages Source set to **GitHub Actions**, not Deploy from a branch.

The editable source, unpublished projects, print masters, private archives and
local QA fixtures are intentionally not stored in this public repository.
Updates are built from the owner's local project and pushed only after checks.

No server, database or Node.js runtime is required by the deployed site.
