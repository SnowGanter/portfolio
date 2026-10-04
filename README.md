# portfolio

Design portfolio: Etsy, Amazon A+, Photoshop Scripts, ComfyUI, Packaging, UX/UI.

Website: **https://cv-designer.me/**.

English is the default at [the portfolio](https://cv-designer.me/).
[Ukrainian](https://cv-designer.me/uk/) and
[Russian](https://cv-designer.me/ru/) are available through
the EN / UK / RU switch. Project and filter context is retained.

Sections use clean URLs: `/etsy/`, `/amazon/`, `/photoshop/`, `/comfyui/`,
`/packaging/`, `/ux-ui/`. Case studies live at `/projects/slug/`,
`/packaging/slug/` and `/ux-ui/slug/`, also within `/uk/` and `/ru/`.
Previous `.html` bookmarks redirect with their query and fragment intact.
The homepage DESIGN gently sways left/right; an explicit push triggers a full turn.

Packaging includes thirteen interactive volumetric mockups with animated artwork
switching and 39 AI-generated raster designs. Cylindrical labels use continuous
wraps; folded packs use matching quiet edges. Thirty-six packaging concepts have
downloadable raster artwork and nominal structural layouts. These sRGB layouts
are not manufacturer-approved dies or press-ready files. UX/UI opens three
working, sandboxed sample websites with persistent
portfolio controls. These new sample designs and fictional brands are explicitly
labelled interaction concepts, not client commissions or confirmed owner work.

The legacy project URL redirects to the custom domain. The additional
`snowganter.github.io` entry point is maintained separately in
[SnowGanter/SnowGanter.github.io](https://github.com/SnowGanter/SnowGanter.github.io).

`docs/` contains the verified static release. The **Publish portfolio** GitHub
Actions workflow deploys this folder to GitHub Pages after release updates to
`main`. Keep Pages Source set to **GitHub Actions**, not Deploy from a branch.

The editable source, unpublished projects, image-generation originals, private archives and
local QA fixtures are intentionally not stored in this public repository.
Updates are built from the owner's local project and pushed only after checks.

No server, database or Node.js runtime is required by the deployed site.
