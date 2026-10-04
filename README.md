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

Packaging includes twelve packaging objects and a textile pillow with animated
artwork switching, optical zoom up to 6×, camera pan and fullscreen inspection.
Project arrows stay at the screen edges. The twelve packaging objects have 36
vector design concepts and downloadable artwork/layout SVGs. Guide contours,
cuts, folds, bleed and safe areas are separate; dimensions are nominal and sRGB.
These are portfolio studies, not manufacturer-approved dielines for production.
Original-material designs are no longer selectable. Amazon A+ pages contain
product images and content only; the pillow's 3D viewer is in Packaging.

UX/UI opens three working, sandboxed sample websites with persistent
portfolio controls. These new sample designs and fictional brands are explicitly
labelled interaction concepts, not client commissions or confirmed owner work.

The legacy project URL redirects to the custom domain. The additional
`snowganter.github.io` entry point is maintained separately in
[SnowGanter/SnowGanter.github.io](https://github.com/SnowGanter/SnowGanter.github.io).

`docs/` contains the verified static release. The **Publish portfolio** GitHub
Actions workflow deploys this folder to GitHub Pages after release updates to
`main`. Keep Pages Source set to **GitHub Actions**, not Deploy from a branch.

The editable source, unpublished projects, original assets, private archives and
local QA fixtures are intentionally not stored in this public repository.
Only the explicitly published conceptual SVG masters are included in `docs/`.
Updates are built from the owner's local project and pushed only after checks.

No server, database or Node.js runtime is required by the deployed site.
